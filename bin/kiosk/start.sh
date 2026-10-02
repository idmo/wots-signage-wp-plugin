#!/bin/bash
# Re-opens the player after you quit it with ⌘Q.
set -euo pipefail
LABEL="com.wordonthestreetbooks.signage-kiosk"
if ! launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
	echo "The kiosk isn't installed. Run bin/kiosk/install.sh \"<player URL>\" first."
	exit 1
fi
launchctl kickstart "gui/$(id -u)/$LABEL"
echo "Starting the player."
