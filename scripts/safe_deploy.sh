#!/bin/bash
# safe_deploy.sh — backup → git pull → rebuild → restart.
# NEVER uses `down -v`. Data is always preserved.
#
# Usage:
#   /home/ubuntu/app/scripts/safe_deploy.sh
#   (or alias: safe-deploy)

set -euo pipefail

APP_DIR="/home/ubuntu/app"
SCRIPTS_DIR="$APP_DIR/scripts"

echo "========================================"
echo "  SAFE DEPLOY — $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# Step 1: Backup before touching anything
echo ""
echo "🔒 Step 1/4 — Backing up database..."
bash "$SCRIPTS_DIR/backup_db.sh"

# Step 2: Pull latest code
echo ""
echo "📥 Step 2/4 — Pulling latest code..."
cd "$APP_DIR"
# Stash any local changes so pull doesn't fail
git stash --include-untracked 2>/dev/null || true
git pull origin final

# Step 3: Rebuild and restart — NO -v flag, ever
echo ""
echo "🏗️  Step 3/4 — Rebuilding containers (no volume wipe)..."
docker-compose down
docker-compose up --build -d

# Step 4: Verify
echo ""
echo "🔍 Step 4/4 — Verifying startup..."
sleep 5
docker-compose ps
echo ""
docker-compose logs backend --tail=8

echo ""
echo "========================================"
echo "  ✅ Deploy complete. Data preserved."
echo "========================================"
