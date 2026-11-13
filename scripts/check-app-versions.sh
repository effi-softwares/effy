#!/usr/bin/env bash
# 121: each app has TWO independent versions - Android's in version.properties (raised by make cm-apk / dm-apk) and iOS's
# in iosApp/Configuration/Version.xcconfig (raised by make cm-ios-version / dm-ios-version). This checks each is well
# formed, that Config.xcconfig includes the iOS one, and that the Xcode project does not carry numbers of its own -
# typing a Version or Build into Xcode's General tab writes them into project.pbxproj, where they silently win over
# Version.xcconfig.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for app in customer-mobile driver-mobile; do
  props="apps/$app/version.properties"
  xc="apps/$app/iosApp/Configuration/Version.xcconfig"
  name=$(sed -n 's/^versionName=//p' "$props"); code=$(sed -n 's/^versionCode=//p' "$props")
  [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$code" =~ ^[0-9]+$ ]] \
    || { echo "check-app-versions: $props - versionName '$name' / versionCode '$code' is not 1.2.3 / a number"; fail=1; }
  if [ ! -f "$xc" ]; then
    echo "check-app-versions: $xc is missing"; fail=1
  else
    xname=$(sed -n 's/^MARKETING_VERSION *= *//p' "$xc"); xcode=$(sed -n 's/^CURRENT_PROJECT_VERSION *= *//p' "$xc")
    [[ "$xname" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$xcode" =~ ^[0-9]+$ ]] \
      || { echo "check-app-versions: $xc - MARKETING_VERSION '$xname' / CURRENT_PROJECT_VERSION '$xcode' is not 1.2.3 / a number"; fail=1; }
  fi
  grep -q '^#include "Version.xcconfig"' "apps/$app/iosApp/Configuration/Config.xcconfig" \
    || { echo "check-app-versions: apps/$app/iosApp/Configuration/Config.xcconfig does not include Version.xcconfig"; fail=1; }
  if grep -q -E '(MARKETING_VERSION|CURRENT_PROJECT_VERSION) =' "apps/$app/iosApp/iosApp.xcodeproj/project.pbxproj"; then
    echo "check-app-versions: apps/$app/iosApp/iosApp.xcodeproj sets its own Version/Build (Xcode › target › General)."
    echo "    Remove them there (clear both fields) and change the numbers with make ${app:0:1}m-ios-version instead."
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "check-app-versions: OK - Android and iOS versions are each well formed and in their one file"
exit "$fail"
