## Property Buddy — Full‑Stack AI Assistant for Nigerian Real Estate

Live demo: [seal-app-94bro.ondigitalocean.app](https://seal-app-94bro.ondigitalocean.app/)

### What I built 
- **Deployed, production AI chat app** that understands natural language queries for Nigerian properties and returns structured results in real time.
- **From zero to shipped**: backend APIs, database access, AI orchestration, secure middleware, rate limiting, observability, and CI/CD-ready Docker deploys.

### Highlights recruiters care about
- **Built a real-time chat experience from scratch** using modern web technologies (Next.js App Router, React server components, streaming UX, Tailwind UI system).
- **Designed and shipped a resilient Node/Express API** with typed contracts, validation, and error handling that fails safely.
- **Implemented governed database access** via MCP tools (parameterized queries, connection pooling, least‑privilege patterns) to prevent prompt‑injection data exfiltration.
- **Production security hardening**: CORS strategy, Helmet, API key auth, per‑route rate limits, structured logging, graceful shutdowns.
- **Cloud-native delivery**: multi‑stage Docker builds, small runtime image, env‑driven config, DigitalOcean App Platform deploy.

### Tech, framed as outcomes
- **Frontend**: "Shipped a responsive, mobile‑first chat interface" with Next.js 14 + Tailwind; typed client (`lib/api.ts`) with streaming-friendly fetch and minimal rerenders.
- **Backend**: "Delivered a fault‑tolerant API" with Express, Zod validation, centralized error handling, rate limiting, and health checks for platform probes.
- **AI Integration**: "Operationalized an LLM agent" using OpenAI SDK (GPT‑4o‑mini) with conversation store and streaming responses.
- **Database**: "Hardened MySQL access" using `mysql2` pools, safe query builders, and MCP tool boundaries for property search and location checks.
- **Security/Observability**: "Instrumented secure-by-default middleware" (Helmet, CORS, auth) and request logging with correlation IDs.
- **DevX**: "Set up TypeScript across stack" with strict configs, Jest test harness, ESLint, and TSX for fast local dev.
- **Ops**: "Containerized and deployed" with a multi-stage Dockerfile, `.dockerignore`, env-driven ports, and platform health checks.

### Architecture at a glance
- **Frontend (Next.js)** → calls **Backend API** → invokes **MCP tools** → queries **MySQL** → streams results back to chat UI via typed responses.

### Quick start (local)
1. Backend
   - `cd backend && npm ci && npm run build && npm start`
   - Env: `OPENAI_API_KEY`, `BACKEND_API_KEY`, `MYSQL_*`, `NODE_ENV`
2. Frontend
   - `cd frontend && npm ci && npm run dev`

### Deployed demo
- Running on DigitalOcean App Platform with containerized backend. Live here: [seal-app-94bro.ondigitalocean.app](https://seal-app-94bro.ondigitalocean.app/)

### Screenshots
![Property Buddy Demo](1.png)