#!/bin/bash
# Starts the signage player full screen in Google Chrome (kiosk mode).
# Installed and started at login by install.sh; you don't run this directly.
#
# Reads the player URL from ~/Library/Application Support/SignageKiosk/player-url.

set -u

APP_DIR="$HOME/Library/Application Support/SignageKiosk"
PROFILE="$APP_DIR/chrome-profile"
URL_FILE="$APP_DIR/player-url"
LOG="$APP_DIR/kiosk.log"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

if [ ! -x "$CHROME" ]; then
	log "Google Chrome not found at $CHROME. Install Chrome (not Chromium: it can't play MP4 video)."
	exit 1
fi
URL="$(tr -d '[:space:]' < "$URL_FILE" 2>/dev/null)"
if [ -z "$URL" ]; then
	log "No player URL in $URL_FILE. Run install.sh again with the URL from Signage > Settings."
	exit 1
fi

# After a power cut, wait up to 2 minutes for the network so the first load
# is fresh. If it never comes up, start anyway: the player's offline cache
# takes over once it has loaded online at least once.
for _ in $(seq 1 24); do
	if curl -s -o /dev/null --max-time 4 "$URL"; then
		break
	fi
	sleep 5
done

# Tell Chrome its last exit was clean, so it never shows a "Restore pages?" bar.
PREFS="$PROFILE/Default/Preferences"
if [ -f "$PREFS" ]; then
	sed -i '' -e 's/"exit_type":"[^"]*"/"exit_type":"Normal"/' -e 's/"exited_cleanly":false/"exited_cleanly":true/' "$PREFS" 2>/dev/null
fi

# Keep the Mac and the display awake for as long as this script (which
# becomes Chrome) is running.
caffeinate -dimsu -w $$ &

log "Starting player: ${URL%%\?*}"
exec "$CHROME" \
	--kiosk \
	--user-data-dir="$PROFILE" \
	--no-first-run \
	--no-default-browser-check \
	--noerrdialogs \
	--disable-session-crashed-bubble \
	--disable-infobars \
	--disable-features=Translate \
	--autoplay-policy=no-user-gesture-required \
	--check-for-update-interval=31536000 \
	"$URL"
