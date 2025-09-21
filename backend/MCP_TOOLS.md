# MCP Tools Documentation

This document describes the Model Context Protocol (MCP) tools used by the Property Chat system for database access and conversation management.

## Overview

The MCP tools provide a safe, structured way for the OpenAI assistant to interact with the MySQL database. All database operations go through these tools, ensuring parameterized queries and proper error handling.

## Database Tools

### `db_location_exists`

Validates location names against the property database and provides suggestions for invalid locations.

**Function Name:** `db_location_exists`

**Purpose:** 
- Check if a location (city or area) exists in the database
- Provide alternative suggestions when location is not found
- Support case-insensitive matching

**Input Schema:**
```json
{
  "name": "string"  // Location name to validate
}
```

**Output Schema:**
```json
{
  "exists": "boolean",           // Whether location was found
  "match": {                     // Exact match details (if found)
    "city": "string | undefined",
    "location": "string | undefined"  
  } | null,
  "suggestions": "string[]"      // Alternative location names (if not found)
}
```

**SQL Operations:**
1. **Exact Match Query:**
   ```sql
   SELECT DISTINCT city, location
   FROM property
   WHERE active = 1
     AND (
       LOWER(TRIM(city)) = LOWER(TRIM(?)) OR
       LOWER(TRIM(location)) = LOWER(TRIM(?))
     )
     AND (city IS NOT NULL AND city <> '' OR location IS NOT NULL AND location <> '')
   LIMIT 1
   ```

2. **Suggestions Query (if no match):**
   ```sql
   SELECT DISTINCT city
   FROM property
   WHERE active = 1 
     AND city IS NOT NULL 
     AND city <> ''
     AND LOWER(city) LIKE CONCAT(LOWER(?), '%')
   ORDER BY city
   LIMIT 5
   ```

**Example Usage:**
```json
// Input
{ "name": "Lagos" }

// Output
{
  "exists": true,
  "match": { "city": "Lagos", "location": null },
  "suggestions": []
}
```

```json
// Input  
{ "name": "Lagoss" }

// Output
{
  "exists": false,
  "match": null,
  "suggestions": ["Lagos", "Lafia"]
}
```

---

### `db_search_properties`

Searches for properties with various filters including location, price range, and bedroom count.

**Function Name:** `db_search_properties`

**Purpose:**
- Search active properties by city or location
- Apply price and bedroom filters
- Support pagination
- Return structured property data

**Input Schema:**
```json
{
  "place": {
    "by": "city | location",     // Search field
    "value": "string"            // Search value
  },
  "minPrice": "number | null",   // Minimum price (optional)
  "maxPrice": "number | null",   // Maximum price (optional)  
  "bedrooms": "number | null",   // Number of bedrooms (optional)
  "limit": "number",             // Max results (default: 20, max: 50)
  "offset": "number"             // Pagination offset (default: 0)
}
```

**Output Schema:**
```json
{
  "total": "number",             // Total matching results
  "items": [
    {
      "id": "number",
      "name": "string",
      "title": "string | null",
      "description": "string | null",
      "address": "string | null",
      "city": "string | null", 
      "location": "string | null",
      "pictures": "string[]",    // Array of image URLs
      "price": "number | null",  // Price in NGN
      "bedrooms": "number | null", // Parsed bedroom count
      "contact": "string | null",
      "coords": {
        "lat": "string | null",
        "lng": "string | null"
      },
      "createdAt": "string"      // ISO timestamp
    }
  ]
}
```

**SQL Operations:**

1. **Count Query:**
   ```sql
   SELECT COUNT(*) as total
   FROM property
   WHERE active = 1
     AND (
       (? = 'city' AND LOWER(TRIM(city)) = LOWER(TRIM(?))) OR
       (? = 'location' AND LOWER(TRIM(location)) = LOWER(TRIM(?)))
     )
     AND ( (? IS NULL) OR (CAST(NULLIF(TRIM(price), '') AS DECIMAL(12,2)) >= ?) )
     AND ( (? IS NULL) OR (CAST(NULLIF(TRIM(price), '') AS DECIMAL(12,2)) <= ?) )
     AND ( (? IS NULL) OR (
           (TRIM(CAST(bed_rooms AS CHAR)) REGEXP '^[0-9]+$')
           AND CAST(TRIM(CAST(bed_rooms AS CHAR)) AS UNSIGNED) = ?
         )
     )
   ```

2. **Search Query:**
   ```sql
   SELECT
     id, property_name, property_title, property_description,
     address, city, location,
     property_picture1, property_picture2, property_picture3,
     CAST(NULLIF(TRIM(price), '') AS DECIMAL(12,2)) AS price_num,
     TRIM(CAST(bed_rooms AS CHAR)) AS bed_rooms_text,
     contact_number, latitude, longitude, date_created
   FROM property
   WHERE [same conditions as count query]
   ORDER BY date_created DESC, id DESC
   LIMIT ? OFFSET ?
   ```

**Data Transformation:**
- `price`: VARCHAR → DECIMAL casting with null handling
- `bed_rooms`: TINYBLOB → STRING → INTEGER parsing with regex validation
- `pictures`: Combines picture1, picture2, picture3 into array, filtering empties
- `coords`: Preserves lat/lng as strings for precision

**Example Usage:**
```json
// Input
{
  "place": { "by": "city", "value": "Lagos" },
  "minPrice": 500000,
  "maxPrice": 2000000, 
  "bedrooms": 2,
  "limit": 5,
  "offset": 0
}

// Output
{
  "total": 23,
  "items": [
    {
      "id": 1001,
      "name": "Modern 2BR Apartment",
      "title": "Luxury Living in VI",
      "description": "Beautiful apartment with ocean view...",
      "address": "123 Ahmadu Bello Way",
      "city": "Lagos",
      "location": "Victoria Island", 
      "pictures": [
        "https://example.com/pic1.jpg",
        "https://example.com/pic2.jpg"
      ],
      "price": 1500000,
      "bedrooms": 2,
      "contact": "+234-123-456-7890",
      "coords": { "lat": "6.4281", "lng": "3.4219" },
      "createdAt": "2023-11-15T08:00:00.000Z"
    }
  ]
}
```

## Chat Tools

### `chat_load_conversation`

Loads a complete conversation history by ID.

**Function Name:** `chat_load_conversation`

**Purpose:**
- Retrieve full conversation history for context
- Load message array with timestamps
- Support conversation continuity

**Input Schema:**
```json
{
  "conversationId": "string"  // UUID v4 conversation ID
}
```

**Output Schema:**
```json
{
  "id": "string",
  "user_ref": "string | null",
  "messages": [
    {
      "role": "user | assistant | system",
      "content": "string", 
      "ts": "string"     // ISO timestamp
    }
  ],
  "context": "object | null",
  "created_at": "string",    // ISO timestamp
  "updated_at": "string"     // ISO timestamp
} | null
```

**SQL Operation:**
```sql
SELECT id, user_ref, messages, context, created_at, updated_at
FROM conversations
WHERE id = ?
LIMIT 1
```

**Data Processing:**
- JSON parsing with error handling for `messages` field
- Validation of message structure with Zod schemas
- Timestamp conversion to ISO strings
- Graceful handling of malformed JSON data

**Example Usage:**
```json
// Input
{ "conversationId": "550e8400-e29b-41d4-a716-446655440000" }

// Output  
{
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
```

---

### `chat_save_message`

Saves a message to a conversation with upsert behavior.

**Function Name:** `chat_save_message`

**Purpose:**
- Persist individual messages to conversation history
- Create new conversations automatically
- Append messages to existing conversations
- Maintain message ordering and timestamps

**Input Schema:**
```json
{
  "conversationId": "string",  // UUID v4 conversation ID
  "message": {
    "role": "user | assistant | system",
    "content": "string",
    "ts": "string | undefined"  // Optional timestamp (auto-generated if missing)
  },
  "userRef": "string | undefined"  // Optional user identifier
}
```

**Output Schema:**
```json
{
  "success": "boolean",
  "conversationId": "string"
}
```

**SQL Operations:**

1. **Check Existing Conversation:**
   ```sql
   SELECT messages
   FROM conversations
   WHERE id = ?
   FOR UPDATE
   ```

2. **Update Existing (if found):**
   ```sql
   UPDATE conversations
   SET messages = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   ```

3. **Create New (if not found):**
   ```sql
   INSERT INTO conversations (id, user_ref, messages, context, created_at, updated_at)
   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ```

**Message Processing:**
- Auto-generates timestamp if not provided
- Validates message structure
- Safely parses existing messages JSON
- Appends new message to array
- Handles JSON parsing errors gracefully

**Transaction Safety:**
- Uses `FOR UPDATE` lock to prevent race conditions
- Atomic message appending
- Consistent timestamp handling

**Example Usage:**
```json
// Input
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "message": {
    "role": "user", 
    "content": "Show me properties in Abuja"
  },
  "userRef": "user123"
}

// Output
{
  "success": true,
  "conversationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Error Handling

All MCP tools implement consistent error handling:

### Error Types
- **DatabaseError**: SQL execution failures, connection issues
- **ValidationError**: Invalid input parameters
- **ParseError**: JSON parsing failures

### Error Response Format
```json
{
  "error": true,
  "message": "Human-readable error message", 
  "code": "ERROR_CODE",
  "details": "Additional error context (development only)"
}
```

### Logging
- All tool executions are logged with input parameters
- Errors include full context for debugging
- Performance metrics tracked per tool call
- Request tracing via correlation IDs

## Security Features

### SQL Injection Prevention
- **Parameterized Queries Only**: All SQL uses `?` parameter placeholders
- **Input Validation**: Zod schemas validate all inputs
- **Type Safety**: TypeScript ensures parameter type correctness

### Data Access Controls
- **Active-Only Filter**: Only `active = 1` properties are returned
- **Read-Only Property Access**: Property table is never modified
- **Isolated Conversations**: Conversations are user-scoped

### Rate Limiting
Tools respect the same rate limits as API endpoints:
- Database queries are resource-intensive operations
- Prevents abuse of expensive search operations
- Maintains system performance under load

## Performance Considerations

### Database Optimization
- **Indexes**: Key columns (city, location, active, date_created) should be indexed
- **Connection Pooling**: Reuses database connections efficiently  
- **Query Limits**: Default 20 results, maximum 50 per search
- **Pagination**: Offset-based pagination for large result sets

### Caching Opportunities
- Location validation results could be cached
- Popular search combinations could be memoized
- Conversation loading for active chats

### Monitoring
- Query execution times logged
- Tool call frequency tracked
- Error rates monitored per tool
- Database connection pool metrics
