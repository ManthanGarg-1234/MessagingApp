# Production Multi-Stage Dockerfile for Baatein Backend
FROM node:20-alpine AS base
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
