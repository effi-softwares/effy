#!/usr/bin/env bash
# No phantm.com anywhere in this project: not the domain, a subdomain or an address. An address belonging to
# an assistant session was once written into dev.tfvars as the alarm endpoint, and the apply mailed a
# subscription request to someone who never asked; every other gate passed. Real-World Identifiers: exit
# non-zero and name the file on any hit.
#
# Usage: bash scripts/check-no-phantm.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# The banned pattern: the domain and any subdomain of it, in any position.
PATTERN='phantm\.com'

# the only permitted occurrences are the places that name it in order to forbid it. Anything else
# - config, fixtures, seeds, specs, docs, comments - is a failure. Keep this list short; every entry
# is a place someone could hide a real value behind a plausible-looking exemption.
ALLOWED=(
  "CLAUDE.md"                          # the prohibition, stated for contributors
  ".specify/memory/constitution.md"    # the governing rule itself
  "infra/envs/dev/variables.tf"        # the validation block that rejects it
  "scripts/check-no-phantm.sh"         # this file
)

is_allowed() {
  local f="${1#./}"
  for a in "${ALLOWED[@]}"; do
    [ "$f" = "$a" ] && return 0
  done
  return 1
}

fail=0
found=""

# --hidden --no-ignore so a value cannot hide in a dotfile or a gitignored one..git is excluded
# because history is a separate concern (see the note at the bottom).
while IFS= read -r line; do
  file="${line%%:*}"
  is_allowed "$file" && continue
  found="${found}${line}"$'\n'
  fail=1
done < <(
  rg -n --hidden --no-ignore -i "${PATTERN}" . 2>/dev/null \
    | grep -v "^\./\.git/" \
    | grep -v "node_modules" \
    | grep -v "^\./\.terraform/" \
    || true
)

if [ "${fail}" -eq 0 ]; then
  printf '\033[32m✓\033[0m check-no-phantm: no phantm.com reference outside the %d files that forbid it.\n' "${#ALLOWED[@]}"
  exit 0
fi

printf '\033[31m✗ check-no-phantm FAILED\033[0m - phantm.com must never appear in this project.\n\n'
printf '%s\n' "${found}"
printf 'Constitution v1.12.0 § Real-World Identifiers: identifiers that reach a person outside this\n'
printf 'repository are OPERATOR-SUPPLIED. Where the value is unknown, fail loudly - never guess.\n'
printf 'Approved Effy mailboxes: workspace-admin@effyshopping.com (operational),\n'
printf 'hello@effyshopping.com (customer-facing). Anything else: ask.\n'
exit 1
