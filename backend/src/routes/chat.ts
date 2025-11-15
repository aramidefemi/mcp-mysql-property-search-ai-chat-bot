import { Router, Request, Response } from 'express';
import { ChatRequestSchema, Message, ApiResponse } from '../utils/types.js';
import { validateBody, validateParams, commonSchemas } from '../middlewares/validation.js';
import { authenticateApiKey } from '../middlewares/auth.js';
import { chatRateLimit } from '../middlewares/ratelimit.js';
import { asyncHandler } from '../middlewares/errors.js';
import { generateUuid } from '../utils/ids.js';
import { conversationStore } from '../services/conversation-store.js';
import { createChatCompletion, processStreamingCompletion } from '../services/openai.js';
import logger from '../middlewares/logging.js';
import { late } from 'zod';

const router = Router();

// Apply middleware to all chat routes
router.use(chatRateLimit);
router.use(authenticateApiKey);


router.post(
  '/',
  validateBody(ChatRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { conversationId: providedId, message: userMessage, stream } = req.body;
    
    // Generate conversation ID if not provided
    let conversationId = providedId || generateUuid();
    
    logger.info({
      conversationId,
      messageLength: userMessage.length,
      stream,
      isNewConversation: !providedId,
    }, 'Processing chat request');

    try {
      // Save user message first
      const userMessageObj: Message = {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      };

      // Save user message to in-memory store
      let conversation = conversationStore.getConversation(conversationId);
      if (!conversation) {
        conversation = conversationStore.createConversation();
        conversationId = conversation.id; // Use the generated ID
      }
      
      conversationStore.addMessage(conversationId, userMessageObj);

      // Get conversation messages from in-memory store
      const messages = conversation.messages;

      // Prepare messages for OpenAI (limit context if too long)
      let contextMessages = messages;
      const maxContextMessages = 20; // Keep last 20 messages for context
      
      if (contextMessages.length > maxContextMessages) {
        // Keep the most recent messages
        contextMessages = contextMessages.slice(-maxContextMessages);
        logger.info({
          conversationId,
          originalCount: messages.length,
          prunedCount: contextMessages.length,
        }, 'Pruned conversation context for OpenAI');
      }

      // Create OpenAI completion
      const completion = await createChatCompletion({
        messages: contextMessages,
        conversationId,
        stream,
        temperature: 0.4,
        topP: 0.9,
      });

      if (stream) {
        // Set up Server-Sent Events
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        let accumulatedContent = '';

        try {
          // Process streaming response
          const streamProcessor = processStreamingCompletion(completion as any, contextMessages, conversationId);
          
          for await (const chunk of streamProcessor) {
            const eventData = JSON.stringify(chunk);
            res.write(`data: ${eventData}\n\n`);
            
            if (chunk.type === 'token' && chunk.data.content) {
              accumulatedContent += chunk.data.content;
            }
            
            if (chunk.type === 'done') {
              // Save assistant's final message
              if (accumulatedContent.trim()) {
                const assistantMessage: Message = {
                  role: 'assistant',
                  content: accumulatedContent,
                  timestamp: new Date().toISOString(),
                };

                conversationStore.addMessage(conversationId, assistantMessage);
              }
              
              // Send final event
              res.write(`data: ${JSON.stringify({
                type: 'complete',
                data: {
                  conversationId,
                  totalContent: accumulatedContent,
                },
              })}\n\n`);
              
              break;
            }
          }
        } catch (streamError) {
          logger.error({ conversationId, error: streamError }, 'Streaming error');
          res.write(`data: ${JSON.stringify({
            type: 'error',
            data: { message: 'Streaming failed' },
          })}\n\n`);
        } finally {
          res.end();
        }
      } else {
        // Non-streaming response
        const response = completion as any;
        const assistantMessage = response.choices[0]?.message;

        if (assistantMessage?.content) {
          // Save assistant message
          const messageObj: Message = {
            role: 'assistant',
            content: assistantMessage.content,
            timestamp: new Date().toISOString(),
          };

          conversationStore.addMessage(conversationId, messageObj);
        }

        const apiResponse: ApiResponse<any> = {
          success: true,
          data: {
            conversationId,
            message: assistantMessage?.content || 'No response generated',
            usage: response.usage,
          },
        };

        res.json(apiResponse);
      }

    } catch (error) {
      logger.error({
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Chat request failed');

      if (stream && !res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }

      if (stream) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          data: { message: 'Chat request failed' },
        })}\n\n`);
        res.end();
      } else {
        throw error; // Let error handler deal with it
      }
    }
  })
);

/**
 * GET /api/chats/:id
 * Retrieve a conversation by ID
 */
router.get(
  '/:id',
  validateParams(commonSchemas.uuidParam),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: conversationId } = req.params;

    if (!conversationId) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          message: 'Conversation ID is required',
          code: 'MISSING_CONVERSATION_ID',
        },
      };
      return res.status(400).json(response);
    }

    logger.info({ conversationId }, 'Loading conversation');

    const conversation = conversationStore.getConversation(conversationId);

    if (!conversation) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          message: 'Conversation not found',
          code: 'CONVERSATION_NOT_FOUND',
        },
      };
      
      return res.status(404).json(response);
    }

    const response: ApiResponse<typeof conversation> = {
      success: true,
      data: conversation,
    };

    return res.json(response);
  })
);

/**
 * GET /api/chats
 * List recent conversations (optional future enhancement)
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    // This is a placeholder for listing conversations
    // Could be implemented if needed for admin purposes
    const response: ApiResponse<any> = {
      success: true,
      data: {
        message: 'Conversation listing not implemented yet',
        conversations: [],
      },
    };

    res.json(response);
  })
);

export default router;
