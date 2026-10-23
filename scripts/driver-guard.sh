#!/usr/bin/env bash
# Driver guard — the redesign's rules for apps/driver-mobile, made build-failing.
#
# 1. No colour literal in a screen. Colours come from the theme (MaterialTheme.colorScheme / EffyRoles),
# generated from the storefront file; a Color(0x…) in a screen is a second palette.
# 2. No red, no orange. The storefront identity says a problem with black and an icon (v3.5.0).
# 3. Counts, never money. No currency on any driver screen.
# 4. No map tab, no activity feed. Removed by the redesign; they must not come back by accident.
#
# Run: scripts/driver-guard.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/apps/driver-mobile/shared/src"
FAIL=0

fail() { echo "✗ driver-guard: $1"; echo "$2" | sed 's/^/    /'; FAIL=1; }

# Screens = presentation code and the shell; the theme and platform surfaces are exempt.
SCREENS="$(find "$SRC" -path '*/build' -prune -o -name '*.kt' -print \
  | grep -E '/(features/[^/]+/presentation|features/(account|onboarding)|app|core/presentation|core/scan)/' \
  | grep -vE 'Test\.kt$' || true)"

HITS="$(echo "$SCREENS" | xargs grep -nE 'Color\(0x[0-9A-Fa-f]{6,8}\)' 2>/dev/null || true)"
[ -n "$HITS" ] && fail "a colour literal in a screen — use MaterialTheme.colorScheme or EffyRoles:" "$HITS"

HITS="$(echo "$SCREENS" | xargs grep -nE 'Color\.(Red|Yellow|Magenta)\b|colorScheme\.(error|onError)|errorContainer|warning' 2>/dev/null || true)"
[ -n "$HITS" ] && fail "red, orange or a warning hue — a problem is black with an icon (v3.5.0):" "$HITS"

HITS="$(echo "$SCREENS" | xargs grep -nE '"[^"]*\$[0-9]|\bAUD\b|formatMoney' 2>/dev/null || true)"
[ -n "$HITS" ] && fail "money on a driver screen — counts, never money:" "$HITS"

HITS="$(grep -rnE 'MapRoot|ActivityRoute|EffyMapCanvas' --include='*.kt' "$SRC" 2>/dev/null | grep -v '/build/' || true)"
[ -n "$HITS" ] && fail "the Map tab or the activity feed is back (E1, E4):" "$HITS"

if [ "$FAIL" -eq 0 ]; then echo "✓ driver-guard: theme colours only, no red, no money, three tabs"; fi
exit "$FAIL"
