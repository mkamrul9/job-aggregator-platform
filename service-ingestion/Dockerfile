# service-ingestion/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# No EXPOSE instruction needed because it doesn't serve HTTP traffic
CMD ["node", "index.js"]
