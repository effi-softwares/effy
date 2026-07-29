#!/usr/bin/env bash
# No-Emerald sweep (026 FR-011 / SC-001): the retired Effy Emerald brand values MUST NOT appear in any
# live source/asset once feature 026 lands the monochrome identity. Sibling of check-no-jade.sh.
#
# ⚠ TWO DELIBERATE DIFFERENCES FROM check-no-jade.sh, both load-bearing (026 research R13):
#
#   1. It scans *.mjs and *.xml as well. The Jade script covers only css/ts/tsx/kt/svg, which CANNOT
#      SEE the two places the retired brand actually lives outside tokens.css:
#        - packages/brand/src/{colourways,compositions}.mjs  (mark colourways + SPLASH_GROUND)
#        - apps/*/androidApp/src/main/res/values{,-night}/colors.xml  (splash grounds, hand-maintained)
#      A guard that misses those would report clean while the brand survived in the shipped APK.
#
#   2. It excludes packages/brand/src/colourways.mjs, where RETIRED_EMERALD legitimately names these
#      values in order to forbid them (the same reason the Jade script excludes *.test.ts).
#
# The values, and why each is here:
#   065f46  emerald-800 — the accent (light + dark)
#   10b981  emerald-500 — the dark-mode focus ring + the brand mark's bag body
#   d0735a  terracotta as supplied
#   bf5540  terracotta AA-tuned for light
#   dd8368  terracotta lifted for dark
#   69b08b  the emerald tint used on dark surfaces
#   0ea5e9  sky-500 — the 024 shop mark body
#   075985  sky-800 — the 024 shop mark fold
#   4ade80  green-400 — the 024 customer splash ground
#   3b82f6  blue-500  — the 024 shop splash ground
set -euo pipefail

cd "$(dirname "$0")/.."

hits="$(grep -rniE '065f46|10b981|d0735a|bf5540|dd8368|69b08b|0ea5e9|075985|4ade80|3b82f6' packages apps \
  --include='*.css' --include='*.ts' --include='*.tsx' --include='*.kt' --include='*.svg' \
  --include='*.mjs' --include='*.xml' \
  --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*.test.js' --exclude='*.test.mjs' \
  --exclude='colourways.mjs' \
  --exclude-dir='node_modules' --exclude-dir='.next' --exclude-dir='dist' \
  --exclude-dir='build' --exclude-dir='.turbo' --exclude-dir='coverage' 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-emerald: FAILED — retired Effy Emerald brand value found in live source:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "check-no-emerald: OK — no retired Effy Emerald brand values in live source (SC-001)."
