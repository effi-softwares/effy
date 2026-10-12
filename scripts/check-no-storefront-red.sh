#!/usr/bin/env bash
# GUARD — there is no red on the storefront, and it is light only (constitution v3.3.0, feature 084).
#
# The storefront identity says an error with an icon and its wording, never with a hue, and it has no
# dark appearance. Both are easy to break one utility at a time: a `text-red-600` pasted from a shadcn
# example, or a `dark:` variant carried in with a generated primitive (which is dead CSS here and reads
# as if a dark storefront existed).
#
# Fails on, under apps/customer-web (tests excluded):
#   - Tailwind's red-family utilities (red, rose, pink, orange, amber, yellow)
#   - a `dark:` variant
#   - an arbitrary hex colour utility (`bg-[#e01010]`) — a colour outside the token set, whatever its hue
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
echo "check-no-storefront-red: OK — no red-family utility, dark: variant or arbitrary hex colour in apps/customer-web."
