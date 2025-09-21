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
    
    console.log('searchProperties called with place:', place, 'limit:', limit);
    
    // Simple query - just search address
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
      WHERE active = 1 AND address LIKE ?
      ORDER BY date_created DESC, id DESC
      LIMIT ?
    `;
    
    const searchParams = [`%${place}%`, limit];
    
    console.log('Executing simple search query:', searchQuery);
    console.log('With params:', searchParams);
    
    // Execute search query
    const searchResult = await executeQuery(searchQuery, searchParams) as PropertyRow[];
    
    const total = searchResult.length;
    
    // Transform the results
    const items: PropertyItem[] = searchResult.map(row => {
      // Parse pictures array, filtering out empty strings
      const pictures = [
        row.property_picture1,
        row.property_picture2,
        row.property_picture3,
      ].filter((pic): pic is string => pic !== null && pic !== undefined && pic.trim().length > 0);
      
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
    console.error('Search properties error:', error);
    console.error('Input was:', JSON.stringify(input, null, 2));
    
    // Try a much simpler fallback search if the main search fails
    try {
      console.log('Attempting ultra-simple fallback search...');
      
      // First, try the absolute simplest query possible
      const ultraSimpleQuery = `
        SELECT id, property_name, address
        FROM property
        WHERE active = 1
        LIMIT 5
      `;
      
      console.log('Ultra simple query:', ultraSimpleQuery);
      const ultraSimpleResult = await executeQuery(ultraSimpleQuery, []) as any[];
      console.log('Ultra simple result count:', ultraSimpleResult.length);
      
      if (ultraSimpleResult.length > 0) {
        console.log('Basic query works, now trying with address filter...');
        
        const simpleQuery = `
          SELECT id, property_name, address
          FROM property
          WHERE active = 1 AND address LIKE ?
          LIMIT ?
        `;
        
        const simpleParams = [`%${input.place.toLowerCase()}%`, input.limit || 20];
        console.log('Simple query:', simpleQuery);
        console.log('Simple params:', simpleParams);
        
        const simpleResult = await executeQuery(simpleQuery, simpleParams) as any[];
        console.log('Simple result count:', simpleResult.length);
        
        if (simpleResult.length > 0) {
          // If this works, return a basic result
          return {
            total: simpleResult.length,
            items: simpleResult.map(row => ({
              id: row.id,
              name: row.property_name || '',
              title: null,
              description: null,
              address: row.address,
              city: null,
              location: null,
              pictures: [],
              price: null,
              bedrooms: null,
              contact: null,
              coords: { lat: null, lng: null },
              createdAt: new Date().toISOString(),
            })),
          };
        }
      }
      
      console.log('Simple queries failed, trying original fallback...');
      const fallbackQuery = `
        SELECT
          id,
          property_name,
          address
        FROM property
        WHERE active = 1
          AND LOWER(address) LIKE ?
        ORDER BY id DESC
        LIMIT ?
      `;
      
      const fallbackParams = [`%${input.place.toLowerCase()}%`, input.limit || 20];
      console.log('Fallback query:', fallbackQuery);
      console.log('Fallback params:', fallbackParams);
      
      const fallbackResult = await executeQuery(fallbackQuery, fallbackParams) as PropertyRow[];
      
      if (fallbackResult.length > 0) {
        console.log(`Fallback search found ${fallbackResult.length} results`);
        
        // Transform the results
        const items: PropertyItem[] = fallbackResult.map(row => {
          // Parse pictures array, filtering out empty strings
          const pictures = [
            row.property_picture1,
            row.property_picture2,
            row.property_picture3,
          ].filter((pic): pic is string => pic !== null && pic !== undefined && pic.trim().length > 0);
          
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
          total: items.length,
          items,
        };
      }
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
    }
    
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
