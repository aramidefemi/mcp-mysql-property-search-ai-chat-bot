import { locationExists } from '../mcp-server/tools/db.location_exists.js';
import { searchProperties } from '../mcp-server/tools/db.search_properties.js';
import { loadConversation, saveMessage } from '../mcp-server/index.js';

// Mock the database pool
jest.mock('../mcp-server/db/pool.js', () => ({
  executeQuery: jest.fn(),
}));

import { executeQuery } from '../mcp-server/db/pool.js';
const mockExecuteQuery = executeQuery as jest.MockedFunction<typeof executeQuery>;

describe('MCP Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('locationExists', () => {
    it('should return true for existing location', async () => {
      mockExecuteQuery.mockResolvedValueOnce([
        { city: 'Lagos', location: null }
      ]);

      const result = await locationExists({ name: 'Lagos' });

      expect(result.exists).toBe(true);
      expect(result.match).toEqual({ city: 'Lagos', location: undefined });
      expect(result.suggestions).toEqual([]);
    });

    it('should return suggestions for non-existing location', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([]) // No exact match
        .mockResolvedValueOnce([   // Suggestions
          { city: 'Lagos' },
          { city: 'Lafia' }
        ]);

      const result = await locationExists({ name: 'Lagoss' });

      expect(result.exists).toBe(false);
      expect(result.match).toBeNull();
      expect(result.suggestions).toEqual(['Lagos', 'Lafia']);
    });
  });

  describe('searchProperties', () => {
    it('should search properties by city', async () => {
      const mockCount = [{ total: 1 }];
      const mockProperties = [{
        id: 1,
        property_name: 'Test Property',
        property_title: 'Test Title',
        property_description: 'Test Description',
        address: '123 Test St',
        city: 'Lagos',
        location: 'Victoria Island',
        property_picture1: 'pic1.jpg',
        property_picture2: '',
        property_picture3: 'pic3.jpg',
        price_num: 1000000,
        bed_rooms_text: '2',
        contact_number: '+234123456789',
        latitude: '6.4281',
        longitude: '3.4219',
        date_created: new Date('2023-01-01'),
      }];

      mockExecuteQuery
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockProperties);

      const result = await searchProperties({
        place: { by: 'city', value: 'Lagos' },
        limit: 20,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 1,
        name: 'Test Property',
        title: 'Test Title',
        description: 'Test Description',
        address: '123 Test St',
        city: 'Lagos',
        location: 'Victoria Island',
        pictures: ['pic1.jpg', 'pic3.jpg'],
        price: 1000000,
        bedrooms: 2,
        contact: '+234123456789',
        coords: { lat: '6.4281', lng: '3.4219' },
        createdAt: '2023-01-01T00:00:00.000Z',
      });
    });

    it('should handle invalid bedroom data', async () => {
      const mockCount = [{ total: 1 }];
      const mockProperties = [{
        id: 1,
        property_name: 'Test Property',
        property_title: null,
        property_description: null,
        address: null,
        city: 'Lagos',
        location: null,
        property_picture1: '',
        property_picture2: '',
        property_picture3: '',
        price_num: null,
        bed_rooms_text: 'invalid', // Non-numeric bedroom data
        contact_number: null,
        latitude: null,
        longitude: null,
        date_created: new Date('2023-01-01'),
      }];

      mockExecuteQuery
        .mockResolvedValueOnce(mockCount)
        .mockResolvedValueOnce(mockProperties);

      const result = await searchProperties({
        place: { by: 'city', value: 'Lagos' },
        limit: 20,
        offset: 0,
      });

      expect(result.items[0].bedrooms).toBeNull();
      expect(result.items[0].pictures).toEqual([]);
      expect(result.items[0].price).toBeNull();
    });
  });

  describe('Chat Tools', () => {
    it('should load existing conversation', async () => {
      const mockConversation = {
        id: 'test-id',
        user_ref: null,
        messages: JSON.stringify([
          { role: 'user', content: 'Hello', ts: '2023-01-01T00:00:00.000Z' }
        ]),
        context: null,
        created_at: new Date('2023-01-01'),
        updated_at: new Date('2023-01-01'),
      };

      mockExecuteQuery.mockResolvedValueOnce([mockConversation]);

      const result = await loadConversation({ conversationId: 'test-id' });

      expect(result).toBeTruthy();
      expect(result?.id).toBe('test-id');
      expect(result?.messages).toHaveLength(1);
      expect(result?.messages[0].content).toBe('Hello');
    });

    it('should return null for non-existent conversation', async () => {
      mockExecuteQuery.mockResolvedValueOnce([]);

      const result = await loadConversation({ conversationId: 'non-existent' });

      expect(result).toBeNull();
    });

    it('should save message to new conversation', async () => {
      mockExecuteQuery
        .mockResolvedValueOnce([]) // No existing conversation
        .mockResolvedValueOnce({}); // Insert success

      const result = await saveMessage({
        conversationId: 'new-id',
        message: {
          role: 'user',
          content: 'Hello',
          ts: '2023-01-01T00:00:00.000Z'
        }
      });

      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('new-id');
    });

    it('should append message to existing conversation', async () => {
      const existingMessages = [
        { role: 'user', content: 'First', ts: '2023-01-01T00:00:00.000Z' }
      ];

      mockExecuteQuery
        .mockResolvedValueOnce([{ messages: JSON.stringify(existingMessages) }]) // Existing conversation
        .mockResolvedValueOnce({}); // Update success

      const result = await saveMessage({
        conversationId: 'existing-id',
        message: {
          role: 'assistant',
          content: 'Reply',
          ts: '2023-01-01T00:01:00.000Z'
        }
      });

      expect(result.success).toBe(true);
    });
  });
});