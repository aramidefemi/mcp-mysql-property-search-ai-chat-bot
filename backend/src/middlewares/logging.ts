import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from '../config.js';
import { generateRequestId } from '../utils/ids.js';

// Create pino logger instance
export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: config.NODE_ENV,
  },
});

// HTTP request logging middleware
export const httpLogger = pinoHttp({
  logger,
  genReqId: generateRequestId,
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    } else if (res.statusCode >= 300 && res.statusCode < 400) {
      return 'silent'; // Don't log redirects
    }
    return 'info';
  },
  customReceivedMessage: (req, res) => {
    return `Request received: ${req.method} ${req.url}`;
  },
  customSuccessMessage: (req, res) => {
    const duration = res.responseTime ? `${Math.round(res.responseTime)}ms` : '-';
    return `Request completed: ${req.method} ${req.url} ${res.statusCode} in ${duration}`;
  },
  customErrorMessage: (req, res, err) => {
    return `Request failed: ${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        // Don't log sensitive headers like x-api-key
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader('content-type'),
        'content-length': res.getHeader('content-length'),
      },
    }),
  },
});

export default logger;