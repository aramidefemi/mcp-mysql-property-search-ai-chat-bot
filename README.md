# Property Chat System

A complete chat system for Nigerian property search with AI assistance, built with Next.js frontend and Express backend using OpenAI's GPT-4o-mini and Model Context Protocol (MCP) for safe database access.

## 🏗️ Architecture

- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Backend**: Express.js with TypeScript and MCP tools
- **AI**: OpenAI GPT-4o-mini with function calling and streaming
- **Database**: MySQL (existing property data + new conversations table)
- **Security**: API key auth, rate limiting, input validation, parameterized SQL

## ✨ Features

### Core Functionality
- 🤖 **AI Chat Assistant**: Intelligent property search with natural language
- 🏘️ **Property Search**: Filter by location, price, bedrooms
- 💬 **Chat Persistence**: Conversation history stored in MySQL
- ⚡ **Streaming Responses**: Real-time chat with Server-Sent Events
- 🔍 **Location Validation**: Smart location matching with suggestions

### Technical Features
- 🛡️ **MCP Tools**: Safe database access with parameterized queries
- 📊 **Observability**: Structured logging and error handling
- 🚀 **Performance**: Connection pooling, pagination, rate limiting
- 🔒 **Security**: CORS, helmet, input validation, API key auth
- 📱 **Responsive UI**: Mobile-friendly chat interface

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MySQL database access (configured for remote server)
- OpenAI API key

### Installation

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd property-chat-system
   ```

2. **Backend setup**:
   ```bash
   cd backend
   npm install
   cp ../.env.example .env
   # Edit .env with your actual values
   npm run dev
   ```

3. **Frontend setup** (in another terminal):
   ```bash
   cd frontend
   npm install
   cp .env.local.example .env.local
   # Edit .env.local with backend URL
   npm run dev
   ```

4. **Database setup**:
   ```bash
   # Run the conversations table creation script
   mysql -h 160.79.116.246 -u admin -p agentsrequest < backend/db/conversations.sql
   ```

### Environment Variables

**Backend (.env)**:
```env
OPENAI_API_KEY=your_openai_api_key
BACKEND_API_KEY=your_backend_api_key
MYSQL_HOST=160.79.116.246
MYSQL_PORT=3306
MYSQL_USER=admin
MYSQL_PASSWORD=your_password
MYSQL_DB=agentsrequest
BACKEND_PORT=4000
```

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_KEY=your_backend_api_key
```

## 📁 Project Structure

```
/
├── backend/                 # Express API server
│   ├── src/
│   │   ├── server.ts       # Main server entry
│   │   ├── config.ts       # Environment config
│   │   ├── middlewares/    # Express middleware
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic (OpenAI)
│   │   ├── mcp-server/     # MCP tools implementation
│   │   └── utils/          # Shared utilities
│   ├── db/conversations.sql # Database schema
│   └── package.json
├── frontend/               # Next.js chat UI
│   ├── app/               # Next.js 13+ app directory
│   ├── lib/api.ts         # API client
│   └── package.json
├── ARCHITECTURE.md        # System design decisions
└── README.md             # This file
```

## 🔧 API Usage

### Send Chat Message
```javascript
POST /api/chat
Headers: { "x-api-key": "your-key" }
Body: {
  "conversationId": "optional-uuid",
  "message": "Find 2-bedroom apartments in Lagos",
  "stream": true
}
```

### Load Conversation
```javascript
GET /api/chats/{conversationId}
Headers: { "x-api-key": "your-key" }
```

### Search Properties Directly
```javascript
GET /api/properties/search?place[by]=city&place[value]=Lagos&bedrooms=2
Headers: { "x-api-key": "your-key" }
```

## 🛠️ Development

### Backend Development
```bash
cd backend
npm run dev        # Development server
npm run build      # Production build
npm test           # Run tests
npm run lint       # ESLint
```

### Frontend Development
```bash
cd frontend
npm run dev        # Next.js dev server
npm run build      # Production build
npm run lint       # Next.js lint
```

### Testing
```bash
# Backend tests
cd backend
npm test

# Integration testing
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-local-key" \
  -d '{"message": "Find properties in Lagos"}'
```

## 🎯 Usage Examples

### Chat Interface
1. Open http://localhost:3000
2. Type: "Show me 2-bedroom properties in Lagos under 1 million NGN"
3. The AI will:
   - Validate "Lagos" exists
   - Search properties with filters
   - Display results in chat format
   - Save conversation history

### API Integration
```javascript
import { sendChatMessage } from './lib/api';

const response = await sendChatMessage({
  message: "Find apartments in Abuja",
  stream: true
}, (chunk) => {
  if (chunk.type === 'token') {
    console.log(chunk.data.content);
  }
});
```

## 🔒 Security Features

- **API Key Authentication**: All endpoints protected
- **Rate Limiting**: 100 req/15min general, 50 req/5min chat
- **Input Validation**: Zod schemas for all inputs
- **SQL Injection Prevention**: Parameterized queries only via MCP
- **CORS Protection**: Configured allowed origins
- **Error Handling**: Sanitized error responses

## 📊 Monitoring

- **Logs**: Structured JSON logs via Pino
- **Health Checks**: `/health` endpoint
- **Request Tracing**: UUID correlation IDs
- **Token Usage**: OpenAI usage logged per request
- **Performance**: Response times and database metrics

## 🚀 Deployment

### Production Build
```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

### Docker (Optional)
```bash
# Backend Dockerfile example
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4000
CMD ["npm", "start"]
```

## 📚 Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and decisions
- [backend/API.md](backend/API.md) - Complete API documentation
- [backend/MCP_TOOLS.md](backend/MCP_TOOLS.md) - MCP tools specification
- [backend/README.md](backend/README.md) - Backend-specific documentation

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Use ESLint configuration
3. Write tests for MCP tools
4. Update documentation for API changes
5. Follow conventional commit messages

## ⚠️ Important Notes

- **Database Safety**: Only the `conversations` table may be created/modified
- **Property Table**: Existing property schema must remain unchanged
- **API Keys**: Never commit secrets to version control
- **Rate Limits**: Respect OpenAI API rate limits and costs
- **Error Handling**: Always use MCP tools for database access

## 📝 License

This project is for development purposes. Ensure you have proper licenses for:
- OpenAI API usage
- Database access
- Any third-party libraries

## 🆘 Troubleshooting

### Common Issues

**"Database connection failed"**
- Check MySQL credentials in .env
- Verify network access to 160.79.116.246:3306
- Ensure database `agentsrequest` exists

**"OpenAI API error"**
- Verify OPENAI_API_KEY is set correctly
- Check API key has sufficient credits
- Monitor rate limits in OpenAI dashboard

**"CORS errors in browser"**
- Check NEXT_PUBLIC_API_URL matches backend
- Verify CORS origins in backend/src/middlewares/cors.ts
- Ensure API key is correctly set

### Debug Mode
```bash
# Backend with debug logging
LOG_LEVEL=debug npm run dev

# Frontend with verbose logging
DEBUG=* npm run dev
```
