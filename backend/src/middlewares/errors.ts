import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, DatabaseError, AuthError, ApiResponse } from '../utils/types.js';
import { config } from '../config.js';
import logger from './logging.js';

/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error with request context
  const requestId = req.id || 'unknown';
  
  logger.error({
    err: error,
    req: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    },
    requestId,
  }, `Error processing request: ${error.message}`);

  // Handle known application errors
  if (error instanceof AppError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        // Only include details in development
        details: config.NODE_ENV === 'development' ? error.details : undefined,
      },
    };

    return res.status(error.statusCode).json(response);
  }

  // Handle validation errors specifically
  if (error instanceof ValidationError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: config.NODE_ENV === 'development' ? error.details : undefined,
      },
    };

    return res.status(400).json(response);
  }

  // Handle database errors
  if (error instanceof DatabaseError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        message: 'Database operation failed',
        code: 'DATABASE_ERROR',
        details: config.NODE_ENV === 'development' ? error.details : undefined,
      },
    };

    return res.status(500).json(response);
  }

  // Handle authentication errors
  if (error instanceof AuthError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        message: error.message,
        code: 'AUTH_ERROR',
      },
    };

    return res.status(401).json(response);
  }

  // Handle unexpected errors
  const response: ApiResponse<null> = {
    success: false,
    error: {
      message: config.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message,
      code: 'INTERNAL_ERROR',
      details: config.NODE_ENV === 'development' ? {
        stack: error.stack,
        name: error.name,
      } : undefined,
    },
  };

  res.status(500).json(response);
}

/**
 * Handle 404 Not Found errors
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse<null> = {
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  };

  res.status(404).json(response);
}

/**
 * Async wrapper for route handlers to catch promise rejections
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}