#!/bin/bash

# Stop backend process running on host

echo "🛑 Stopping backend process..."
pkill -f "npx tsx server/index.ts" || pkill -f "node server/index.ts" || echo "No backend process found"
echo "✅ Backend stopped"
