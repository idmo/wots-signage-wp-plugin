#!/bin/bash
# Prepares a release: sets the version everywhere, adds a CHANGELOG entry,
# commits, and tags. Pushing the tag makes GitHub build and publish it.
#
#   bin/release.sh patch      0.2.1 -> 0.2.2   bug fixes
#   bin/release.sh minor      0.2.1 -> 0.3.0   new features
#   bin/release.sh major      0.2.1 -> 1.0.0   big or breaking changes
#   bin/release.sh 0.4.0      an exact version
#
# Then: git push && git push --tags

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
	echo "Commit or stash your changes first (git status shows uncommitted work)."
	exit 1
fi

CURRENT="$(sed -n "s/.*define( 'WOTS_SIGNAGE_VERSION', '\([^']*\)' );.*/\1/p" wots-signage.php)"
IFS=. read -r MA MI PA <<< "$CURRENT"
case "${1:-}" in
	patch) NEXT="$MA.$MI.$((PA + 1))" ;;
	minor) NEXT="$MA.$((MI + 1)).0" ;;
	major) NEXT="$((MA + 1)).0.0" ;;
	[0-9]*.[0-9]*.[0-9]*) NEXT="$1" ;;
	*)
		echo "Usage: $0 patch|minor|major|X.Y.Z   (current version: $CURRENT)"
		exit 1
		;;
esac

if git rev-parse "v$NEXT" >/dev/null 2>&1; then
	echo "Tag v$NEXT already exists."
	exit 1
fi

# Version in the plugin header, the PHP constant, and package.json.
perl -pi -e "s/^( \\* Version: +)\\S+/\${1}$NEXT/" wots-signage.php
perl -pi -e "s/define\\( 'WOTS_SIGNAGE_VERSION', '[^']*' \\);/define( 'WOTS_SIGNAGE_VERSION', '$NEXT' );/" wots-signage.php
npm version "$NEXT" --no-git-tag-version --allow-same-version >/dev/null

# Changelog: new heading under the title, with the commits since the last tag.
LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"
ENTRY="$(mktemp)"
{
	echo "## $NEXT ($(date +%Y-%m-%d))"
	echo
	if [ -n "$LAST_TAG" ]; then
		git log --pretty='- %s' "$LAST_TAG"..HEAD
	else
		echo "- First release."
	fi
	echo
} > "$ENTRY"
awk -v entry="$ENTRY" 'NR == 1 { print; print ""; while ((getline line < entry) > 0) print line; next } NR == 2 && $0 == "" { next } { print }' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
rm -f "$ENTRY"

echo "Version $CURRENT -> $NEXT. Edit CHANGELOG.md now if you want nicer notes (they become the release notes)."
read -r -p "Commit and tag v$NEXT? [y/N] " OK
if [ "$OK" != "y" ] && [ "$OK" != "Y" ]; then
	echo "Stopped. Files are changed but not committed; 'git checkout .' undoes it."
	exit 1
fi

git add wots-signage.php package.json package-lock.json CHANGELOG.md
git commit -q -m "Release $NEXT"
git tag -a "v$NEXT" -m "Version $NEXT"

echo
echo "Tagged v$NEXT. Publish it with:"
echo "  git push && git push --tags"
echo "GitHub then builds wots-signage.zip and your sites show the update within about 12 hours"
echo "(or right away: Plugins > WOTS Signage > Check for updates)."
