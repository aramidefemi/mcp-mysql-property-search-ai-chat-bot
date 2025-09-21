import { config } from '../config.js';

// Test environment setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  
  // Mock console methods to reduce test noise
  if (process.env.SILENT_TESTS === 'true') {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
  }
});

afterAll(async () => {
  // Cleanup any global resources
});

// Global test utilities
global.testUtils = {
  createMockMessage: (role: 'user' | 'assistant' | 'system', content: string) => ({
    role,
    content,
    ts: new Date().toISOString(),
  }),
  
  createMockConversation: (id: string, messages: any[] = []) => ({
    id,
    user_ref: null,
    messages,
    context: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
  
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};
