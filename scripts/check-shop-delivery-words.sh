#!/usr/bin/env bash
# A shop is never shown "same-day" or "standard": those are the customer's words, and a "standard" Effy
# order is delivered by an Effy driver. A shop is told who takes the package away, "Effy driver" or
# "Courier" (`DELIVERED_BY_WORDS` in packages/shared-types/src/delivery-type.ts).
#
# A source guard, because a restored label compiles and reads plausibly. Scans shop-web's UI source (not
# tests) for a quoted string or JSX text containing same-day / Same day / standard delivery (lower-case
# "same day" is ordinary English), or a label that is exactly "Standard". Comments and "standard" in prose
# never rendered are not hits.
set -euo pipefail
cd "$(dirname "$0")/.."

hits=$(grep -rnE "([\"'\`>][^\"'\`<]*\b([Ss]ame-[Dd]ay|Same [Dd]ay|[Ss]tandard delivery)\b)|([\"'\`>]Standard[\"'\`<])" \
    apps/shop-web/src \
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
