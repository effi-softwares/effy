#!/usr/bin/env bash
# 050-observability-push-foundation — no-PII sweep (FR-022, SC-004).
#
# Telemetry and notification payloads may carry only the auth subject id + non-PII routing/render ids
# (Principle VII). This scans the 050 surface — analytics taxonomies, notification producers, the FCM
# sender/copy, and the device layer — for PII field names appearing as payload keys/props. It is a
# heuristic guard, not a proof; the typed taxonomies + drift tests + copy tests are the primary defence.
#
# Exit non-zero and name the file on any hit. `sub`/`cognito_sub`/`recipient_sub`/`subject_sub` are the
# ALLOWED identifier and are excluded.
set -euo pipefail

cd "$(dirname "$0")/.."

# Files that construct telemetry/notification payloads (the 050 surface).
FILES=(
  packages/shared-types/src/device.ts
  apis/edge-api/shared/src/lib/devices.ts
  apis/core-api/internal/features/notifications/producer.go
  apis/edge-api/notifications/src/worker/copy.ts
  apis/edge-api/notifications/src/fcm/sender.ts
  apis/edge-api/notifications/src/worker/drain.ts
  apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/observability/AnalyticsEvent.kt
  apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/observability/AnalyticsEvent.kt
  apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/core/observability/AnalyticsEvent.kt
)

# PII tokens forbidden as payload keys/props. Word-boundaried; `sub` variants are the allowed id.
PII_PATTERN='(recipient_name|customer_name|first_name|last_name|full_name|\bemail\b|\bphone\b|\baddress\b|\bpostcode\b|postal_code|line1|line2|order_total|grand_total|card|payment)'

fail=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  # Skip comment lines (JS/Kotlin //, /*, *, /**; SQL --; shell #) to reduce prose false positives,
  # then match remaining code lines. `|| true` so a no-match grep doesn't trip `set -e`.
  if hits=$(grep -nEi "$PII_PATTERN" "$f" | grep -vE '^[0-9]+:[[:space:]]*(/|\*|//|--|#)' || true); then
    if [ -n "$hits" ]; then
      echo "✗ possible PII field in telemetry/notification payload: $f"
      echo "$hits"
      fail=1
    fi
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Telemetry/notification payloads must carry no PII beyond the auth subject id (Principle VII, FR-022)."
  exit 1
fi
echo "✓ no-PII telemetry sweep clean (${#FILES[@]} files)"
