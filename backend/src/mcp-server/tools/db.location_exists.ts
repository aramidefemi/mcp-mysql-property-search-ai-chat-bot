import { z } from 'zod';
import { executeQuery } from '../db/pool.js';
import { LocationExistsInput, LocationExistsResult, DatabaseError } from '../../utils/types.js';
import type { RowDataPacket } from 'mysql2/promise';

interface LocationRow extends RowDataPacket {
  address: string | null;
  city: string | null;
  location: string | null;
}

interface SuggestionRow extends RowDataPacket {
  city_suggestion: string | null;
}

/**
 * Tool: db.location_exists
 * Check if a location exists in the property database and provide suggestions
 * Uses address column for better matching since addresses contain full location info
 */
export async function locationExists(input: LocationExistsInput): Promise<LocationExistsResult> {
  try {
    const { name } = input;
   

    console.log('locationExists called with name:', name);
    

const query = `SELECT id, location
FROM property
WHERE LOWER(location) LIKE CONCAT('%', LOWER('${name}'), '%' )  limit 3;`

const simpleResult = await executeQuery(query) as any[];
 
    return {
      exists: false,
      match: null,
      suggestions: simpleResult,
    };
    
  } catch (error) {
    throw new DatabaseError(
      `Failed to check location existence for: ${input.name}`,
      error
    );
  }
}

/**
 * Tool definition for OpenAI function calling
 */
export const locationExistsToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'db_location_exists',
    description: 'Check if a location (city or area) exists in the property database. Returns exact match or suggestions.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The location name to check (city or area name)',
        },
      },
      required: ['name'],
    },
  },
};
