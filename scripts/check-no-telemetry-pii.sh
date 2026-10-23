#!/usr/bin/env bash
# No-PII sweep: telemetry and notification payloads carry only the auth subject id and non-PII routing or
# render ids. Scans the analytics taxonomies, notification producers, the FCM sender and copy, and the
# device layer for PII field names as payload keys. A heuristic; the typed taxonomies and their tests are
# the primary defence. `sub`/`cognito_sub`/`recipient_sub`/`subject_sub` are allowed. Exits non-zero naming
# the file.
set -euo pipefail

cd "$(dirname "$0")/.."

# Files that construct telemetry/notification payloads (the 050 surface).
FILES=(
  packages/shared-types/src/device.ts
  apis/edge-api/shared/src/lib/devices.ts
  apis/edge-api/shared/src/payments/outbox.ts
  apis/edge-api/notifications/src/worker/copy.ts
  apis/edge-api/notifications/src/fcm/sender.ts
  apis/edge-api/notifications/src/worker/drain.ts
  apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/observability/AnalyticsEvent.kt
  apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/core/observability/AnalyticsEvent.kt
)

# PII tokens forbidden as payload keys/props. Word-boundaried; `sub` variants are the allowed id.
PII_PATTERN='(recipient_name|customer_name|first_name|last_name|full_name|\bemail\b|\bphone\b|\baddress\b|\bpostcode\b|postal_code|line1|line2|order_total|grand_total|card|payment)'

fail=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  # Skip comment lines (JS/Kotlin //, /*, *, /**; SQL --; shell #) to reduce prose false positives,
  # then match remaining code lines. `|| true` so a no-match grep doesn't trip `set -e`.
  # A notification channel named "email" is not an email address in a payload.
  if hits=$(grep -nEi "$PII_PATTERN" "$f" | grep -vE '^[0-9]+:[[:space:]]*(/|\*|//|--|#)' | grep -vE 'NotificationChannel|channel === "email"' || true); then
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
