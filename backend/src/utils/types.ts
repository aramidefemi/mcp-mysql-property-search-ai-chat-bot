import { z } from 'zod';
import type { MoneyValue, PropertyUnit } from '../models/property-listing.js';

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

export const MongoPropertySearchInputSchema = z.object({
  q: z.string().trim().min(1).optional(),
  place: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  dealCategory: z.string().trim().min(1).optional(),
  lifecycle: z.string().trim().min(1).optional(),
  verification: z.string().trim().min(1).optional(),
  minBedrooms: z.coerce.number().int().min(0).optional(),
  maxBedrooms: z.coerce.number().int().min(0).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type MongoPropertySearchInput = z.infer<typeof MongoPropertySearchInputSchema>;

export interface PropertyListingSummary {
  id: string;
  ingest: {
    source: string;
    rawMessageId: string | null;
    groupId: string | null;
    messageId: string | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    dedupeKey: string;
  };
  status: {
    lifecycle: string;
    verification: string;
    extractedConfidence: number | null;
  };
  deal: {
    category: string;
    price: MoneyValue | null;
    fees: Record<string, MoneyValue | number | string>;
  };
  property: {
    type: string;
    subtypeNote: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    toilets: number | null;
    furnishing: string | null;
  };
  address: {
    display: string | null;
    street: string | null;
    landmark: string | null;
    area: string | null;
    district: string | null;
    city: string | null;
    lga: string | null;
    state: string | null;
    country: string | null;
    geo: {
      point: { lat: number | null; lng: number | null } | null;
      precision: string | null;
      geocoder: string | null;
      geocodedAt: string | null;
      confidence: number | null;
      sources: string[];
    };
  };
  building: {
    estateName: string | null;
    security: string[];
    amenities: string[];
    notes: string | null;
  };
  units: Array<{
    unitId: string | null;
    property: {
      type: string;
      bedrooms: number | null;
      bathrooms: number | null;
      toilets: number | null;
      subtypeNote: string | null;
      furnishing: string | null;
    };
    deal: {
      category: string;
      price: MoneyValue | null;
      fees: Record<string, MoneyValue | number | string>;
    };
    quantity: number | null;
  }>;
  tenantRequirements: {
    profile: string | null;
    employment: string | null;
    income: string | null;
    notes: string | null;
  };
  media: {
    photos: string[];
    videos: string[];
  };
  contact: {
    agentName: string | null;
    phones: string[];
    whatsapp: string | null;
    agency: string | null;
    coBrokerAllowed: boolean | null;
  };
  text: {
    title: string | null;
    description: string | null;
    keywords: string[];
  };
  quality: {
    confidenceOverall: number | null;
    unusedDataPct: number | null;
    fieldConfidence: Record<string, number>;
  };
  audit: {
    sourceSpans: Record<string, string>;
    assumptions: string[];
    parserVersion: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PropertyListingSearchResult {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  items: PropertyListingSummary[];
}

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
