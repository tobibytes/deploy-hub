#!/bin/bash

# Script to run both frontend and backend servers concurrently

set -e

echo "🚀 Starting both frontend and backend servers..."
echo "📊 Frontend: http://localhost:5173"
echo "📊 Backend: http://localhost:3001"
echo "🔍 Press Ctrl+C to stop both servers"
echo ""

# Run both in parallel
npm run dev:all
