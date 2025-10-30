# Multi-stage Dockerfile for backend service

FROM node:20-alpine AS builder
WORKDIR /app

# Install build tools for native modules if needed (e.g., mysql2)
RUN apk add --no-cache python3 make g++

# Install deps first for better caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Only prod deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Health port for DigitalOcean App Platform
EXPOSE 8080

CMD ["node", "dist/server.js"]


