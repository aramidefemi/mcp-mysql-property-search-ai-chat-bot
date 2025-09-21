import { z } from 'zod';
import { executeQuery } from '../db/pool.js';
import { Message, DatabaseError } from '../../utils/types.js';
import { generateUuid } from '../../utils/ids.js';
import type { OkPacket, RowDataPacket } from 'mysql2/promise';

const SaveMessageInputSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    ts: z.string().datetime().optional(),
  }),
  userRef: z.string().optional(),
});

export type SaveMessageInput = z.infer<typeof SaveMessageInputSchema>;

interface ConversationRow extends RowDataPacket {
  messages: string;
}

/**
 * Tool: chat.save_message
 * Save a message to a conversation (upsert behavior)
 */
export async function saveMessage(input: SaveMessageInput): Promise<{ success: boolean; conversationId: string }> {
  try {
    const { conversationId, message, userRef } = input;
    
    // Add timestamp if not provided
    const messageWithTimestamp: Message = {
      ...message,
      ts: message.ts || new Date().toISOString(),
    };
    
    // First, try to get existing conversation
    const selectQuery = `
      SELECT messages
      FROM conversations
      WHERE id = ?
      FOR UPDATE
    `;
    
    const existingRows = await executeQuery(selectQuery, [conversationId]) as ConversationRow[];
    
    if (existingRows.length > 0) {
      // Conversation exists - append the message
      let existingMessages: Message[] = [];
      
      try {
        existingMessages = JSON.parse(existingRows[0].messages);
      } catch (error) {
        console.error('Failed to parse existing messages, starting fresh:', error);
        existingMessages = [];
      }
      
      // Append new message
      existingMessages.push(messageWithTimestamp);
      
      const updateQuery = `
        UPDATE conversations
        SET messages = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      await executeQuery(updateQuery, [
        JSON.stringify(existingMessages),
        conversationId,
      ]);
      
    } else {
      // Conversation doesn't exist - create it
      const insertQuery = `
        INSERT INTO conversations (id, user_ref, messages, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;
      
      await executeQuery(insertQuery, [
        conversationId,
        userRef || null,
        JSON.stringify([messageWithTimestamp]),
        null, // context starts as null
      ]);
    }
    
    return {
      success: true,
      conversationId,
    };
    
  } catch (error) {
    throw new DatabaseError(
      `Failed to save message to conversation: ${input.conversationId}`,
      error
    );
  }
}

/**
 * Tool definition for OpenAI function calling
 */
export const saveMessageToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'chat_save_message',
    description: 'Save a message to a conversation. Creates the conversation if it doesn\'t exist.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The UUID of the conversation',
        },
        message: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              enum: ['user', 'assistant', 'system'],
              description: 'The role of the message sender',
            },
            content: {
              type: 'string',
              description: 'The content of the message',
            },
            ts: {
              type: 'string',
              description: 'ISO timestamp (optional, will be auto-generated)',
            },
          },
          required: ['role', 'content'],
        },
        userRef: {
          type: 'string',
          description: 'Optional user reference/identifier',
        },
      },
      required: ['conversationId', 'message'],
    },
  },
};