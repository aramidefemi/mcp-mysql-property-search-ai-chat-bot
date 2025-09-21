import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middlewares/logging.js';
import { Message } from '../utils/types.js';

export interface ChatMessage extends Message {}

export interface Conversation {
  id: string;
  userRef?: string;
  messages: ChatMessage[];
  context?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory conversation store
 * This is much faster than database storage for development/testing
 */
class ConversationStore {
  private conversations: Map<string, Conversation> = new Map();
  private userConversations: Map<string, string[]> = new Map();

  /**
   * Create a new conversation
   */
  createConversation(userRef?: string): Conversation {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const conversation: Conversation = {
      id,
      userRef,
      messages: [],
      context: {},
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(id, conversation);
    
    // Track conversation by user
    if (userRef) {
      const userConvs = this.userConversations.get(userRef) || [];
      userConvs.push(id);
      this.userConversations.set(userRef, userConvs);
    }

    logger.info({ conversationId: id, userRef }, 'Created new conversation');
    return conversation;
  }

  /**
   * Get a conversation by ID
   */
  getConversation(id: string): Conversation | null {
    const conversation = this.conversations.get(id);
    if (conversation) {
      logger.debug({ conversationId: id }, 'Retrieved conversation');
    }
    return conversation || null;
  }

  /**
   * Get conversations by user reference
   */
  getUserConversations(userRef: string): Conversation[] {
    const conversationIds = this.userConversations.get(userRef) || [];
    const conversations = conversationIds
      .map(id => this.conversations.get(id))
      .filter((conv): conv is Conversation => conv !== undefined);
    
    logger.debug({ userRef, count: conversations.length }, 'Retrieved user conversations');
    return conversations;
  }

  /**
   * Add a message to a conversation
   */
  addMessage(conversationId: string, message: ChatMessage): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn({ conversationId }, 'Attempted to add message to non-existent conversation');
      return false;
    }

    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();
    
    logger.debug({ 
      conversationId, 
      role: message.role, 
      messageLength: message.content.length 
    }, 'Added message to conversation');
    
    return true;
  }

  /**
   * Update conversation context
   */
  updateContext(conversationId: string, context: Record<string, any>): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn({ conversationId }, 'Attempted to update context for non-existent conversation');
      return false;
    }

    conversation.context = { ...conversation.context, ...context };
    conversation.updatedAt = new Date().toISOString();
    
    logger.debug({ conversationId }, 'Updated conversation context');
    return true;
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn({ conversationId }, 'Attempted to delete non-existent conversation');
      return false;
    }

    // Remove from user conversations if applicable
    if (conversation.userRef) {
      const userConvs = this.userConversations.get(conversation.userRef) || [];
      const updatedUserConvs = userConvs.filter(id => id !== conversationId);
      this.userConversations.set(conversation.userRef, updatedUserConvs);
    }

    this.conversations.delete(conversationId);
    logger.info({ conversationId }, 'Deleted conversation');
    return true;
  }

  /**
   * Get conversation statistics
   */
  getStats(): { totalConversations: number; totalMessages: number; usersWithConversations: number } {
    const totalConversations = this.conversations.size;
    const totalMessages = Array.from(this.conversations.values())
      .reduce((sum, conv) => sum + conv.messages.length, 0);
    const usersWithConversations = this.userConversations.size;

    return {
      totalConversations,
      totalMessages,
      usersWithConversations,
    };
  }

  /**
   * Clear all conversations (useful for testing)
   */
  clear(): void {
    this.conversations.clear();
    this.userConversations.clear();
    logger.info('Cleared all conversations');
  }
}

// Export singleton instance
export const conversationStore = new ConversationStore();
export default conversationStore;
