#!/usr/bin/env bash
# Phase 1 spike (PRD §12, Open Question 5): confirm Pressable's page and edge
# caches never serve the signage player or its REST responses.
#
# Usage: bin/check-cache.sh https://www.wordonthestreetbooks.com <player-key>
#
# Each URL is requested twice. A pass means: Cache-Control says no-store, and
# the second response is not a cache HIT (Pressable reports edge-cache status
# in the x-ac header; Batcache adds x-nananana when it served a cached page).
set -euo pipefail

SITE="${1:?Usage: $0 <site-url> <player-key>}"
KEY="${2:?Usage: $0 <site-url> <player-key>}"
SITE="${SITE%/}"

urls=(
	"$SITE/signage/player/?key=$KEY"
	"$SITE/wp-json/wots-signage/v1/player/version?key=$KEY"
	"$SITE/wp-json/wots-signage/v1/player/playlist?key=$KEY"
	"$SITE/signage/sw.js"
)

fail=0
for url in "${urls[@]}"; do
	echo "== ${url/$KEY/<key>}"
	for attempt in 1 2; do
		headers="$(curl -s -o /dev/null -D - "$url")"
		status="$(printf '%s' "$headers" | head -n1 | tr -d '\r')"
		cc="$(printf '%s' "$headers" | grep -i '^cache-control:' | tr -d '\r' || true)"
		edge="$(printf '%s' "$headers" | grep -iE '^(x-ac|x-cache|age|x-nananana|cf-cache-status):' | tr -d '\r' | paste -sd ' ' - || true)"
		echo "  #$attempt $status | ${cc:-no cache-control} | ${edge:-no cache headers}"
		if [ "$attempt" = 2 ]; then
			if ! printf '%s' "$cc" | grep -qi 'no-store'; then
				echo "  FAIL: missing no-store"; fail=1
			fi
			if printf '%s' "$edge" | grep -qiE 'x-ac: [^ ]*HIT|x-cache: HIT|x-nananana|cf-cache-status: HIT'; then
				echo "  FAIL: served from cache"; fail=1
			fi
		fi
		sleep 1
	done
done

if [ "$fail" = 0 ]; then
	echo "PASS: player page and REST routes bypass the cache."
else
	echo "Some checks failed. Ask Pressable support to exclude /signage/ and /wp-json/wots-signage/ from the page and edge cache."
	exit 1
fi
