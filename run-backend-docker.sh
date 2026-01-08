#!/bin/bash

# Script to run the backend in a Docker container
#
# SECURITY NOTE: This script mounts the Docker socket (/var/run/docker.sock) into the container,
# which grants the container full Docker daemon privileges. This is necessary for the backend
# to manage Docker containers (which is the core functionality of this application).
# Only use this in development or trusted environments.

set -e

echo "🔵 Building Docker image for backend..."
docker build -t deploy-hub-backend .

echo "🔵 Stopping any existing backend container..."
docker stop deploy-hub-backend-container 2>/dev/null || true
docker rm deploy-hub-backend-container 2>/dev/null || true

echo "🔵 Running database migrations..."
if [ -f .env ]; then
  echo "📄 Found .env file, loading environment variables..."
  bash ./run-migrations.sh
else
  echo "⚠️  No .env file found. Skipping migrations."
fi

echo "🚀 Starting backend in Docker container..."

# Check if .env file exists and add it to the docker run command
ENV_FILE_ARG=""
if [ -f .env ]; then
  echo "📄 Found .env file, loading environment variables..."
  ENV_FILE_ARG="--env-file .env"
fi

docker run -d \
  --name deploy-hub-backend-container \
  -p 3001:3001 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  $ENV_FILE_ARG \
  --restart unless-stopped \
  deploy-hub-backend

echo "✅ Backend is running in Docker!"
echo "📊 Backend URL: http://localhost:3001"
echo "🔍 To view logs: docker logs -f deploy-hub-backend-container"
echo "🛑 To stop: docker stop deploy-hub-backend-container"
