#!/usr/bin/env bash
# verify-no-store.sh — enforce the one-name rule (008-shop-naming-unification, SC-001).
#
# The Effy audience of internal fulfillment-node operators is named "shop", never "store".
# This script finds every surviving occurrence of the retired token and fails on any that is
# not individually attributable to a documented exclusion.
#
# Exclusions live in scripts/store-token-allowlist.txt, one extended-regex per line, each
# preceded by a comment naming its category and reason. Adding a pattern is therefore a
# reviewable act with a written justification attached — which is the whole point. A silent
# widening of the allowlist is how the split this feature removed would come back.
#
# Usage:  make verify-naming        (or:  bash scripts/verify-no-store.sh)
# Exit:   0 = clean · 1 = unattributed occurrences found · 2 = the guard itself is broken
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST="${ROOT}/scripts/store-token-allowlist.txt"

if [ ! -f "$ALLOWLIST" ]; then
  echo "verify-no-store: allowlist not found: $ALLOWLIST" >&2
  exit 2
fi

# Strip comments and blank lines. What remains are the permitted-line patterns.
patterns="$(sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$ALLOWLIST")"
if [ -z "$patterns" ]; then
  echo "verify-no-store: allowlist contains no patterns — refusing to pass vacuously" >&2
  exit 2
fi

cd "$ROOT"

# Search tracked + untracked-but-not-ignored files, so a newly added file cannot smuggle the
# retired name in. git's ignore rules already exclude node_modules/, dist/, .serverless/, etc.
#
# Path exclusions — the artifacts that DESCRIBE the rename necessarily quote the old name:
#   pnpm-lock.yaml                     machine-generated
#   specs/008-shop-naming-unification  this feature's own spec, plan, contracts, tasks
#   scripts/verify-no-store.sh         this file
#   scripts/store-token-allowlist.txt  the allowlist itself
hits="$(git grep --untracked -I -n -i -e store -- \
  ':!pnpm-lock.yaml' \
  ':!specs/008-shop-naming-unification' \
  ':!scripts/verify-no-store.sh' \
  ':!scripts/store-token-allowlist.txt' \
  || true)"

if [ -z "$hits" ]; then
  echo "verify-no-store: clean — no occurrences of the retired token at all."
  exit 0
fi

remainder="$(printf '%s\n' "$hits" | grep -v -E -f <(printf '%s\n' "$patterns") || true)"

if [ -z "$remainder" ]; then
  attributed="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
  echo "verify-no-store: clean — ${attributed} occurrence(s), each attributable to a documented exclusion."
  exit 0
fi

count="$(printf '%s\n' "$remainder" | wc -l | tr -d ' ')"
files="$(printf '%s\n' "$remainder" | cut -d: -f1 | sort -u | wc -l | tr -d ' ')"

echo "verify-no-store: FAIL — ${count} unattributed occurrence(s) of the retired token across ${files} file(s)."
echo
printf '%s\n' "$remainder"
echo
echo "Each line above must either be renamed to 'shop', or added to"
echo "  scripts/store-token-allowlist.txt"
echo "with a comment naming its exclusion category. See"
echo "  specs/008-shop-naming-unification/contracts/naming.contract.md"
exit 1
