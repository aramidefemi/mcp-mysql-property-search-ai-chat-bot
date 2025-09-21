import cors from 'cors';
import { config } from '../config.js';

const allowedOrigins = [
  'http://localhost:3000', // Next.js dev server
  'http://localhost:3001', // Alternative port
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// Add production origins if needed
if (config.NODE_ENV === 'production') {
  // Add production URLs when known
  // allowedOrigins.push('https://your-production-domain.com');
}

export const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow all localhost origins
    if (config.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
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
