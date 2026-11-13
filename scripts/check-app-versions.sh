#!/usr/bin/env bash
# 121: each app's iPhone version file must carry the same numbers as its version.properties, or one build number would
# mean two builds and the in-app update check would compare the wrong thing. scripts/bump-version.sh writes both.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for app in customer-mobile driver-mobile; do
  props="apps/$app/version.properties"
  xc="apps/$app/iosApp/Configuration/Version.xcconfig"
  name=$(sed -n 's/^versionName=//p' "$props")
  code=$(sed -n 's/^versionCode=//p' "$props")
  if [ ! -f "$xc" ]; then echo "check-app-versions: $xc is missing - run scripts/bump-version.sh"; fail=1; continue; fi
  xname=$(sed -n 's/^MARKETING_VERSION = //p' "$xc")
  xcode=$(sed -n 's/^CURRENT_PROJECT_VERSION = //p' "$xc")
  if [ "$name" != "$xname" ] || [ "$code" != "$xcode" ]; then
    echo "check-app-versions: $app - version.properties says $name ($code), Version.xcconfig says $xname ($xcode)"
    fail=1
  fi
  if ! grep -q '^#include "Version.xcconfig"' "apps/$app/iosApp/Configuration/Config.xcconfig"; then
    echo "check-app-versions: apps/$app/iosApp/Configuration/Config.xcconfig does not include Version.xcconfig"
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "check-app-versions: OK - iPhone and Android carry the same version numbers"
exit "$fail"
