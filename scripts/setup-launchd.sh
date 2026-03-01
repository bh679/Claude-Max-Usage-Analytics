#!/usr/bin/env bash
#
# setup-launchd.sh — Install a macOS launchd job to scrape Claude usage on a schedule.
#
# Usage:
#   bash scripts/setup-launchd.sh             # Preview plist, no changes
#   bash scripts/setup-launchd.sh --install   # Install and load the launchd job
#   bash scripts/setup-launchd.sh --uninstall # Unload and remove the launchd job
#
# Environment variables (optional):
#   SCRAPE_INTERVAL_HOURS   Scrape interval in hours (default: 4)
#   NODE_PATH               Path to the node binary (auto-detected via `which node`)

set -euo pipefail

LABEL="games.brennan.claudemd.usage"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
INTERVAL_HOURS="${SCRAPE_INTERVAL_HOURS:-4}"
INTERVAL_SECS=$(( INTERVAL_HOURS * 3600 ))
NODE_BIN="${NODE_PATH:-$(which node)}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRAPER="${PROJECT_DIR}/capture/scrape-usage.js"
LOG_DIR="${PROJECT_DIR}/logs"
OUT_LOG="${LOG_DIR}/scrape.log"
ERR_LOG="${LOG_DIR}/scrape-error.log"

# ── Helpers ───────────────────────────────────────────────────────────────────
plist_content() {
cat <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${SCRAPER}</string>
    <string>--refresh</string>
    <string>--post</string>
    <string>--post-url</string>
    <string>http://localhost:8080/api/scrape</string>
  </array>

  <key>StartInterval</key>
  <integer>${INTERVAL_SECS}</integer>

  <key>RunAtLoad</key>
  <false/>

  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>

  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    <key>DISPLAY</key>
    <string>:0</string>
  </dict>
</dict>
</plist>
XML
}

# ── Actions ───────────────────────────────────────────────────────────────────
case "${1:-}" in
  --install)
    mkdir -p "$LOG_DIR"
    plist_content > "$PLIST"
    launchctl load -w "$PLIST"
    echo "✓ Installed and loaded: ${LABEL}"
    echo "  Scrapes every ${INTERVAL_HOURS} hours."
    echo "  Logs: ${LOG_DIR}/"
    echo ""
    echo "  To check status:  launchctl list | grep claudemd"
    echo "  To run now:       launchctl kickstart -k gui/\$(id -u)/${LABEL}"
    echo "  To uninstall:     bash scripts/setup-launchd.sh --uninstall"
    ;;

  --uninstall)
    if [ -f "$PLIST" ]; then
      launchctl unload -w "$PLIST" 2>/dev/null || true
      rm "$PLIST"
      echo "✓ Uninstalled: ${LABEL}"
    else
      echo "Not installed (plist not found at ${PLIST})"
    fi
    ;;

  *)
    echo "Claude Max Usage Analytics — launchd setup"
    echo ""
    echo "This script will create a macOS launchd job that runs the scraper"
    echo "every ${INTERVAL_HOURS} hours automatically."
    echo ""
    echo "Configuration:"
    echo "  Node binary:      ${NODE_BIN}"
    echo "  Scraper:          ${SCRAPER}"
    echo "  Interval:         ${INTERVAL_HOURS} hours"
    echo "  Plist location:   ${PLIST}"
    echo "  Logs:             ${LOG_DIR}/"
    echo ""
    echo "Generated plist preview:"
    echo "─────────────────────────────────────────────────────────"
    plist_content
    echo "─────────────────────────────────────────────────────────"
    echo ""
    echo "To install:"
    echo "  bash scripts/setup-launchd.sh --install"
    echo ""
    echo "To change the interval, set SCRAPE_INTERVAL_HOURS before running:"
    echo "  SCRAPE_INTERVAL_HOURS=2 bash scripts/setup-launchd.sh --install"
    ;;
esac
