#!/usr/bin/env bash
# deploy.sh — Push code to Lightsail instance
set -euo pipefail

SERVER="${DEPLOY_HOST:-user@brennan.games}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/bitnami/apps/claude-usage}"

echo "Syncing files to $SERVER:$REMOTE_DIR..."
rsync -avz --exclude node_modules --exclude '*.db' --exclude .env \
  --exclude capture/ --exclude .auth-state.json --exclude .claude/ \
  --exclude test-results/ --exclude playwright-report/ \
  . "$SERVER:$REMOTE_DIR/"

echo "Installing dependencies..."
ssh "$SERVER" "cd $REMOTE_DIR && npm install --production"

echo "Restarting PM2 process..."
ssh "$SERVER" "cd $REMOTE_DIR && pm2 restart claude-usage || pm2 start ecosystem.config.js"

echo "Done. Health check:"
curl -s "https://brennan.games/claudemd/usage/health" | jq .
