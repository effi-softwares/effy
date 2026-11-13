#!/bin/sh
# Runs the customer or driver app's debug build on an iOS simulator, with the Simulator window open and
# the app's output (prints, crashes) in this terminal until Ctrl+C, which stops the app. It asks which
# iPhone or iPad to use; Enter takes the one already open (else the iPhone 17 Pro), and IOS_SIMULATOR
# skips the question.
#
#   make customer-ios                              # or: make driver-ios
#   IOS_SIMULATOR="iPhone Air" make customer-ios   # no question (a name or a udid)
#
# Needs Xcode, a JDK and the Android SDK (Gradle configures the Android targets too), and the app's
# secrets.properties. Writes nothing outside apps/<app>-mobile/build. The build's steps print as they run;
# the first build fetches the Swift packages and compiles the Kotlin framework (over ten minutes), later
# builds are quick.
set -eu

case "${1:-}" in
  customer | driver) app="$1" ;;
  *) echo "usage: $0 <customer|driver>" >&2; exit 1 ;;
esac
steps="$(cd "$(dirname "$0")" && pwd)/xcodebuild-steps.awk"
cd "$(dirname "$0")/../../apps/$app-mobile"
[ -f secrets.properties ] || { echo "apps/$app-mobile/secrets.properties is missing: copy secrets.properties.example and fill it in." >&2; exit 1; }

# Choices, one "<udid> <label>" per line: open simulators first, then the rest (iOS only).
choices="$(xcrun simctl list devices available | awk '
  /^-- / { runtime = $0; gsub(/^-- | --$/, "", runtime); ios = (runtime ~ /^iOS/); next }
  ios && match($0, /\([0-9A-F-]{36}\)/) {
    udid = substr($0, RSTART + 1, RLENGTH - 2)
    name = substr($0, 1, RSTART - 2); sub(/^ +/, "", name)
    open = ($0 ~ /\(Booted\)/)
    printf "%d %s %s (%s)%s\n", !open, udid, name, runtime, (open ? " (open)" : "")
  }' | sort -s -k1,1n | cut -d ' ' -f 2-)"
[ -n "$choices" ] || { echo "No iOS simulator. Add one in Xcode: Window, Devices and Simulators." >&2; exit 1; }

# The default: an open iPhone, else the iPhone 17 Pro, else the first choice.
simulator="$(printf '%s\n' "$choices" | awk '/ iPhone / && / \(open\)$/ { print $1; exit }')"
[ -n "$simulator" ] || simulator="$(printf '%s\n' "$choices" | awk '/^[^ ]+ iPhone 17 Pro \(/ { print $1; exit }')"
[ -n "$simulator" ] || simulator="$(printf '%s\n' "$choices" | head -1 | cut -d ' ' -f 1)"

if [ -n "${IOS_SIMULATOR:-}" ]; then
  simulator="$(printf '%s\n' "$choices" | awk -v want="$IOS_SIMULATOR" '{ id = $1; sub(/^[^ ]+ /, ""); n = $0; sub(/ \(.*$/, "", n) } id == want || n == want { print id; exit }')"
  [ -n "$simulator" ] || { echo "No simulator called $IOS_SIMULATOR." >&2; exit 1; }
elif [ -t 0 ]; then
  echo "Simulators:"
  printf '%s\n' "$choices" | awk -v d="$simulator" '{ id = $1; sub(/^[^ ]+ /, ""); printf "  %2d) %s%s\n", NR, $0, (id == d ? "  (default)" : "") }'
  printf 'Pick a number, or press Enter for the default: '
  read -r choice
  if [ -n "$choice" ]; then
    case "$choice" in *[!0-9]*) echo "Not a number: $choice" >&2; exit 1 ;; esac
    simulator="$(printf '%s\n' "$choices" | sed -n "${choice}p" | cut -d ' ' -f 1)"
    [ -n "$simulator" ] || { echo "There is no choice $choice." >&2; exit 1; }
  fi
fi

echo "Building for the simulator (one line per step; the full log is apps/$app-mobile/build/ios-build.log)"
mkdir -p build
# No -sdk: it would force the Swift packages' Mac-side build-plugin tools (smithy-swift's code generator)
# onto the iOS SDK, where they cannot build. The destination alone picks the simulator. sh has no
# pipefail, so xcodebuild's own exit status is kept in a file.
{
  rc=0
  xcodebuild -project iosApp/iosApp.xcodeproj -scheme iosApp -configuration Debug \
    -destination "platform=iOS Simulator,id=$simulator" \
    -derivedDataPath build/xcode CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO build 2>&1 || rc=$?
  echo "$rc" > build/ios-build.status
} | tee build/ios-build.log | awk -f "$steps"
if [ "$(cat build/ios-build.status)" != 0 ]; then
  echo "The build failed: the reason is above, the full log is apps/$app-mobile/build/ios-build.log." >&2
  exit 1
fi
bundle_path="build/xcode/Build/Products/Debug-iphonesimulator/$app-mobile.app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$bundle_path/Info.plist")"

echo "Starting the simulator"
xcrun simctl boot "$simulator" 2>/dev/null || true
open -a Simulator
xcrun simctl bootstatus "$simulator" -b > /dev/null
xcrun simctl install "$simulator" "$bundle_path"

echo "Running the $app app; its output follows. Ctrl+C stops the app."
# --console-pty connects the app's stdout and stderr to this terminal and ends the app on Ctrl+C.
exec xcrun simctl launch --console-pty --terminate-running-process "$simulator" "$bundle_id"
