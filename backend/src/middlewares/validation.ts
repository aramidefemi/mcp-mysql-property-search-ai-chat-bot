import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/types.js';

/**
 * Middleware factory for validating request bodies with Zod schemas
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return next(new ValidationError(
          'Request body validation failed',
          result.error.errors
        ));
      }
      
      // Replace request body with validated and transformed data
      req.body = result.data;
      next();
    } catch (error) {
      return next(new ValidationError('Body validation error', error));
    }
  };
}

/**
 * Middleware factory for validating query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      
      if (!result.success) {
        return next(new ValidationError(
          'Query parameters validation failed',
          result.error.errors
        ));
      }
      
      req.query = result.data as any;
      next();
    } catch (error) {
      return next(new ValidationError('Query validation error', error));
    }
  };
}

/**
 * Middleware factory for validating URL parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      
      if (!result.success) {
        return next(new ValidationError(
          'URL parameters validation failed',
          result.error.errors
        ));
      }
      
      req.params = result.data as any;
      next();
    } catch (error) {
      return next(new ValidationError('Params validation error', error));
    }
  };
}

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  uuidParam: z.object({
    id: z.string().uuid('Invalid UUID format'),
  }),
  
  paginationQuery: z.object({
    limit: z.coerce.number().int().positive().max(50).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
  }),
};