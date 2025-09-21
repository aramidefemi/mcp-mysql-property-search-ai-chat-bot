import OpenAI from 'openai';
import { config } from '../config.js';
import { Message, AppError } from '../utils/types.js';
import { mcpToolDefinitions, executeTool } from '../mcp-server/index.js';
import logger from '../middlewares/logging.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

// System prompt for the Nigerian property assistant
const SYSTEM_PROMPT = `You are a Nigerian property search assistant. You only use our database.

Always:
1. Verify the place via db_location_exists (check city/location).
2. If valid, call db_search_properties with user filters.
3. If invalid, say so and suggest close matches from db_location_exists.

Keep replies concise, friendly, and factual. Never invent listings; only present tool results.
After each reply, persist it with chat_save_message. Prices default to NGN. Reuse the same conversationId.

Important: 
- Always check location existence before searching
- Be helpful but honest about what's available
- Use clear, conversational Nigerian English
- Format property results nicely for the user`;

export interface ChatCompletionParams {
  messages: Message[];
  conversationId: string;
  stream?: boolean;
  temperature?: number;
  topP?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Create a chat completion with OpenAI
 */
export async function createChatCompletion(params: ChatCompletionParams) {
  const { messages, conversationId, stream = true, temperature = 0.4, topP = 0.9 } = params;

  try {
    // Prepare messages with system prompt
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: 'system',
      content: SYSTEM_PROMPT,
    };

    const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      systemMessage,
      ...messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
    ];

    // Add conversationId to the available tools context
    const toolsWithContext = mcpToolDefinitions.map(tool => {
      if (tool.function.name === 'chat_save_message') {
        // Inject conversationId into the save message tool description
        return {
          ...tool,
          function: {
            ...tool.function,
            description: `${tool.function.description} Always use conversationId: ${conversationId}`,
          },
        };
      }
      return tool;
    });

    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: 'gpt-4o-mini',
      messages: formattedMessages,
      tools: toolsWithContext,
      tool_choice: 'auto',
      temperature,
      top_p: topP,
      max_tokens: 1000, // Reasonable limit for chat responses
      stream,
    };

    logger.info({
      conversationId,
      messageCount: messages.length,
      tools: toolsWithContext.length,
      stream,
    }, 'Creating OpenAI chat completion');

    const completion = await openai.chat.completions.create(requestParams);
    
    return completion;

  } catch (error) {
    logger.error({
      conversationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'OpenAI API call failed');
    
    throw new AppError(
      'Failed to get response from AI assistant',
      'OPENAI_ERROR',
      500,
      error
    );
  }
}

/**
 * Handle tool calls from OpenAI
 */
export async function handleToolCall(toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall): Promise<string> {
  try {
    const { name: functionName, arguments: argsString } = toolCall.function;
    
    logger.info({
      functionName,
      arguments: argsString,
      toolCallId: toolCall.id,
    }, 'Executing tool call');

    // Parse arguments
    let args: any;
    try {
      args = JSON.parse(argsString);
    } catch (parseError) {
      throw new AppError(
        `Invalid tool arguments: ${argsString}`,
        'TOOL_ARGS_ERROR',
        400,
        parseError
      );
    }

    // Map OpenAI tool names to our internal tool names
    const toolName = functionName.replace('_', '_') as any;
    
    if (!toolName) {
      throw new AppError(
        `Unknown tool: ${functionName}`,
        'UNKNOWN_TOOL',
        400
      );
    }

    // Execute the tool
    const result = await executeTool(toolName, args);
    

    console.log('result', result);
    logger.info({
      functionName,
      toolCallId: toolCall.id,
      resultSize: JSON.stringify(result).length,
    }, 'Tool call completed successfully');

    return JSON.stringify(result);

  } catch (error) {
    logger.error({
      toolCallId: toolCall.id,
      functionName: toolCall.function.name,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Tool call failed');

    // Return error as string so OpenAI can handle it
    return JSON.stringify({
      error: true,
      message: error instanceof Error ? error.message : 'Tool execution failed',
      code: error instanceof AppError ? error.code : 'TOOL_ERROR',
    });
  }
}

/**
 * Process streaming chat completion with tool calls
 */
export async function* processStreamingCompletion(
  completion: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  messages: Message[],
  conversationId: string
): AsyncGenerator<{ type: 'token' | 'tool' | 'done'; data: any }> {
  let currentToolCall: Partial<OpenAI.Chat.Completions.ChatCompletionMessageToolCall> | null = null;
  let toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  let accumulatedContent = '';
  let currentMessages = [...messages];

  try {
    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta;
      
      if (!delta) continue;

      // Handle content tokens
      if (delta.content) {
        accumulatedContent += delta.content;
        yield { type: 'token', data: { content: delta.content } };
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          
          // Initialize or update tool call
          if (toolCallDelta.id) {
            currentToolCall = {
              id: toolCallDelta.id,
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }
          
          if (currentToolCall && toolCallDelta.function) {
            if (toolCallDelta.function.name) {
              currentToolCall.function!.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function.arguments) {
              currentToolCall.function!.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      // Check if we have a complete tool call
      if (chunk.choices[0]?.finish_reason === 'tool_calls' && currentToolCall?.id) {
        toolCalls.push(currentToolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall);
        
        // Execute tool call
        const result = await handleToolCall(currentToolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall);
        
        yield { 
          type: 'tool', 
          data: { 
            toolCall: currentToolCall,
            result 
          } 
        };
        
        // Add the tool call and result to messages for continuation
        const toolCallMessage: Message = {
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          tool_calls: [currentToolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall]
        };
        
        const toolResultMessage: Message = {
          role: 'tool',
          content: result,
          timestamp: new Date().toISOString(),
          tool_call_id: currentToolCall.id
        };
        
        currentMessages.push(toolCallMessage, toolResultMessage);
        
        // Continue the conversation with the tool result
        const continuationCompletion = await createChatCompletion({
          messages: currentMessages,
          conversationId,
          stream: true,
          temperature: 0.4,
          topP: 0.9,
        });
        
        // Process the continuation stream
        for await (const continuationChunk of continuationCompletion as any) {
          const continuationDelta = continuationChunk.choices[0]?.delta;
          
          if (!continuationDelta) continue;
          
          // Handle content tokens from continuation
          if (continuationDelta.content) {
            accumulatedContent += continuationDelta.content;
            yield { type: 'token', data: { content: continuationDelta.content } };
          }
          
          // Check if continuation is done
          if (continuationChunk.choices[0]?.finish_reason === 'stop') {
            yield { type: 'done', data: { content: accumulatedContent } };
            return;
          }
        }
        
        currentToolCall = null;
      }

      // Check if completion is done
      if (chunk.choices[0]?.finish_reason === 'stop') {
        yield { type: 'done', data: { content: accumulatedContent } };
        break;
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error processing streaming completion');
    yield { 
      type: 'done', 
      data: { 
        error: true, 
        message: 'Streaming completion failed',
        content: accumulatedContent 
      } 
    };
  }
}

/**
 * Extract token usage from completion response
 */
export function extractTokenUsage(completion: OpenAI.Chat.Completions.ChatCompletion): TokenUsage | null {
  if (!completion.usage) {
    return null;
  }

  return {
    promptTokens: completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
    totalTokens: completion.usage.total_tokens,
  };
}
