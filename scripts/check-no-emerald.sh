#!/usr/bin/env bash
# No-Emerald sweep: the retired Effy Emerald brand values must not appear in any live source or asset.
# Sibling of check-no-jade.sh, with two differences:
#
# 1. It scans *.mjs and *.xml too, where the brand also lived outside tokens.css:
# - packages/brand/src/{colourways,compositions}.mjs (mark colourways + SPLASH_GROUND)
# - apps/*/androidApp/src/main/res/values{,-night}/colors.xml (splash grounds, hand-maintained)
# 2. It excludes packages/brand/src/colourways.mjs, where RETIRED_EMERALD names these values to forbid them.
#
# The values:
# 065f46 emerald-800 - the accent (light + dark)
# d0735a terracotta as supplied
# bf5540 terracotta AA-tuned for light
# dd8368 terracotta lifted for dark
# 69b08b the emerald tint used on dark surfaces
# 0ea5e9 sky-500 - the old shop mark body
# 075985 sky-800 - the old shop mark fold
# 4ade80 green-400 - the old customer splash ground
# 3b82f6 blue-500 - the old shop splash ground
set -euo pipefail

cd "$(dirname "$0")/.."

hits="$(grep -rniE '065f46|d0735a|bf5540|dd8368|69b08b|0ea5e9|075985|4ade80|3b82f6' packages apps \
  --include='*.css' --include='*.ts' --include='*.tsx' --include='*.kt' --include='*.svg' \
  --include='*.mjs' --include='*.xml' \
  --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*.test.js' --exclude='*.test.mjs' \
  --exclude='colourways.mjs' \
  --exclude-dir='node_modules' --exclude-dir='.next' --exclude-dir='dist' \
  --exclude-dir='build' --exclude-dir='.turbo' --exclude-dir='coverage' 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-emerald: FAILED - retired Effy Emerald brand value found in live source:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "check-no-emerald: OK - no retired Effy Emerald brand values in live source (SC-001)."
