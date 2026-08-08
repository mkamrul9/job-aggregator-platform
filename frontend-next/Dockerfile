# frontend-next/Dockerfile

# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Copy the standalone output and static assets from the builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose port 3000 inside the container
EXPOSE 3000

# Start the standalone Node.js server
CMD ["node", "server.js"]
