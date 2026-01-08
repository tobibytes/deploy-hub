#!/bin/bash

set -e

# Load environment variables from .env file
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set in .env file"
  exit 1
fi

echo "🔵 Running database migrations..."

# Verify psql is available
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found. Please install PostgreSQL client tools."
  exit 1
fi

MIGRATIONS_DIR="./migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "⚠️  Migrations directory not found at $MIGRATIONS_DIR"
  exit 1
fi

# Create migrations tracking table if it doesn't exist
echo "📋 Setting up migrations tracking..."
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS deploy_schema_migrations (
    version BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );
" 2>/dev/null || true

# Execute all migration files in order
echo "📝 Checking for pending migrations..."
PENDING_COUNT=0

for migration_file in $(ls -1 $MIGRATIONS_DIR/*.sql 2>/dev/null | sort); do
  version=$(basename "$migration_file" | cut -d'_' -f1)
  name=$(basename "$migration_file" .sql)
  
  # Check if migration has already been applied
  MIGRATION_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM deploy_schema_migrations WHERE version = $version" 2>/dev/null | grep -c 1 || echo 0)
  
  if [ "$MIGRATION_EXISTS" -eq 1 ]; then
    echo "✓ Already applied: $name"
  else
    echo "⚡ Applying migration: $name"
    
    # Execute migration file
    if psql "$DATABASE_URL" -f "$migration_file" > /dev/null 2>&1; then
      # Record migration
      psql "$DATABASE_URL" -c "INSERT INTO deploy_schema_migrations (version, name) VALUES ($version, '$name')" 2>/dev/null
      echo "   ✓ Migration $name applied successfully"
      PENDING_COUNT=$((PENDING_COUNT + 1))
    else
      echo "   ❌ Failed to apply migration: $name"
      exit 1
    fi
  fi
done

echo ""
if [ $PENDING_COUNT -gt 0 ]; then
  echo "✅ Successfully applied $PENDING_COUNT migration(s)!"
else
  echo "✅ All migrations already applied. Database is up to date."
fi
