#!/bin/bash
# setup_server.sh — run ONCE on the server after first deploy.
# Sets up aliases, cron, and permissions. Safe to re-run.
#
# Usage (on server):
#   cd /home/ubuntu/app
#   bash scripts/setup_server.sh

set -euo pipefail

APP_DIR="/home/ubuntu/app"
SCRIPTS_DIR="$APP_DIR/scripts"

echo "🔧 Setting up server utilities..."

# Make all scripts executable
chmod +x "$SCRIPTS_DIR"/*.sh
echo "✅ Scripts are executable"

# Create backup directory
mkdir -p /home/ubuntu/db_backups
echo "✅ Backup directory: /home/ubuntu/db_backups"

# Add aliases to .bashrc (idempotent)
BASHRC="/home/ubuntu/.bashrc"
MARKER="# pwa-project aliases"

if ! grep -q "$MARKER" "$BASHRC" 2>/dev/null; then
    cat >> "$BASHRC" << 'EOF'

# pwa-project aliases
alias safe-deploy='bash /home/ubuntu/app/scripts/safe_deploy.sh'
alias safe-restart='bash /home/ubuntu/app/scripts/backup_db.sh && cd /home/ubuntu/app && docker-compose down && docker-compose up -d && echo "✅ Restarted"'
alias db-backup='bash /home/ubuntu/app/scripts/backup_db.sh'
alias db-restore='bash /home/ubuntu/app/scripts/restore_db.sh'
alias db-list='ls -lt /home/ubuntu/db_backups/backup_*.sql 2>/dev/null | head -15 || echo "No backups found"'
EOF
    echo "✅ Aliases added to $BASHRC"
else
    echo "⏭️  Aliases already in $BASHRC — skipped"
fi

# Daily 2am backup via cron (idempotent)
CRON_JOB="0 2 * * * bash /home/ubuntu/app/scripts/backup_db.sh >> /home/ubuntu/db_backups/cron.log 2>&1"
EXISTING=$(crontab -l 2>/dev/null || true)

if echo "$EXISTING" | grep -qF "backup_db.sh"; then
    echo "⏭️  Cron job already exists — skipped"
else
    (echo "$EXISTING"; echo "$CRON_JOB") | crontab -
    echo "✅ Daily 2am backup cron job added"
fi

echo ""
echo "========================================"
echo "  ✅ Setup complete!"
echo ""
echo "  Available commands (after: source ~/.bashrc):"
echo "    safe-deploy    — backup + git pull + rebuild"
echo "    safe-restart   — backup + restart only"
echo "    db-backup      — manual backup now"
echo "    db-restore     — restore from a backup file"
echo "    db-list        — list available backups"
echo ""
echo "  ⚠️  NEVER use: docker-compose down -v"
echo "========================================"
echo ""
echo "Run: source ~/.bashrc"
