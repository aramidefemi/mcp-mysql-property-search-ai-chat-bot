import { Router, Request, Response } from 'express';
import { MongoPropertySearchInputSchema, ApiResponse, MongoPropertySearchInput } from '../utils/types.js';
import { validateQuery } from '../middlewares/validation.js';
import { authenticateApiKey, optionalAuth } from '../middlewares/auth.js';
import { searchRateLimit } from '../middlewares/ratelimit.js';
import { asyncHandler } from '../middlewares/errors.js';
import logger from '../middlewares/logging.js';
import { searchPropertyListings } from '../services/property-search.js';

const router = Router();

// Apply middleware to property routes
router.use(searchRateLimit);

/**
 * GET /api/properties/search
 * Direct search endpoint for debugging and testing
 * Optional auth to allow easier development/testing
 */
router.get(
  '/search',
  optionalAuth, // Optional auth for development flexibility
  validateQuery(MongoPropertySearchInputSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const searchParams = req.query as MongoPropertySearchInput;

    logger.info({
      searchParams,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    }, 'Direct property search request');

    try {
      const results = await searchPropertyListings(searchParams);

      logger.info({
        filters: searchParams,
        resultCount: results.items.length,
        totalFound: results.total,
      }, 'Property search completed');

      const response: ApiResponse<typeof results> = {
        success: true,
        data: results,
      };

      res.json(response);

    } catch (error) {
      logger.error({
        searchParams,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Property search failed');

      throw error; // Let error handler deal with it
    }
  })
);

/**
 * GET /api/properties/health
 * Simple health check endpoint for the properties service
 */
router.get(
  '/health',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await searchPropertyListings({ limit: 1, offset: 0 });
      const response: ApiResponse<any> = {
        success: true,
        data: {
          status: 'healthy',
          database: 'connected',
          timestamp: new Date().toISOString(),
          queryTest: 'passed',
        },
      };

      res.json(response);

    } catch (error) {
      logger.error({ error }, 'Properties health check failed');
      
      const response: ApiResponse<null> = {
        success: false,
        error: {
          message: 'Properties service unhealthy',
          code: 'HEALTH_CHECK_FAILED',
        },
      };

      res.status(503).json(response);
    }
  })
);

/**
 * GET /api/properties/stats
 * Get basic statistics about the property database (development/admin)
 */
router.get(
  '/stats',
  authenticateApiKey, // Require auth for stats
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const cities = ['Lagos', 'Abuja', 'Ibadan', 'Kano'];
      const sampleSearches: Record<
        string,
        { total: number; hasResults: boolean; error?: string }
      > = {};

      for (const city of cities) {
        try {
          const results = await searchPropertyListings({
            city,
            limit: 1,
            offset: 0,
          });
          sampleSearches[city] = {
            total: results.total,
            hasResults: results.items.length > 0,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.warn({ city, error: message }, 'Sample search failed');
          sampleSearches[city] = {
            total: 0,
            hasResults: false,
            error: message,
          };
        }
      }

      const stats = {
        sampleSearches,
        timestamp: new Date().toISOString(),
      };

      const response: ApiResponse<typeof stats> = {
        success: true,
        data: stats,
      };

      res.json(response);

    } catch (error) {
      logger.error({ error }, 'Properties stats request failed');
      throw error;
    }
  })
);

export default router;
