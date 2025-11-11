import { z } from 'zod';
import { MongoPropertySearchInputSchema, PropertyListingSearchResult } from '../../utils/types.js';
import { searchPropertyListings } from '../../services/property-search.js';

type ToolInput = z.infer<typeof MongoPropertySearchInputSchema>;

/**
 * Tool: db.search_properties
 * Search Mongo-backed property listings with flexible filters.
 */
export async function searchProperties(input: ToolInput): Promise<PropertyListingSearchResult> {
  const parsed = MongoPropertySearchInputSchema.parse(input);
  const merged = {
    ...parsed,
    q: parsed.q ?? parsed.place,
  };
  return searchPropertyListings(merged);
}

/**
 * Tool definition for OpenAI function calling
 */
export const searchPropertiesToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'db_search_properties',
    description: 'Search structured Agent Buddy property listings stored in MongoDB.',
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string',
          description: 'Free-text search across address, title, description, and keywords.',
        },
        place: {
          type: 'string',
          description: 'Legacy alias for q; kept for backward compatibility.',
        },
        city: {
          type: 'string',
          description: 'City filter (case-insensitive).',
        },
        state: {
          type: 'string',
          description: 'State filter (case-insensitive).',
        },
        dealCategory: {
          type: 'string',
          description: 'Deal category such as rent, sale, or lease.',
        },
        lifecycle: {
          type: 'string',
          description: 'Lifecycle filter (active, inactive, archived, etc.).',
        },
        verification: {
          type: 'string',
          description: 'Verification status filter.',
        },
        minBedrooms: {
          type: 'number',
          description: 'Minimum bedrooms for the primary property.',
        },
        maxBedrooms: {
          type: 'number',
          description: 'Maximum bedrooms for the primary property.',
        },
        minPrice: {
          type: 'number',
          description: 'Minimum price based on the primary deal.',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price based on the primary deal.',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum extracted confidence score (0-1).',
          minimum: 0,
          maximum: 1,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of listings to return (default 20, max 50).',
          minimum: 1,
          maximum: 50,
        },
        offset: {
          type: 'number',
          description: 'Number of listings to skip (default 0).',
          minimum: 0,
        },
      },
    },
  },
};