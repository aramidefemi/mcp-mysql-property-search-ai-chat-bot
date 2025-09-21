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
    const { place, minPrice, maxPrice, bedrooms, limit, offset } = input;
    
    // Build the WHERE clause conditions
    const conditions: string[] = ['active = 1'];
    const params: any[] = [];
    
    // Location filter
    conditions.push(`(
      (? = 'city' AND LOWER(TRIM(city)) = LOWER(TRIM(?))) OR
      (? = 'location' AND LOWER(TRIM(location)) = LOWER(TRIM(?)))
    )`);
    params.push(place.by, place.value, place.by, place.value);
    
    // Price filters
    if (minPrice !== undefined) {
      conditions.push('(CAST(NULLIF(TRIM(price), \'\') AS DECIMAL(12,2)) >= ?)');
      params.push(minPrice);
    }
    
    if (maxPrice !== undefined) {
      conditions.push('(CAST(NULLIF(TRIM(price), \'\') AS DECIMAL(12,2)) <= ?)');
      params.push(maxPrice);
    }
    
    // Bedrooms filter
    if (bedrooms !== undefined) {
      conditions.push(`(
        (TRIM(CAST(bed_rooms AS CHAR)) REGEXP '^[0-9]+$')
        AND CAST(TRIM(CAST(bed_rooms AS CHAR)) AS UNSIGNED) = ?
      )`);
      params.push(bedrooms);
    }
    
    const whereClause = conditions.join(' AND ');
    
    // Count query for total results
    const countQuery = `
      SELECT COUNT(*) as total
      FROM property
      WHERE ${whereClause}
    `;
    
    // Main search query
    const searchQuery = `
      SELECT
        id,
        property_name,
        property_title,
        property_description,
        address,
        city,
        location,
        property_picture1,
        property_picture2,
        property_picture3,
        CAST(NULLIF(TRIM(price), '') AS DECIMAL(12,2)) AS price_num,
        TRIM(CAST(bed_rooms AS CHAR)) AS bed_rooms_text,
        contact_number,
        latitude,
        longitude,
        date_created
      FROM property
      WHERE ${whereClause}
      ORDER BY date_created DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    
    // Execute both queries
    const [countResult, searchResult] = await Promise.all([
      executeQuery(countQuery, params) as Promise<CountRow[]>,
      executeQuery(searchQuery, [...params, limit, offset]) as Promise<PropertyRow[]>,
    ]);
    
    const total = countResult[0]?.total || 0;
    
    // Transform the results
    const items: PropertyItem[] = searchResult.map(row => {
      // Parse pictures array, filtering out empty strings
      const pictures = [
        row.property_picture1,
        row.property_picture2,
        row.property_picture3,
      ].filter(pic => pic && pic.trim().length > 0);
      
      // Parse bedrooms as integer if possible
      let parsedBedrooms: number | null = null;
      if (row.bed_rooms_text && /^\d+$/.test(row.bed_rooms_text.trim())) {
        parsedBedrooms = parseInt(row.bed_rooms_text.trim(), 10);
      }
      
      return {
        id: row.id,
        name: row.property_name || '',
        title: row.property_title,
        description: row.property_description,
        address: row.address,
        city: row.city,
        location: row.location,
        pictures,
        price: row.price_num,
        bedrooms: parsedBedrooms,
        contact: row.contact_number,
        coords: {
          lat: row.latitude,
          lng: row.longitude,
        },
        createdAt: row.date_created.toISOString(),
      };
    });
    
    return {
      total,
      items,
    };
    
  } catch (error) {
    throw new DatabaseError(
      `Failed to search properties: ${JSON.stringify(input)}`,
      error
    );
  }
}

/**
 * Tool definition for OpenAI function calling
 */
export const searchPropertiesToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'db_search_properties',
    description: 'Search for properties with location, price, and bedroom filters. Always filter by active properties only.',
    parameters: {
      type: 'object',
      properties: {
        place: {
          type: 'object',
          properties: {
            by: {
              type: 'string',
              enum: ['city', 'location'],
              description: 'Whether to search by city or location field',
            },
            value: {
              type: 'string',
              description: 'The city or location name to search for',
            },
          },
          required: ['by', 'value'],
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
