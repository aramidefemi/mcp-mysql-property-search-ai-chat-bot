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
    
    // Check for exact matches in location and city columns
    const exactQuery = `
      SELECT DISTINCT location, city, address
      FROM property
      WHERE LOWER(location) = LOWER(?) 
         OR LOWER(city) = LOWER(?)
      LIMIT 1
    `;
    
    const exactMatches = await executeQuery<LocationRow[]>(exactQuery, [name, name]);
    
    if (Array.isArray(exactMatches) && exactMatches.length > 0 && exactMatches[0]) {
      const match = exactMatches[0];
      return {
        exists: true,
        match: {
          city: match.city || undefined,
          location: match.location || undefined,
        },
        suggestions: [],
      };
    }
    
    // Get suggestions for partial matches
    const suggestionsQuery = `
      SELECT DISTINCT location, city
      FROM property
      WHERE LOWER(location) LIKE CONCAT('%', LOWER(?), '%')
         OR LOWER(city) LIKE CONCAT('%', LOWER(?), '%')
         OR LOWER(address) LIKE CONCAT('%', LOWER(?), '%')
      LIMIT 3
    `;
    
    const suggestions = await executeQuery<LocationRow[]>(suggestionsQuery, [name, name, name]);
    const suggestionStrings = (Array.isArray(suggestions) ? suggestions : [])
      .map(row => row.location || row.city || '')
      .filter(loc => loc !== '');
    
    console.log(`Location "${name}" exists: false, suggestions: ${suggestionStrings.length}`);
    
    return {
      exists: false,
      match: null,
      suggestions: suggestionStrings,
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