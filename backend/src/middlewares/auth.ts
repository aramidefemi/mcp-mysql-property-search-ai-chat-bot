import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { AuthError } from '../utils/types.js';

/**
 * Simple API key authentication middleware
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return next(new AuthError('Missing API key header (x-api-key)'));
  }
  
  if (typeof apiKey !== 'string') {
    return next(new AuthError('Invalid API key format'));
  }
  
  if (apiKey !== config.BACKEND_API_KEY) {
    return next(new AuthError('Invalid API key'));
  }
  
  next();
}

/**
 * Optional authentication for development/testing
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  // In development, we might want to skip auth for certain endpoints
  if (config.NODE_ENV === 'development') {
    const skipAuth = req.headers['x-skip-auth'] === 'true';
    if (skipAuth) {
      return next();
    }
  }
  
  return authenticateApiKey(req, res, next);
}
