import { locationExists, locationExistsToolDefinition } from './tools/db.location_exists.js';
import { searchProperties, searchPropertiesToolDefinition } from './tools/db.search_properties.js';
import { loadConversation, loadConversationToolDefinition } from './tools/chat.load_conversation.js';
import { saveMessage, saveMessageToolDefinition } from './tools/chat.save_message.js';
import { testConnection, closePool } from './db/pool.js';

// Export all tools and their definitions
export const mcpTools = {
  db_location_exists: locationExists,
  db_search_properties: searchProperties,
  chat_load_conversation: loadConversation,
  chat_save_message: saveMessage,
};

export const mcpToolDefinitions = [
  locationExistsToolDefinition,
  searchPropertiesToolDefinition,
  loadConversationToolDefinition,
  saveMessageToolDefinition,
];

// Type for tool function calls
export type ToolFunction = keyof typeof mcpTools;

/**
 * Execute a tool by name with provided arguments
 */
export async function executeTool(toolName: ToolFunction, args: any): Promise<any> {
  const tool = mcpTools[toolName];
  
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  try {
    return await tool(args);
  } catch (error) {
    console.error(`Tool execution failed for ${toolName}:`, error);
    throw error;
  }
}

/**
 * Initialize MCP server and test database connection
 */
export async function initializeMcpServer(): Promise<boolean> {
  try {
    console.log('Testing database connection...');
    const isConnected = await testConnection();
    
    if (!isConnected) {
      console.error('Database connection test failed');
      return false;
    }
    
    console.log('MCP server initialized successfully');
    console.log(`Available tools: ${Object.keys(mcpTools).join(', ')}`);
    
    return true;
  } catch (error) {
    console.error('Failed to initialize MCP server:', error);
    return false;
  }
}

/**
 * Cleanup function for graceful shutdown
 */
export async function shutdownMcpServer(): Promise<void> {
  try {
    console.log('Shutting down MCP server...');
    await closePool();
    console.log('MCP server shut down successfully');
  } catch (error) {
    console.error('Error during MCP server shutdown:', error);
  }
}

// Helper function to get tool definition by function name
export function getToolDefinition(functionName: string) {
  return mcpToolDefinitions.find(def => def.function.name === functionName);
}