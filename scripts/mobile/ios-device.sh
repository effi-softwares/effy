#!/bin/sh
# Builds the customer or driver app's debug build, signed, installs it on an iPhone connected to this Mac (cable or
# the same Wi-Fi) and runs it, with the app's output (prints, crashes) in this terminal until Ctrl+C, which stops it.
# It asks which iPhone when more than one is connected; IOS_DEVICE (a name or a UDID) skips the question.
#
#   make customer-iphone                         # or: make driver-iphone
#   IOS_DEVICE="Janith's iPhone" make customer-iphone
#
# Needs, once:
#   - Xcode › Settings › Accounts: signed in with the Apple ID whose team is TEAM_ID in iosApp/Configuration/Config.xcconfig
#     (a free Apple ID works: its builds run for 7 days, then install again).
#   - On the iPhone: Settings › Privacy & Security › Developer Mode on, and "Trust This Computer" accepted.
#   - After the first install: Settings › General › VPN & Device Management › your Apple ID › Trust (free accounts only).
# Writes nothing outside apps/<app>-mobile/build.
set -eu

case "${1:-}" in
  customer | driver) app="$1" ;;
  *) echo "usage: $0 <customer|driver>" >&2; exit 1 ;;
esac
steps="$(cd "$(dirname "$0")" && pwd)/xcodebuild-steps.awk"
cd "$(dirname "$0")/../../apps/$app-mobile"
[ -f secrets.properties ] || { echo "apps/$app-mobile/secrets.properties is missing: copy secrets.properties.example and fill it in." >&2; exit 1; }
mkdir -p build

# Connected iPhones and iPads, one "<udid> <name> (<model>, <how>)" per line, cable first.
xcrun devicectl list devices --json-output build/ios-devices.json > /dev/null 2>&1 \
  || { echo "Could not list devices (xcrun devicectl). Is Xcode 15 or later installed?" >&2; exit 1; }
choices="$(python3 - build/ios-devices.json <<'PY'
import json, sys
devices = json.load(open(sys.argv[1]))["result"]["devices"]
rows = []
for d in devices:
    hw, conn, props = d.get("hardwareProperties", {}), d.get("connectionProperties", {}), d.get("deviceProperties", {})
    # A paired iPhone the Mac can reach now (cable or Wi-Fi). The tunnel itself may be idle ("unavailable" while the
    # phone is locked): Xcode opens it when it builds.
    reachable = conn.get("tunnelState") == "connected" or conn.get("transportType") in ("wired", "localNetwork")
    if hw.get("platform") != "iOS" or conn.get("pairingState") != "paired" or not reachable:
        continue
    how = {"wired": "cable", "localNetwork": "Wi-Fi"}.get(conn.get("transportType"), "connected")
    model = hw.get("marketingName") or hw.get("productType") or "?"
    rows.append((how != "cable", f'{hw.get("udid")} {props.get("name", "?")} ({model}, {how})'))
for _, row in sorted(rows):
    print(row)
PY
)"
[ -n "$choices" ] || {
  echo "No iPhone is connected. Plug it in with a cable, unlock it, and accept \"Trust This Computer\"." >&2
  echo "(Xcode › Window › Devices and Simulators shows what this Mac can see.)" >&2
  exit 1
}
device="$(printf '%s\n' "$choices" | head -1 | cut -d ' ' -f 1)"

if [ -n "${IOS_DEVICE:-}" ]; then
  device="$(printf '%s\n' "$choices" | awk -v want="$IOS_DEVICE" '{ id = $1; sub(/^[^ ]+ /, ""); n = $0; sub(/ \(.*$/, "", n) } id == want || n == want { print id; exit }')"
  [ -n "$device" ] || { echo "No connected device called $IOS_DEVICE." >&2; exit 1; }
elif [ "$(printf '%s\n' "$choices" | wc -l | tr -d ' ')" -gt 1 ] && [ -t 0 ]; then
  echo "Connected devices:"
  printf '%s\n' "$choices" | awk -v d="$device" '{ id = $1; sub(/^[^ ]+ /, ""); printf "  %2d) %s%s\n", NR, $0, (id == d ? "  (default)" : "") }'
  printf 'Pick a number, or press Enter for the default: '
  read -r choice
  if [ -n "$choice" ]; then
    case "$choice" in *[!0-9]*) echo "Not a number: $choice" >&2; exit 1 ;; esac
    device="$(printf '%s\n' "$choices" | sed -n "${choice}p" | cut -d ' ' -f 1)"
    [ -n "$device" ] || { echo "There is no choice $choice." >&2; exit 1; }
  fi
fi
echo "Device: $(printf '%s\n' "$choices" | awk -v d="$device" '$1 == d { sub(/^[^ ]+ /, ""); print }')"

echo "Building for the iPhone (one line per step; the full log is apps/$app-mobile/build/ios-device-build.log)"
# Signed with the team in Config.xcconfig (automatic signing); -allowProvisioning* lets Xcode make the profile and add
# this iPhone to the team's devices the first time. A separate derived-data folder from the simulator's, so switching
# between them does not rebuild everything.
{
  rc=0
  xcodebuild -project iosApp/iosApp.xcodeproj -scheme iosApp -configuration Debug \
    -destination "id=$device" \
    -derivedDataPath build/xcode-device \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration build 2>&1 || rc=$?
  echo "$rc" > build/ios-device-build.status
} | tee build/ios-device-build.log | awk -f "$steps"
if [ "$(cat build/ios-device-build.status)" != 0 ]; then
  echo "The build failed: the reason is above, the full log is apps/$app-mobile/build/ios-device-build.log." >&2
  if grep -q -E "No Account for Team|No signing certificate|requires a provisioning profile|Signing for" build/ios-device-build.log; then
    echo "It is signing: open Xcode › Settings › Accounts and sign in with the Apple ID for team" \
      "$(sed -n 's/^TEAM_ID *= *//p' iosApp/Configuration/Config.xcconfig), then run this again." >&2
  fi
  exit 1
fi
bundle_path="build/xcode-device/Build/Products/Debug-iphoneos/$app-mobile.app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$bundle_path/Info.plist")"

echo "Installing on the iPhone"
xcrun devicectl device install app --device "$device" "$bundle_path" > build/ios-device-install.log 2>&1 || {
  cat build/ios-device-install.log >&2
  echo "Install failed. Is the iPhone unlocked, with Developer Mode on (Settings › Privacy & Security)?" >&2
  exit 1
}

echo "Running the $app app; its output follows. Ctrl+C stops the app."
echo "(First install with a free Apple ID: if it will not open, trust it in Settings › General › VPN & Device Management.)"
exec xcrun devicectl device process launch --device "$device" --console --terminate-existing "$bundle_id"
