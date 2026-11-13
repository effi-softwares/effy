#!/usr/bin/env bash
# Renames a freshly built release APK to <app>-<versionName>+<versionCode>.apk, e.g. customer-app-1.0.0+1.apk.
# The version is read from AGP's own output-metadata.json beside the APK - the values actually baked into
# it - never re-parsed from build.gradle.kts. versionName must be three numbers (1.0.0) or this fails.
#
#   scripts/name-apk.sh <android-app-module-dir> <app-name>
#   scripts/name-apk.sh apps/customer-mobile/androidApp customer-app
set -euo pipefail

module_dir="${1:?usage: name-apk.sh <android-app-module-dir> <app-name>}"
app_name="${2:?usage: name-apk.sh <android-app-module-dir> <app-name>}"
out_dir="$module_dir/build/outputs/apk/release"
metadata="$out_dir/output-metadata.json"

[ -f "$metadata" ] || { echo "name-apk: $metadata missing - run assembleRelease first" >&2; exit 1; }

read -r built version_name version_code < <(node -e '
  const m = require(process.argv[1]);
  const e = m.elements[0];
  console.log(e.outputFile, e.versionName, e.versionCode);
' "$(cd "$(dirname "$metadata")" && pwd)/output-metadata.json")

if ! [[ "$version_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "name-apk: versionName '$version_name' is not three numbers (1.0.0) - fix defaultConfig.versionName" >&2
  exit 1
fi

src="$out_dir/$built"
dest="$out_dir/$app_name-$version_name+$version_code.apk"
[ -f "$src" ] || { echo "name-apk: $src missing - run assembleRelease first" >&2; exit 1; }

# Copied, not moved: Gradle's own output stays in place, so an unchanged build stays up to date.
cp -f "$src" "$dest"
echo "$dest"
