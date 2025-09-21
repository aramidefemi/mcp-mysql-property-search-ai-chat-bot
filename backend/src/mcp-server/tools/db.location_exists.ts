import { z } from 'zod';
import { executeQuery } from '../db/pool.js';
import { LocationExistsInput, LocationExistsResult, DatabaseError } from '../../utils/types.js';
import type { RowDataPacket } from 'mysql2/promise';

interface LocationRow extends RowDataPacket {
  city: string | null;
  location: string | null;
}

interface SuggestionRow extends RowDataPacket {
  city: string;
}

/**
 * Tool: db.location_exists
 * Check if a location exists in the property database and provide suggestions
 */
export async function locationExists(input: LocationExistsInput): Promise<LocationExistsResult> {
  try {
    const { name } = input;
    
    // First, check for exact matches in both city and location columns
    const exactMatchQuery = `
      SELECT DISTINCT city, location
      FROM property
      WHERE active = 1
        AND (
          LOWER(TRIM(city)) = LOWER(TRIM(?)) OR
          LOWER(TRIM(location)) = LOWER(TRIM(?))
        )
        AND (city IS NOT NULL AND city <> '' OR location IS NOT NULL AND location <> '')
      LIMIT 1
    `;

    console.log(exactMatchQuery, [name, name]);
    
    const exactMatches = await executeQuery(
      exactMatchQuery,
      [name, name]
    ) as LocationRow[];
    
    if (exactMatches.length > 0) {
      const match = exactMatches[0];
      return {
        exists: true,
        match: {
          city: match?.city || undefined,
          location: match?.location || undefined,
        },
        suggestions: [],
      };
    }
    
    // If no exact match, get suggestions from city names using LIKE pattern
    const suggestionsQuery = `
      SELECT DISTINCT city
      FROM property
      WHERE active = 1 
        AND city IS NOT NULL 
        AND city <> ''
        AND LOWER(city) LIKE CONCAT(LOWER(?), '%')
      ORDER BY city
      LIMIT 5
    `;
    
    console.log(suggestionsQuery, [name]);
    const suggestions = await executeQuery(
      suggestionsQuery,
      [name]
    ) as SuggestionRow[];
    

    console.log('suggestions', suggestions);
    return {
      exists: false,
      match: null,
      suggestions: suggestions.map(row => row.city).filter(Boolean),
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
