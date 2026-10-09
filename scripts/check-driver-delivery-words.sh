#!/usr/bin/env bash
# 082 FR-012 / FR-021 / SC-004 — A DRIVER AND A DISPATCHER ARE NEVER SHOWN "SAME-DAY" OR "STANDARD".
#
# Those are the CUSTOMER'S words for a delivery. Under the new delivery model a "standard" order is
# one an Effy driver delivers on a later day, in a window — so on a driver's screen the word no longer
# says what to do with the parcel, and on a dispatcher's it no longer says whose work it is.
#
# Drivers and dispatch read: "Effy delivery" / "Delivery" (with its day and window), "Collection",
# and "Courier". A driver's permissions are "Collects" / "Delivers" and where.
#
# This is a guard over SOURCE because the failure produces no error: a label restored during a
# redesign compiles, renders, and reads perfectly plausibly. Same shape as 079's
# `check-shop-delivery-words.sh`, which keeps the same two words off a shop's screens.
#
# What it looks for, in the driver app's own UI source and back-office's dispatch, driver and
# assignment screens (not tests):
#   a quoted string or JSX text containing  same-day / same day / standard   (any case)
#
# What is NOT a hit: identifiers and wire values — `same_day_delivery`, `"same_day"`, `"standard"`,
# `PackageMethod.SAME_DAY`, `MapMode.SAME_DAY`, `sameDayCount` — which stay on the contract until the
# cutover so driver apps installed before 082 keep working; and comments.
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
