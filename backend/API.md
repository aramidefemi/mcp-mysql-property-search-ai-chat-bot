# Property Chat API Documentation

## Base URL
```
http://localhost:4000
```

## Authentication
All API endpoints (except `/health`) require authentication via the `x-api-key` header:

```http
x-api-key: your-backend-api-key
```

## Response Format
All API responses follow this format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}
```

## Endpoints

### Chat API

#### POST `/api/chat`
Send a message and get an AI response with property search capabilities.

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <your-api-key>`

**Request Body:**
```json
{
  "conversationId": "optional-uuid-v4-string",
  "message": "Find 2-bedroom apartments in Lagos under 1 million NGN",
  "stream": true
}
```

**Parameters:**
- `conversationId` (optional): UUID of existing conversation. If not provided, a new conversation will be created.
- `message` (required): User message (1-4000 characters)
- `stream` (optional): Enable streaming response via Server-Sent Events (default: true)

**Response (Streaming):**
Content-Type: `text/event-stream`

Stream of Server-Sent Events:
```
data: {"type": "token", "data": {"content": "I'll help you find"}}
data: {"type": "token", "data": {"content": " properties in Lagos"}}
data: {"type": "tool", "data": {"toolCall": {...}, "result": {...}}}
data: {"type": "complete", "data": {"conversationId": "uuid", "totalContent": "..."}}
```

Event Types:
- `token`: Streaming text content
- `tool`: Tool execution (db queries)
- `complete`: Response finished successfully
- `error`: Error occurred

**Response (Non-streaming):**
```json
{
  "success": true,
  "data": {
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "I found several 2-bedroom apartments in Lagos under ₦1,000,000...",
    "usage": {
      "promptTokens": 120,
      "completionTokens": 80,
      "totalTokens": 200
    }
  }
}
```

#### GET `/api/chats/:id`
Retrieve a conversation by ID.

**Parameters:**
- `id` (required): UUID of the conversation

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_ref": null,
    "messages": [
      {
        "role": "user",
        "content": "Find properties in Lagos",
        "ts": "2023-11-20T10:30:00.000Z"
      },
      {
        "role": "assistant", 
        "content": "I'll help you find properties in Lagos...",
        "ts": "2023-11-20T10:30:05.000Z"
      }
    ],
    "context": {},
    "created_at": "2023-11-20T10:30:00.000Z",
    "updated_at": "2023-11-20T10:30:05.000Z"
  }
}
```

### Properties API

#### GET `/api/properties/search`
Direct property search endpoint (mainly for debugging/testing).

**Query Parameters:**
- `place[by]` (required): Search by "city" or "location"
- `place[value]` (required): City/location name
- `minPrice` (optional): Minimum price filter
- `maxPrice` (optional): Maximum price filter  
- `bedrooms` (optional): Number of bedrooms
- `limit` (optional): Max results (default: 20, max: 50)
- `offset` (optional): Pagination offset (default: 0)

**Example:**
```
GET /api/properties/search?place[by]=city&place[value]=Lagos&minPrice=500000&maxPrice=2000000&bedrooms=2&limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "items": [
      {
        "id": 123,
        "name": "Modern 2BR Apartment",
        "title": "Luxury Living in Victoria Island",
        "description": "Beautiful 2-bedroom apartment with modern amenities...",
        "address": "123 Ahmadu Bello Way, Victoria Island",
        "city": "Lagos",
        "location": "Victoria Island",
        "pictures": [
          "https://example.com/pic1.jpg",
          "https://example.com/pic2.jpg"
        ],
        "price": 1500000,
        "bedrooms": 2,
        "contact": "+234 123 456 7890",
        "coords": {
          "lat": "6.4281",
          "lng": "3.4219"
        },
        "createdAt": "2023-11-15T08:00:00.000Z"
      }
    ]
  }
}
```

#### GET `/api/properties/health`
Health check for the properties service.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "timestamp": "2023-11-20T10:30:00.000Z",
    "queryTest": "passed"
  }
}
```

#### GET `/api/properties/stats`
Get database statistics (requires authentication).

**Response:**
```json
{
  "success": true,
  "data": {
    "sampleSearches": {
      "Lagos": {
        "total": 1247,
        "hasResults": true
      },
      "Abuja": {
        "total": 892,
        "hasResults": true
      }
    },
    "timestamp": "2023-11-20T10:30:00.000Z"
  }
}
```

### System API

#### GET `/health`
System health check (no authentication required).

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2023-11-20T10:30:00.000Z",
    "environment": "development",
    "version": "1.0.0"
  }
}
```

#### GET `/`
API information (no authentication required).

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Property Chat API Server",
    "version": "1.0.0",
    "endpoints": {
      "chat": "/api/chat",
      "conversations": "/api/chats/:id",
      "properties": "/api/properties/search",
      "health": "/health"
    }
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `AUTH_ERROR` | 401 | Authentication failed |
| `CONVERSATION_NOT_FOUND` | 404 | Conversation ID not found |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `OPENAI_ERROR` | 500 | OpenAI API call failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Rate Limits

- **General API**: 100 requests per 15 minutes per IP
- **Chat endpoints**: 50 requests per 5 minutes per IP  
- **Search endpoints**: 30 requests per minute per IP

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when limit resets

## Property Data Schema

Properties returned from the API have this structure:

```typescript
interface PropertyItem {
  id: number;                           // Unique property ID
  name: string;                        // Property name
  title: string | null;                // Property title
  description: string | null;          // Property description  
  address: string | null;              // Street address
  city: string | null;                 // City name
  location: string | null;             // Specific location/area
  pictures: string[];                  // Array of image URLs
  price: number | null;                // Price in NGN
  bedrooms: number | null;             // Number of bedrooms
  contact: string | null;              // Contact phone number
  coords: {                           // GPS coordinates
    lat: string | null;
    lng: string | null;
  };
  createdAt: string;                   // ISO timestamp
}
```

## Example Usage

### JavaScript/TypeScript

```javascript
// Send a chat message with streaming
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key'
  },
  body: JSON.stringify({
    message: 'Find 3-bedroom houses in Abuja',
    stream: true
  })
});

if (response.headers.get('content-type')?.includes('text/event-stream')) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        console.log('Stream chunk:', data);
      }
    }
  }
}
```

### cURL Examples

```bash
# Send a chat message
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "message": "Show me properties in Lagos",
    "stream": false
  }'

# Get conversation
curl -H "x-api-key: your-api-key" \
  http://localhost:4000/api/chats/550e8400-e29b-41d4-a716-446655440000

# Search properties directly  
curl -H "x-api-key: your-api-key" \
  "http://localhost:4000/api/properties/search?place[by]=city&place[value]=Lagos&limit=5"

# Health check
curl http://localhost:4000/health
```