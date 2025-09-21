import { z } from 'zod';
import { executeQuery } from '../db/pool.js';
import { Conversation, DatabaseError, MessageSchema } from '../../utils/types.js';
import type { RowDataPacket } from 'mysql2/promise';

const LoadConversationInputSchema = z.object({
  conversationId: z.string().uuid(),
});

export type LoadConversationInput = z.infer<typeof LoadConversationInputSchema>;

interface ConversationRow extends RowDataPacket {
  id: string;
  user_ref: string | null;
  messages: string; // JSON string
  context: string | null; // JSON string
  created_at: Date;
  updated_at: Date;
}

/**
 * Tool: chat.load_conversation
 * Load a conversation by ID with all messages
 */
export async function loadConversation(input: LoadConversationInput): Promise<Conversation | null> {
  try {
    const { conversationId } = input;
    
    const query = `
      SELECT id, user_ref, messages, context, created_at, updated_at
      FROM conversations
      WHERE id = ?
      LIMIT 1
    `;
    
    const result = await executeQuery(query, [conversationId]) as ConversationRow[];
    
    if (result.length === 0) {
      return null;
    }
    
    const row = result[0];
    
    // Parse JSON fields safely
    let messages: any[] = [];
    let context: Record<string, unknown> | null = null;
    
    try {
      messages = JSON.parse(row.messages);
      // Validate messages array structure
      const parsedMessages = z.array(MessageSchema).parse(messages);
      messages = parsedMessages;
    } catch (error) {
      console.error('Failed to parse messages JSON:', error);
      messages = [];
    }
    
    try {
      if (row.context) {
        context = JSON.parse(row.context);
      }
    } catch (error) {
      console.error('Failed to parse context JSON:', error);
      context = null;
    }
    
    return {
      id: row.id,
      user_ref: row.user_ref,
      messages,
      context,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
    
  } catch (error) {
    throw new DatabaseError(
      `Failed to load conversation: ${input.conversationId}`,
      error
    );
  }
}

/**
 * Tool definition for OpenAI function calling
 */
export const loadConversationToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'chat_load_conversation',
    description: 'Load a conversation by ID to get the full message history',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The UUID of the conversation to load',
        },
      },
      required: ['conversationId'],
    },
  },
};