#!/bin/bash

# Start backend directly on host (not in Docker)
# This gives direct access to Docker daemon for monitoring

set -e

echo "🔵 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  exit 1
fi

echo "✅ Node.js $(node --version)"

echo "🔵 Loading environment variables..."
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
  echo "📄 Loaded .env"
else
  echo "⚠️  No .env file found"
fi

echo "🔵 Running database migrations..."
bash ./run-migrations.sh

echo "🔵 Installing/updating dependencies..."
npm install

echo "🚀 Starting backend on http://localhost:${PORT:-3001}..."
npx tsx server/index.ts
