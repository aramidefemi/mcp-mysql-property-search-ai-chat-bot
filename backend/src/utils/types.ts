import { z } from 'zod';

// Message types
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  timestamp: z.string().datetime(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// Legacy alias for backward compatibility
export type ChatMessage = Message;

// Chat API request/response types
export const ChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  stream: z.boolean().default(true),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Property search types
export const PropertySearchInputSchema = z.object({
  place: z.string().min(1),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  bedrooms: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(50).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export type PropertySearchInput = z.infer<typeof PropertySearchInputSchema>;

export const PropertyItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  location: z.string().nullable(),
  pictures: z.array(z.string()),
  price: z.number().nullable(),
  bedrooms: z.number().int().nullable(),
  contact: z.string().nullable(),
  coords: z.object({
    lat: z.string().nullable(),
    lng: z.string().nullable(),
  }),
  createdAt: z.string(),
});

export type PropertyItem = z.infer<typeof PropertyItemSchema>;

export const PropertySearchResultSchema = z.object({
  total: z.number(),
  items: z.array(PropertyItemSchema),
});

export type PropertySearchResult = z.infer<typeof PropertySearchResultSchema>;

// Location existence check types
export const LocationExistsInputSchema = z.object({
  name: z.string().min(1),
});

export type LocationExistsInput = z.infer<typeof LocationExistsInputSchema>;

export const LocationExistsResultSchema = z.object({
  exists: z.boolean(),
  match: z.object({
    city: z.string().optional(),
    location: z.string().optional(),
  }).nullable(),
  suggestions: z.array(z.string()),
});

export type LocationExistsResult = z.infer<typeof LocationExistsResultSchema>;

// Conversation types
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  user_ref: z.string().nullable(),
  messages: z.array(MessageSchema),
  context: z.record(z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

// Error types
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthError';
  }
}
