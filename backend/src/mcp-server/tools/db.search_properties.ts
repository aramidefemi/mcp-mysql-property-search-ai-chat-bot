import { z } from 'zod';
import { executeQuery } from '../db/pool.js';
import { PropertySearchInput, PropertySearchResult, PropertyItem, DatabaseError } from '../../utils/types.js';
import type { RowDataPacket } from 'mysql2/promise';

interface PropertyRow extends RowDataPacket {
  id: number;
  property_name: string;
  property_title: string | null;
  property_description: string | null;
  address: string | null;
  city: string | null;
  location: string | null;
  property_picture1: string | null;
  property_picture2: string | null;
  property_picture3: string | null;
  price_num: number | null;
  bed_rooms_text: string | null;
  contact_number: string | null;
  latitude: string | null;
  longitude: string | null;
  date_created: Date;
}

interface CountRow extends RowDataPacket {
  total: number;
}

/**
 * Tool: db.search_properties
 * Search for properties with various filters
 */
export async function searchProperties(input: PropertySearchInput): Promise<PropertySearchResult> {
  try {
    // Validate input first
    if (!input.place || typeof input.place !== 'string') {
      throw new Error(`Invalid place parameter: ${JSON.stringify(input.place)}`);
    }

    const { place, limit = 20 } = input; 
    console.log('search props called with name:', place);
    
    const query = `SELECT location, price, property_header 
    FROM property
    WHERE LOWER(location) LIKE CONCAT('%', LOWER('${place}'), '%' )  limit 3;`
    
    const simpleResult = await executeQuery(query) as any[];
    
    console.log('simpleResult:', simpleResult, 'query:', query);
        
        return {
          total: simpleResult.length,
          items: simpleResult,
        };
     
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
    }
    
 
}

/**
 * Tool definition for OpenAI function calling
 */
export const searchPropertiesToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'db_search_properties',
    description: 'Search for properties with location, price, and bedroom filters. Uses address column for comprehensive location matching (e.g., searches "Lagos" in "Epe Rd, Epe 106103, Lagos, Nigeria"). Always filter by active properties only.',
    parameters: {
      type: 'object',
      properties: {
        place: {
          type: 'string',
          description: 'The location name to search for (e.g., "Lagos", "Epe", "Ibadan", "Victoria Island"). Will match anywhere within property addresses.',
        },
        minPrice: {
          type: 'number',
          description: 'Minimum price filter (optional)',
        },
        maxPrice: {
          type: 'number', 
          description: 'Maximum price filter (optional)',
        },
        bedrooms: {
          type: 'number',
          description: 'Number of bedrooms filter (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default 20, max 50)',
          minimum: 1,
          maximum: 50,
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip for pagination (default 0)',
          minimum: 0,
        },
      },
      required: ['place'],
    },
  },
};
