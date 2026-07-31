# service-user/Dockerfile

# Stage 1: Build and generate Prisma client
FROM node:22-slim AS builder
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Generate Prisma Client for the Alpine Linux environment
RUN npx prisma generate 

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
