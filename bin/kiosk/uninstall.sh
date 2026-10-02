#!/bin/bash
# Stops the player and removes it from login. Keeps the Chrome profile and
# offline cache in ~/Library/Application Support/SignageKiosk; add --purge to delete them too.
set -euo pipefail
LABEL="com.wordonthestreetbooks.signage-kiosk"
APP_DIR="$HOME/Library/Application Support/SignageKiosk"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -f -- "--user-data-dir=$APP_DIR/chrome-profile" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "${1:-}" = "--purge" ]; then
	rm -rf "$APP_DIR"
	echo "Kiosk removed, including its Chrome profile and offline cache."
else
	echo "Kiosk removed. (Settings kept in $APP_DIR; use --purge to delete them.)"
fi
