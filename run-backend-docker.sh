#!/bin/bash

# Script to run the backend in a Docker container

set -e

echo "🔵 Building Docker image for backend..."
docker build -t deploy-hub-backend .

echo "🔵 Stopping any existing backend container..."
docker stop deploy-hub-backend-container 2>/dev/null || true
docker rm deploy-hub-backend-container 2>/dev/null || true

echo "🚀 Starting backend in Docker container..."
docker run -d \
  --name deploy-hub-backend-container \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --restart unless-stopped \
  deploy-hub-backend

echo "✅ Backend is running in Docker!"
echo "📊 Backend URL: http://localhost:3001"
echo "🔍 To view logs: docker logs -f deploy-hub-backend-container"
echo "🛑 To stop: docker stop deploy-hub-backend-container"
