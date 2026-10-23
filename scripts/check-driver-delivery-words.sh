#!/usr/bin/env bash
# A driver and a dispatcher are never shown "same-day" or "standard": those are the customer's words, and
# a "standard" Effy order is delivered by an Effy driver on a later day in a window, so on a driver's or
# dispatcher's screen the word says nothing true. They read "Effy delivery" / "Delivery" (with its day and
# window), "Collection" and "Courier"; a driver's permissions are "Collects" / "Delivers" and where.
#
# A source guard, because a restored label compiles and reads plausibly (like check-shop-delivery-words.sh).
# Scans the driver app's UI source and back-office's dispatch, driver and assignment screens (not tests)
# for a quoted string or JSX text containing same-day / same day / standard (any case). Identifiers, wire
# values (`"same_day"`, `"standard"`, `PackageMethod.SAME_DAY`, `sameDayCount`) and comments are not hits.
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rnEi "[\"'\`>][^\"'\`<]*\b(same[- ]day|standard)\b" \
    apps/driver-mobile/shared/src/commonMain \
    apps/back-office/src/features/dispatch apps/back-office/src/features/drivers apps/back-office/src/features/assign \
    --include='*.ts' --include='*.tsx' --include='*.kt' 2>/dev/null \
  | grep -vE "(\.test\.|__tests__/|/commonTest/)" \
  | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|/\*|\{/\*)" \
  | grep -vEi "(//|/\*|\*).*(same[- ]day|standard)" \
  | grep -vE "[\"'\`](same_day|standard|same_day_delivery)[\"'\`]" || true)

if [ -n "$hits" ]; then
  echo "✗ a driver or dispatch screen says \"same-day\" or \"standard\" (082 FR-012/FR-021). Those are the customer's words."
  echo "  Say who takes the parcel and when: \"Effy delivery\" / \"Delivery\" with its day and window, \"Collection\", \"Courier\"."
  echo "$hits"
  exit 1
fi
echo "✓ driver delivery words — no driver or dispatch screen says same-day or standard"
