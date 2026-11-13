#!/usr/bin/env bash
# Raises an app's ANDROID version before a release build (`make cm-apk` / `make dm-apk`). iOS has its own numbers,
# raised only by scripts/bump-ios-version.sh (`make cm-ios-version` / `make dm-ios-version`): the two platforms are
# built and released separately, so neither moves the other (121).
# The build number (versionCode) ALWAYS goes up by one, so
# no two APKs ever carry the same number and every one installs over the last. The version (versionName,
# three numbers) changes only when asked: patch 1.0.0 → 1.0.1, minor → 1.1.0, major → 2.0.0. The build
# number never resets - Android only accepts an update with a higher versionCode.
#
#   scripts/bump-version.sh <version.properties> [patch|minor|major]
set -euo pipefail

file="${1:?usage: bump-version.sh <version.properties> [patch|minor|major]}"
part="${2:-}"
[ -f "$file" ] || { echo "bump-version: $file missing" >&2; exit 1; }

name=$(sed -n 's/^versionName=//p' "$file")
code=$(sed -n 's/^versionCode=//p' "$file")
[[ "$code" =~ ^[0-9]+$ ]] || { echo "bump-version: versionCode '$code' in $file is not a number" >&2; exit 1; }
[[ "$name" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo "bump-version: versionName '$name' in $file is not three numbers (1.0.0)" >&2; exit 1; }
major=${BASH_REMATCH[1]} minor=${BASH_REMATCH[2]} patch=${BASH_REMATCH[3]}

case "$part" in
  "")    ;;
  patch) patch=$((patch + 1)) ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  major) major=$((major + 1)); minor=0; patch=0 ;;
  *) echo "bump-version: BUMP must be patch, minor or major (got '$part')" >&2; exit 1 ;;
esac

new_name="$major.$minor.$patch"
new_code=$((code + 1))
tmp="$file.tmp"
sed -e "s/^versionName=.*/versionName=$new_name/" -e "s/^versionCode=.*/versionCode=$new_code/" "$file" > "$tmp"
mv "$tmp" "$file"
echo "bump-version: $name+$code → $new_name+$new_code ($file)"

