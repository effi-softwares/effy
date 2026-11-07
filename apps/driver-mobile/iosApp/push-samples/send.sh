#!/usr/bin/env bash
# Send a sample notification to the app running in the booted iOS Simulator - no Apple account, no Firebase.
# It checks how the app SHOWS and OPENS a notification; it does not test delivery (see
# docs/observability-apple-blockers.md). The payloads mirror `dataFor` in
# apis/edge-api/notifications/src/worker/copy.ts.
#
#   ./send.sh run_assigned        # (edit the .apns first: put one of your run ids in it)
#   ./send.sh run_changed
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sample="${1:?usage: send.sh <sample name, e.g. run_assigned>}"
file="$here/$sample.apns"
[[ -f "$file" ]] || { echo "No sample $file"; ls "$here"/*.apns; exit 1; }
config="$here/../Configuration/Config.xcconfig"
team="$(sed -n 's/^TEAM_ID *= *//p' "$config" | tr -d '[:space:]')"
bundle="$(sed -n 's/^PRODUCT_BUNDLE_IDENTIFIER *= *//p' "$config" | tr -d '[:space:]')"
bundle="${bundle//\$(TEAM_ID)/$team}"
echo "→ $bundle: $sample"
xcrun simctl push booted "$bundle" "$file"
