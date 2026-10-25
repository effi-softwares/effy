#!/usr/bin/env bash
# No red on the storefront, and it is light only: an error is an icon and words, never a hue. Fails on, under
# apps/customer-web (tests excluded):
# - Tailwind's red-family utilities (red, rose, pink, orange, amber, yellow)
# - a `dark:` variant
# - an arbitrary hex colour utility (`bg-[#e01010]`) — a colour outside the token set, whatever its hue
set -euo pipefail

cd "$(dirname "$0")/.."

hits="$(grep -rnE '\b(bg|text|border|ring|fill|stroke|outline|decoration|from|via|to|divide|shadow)-(red|rose|pink|orange|amber|yellow)-[0-9]{2,3}\b|\bdark:[a-z\[]|-\[#[0-9a-fA-F]{3,8}\]' \
  apps/customer-web/app apps/customer-web/components \
  --include='*.ts' --include='*.tsx' --include='*.css' \
  --exclude='*.test.ts' --exclude='*.test.tsx' 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-storefront-red: FAILED — a red-family utility, a dark: variant or an arbitrary hex colour on the storefront:" >&2
  echo "$hits" >&2
  exit 1
fi
# The customer mobile app wears the storefront identity too. Its colours come only from the
# generated storefront theme (packages/design-system/compose/EffyTokens.kt, which tokens:check holds to
# tokens.css); a red-dominant colour literal anywhere in its Kotlin is a defect.
mobile_red="$(grep -rnoE 'Color\(0x[0-9A-Fa-f]{8}\)' apps/customer-mobile/shared/src packages/design-system/compose \
  --include='*.kt' 2>/dev/null | python3 -c '
import sys
for line in sys.stdin:
    h = line.rsplit("0x", 1)[1][2:8]
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if r > g + 40 and r > b + 40:
        print(line.rstrip())
' || true)"
if [ -n "$mobile_red" ]; then
  echo "check-no-storefront-red: FAILED — a red-dominant colour literal in the customer mobile app:" >&2
  echo "$mobile_red" >&2
  exit 1
fi
echo "check-no-storefront-red: OK — no red-family utility, dark: variant or arbitrary hex colour in apps/customer-web; no red in the customer mobile app."
