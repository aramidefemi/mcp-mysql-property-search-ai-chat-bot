/**
 * API client for communicating with the backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://stingray-app-7zm89.ondigitalocean.app/';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'dev-local-key';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: string;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    conversationId: string;
    message: string;
    usage?: any;
  };
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}

export interface Conversation {
  id: string;
  user_ref: string | null;
  messages: Message[];
  context: any;
  created_at: string;
  updated_at: string;
}

export interface StreamChunk {
  type: 'token' | 'tool' | 'done' | 'error' | 'complete';
  data: any;
}

/**
 * Send a chat message with optional streaming
 */
export async function sendChatMessage(
  request: ChatRequest,
  onStream?: (chunk: StreamChunk) => void
): Promise<ChatResponse> {
  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: { message: 'Request failed' } 
      }));
      throw new Error(errorData.error?.message || 'Request failed');
    }

    // Handle streaming response
    if (request.stream && response.headers.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let conversationId = '';
      let totalContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onStream?.(data);

                // Track conversation ID and content
                if (data.type === 'token' && data.data?.content) {
                  totalContent += data.data.content;
                }
                
                if (data.type === 'complete' && data.data?.conversationId) {
                  conversationId = data.data.conversationId;
                  totalContent = data.data.totalContent || totalContent;
                }

                // Handle completion or errors
                if (data.type === 'complete' || data.type === 'error') {
                  return {
                    success: data.type === 'complete',
                    data: data.type === 'complete' ? {
                      conversationId: conversationId || '',
                      message: totalContent,
                    } : undefined,
                    error: data.type === 'error' ? data.data : undefined,
                  };
                }
              } catch (parseError) {
                console.error('Failed to parse SSE data:', parseError);
              }
            }
          }
        }

        // If we get here, stream ended without complete/error
        return {
          success: true,
          data: {
            conversationId: conversationId || '',
            message: totalContent,
          },
        };

      } finally {
        reader.releaseLock();
      }
    } else {
      // Handle non-streaming response
      const data = await response.json();
      return data;
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'API_ERROR',
      },
    };
  }
}

/**
 * Load a conversation by ID
 */
export async function loadConversation(conversationId: string): Promise<Conversation | null> {
  try {
    const response = await fetch(`${API_URL}/api/chats/${conversationId}`, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to load conversation');
    }

    const data = await response.json();
    return data.success ? data.data : null;

  } catch (error) {
    console.error('Load conversation error:', error);
    return null;
  }
}

/**
 * Search properties directly (for testing/debugging)
 */
export async function searchProperties(params: any) {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_URL}/api/properties/search?${queryString}`, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error('Property search failed');
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Property search error:', error);
    throw error;
  }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    return data.success && data.data?.status === 'healthy';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}
