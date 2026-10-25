#!/usr/bin/env bash
# No-Jade sweep: the retired Jade accent (#0FB57E) must not (#047857 is emerald-700, adopted 2026-10-25)
# appear in any live source/asset. Scans packages/ + apps/ code files, excluding node_modules, build
# output, and the theme guard tests (which legitimately name the forbidden hex to forbid it).
set -euo pipefail

cd "$(dirname "$0")/.."

# grep -r with include/exclude; case-insensitive; the two retired hex values.
hits="$(grep -rniE '0fb57e' packages apps \
  --include='*.css' --include='*.ts' --include='*.tsx' --include='*.kt' --include='*.svg' \
  --exclude='*.test.ts' --exclude='*.test.tsx' \
  --exclude-dir='node_modules' --exclude-dir='.next' --exclude-dir='dist' \
  --exclude-dir='build' --exclude-dir='.turbo' --exclude-dir='coverage' 2>/dev/null || true)"

if [ -n "$hits" ]; then
  echo "check-no-jade: FAILED — retired Jade brand value found in live source:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "check-no-jade: OK — no retired Jade brand values in live source (SC-008)."
