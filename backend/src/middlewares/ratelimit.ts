import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

// General API rate limiting
export const generalRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP address for identification
  keyGenerator: (req) => req.ip || 'unknown',
  // Skip rate limiting in test environment
  skip: (req) => config.NODE_ENV === 'test',
});

// Stricter rate limiting for chat endpoints (more resource intensive)
export const chatRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 requests per 5 minutes
  message: {
    error: {
      message: 'Too many chat requests, please slow down.',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => config.NODE_ENV === 'test',
});

// Very strict rate limiting for property search to prevent abuse
export const searchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  max: 30, // 30 searches per minute
  message: {
    error: {
      message: 'Too many search requests, please wait before searching again.',
      code: 'SEARCH_RATE_LIMIT_EXCEEDED',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  skip: (req) => config.NODE_ENV === 'test',
});
