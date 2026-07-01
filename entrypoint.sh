#!/bin/sh
set -e

mkdir -p "$(dirname "$DB_PATH")"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH. Initializing..."
  node server/init-db.js
  echo "Database initialized."
fi

echo "Starting server..."
exec node server/index.js
