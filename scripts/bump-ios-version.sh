#!/usr/bin/env bash
# Raises an app's iOS version before an Xcode archive (`make cm-ios-version` / `make dm-ios-version`). iOS keeps its own
# numbers in iosApp/Configuration/Version.xcconfig, independent of Android's version.properties (121): the two platforms
# are built and released separately.
#
# The build number (CURRENT_PROJECT_VERSION) ALWAYS goes up by one - App Store Connect refuses a build number it has
# already seen. The version (MARKETING_VERSION, three numbers) changes only when asked: patch 1.0.0 → 1.0.1,
# minor → 1.1.0, major → 2.0.0. The build number never resets.
#
#   scripts/bump-ios-version.sh <Version.xcconfig> [patch|minor|major]
set -euo pipefail

file="${1:?usage: bump-ios-version.sh <Version.xcconfig> [patch|minor|major]}"
part="${2:-}"
[ -f "$file" ] || { echo "bump-ios-version: $file missing" >&2; exit 1; }

name=$(sed -n 's/^MARKETING_VERSION *= *//p' "$file")
code=$(sed -n 's/^CURRENT_PROJECT_VERSION *= *//p' "$file")
[[ "$code" =~ ^[0-9]+$ ]] || { echo "bump-ios-version: CURRENT_PROJECT_VERSION '$code' in $file is not a number" >&2; exit 1; }
[[ "$name" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo "bump-ios-version: MARKETING_VERSION '$name' in $file is not three numbers (1.0.0)" >&2; exit 1; }
major=${BASH_REMATCH[1]} minor=${BASH_REMATCH[2]} patch=${BASH_REMATCH[3]}

case "$part" in
  "")    ;;
  patch) patch=$((patch + 1)) ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  major) major=$((major + 1)); minor=0; patch=0 ;;
  *) echo "bump-ios-version: BUMP must be patch, minor or major (got '$part')" >&2; exit 1 ;;
esac

new_name="$major.$minor.$patch"
new_code=$((code + 1))
tmp="$file.tmp"
sed -e "s/^MARKETING_VERSION *=.*/MARKETING_VERSION = $new_name/" -e "s/^CURRENT_PROJECT_VERSION *=.*/CURRENT_PROJECT_VERSION = $new_code/" "$file" > "$tmp"
mv "$tmp" "$file"
echo "bump-ios-version: $name ($code) → $new_name ($new_code) ($file)"
