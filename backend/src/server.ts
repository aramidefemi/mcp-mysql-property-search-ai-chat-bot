import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { httpLogger, logger } from './middlewares/logging.js';
import { corsMiddleware } from './middlewares/cors.js';
import { generalRateLimit } from './middlewares/ratelimit.js';
import { errorHandler, notFoundHandler } from './middlewares/errors.js';
import { initializeMcpServer, shutdownMcpServer } from './mcp-server/index.js';
import chatRoutes from './routes/chat.js';
import propertiesRoutes from './routes/properties.js';
import { ApiResponse } from './utils/types.js';

const app = express();

// Trust proxy for accurate IP addresses behind reverse proxies
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for SSE streaming
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(corsMiddleware);

// HTTP request logging
app.use(httpLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(generalRateLimit);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  const response: ApiResponse<any> = {
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      version: '1.0.0',
    },
  };
  res.json(response);
});

// Root endpoint
app.get('/', (req, res) => {
  const response: ApiResponse<any> = {
    success: true,
    data: {
      message: 'Property Chat API Server',
      version: '1.0.0',
      endpoints: {
        chat: '/api/chat',
        conversations: '/api/chats/:id', 
        properties: '/api/properties/search',
        health: '/health',
      },
    },
  };
  res.json(response);
});

// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/chats', chatRoutes); // Alias for chat routes
app.use('/api/properties', propertiesRoutes);

// Handle 404 errors
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize MCP server and test database connection
    logger.info('Initializing MCP server...');
    const mcpInitialized = await initializeMcpServer();
    
    if (!mcpInitialized) {
      throw new Error('Failed to initialize MCP server');
    }

    // Start HTTP server
    const server = app.listen(config.BACKEND_PORT, () => {
      logger.info({
        port: config.BACKEND_PORT,
        environment: config.NODE_ENV,
        database: `${config.MYSQL_HOST}:${config.MYSQL_PORT}/${config.MYSQL_DB}`,
      }, `Server started successfully`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async (err) => {
        if (err) {
          logger.error({ error: err }, 'Error during server shutdown');
        } else {
          logger.info('HTTP server closed');
        }

        try {
          await shutdownMcpServer();
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (shutdownError) {
          logger.error({ error: shutdownError }, 'Error during MCP shutdown');
          process.exit(1);
        }
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection');
      process.exit(1);
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;