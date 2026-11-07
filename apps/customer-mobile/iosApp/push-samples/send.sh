#!/usr/bin/env bash
# Send a sample notification to the app running in the booted iOS Simulator - no Apple account, no Firebase.
# It checks how the app SHOWS and OPENS a notification; it does not test delivery (see
# docs/observability-apple-blockers.md). The payloads mirror `dataFor` in
# apis/edge-api/notifications/src/worker/copy.ts.
#
#   ./send.sh order_paid          # (edit order_paid.apns first: put one of your order ids in it)
#   ./send.sh order_with_courier
#   ./send.sh points_credited
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sample="${1:?usage: send.sh <sample name, e.g. points_credited>}"
file="$here/$sample.apns"
[[ -f "$file" ]] || { echo "No sample $file"; ls "$here"/*.apns; exit 1; }
config="$here/../Configuration/Config.xcconfig"
team="$(sed -n 's/^TEAM_ID *= *//p' "$config" | tr -d '[:space:]')"
bundle="$(sed -n 's/^PRODUCT_BUNDLE_IDENTIFIER *= *//p' "$config" | tr -d '[:space:]')"
bundle="${bundle//\$(TEAM_ID)/$team}"
echo "→ $bundle: $sample"
xcrun simctl push booted "$bundle" "$file"
