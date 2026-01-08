#!/bin/bash

# Script to run the backend server locally (not in Docker)

set -e

echo "🔧 Starting backend server locally..."
echo "📊 Backend will be available at http://localhost:3001"
echo "🔍 Press Ctrl+C to stop"
echo ""

npm run server
