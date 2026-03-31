#!/bin/bash
# backup_db.sh — dump the postgres volume to a timestamped SQL file.
# Safe to run at any time, including while the app is live.
# Keeps the 10 most recent backups, deletes older ones automatically.
#
# Usage:
#   /home/ubuntu/app/scripts/backup_db.sh
#   (or copy to /home/ubuntu/backup_db.sh and run from there)

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/db_backups"
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"

# Find the running postgres container (works whether project is named "app" or anything else)
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '[-_]db[-_]?1?$' | head -1)

if [ -z "$DB_CONTAINER" ]; then
    echo "❌ No running postgres container found. Is docker-compose up?"
    exit 1
fi

echo "📦 Backing up from container: $DB_CONTAINER"
docker exec "$DB_CONTAINER" pg_dump -U inspection_user inspection_db > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "✅ Backup saved: $BACKUP_FILE ($SIZE)"

# Keep only the 10 most recent backups
EXCESS=$(ls -t "$BACKUP_DIR"/backup_*.sql 2>/dev/null | tail -n +11)
if [ -n "$EXCESS" ]; then
    echo "$EXCESS" | xargs rm -f
    echo "🗑️  Old backups pruned (kept 10 most recent)"
fi
