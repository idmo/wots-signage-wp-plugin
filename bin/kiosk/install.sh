#!/bin/bash
# Sets up this Mac to show the signage player full screen at every login.
#
#   bin/kiosk/install.sh "https://www.wordonthestreetbooks.com/signage/player/?key=…"
#
# Copy the URL from wp-admin > Signage > Settings. Run again any time to
# change the URL (e.g. after rotating the key). Undo with uninstall.sh.

set -euo pipefail

URL="${1:-}"
case "$URL" in
	http://*/signage/player/*key=* | https://*/signage/player/*key=*) ;;
	*)
		echo "Usage: $0 \"https://…/signage/player/?key=…\""
		echo "Copy the full Player URL from wp-admin > Signage > Settings (keep the quotes)."
		exit 1
		;;
esac

if [ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
	echo "Google Chrome isn't in /Applications. Install it first (Chromium can't play MP4 video)."
	exit 1
fi

LABEL="com.wordonthestreetbooks.signage-kiosk"
APP_DIR="$HOME/Library/Application Support/SignageKiosk"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents"
cp "$HERE/run-kiosk.sh" "$APP_DIR/run-kiosk.sh"
chmod 755 "$APP_DIR/run-kiosk.sh"
printf '%s\n' "$URL" > "$APP_DIR/player-url"
chmod 600 "$APP_DIR/player-url" # The key is a secret.

# KeepAlive/SuccessfulExit=false: relaunch if Chrome crashes, but not when
# you quit it on purpose with ⌘Q.
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>$APP_DIR/run-kiosk.sh</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ThrottleInterval</key>
	<integer>15</integer>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>StandardOutPath</key>
	<string>$APP_DIR/kiosk.log</string>
	<key>StandardErrorPath</key>
	<string>$APP_DIR/kiosk.log</string>
</dict>
</plist>
PLIST

# Reload so a changed URL takes effect now.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -f -- "--user-data-dir=$APP_DIR/chrome-profile" 2>/dev/null || true
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Done. The player is opening full screen and will start at every login."
echo
echo "  Quit the player:        ⌘Q (it stays closed until next login)"
echo "  Start it again:         bin/kiosk/start.sh"
echo "  Stop auto-start:        bin/kiosk/uninstall.sh"
echo "  Log:                    $APP_DIR/kiosk.log"
echo
echo "Also set: System Settings > Users & Groups > automatic login for this account,"
echo "so the player comes back by itself after a power cut."
