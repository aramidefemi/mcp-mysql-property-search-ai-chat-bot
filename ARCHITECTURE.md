# Architecture Overview

## System Design

This chat system consists of three main components:

1. **Next.js Frontend**: Minimal chat UI with real-time streaming
2. **Express Backend**: TypeScript API server with OpenAI integration
3. **MCP Layer**: Database access tools for safe SQL operations

## Key Architectural Decisions

### MCP Tool Layer
- **Rationale**: Encapsulates database logic, ensures parameterized queries, provides auditability
- **Benefits**: Type safety, testability, clear separation of concerns
- **Implementation**: In-process MCP server for development simplicity

### Message Storage
- **Strategy**: JSON column in single `conversations` table
- **Justification**: Atomic operations, no complex joins, sufficient for chat use case
- **Schema**: `messages` JSON array with `{ role, content, timestamp }` objects

### Technology Stack
- **Backend**: Express + TypeScript for robust API development
- **Database**: mysql2/promise with connection pooling
- **Validation**: Zod for runtime type checking
- **Streaming**: Server-Sent Events for real-time chat
- **AI**: OpenAI GPT-4o-mini with function calling

## Data Flow

1. User sends message to `/api/chat`
2. Backend validates and saves user message
3. OpenAI processes message with available tools:
   - `db.location_exists`: Validates and suggests locations
   - `db.search_properties`: Queries property database
   - `chat.save_message`: Persists conversation
4. Response streams back to frontend via SSE
5. Frontend displays tokens in real-time

## Security & Safety

- API key authentication for all endpoints
- Rate limiting to prevent abuse
- Parameterized queries only (enforced via MCP tools)
- Input validation with Zod schemas
- Environment-based configuration (no hardcoded secrets)

## Database Strategy

### Read-Only Property Table
- Existing schema preserved unchanged
- Access via MCP tools only
- Focus on `city`, `location`, `price`, `bed_rooms`, `active` columns

### Writable Conversations Table
- Single new table for chat persistence
- UUID primary keys for conversation identification
- JSON message storage with timestamps
- Auto-updating timestamps for audit trail

## Performance Considerations

- Connection pooling for database efficiency
- Streaming responses for better UX
- Pagination for large property result sets
- Structured logging for observability