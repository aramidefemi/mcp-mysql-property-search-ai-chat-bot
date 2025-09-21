import OpenAI from 'openai';
import { config } from '../config.js';
import { Message, AppError } from '../utils/types.js';
import { mcpToolDefinitions, mcpTools, executeTool } from '../mcp-server/index.js';
import logger from '../middlewares/logging.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

// System prompt for the Nigerian property assistant
const SYSTEM_PROMPT = `You are a helpful Nigerian property search assistant. You only use our database.

CRITICAL: Always follow this exact flow:
1. Check location with db_location_exists first
2. If location exists, IMMEDIATELY call db_search_properties with the location
3. If you get an error from db_search_properties, try again with different parameters
4. ALWAYS show actual property data from successful searches
5. If all searches fail, explain the technical issue clearly

Search Parameters:
- For ANY location: use {"place": "Lagos"} or {"place": "Akobo"} or {"place": "Victoria Island"}
- The system searches ONLY in the address column for all locations
- Always include limit: {"limit": 10}

Error Handling:
- If db_search_properties returns {"error": true, ...}, try searching with different parameters
- If location exists but no properties found, say "I found the location but no active properties are listed there currently"
- Never give vague responses like "technical difficulties" - be specific about what happened

Response Format:
- When successful: "Great! I found [X] properties in [location]. Here are some options: [list actual properties with names, prices, bedrooms]"
- Always show real property names, addresses, and prices from the database
- Never invent or assume property details

After each response, save it with chat_save_message using the same conversationId.`;

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
      console.log('Parsed tool arguments:', JSON.stringify(args, null, 2));
    } catch (parseError) {
      throw new AppError(
        `Invalid tool arguments: ${argsString}`,
        'TOOL_ARGS_ERROR',
        400,
        parseError
      );
    }

    // Map OpenAI tool names to our internal tool names  
    const toolName = functionName as keyof typeof mcpTools;
    
    if (!toolName) {
      throw new AppError(
        `Unknown tool: ${functionName}`,
        'UNKNOWN_TOOL',
        400
      );
    }

    // Validate that the tool exists in our tools
    if (!mcpTools[toolName]) {
      throw new AppError(
        `Tool not found: ${toolName}. Available tools: ${Object.keys(mcpTools).join(', ')}`,
        'TOOL_NOT_FOUND',
        400
      );
    }

    console.log('Executing tool:', toolName, 'with args:', JSON.stringify(args, null, 2));

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
  let accumulatedContent = '';
  let currentMessages = [...messages];
  
  // Process the completion recursively to handle multiple tool calls
  yield* processCompletionRecursively(completion, currentMessages, conversationId, accumulatedContent);
}

async function* processCompletionRecursively(
  completion: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  messages: Message[],
  conversationId: string,
  accumulatedContent: string
): AsyncGenerator<{ type: 'token' | 'tool' | 'done'; data: any }> {
  let currentToolCall: Partial<OpenAI.Chat.Completions.ChatCompletionMessageToolCall> | null = null;
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
        logger.info({ 
          conversationId,
          toolName: currentToolCall.function?.name,
          toolArgs: currentToolCall.function?.arguments 
        }, 'Executing tool call');
        
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
          content: accumulatedContent,
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
        
        // Create a new completion with the updated messages
        const continuationCompletion = await createContinuationCompletion(currentMessages, conversationId);
        
        // Recursively process the continuation
        yield* processCompletionRecursively(continuationCompletion, currentMessages, conversationId, accumulatedContent);
        return;
      }

      // Check if completion is done
      if (chunk.choices[0]?.finish_reason === 'stop') {
        yield { type: 'done', data: { content: accumulatedContent } };
        return;
      }
    }
  } catch (error) {
    logger.error({ error, conversationId }, 'Error processing streaming completion');
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

async function createContinuationCompletion(
  messages: Message[], 
  conversationId: string
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  // Convert messages to OpenAI format for continuation
  const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: 'system',
    content: SYSTEM_PROMPT,
  };

  const formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    systemMessage,
    ...messages.map(msg => {
      if (msg.role === 'tool' && msg.tool_call_id) {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        };
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls,
        };
      } else {
        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        };
      }
    }),
  ];
  
  logger.info({ conversationId, messageCount: formattedMessages.length }, 'Creating continuation completion');
  
  return await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: formattedMessages,
    tools: mcpToolDefinitions.map(tool => {
      if (tool.function.name === 'chat_save_message') {
        return {
          ...tool,
          function: {
            ...tool.function,
            description: `${tool.function.description} Always use conversationId: ${conversationId}`,
          },
        };
      }
      return tool;
    }),
    tool_choice: 'auto',
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: 1000,
    stream: true,
  }) as any;
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
