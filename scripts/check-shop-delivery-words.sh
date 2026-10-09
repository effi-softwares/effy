#!/usr/bin/env bash
# 079 FR-028 / SC-006 — A SHOP IS NEVER SHOWN "SAME-DAY" OR "STANDARD".
#
# Those are the CUSTOMER'S words for a delivery. Until 079 they were printed on the shop console and
# the shop app as the delivery "method" — and then, under the new delivery model, a "standard" order
# became one an Effy driver delivers on a later day. The word would have been wrong on the screen of
# the one person handing the package over.
#
# A shop is told one thing about delivery: WHO TAKES THE PACKAGE AWAY — "Effy driver" or "Courier"
# (`DELIVERED_BY_WORDS` in packages/shared-types/src/delivery-type.ts, mirrored by the shop app's
# `DeliveredByWords.kt`).
#
# This is a guard over SOURCE because the failure produces no error: a label restored during a
# redesign compiles, renders, and reads perfectly plausibly.
#
# What it looks for, in the shop console's and the shop app's own UI source (not tests):
#   a quoted string or JSX text containing  same-day / Same day / standard delivery
#   (lower-case "same day" is ordinary English — "the same day last week" — and is not a hit)
#   a label that is exactly                 "Standard"
#
# What is NOT a hit: the wire field `deliveryMethod` and its values `"same_day"` / `"standard"`,
# which stay on the contract (deprecated) for shop apps installed before 079; comments; and
# "standard" in its ordinary sense inside prose that is never rendered (e.g. "the web standard").
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rnE "([\"'\`>][^\"'\`<]*\b([Ss]ame-[Dd]ay|Same [Dd]ay|[Ss]tandard delivery)\b)|([\"'\`>]Standard[\"'\`<])" \
    apps/shop-web/src apps/shop-mobile/shared/src/commonMain \
    --include='*.ts' --include='*.tsx' --include='*.kt' 2>/dev/null \
  | grep -vE "(\.test\.|__tests__/|/commonTest/)" \
  | grep -vE "^[^:]+:[0-9]+:\s*(//|\*|/\*)" \
  | grep -vE "(//|/\*|\*).*([Ss]ame-[Dd]ay|Same [Dd]ay|[Ss]tandard)" || true)

if [ -n "$hits" ]; then
  echo "✗ a shop screen says \"same-day\" or \"standard\" (079 FR-028). Those are the customer's words."
  echo "  A shop is shown who takes the package away: DELIVERED_BY_WORDS[deliveredBy] — \"Effy driver\" / \"Courier\"."
  echo "$hits"
  exit 1
fi
echo "✓ shop delivery words — no shop screen says same-day or standard"
