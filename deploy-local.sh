#!/bin/bash
# deploy-local.sh

echo "🚀 Starting Job Aggregator Local Deployment..."

# Stop and remove existing containers and dangling images
echo "🧹 Cleaning up old containers..."
docker compose down

# Rebuild the images (forcing a clean build for the scraper)
echo "🏗️ Building Microservices..."
docker compose build --no-cache scraper-service

# Bring up the network in detached mode
echo "🌐 Starting up the cluster..."
docker compose up -d

echo "✅ Deployment successful. Checking status..."
docker compose ps

echo "Applying database migrations..."
# Wait a few seconds to ensure Postgres is fully initialized
sleep 5 
docker compose exec user-service npx prisma db push
