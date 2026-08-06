#!/usr/bin/env bash
# ⚠ NO phantm.com ANYWHERE IN THIS PROJECT — not the domain, not a subdomain, not an address.
#
# WHY THIS SCRIPT EXISTS. On 2026-08-06 `techsupport+claudeone@phantm.com` — an address belonging to
# an assistant session, not to this platform — was read out of context and written into
# infra/envs/dev/dev.tfvars as the CloudWatch alarm endpoint. The apply created a live SNS email
# subscription and AWS mailed a subscription request to a person who had never asked for one.
#
# EVERY AUTOMATED GATE PASSED: typecheck, 1,077 tests, terraform validate, fmt, shellcheck. Nothing
# was incorrect. The defect was one of AUTHORITY — a value nobody had chosen was made outward-facing
# — and no existing check was looking for that class of mistake. This one is.
#
# Constitution v1.12.0 § Real-World Identifiers. Exit non-zero and NAME the file on any hit.
#
# Usage: bash scripts/check-no-phantm.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# The banned pattern: the domain and any subdomain of it, in any position.
PATTERN='phantm\.com'

# ⚠ THE ONLY PERMITTED OCCURRENCES are the places that name it in order to FORBID it. Anything else
# — config, fixtures, seeds, specs, docs, comments — is a failure. Keep this list SHORT; every entry
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

# --hidden --no-ignore so a value cannot hide in a dotfile or a gitignored one. .git is excluded
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

printf '\033[31m✗ check-no-phantm FAILED\033[0m — phantm.com must never appear in this project.\n\n'
printf '%s\n' "${found}"
printf 'Constitution v1.12.0 § Real-World Identifiers: identifiers that reach a person outside this\n'
printf 'repository are OPERATOR-SUPPLIED. Where the value is unknown, fail loudly — never guess.\n'
printf 'Approved Effy mailboxes: workspace-admin@effyshopping.com (operational),\n'
printf 'hello@effyshopping.com (customer-facing). Anything else: ask.\n'
exit 1
