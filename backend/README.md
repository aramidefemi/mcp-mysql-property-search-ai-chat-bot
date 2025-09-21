# Property Chat Backend

A TypeScript/Express backend API for the Property Chat system with OpenAI integration and MCP-based database access.

## Features

- 🤖 **OpenAI Integration**: GPT-4o-mini with function calling and streaming responses
- 🛡️ **MCP Tools**: Safe database access through Model Context Protocol tools
- 💬 **Chat Persistence**: JSON-based conversation storage in MySQL
- 🚀 **Streaming Responses**: Server-Sent Events for real-time chat
- 🔒 **Security**: Rate limiting, CORS, input validation, API key auth
- 📊 **Observability**: Structured logging with Pino

## Quick Start

### Prerequisites

- Node.js 18+
- Access to MySQL database (configured for 160.79.116.246:3306)
- OpenAI API key

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp ../.env.example .env
# Edit .env with your actual values

# Development mode
npm run dev

# Production build
npm run build
npm start
```

### Environment Variables

Required environment variables (see `.env.example`):

```bash
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
BACKEND_API_KEY=your_backend_api_key

# MySQL Database  
MYSQL_HOST=160.79.116.246
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=your_db_password
MYSQL_DB=agentsrequest

# Server
BACKEND_PORT=4000
NODE_ENV=development
```

## API Endpoints

### Chat Endpoints

#### POST `/api/chat`

Send a chat message and get AI response.

**Headers:**
- `x-api-key`: Your backend API key
- `Content-Type`: application/json

**Body:**
```json
{
  "conversationId": "optional-uuid-v4",
  "message": "Find 2-bedroom apartments in Lagos",
  "stream": true
}
```

**Response (Streaming):**
Server-Sent Events with chunks:
```json
{"type": "token", "data": {"content": "I'll help you find..."}}
{"type": "tool", "data": {"toolCall": "db_search_properties", "result": "..."}}
{"type": "complete", "data": {"conversationId": "uuid", "totalContent": "..."}}
```

**Response (Non-streaming):**
```json
{
  "success": true,
  "data": {
    "conversationId": "uuid-v4",
    "message": "I found several properties...",
    "usage": { "totalTokens": 150 }
  }
}
```

#### GET `/api/chats/:id`

Retrieve conversation history by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-v4",
    "messages": [
      {
        "role": "user",
        "content": "Hello",
        "ts": "2023-01-01T00:00:00.000Z"
      }
    ],
    "created_at": "2023-01-01T00:00:00.000Z",
    "updated_at": "2023-01-01T00:00:00.000Z"
  }
}
```

### Property Endpoints

#### GET `/api/properties/search`

Direct property search for debugging/testing.

**Query Parameters:**
```
place[by]=city&place[value]=Lagos
minPrice=100000
maxPrice=500000  
bedrooms=2
limit=20
offset=0
```

#### GET `/health`

Health check endpoint (no auth required).

## MCP Tools

The system uses four MCP tools for database operations:

### `db_location_exists`
- **Purpose**: Validate location names and suggest alternatives
- **Input**: `{ name: string }`
- **Output**: `{ exists: boolean, match: object, suggestions: string[] }`

### `db_search_properties`
- **Purpose**: Search properties with filters
- **Input**: `{ place, minPrice?, maxPrice?, bedrooms?, limit?, offset? }`
- **Output**: `{ total: number, items: Property[] }`

### `chat_load_conversation`
- **Purpose**: Load conversation history
- **Input**: `{ conversationId: string }`
- **Output**: `Conversation | null`

### `chat_save_message`  
- **Purpose**: Save message to conversation
- **Input**: `{ conversationId: string, message: Message }`
- **Output**: `{ success: boolean }`

## Database Schema

Only the `conversations` table is created by this system:

```sql
CREATE TABLE conversations (
  id CHAR(36) PRIMARY KEY,
  user_ref VARCHAR(255) NULL,
  messages JSON NOT NULL,
  context JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

The existing `property` table is accessed read-only.

## Development

### Scripts

```bash
npm run dev        # Development server with hot reload
npm run build      # Production build
npm start          # Start production server  
npm test           # Run tests
npm run lint       # ESLint check
npm run type-check # TypeScript check
```

### Project Structure

```
src/
├── server.ts              # Express app entry point
├── config.ts              # Environment configuration
├── middlewares/           # Express middleware
│   ├── auth.ts           # API key authentication
│   ├── cors.ts           # CORS configuration  
│   ├── errors.ts         # Error handling
│   ├── logging.ts        # Pino logging setup
│   ├── ratelimit.ts      # Rate limiting rules
│   └── validation.ts     # Zod validation helpers
├── routes/               # API route handlers
│   ├── chat.ts          # Chat endpoints
│   └── properties.ts    # Property endpoints
├── services/            # Business logic services
│   └── openai.ts       # OpenAI integration
├── mcp-server/         # MCP tools implementation
│   ├── index.ts        # MCP server setup
│   ├── db/pool.ts      # MySQL connection pool
│   └── tools/          # Individual MCP tools
└── utils/              # Shared utilities
    ├── types.ts        # TypeScript types/schemas
    └── ids.ts          # UUID generation
```

## Deployment

1. Set environment variables
2. Install dependencies: `npm ci`
3. Build: `npm run build`
4. Run database migration: `node -e "require('./dist/mcp-server/db/pool.js').executeQuery(require('fs').readFileSync('./db/conversations.sql', 'utf8'))"`
5. Start: `npm start`

## Monitoring

- **Logs**: Structured JSON logs via Pino
- **Health**: GET `/health` endpoint
- **Metrics**: OpenAI token usage logged per request
- **Errors**: All errors logged with request context

## Security

- API key authentication on all endpoints
- Rate limiting (100 req/15min general, 50 req/5min chat)
- Input validation with Zod schemas  
- Parameterized SQL queries only (via MCP tools)
- CORS configured for allowed origins
- Helmet security headers
