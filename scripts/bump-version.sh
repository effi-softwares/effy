#!/usr/bin/env bash
# Raises an app's version before a release build. The build number (versionCode) ALWAYS goes up by one, so
# no two APKs ever carry the same number and every one installs over the last. The version (versionName,
# three numbers) changes only when asked: patch 1.0.0 → 1.0.1, minor → 1.1.0, major → 2.0.0. The build
# number never resets - Android only accepts an update with a higher versionCode.
#
#   scripts/bump-version.sh <version.properties> [patch|minor|major]
set -euo pipefail

write_xcconfig() {
  cat > "$1" <<XC
// Written by scripts/bump-version.sh from ../../version.properties - never edit by hand (121).
// One build number means one build on iPhone and Android; the in-app update check compares it.
MARKETING_VERSION = $2
CURRENT_PROJECT_VERSION = $3
XC
}

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

# 121: the iPhone build carries the same two numbers, so one build number means one build on both platforms (the
# update check compares it). Config.xcconfig includes this file; scripts/check-app-versions.sh fails a mismatch.
xcconfig="$(dirname "$file")/iosApp/Configuration/Version.xcconfig"
if [ -d "$(dirname "$xcconfig")" ]; then
  write_xcconfig "$xcconfig" "$new_name" "$new_code"
  echo "bump-version: $xcconfig → $new_name ($new_code)"
fi
