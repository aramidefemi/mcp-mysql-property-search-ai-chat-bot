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

    const { place, limit = 20, minPrice, maxPrice, bedrooms, offset = 0 } = input;
    console.log('search_properties called with:', { place, limit, minPrice, maxPrice, bedrooms, offset });
    
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    
    // Location search - check location, city, and address columns
    conditions.push(`(
      LOWER(location) LIKE CONCAT('%', LOWER(?), '%') OR
      LOWER(city) LIKE CONCAT('%', LOWER(?), '%') OR
      LOWER(address) LIKE CONCAT('%', LOWER(?), '%')
    )`);
    params.push(place, place, place);
    
    // Price filters
    if (minPrice !== undefined) {
      conditions.push('price_num >= ?');
      params.push(minPrice);
    }
    if (maxPrice !== undefined) {
      conditions.push('price_num <= ?');
      params.push(maxPrice);
    }
    
    // Bedroom filter
    if (bedrooms !== undefined) {
      conditions.push('bed_rooms_text LIKE ?');
      params.push(`%${bedrooms}%`);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM property ${whereClause}`;
    const countResult = await executeQuery<CountRow[]>(countQuery, params);
    const firstRow = Array.isArray(countResult) && countResult.length > 0 ? countResult[0] : null;
    const total = firstRow && firstRow.total ? firstRow.total : 0;
    
    // Get properties with limit and offset
    const query = `SELECT 
      id, property_name, property_title, property_description, 
      address, city, location, 
      property_picture1, property_picture2, property_picture3,
      price_num, bed_rooms_text, contact_number,
      latitude, longitude, date_created
    FROM property 
    ${whereClause}
    ORDER BY date_created DESC
    LIMIT ? OFFSET ?`;
    
    const searchParams = [...params, limit, offset];
    const rows = await executeQuery<PropertyRow[]>(query, searchParams);
    
    // Transform to PropertyItem format
    const items: PropertyItem[] = (Array.isArray(rows) ? rows : []).map(property => {
      // Parse bedrooms from text (e.g., "3 Bedrooms" -> 3)
      let bedrooms: number | null = null;
      if (property.bed_rooms_text) {
        const bedroomMatch = property.bed_rooms_text.match(/(\d+)/);
        if (bedroomMatch && bedroomMatch[1] !== undefined) {
          bedrooms = parseInt(bedroomMatch[1], 10);
        }
      }
      
      // Collect pictures
      const pictures = [
        property.property_picture1,
        property.property_picture2,
        property.property_picture3
      ].filter(pic => pic && pic !== '') as string[];
      
      return {
        id: property.id,
        name: property.property_name,
        title: property.property_title,
        description: property.property_description,
        address: property.address,
        city: property.city,
        location: property.location,
        pictures: pictures,
        price: property.price_num,
        bedrooms: bedrooms,
        contact: property.contact_number,
        coords: {
          lat: property.latitude,
          lng: property.longitude,
        },
        createdAt: property.date_created ? new Date(property.date_created).toISOString() : new Date().toISOString(),
      };
    });
    
    console.log(`Found ${items.length} properties matching "${place}" (total: ${total})`);
    
    return {
      total,
      items,
    };
     
  } catch (error) {
    console.error('Property search failed:', error);
    throw new DatabaseError(
      `Failed to search properties for: ${input.place}`,
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
    description: 'Search for properties with location, price, and bedroom filters. Uses address column for comprehensive location matching.',
    parameters: {
      type: 'object',
      properties: {
        place: {
          type: 'string',
          description: 'The location name to search for (e.g., "Lagos", "Ibadan", "Abuja"). Will match anywhere within property addresses.',
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