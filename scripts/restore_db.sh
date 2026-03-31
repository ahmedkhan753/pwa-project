#!/bin/bash
# restore_db.sh — restore a postgres backup created by backup_db.sh.
# ⚠️  This REPLACES all current data with the backup. Use with care.
#
# Usage:
#   /home/ubuntu/app/scripts/restore_db.sh /home/ubuntu/db_backups/backup_20260101_120000.sql
#   /home/ubuntu/app/scripts/restore_db.sh        (lists available backups)

set -euo pipefail

BACKUP_DIR="/home/ubuntu/db_backups"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql>"
    echo ""
    echo "Available backups (newest first):"
    ls -lt "$BACKUP_DIR"/backup_*.sql 2>/dev/null | awk '{print $NF, $5, $6, $7, $8}' || echo "  (none found in $BACKUP_DIR)"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ File not found: $BACKUP_FILE"
    exit 1
fi

# Find the running postgres container
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '[-_]db[-_]?1?$' | head -1)

if [ -z "$DB_CONTAINER" ]; then
    echo "❌ No running postgres container found. Is docker-compose up?"
    exit 1
fi

echo "⚠️  This will REPLACE all data in inspection_db with: $BACKUP_FILE"
echo "Container: $DB_CONTAINER"
read -r -p "Type YES to confirm: " CONFIRM

if [ "$CONFIRM" != "YES" ]; then
    echo "Aborted."
    exit 0
fi

echo "🔄 Restoring..."
docker exec -i "$DB_CONTAINER" psql -U inspection_user inspection_db < "$BACKUP_FILE"
echo "✅ Restore complete from: $BACKUP_FILE"
