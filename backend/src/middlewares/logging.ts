import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { generateRequestId } from '../utils/ids.js';

// Simple console logger
export const logger = {
  info: (obj: any, msg?: string) => {
    const timestamp = new Date().toISOString();
    if (typeof obj === 'string') {
      console.log(`[${timestamp}] INFO: ${obj}`);
    } else {
      console.log(`[${timestamp}] INFO: ${msg || 'Log message'}`, obj);
    }
  },
  
  warn: (obj: any, msg?: string) => {
    const timestamp = new Date().toISOString();
    if (typeof obj === 'string') {
      console.warn(`[${timestamp}] WARN: ${obj}`);
    } else {
      console.warn(`[${timestamp}] WARN: ${msg || 'Warning message'}`, obj);
    }
  },
  
  error: (obj: any, msg?: string) => {
    const timestamp = new Date().toISOString();
    if (typeof obj === 'string') {
      console.error(`[${timestamp}] ERROR: ${obj}`);
    } else {
      console.error(`[${timestamp}] ERROR: ${msg || 'Error message'}`, obj);
    }
  },
  
  debug: (obj: any, msg?: string) => {
    if (config.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      if (typeof obj === 'string') {
        console.debug(`[${timestamp}] DEBUG: ${obj}`);
      } else {
        console.debug(`[${timestamp}] DEBUG: ${msg || 'Debug message'}`, obj);
      }
    }
  }
};

// HTTP request logging middleware
export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Add request ID to request object
  (req as any).id = requestId;
  
  // Log request received
  logger.info({
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  }, 'Request received');
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };
    
    // Choose log level based on status code
    if (res.statusCode >= 500) {
      logger.error(logData, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else {
      logger.info(logData, 'Request completed successfully');
    }
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

export default logger;
