#!/usr/bin/env bash
# 039 FR-002 — the operator's storefront LOCKS, enforced mechanically.
#
# The operator's direction for the home redesign was explicit: the header, top navigation, information
# strip, the PRODUCT CARD and the footer are not redesigned by that feature. Until now that lock lived
# only in a comment at the top of tasks.md, and a comment does not fail a build.
#
# ⚠ THIS IS A DRIFT GUARD, NOT A BAN. These files are allowed to change — by a feature that intends to
# change them. What must not happen is a redesign quietly reaching into the product card because one
# rail looked slightly wrong, which is exactly how a "we are not touching X" scope commitment erodes.
#
# So: each locked file's sha256 is recorded in the baseline below. Editing one deliberately means
# updating the baseline in the same commit — a reviewed, greppable act — rather than nobody noticing.
#
# Same shape as `check-no-jade.sh`, `tokens:check` and `brand-check`: authored source, recorded
# expectation, a check that names what drifted and never repairs it.

set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="scripts/storefront-locks.sha256"
LOCKED=(
  "apps/customer-web/app/(shop)/layout.tsx"
  "apps/customer-web/app/(shop)/_components/ProductCard.tsx"
  "apps/customer-web/app/(shop)/_components/StorefrontFooter.tsx"
  "apps/customer-web/app/(shop)/_components/PrimaryNav.tsx"
  "apps/customer-web/app/(shop)/_components/MobileNav.tsx"
  "apps/customer-web/app/(shop)/_components/HeaderSearch.tsx"
)

hash_of() { shasum -a 256 "$1" | cut -d' ' -f1; }

if [ "${1:-}" = "--update" ]; then
  : > "$BASELINE"
  for f in "${LOCKED[@]}"; do
    [ -f "$f" ] || { echo "check-storefront-locks: missing locked file: $f" >&2; exit 1; }
    echo "$(hash_of "$f")  $f" >> "$BASELINE"
  done
  echo "check-storefront-locks: baseline rewritten — ⚠ commit it with the change that justified it."
  exit 0
fi

[ -f "$BASELINE" ] || { echo "check-storefront-locks: no baseline; run '$0 --update'" >&2; exit 1; }

drifted=()
for f in "${LOCKED[@]}"; do
  if [ ! -f "$f" ]; then
    drifted+=("$f (DELETED)")
    continue
  fi
  # ⚠ EXACT FIELD COMPARISON, not a regex match. Every locked path contains `(shop)`, which awk would
  # read as a capture group — so `~` matched `app/shop/…` and never the real `app/(shop)/…`, and every
  # file reported "not in baseline". The guard failed loudly rather than silently, which is the only
  # reason it was obvious.
  expected="$(awk -v path="$f" '$2 == path {print $1}' "$BASELINE" | head -1)"
  if [ -z "$expected" ]; then
    drifted+=("$f (not in baseline)")
  elif [ "$(hash_of "$f")" != "$expected" ]; then
    drifted+=("$f")
  fi
done

if [ ${#drifted[@]} -gt 0 ]; then
  echo "check-storefront-locks: FAILED — operator-locked storefront files changed (039 FR-002):" >&2
  printf '    %s\n' "${drifted[@]}" >&2
  echo "" >&2
  echo "  These are locked by operator decision: the header/nav/info-strip, the product card and the" >&2
  echo "  footer are not redesigned by the home slice. If the change is intended, run" >&2
  echo "      scripts/check-storefront-locks.sh --update" >&2
  echo "  and commit the new baseline alongside it, so the decision is visible in review." >&2
  exit 1
fi

echo "check-storefront-locks: OK — ${#LOCKED[@]} operator-locked storefront files unchanged (FR-002)."
