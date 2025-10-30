import cors from 'cors';
import { config } from '../config.js';

export const corsMiddleware = cors({
  // Reflect the request origin, effectively allowing all origins.
  // This works with credentials, unlike wildcard '*'.
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'x-request-id',
    'x-skip-auth',
  ],
  exposedHeaders: ['x-request-id'],
});

export default corsMiddleware;
