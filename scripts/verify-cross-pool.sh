#!/usr/bin/env bash
# SC-004 — cross-pool isolation, BOTH directions (specs/007-shop-web).
#
# The four-pool isolation rule (constitution Principle IV) is enforced structurally, by the shared
# gateway's per-pool JWT authorizers — not by application code. That means it cannot be unit-tested:
# a vitest assertion would only prove the test's own fixture is shaped as expected. This script is
# the honest verification, run against the real gateway with two real tokens.
#
#   usage: make shop-verify-isolation SHOP_TOKEN=eyJ... BO_TOKEN=eyJ... ENV=dev
#
# Pass = 200 200 401 401.
set -euo pipefail

API="${API_ENDPOINT:?API_ENDPOINT not set}"
SHOP_TOKEN="${SHOP_TOKEN:?SHOP_TOKEN not set (sign in to shop-web, copy the access token)}"
BO_TOKEN="${BO_TOKEN:?BO_TOKEN not set (sign in to back-office, copy the access token)}"

status() { # path token
  curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $2" "${API}$1"
}

fail=0
check() { # label path token expected
  local label="$1" path="$2" token="$3" expected="$4" got
  got="$(status "$path" "$token")"
  if [ "$got" = "$expected" ]; then
    printf '  \033[32m✓\033[0m %-46s %s\n' "$label" "$got"
  else
    printf '  \033[31m✗\033[0m %-46s %s (expected %s)\n' "$label" "$got" "$expected"
    fail=1
  fi
}

echo "cross-pool isolation → ${API}"
echo
echo "same-pool (must be served):"
check "shop token  → /store/v1/me"   "/store/v1/me"  "$SHOP_TOKEN" 200
check "bo token    → /admin/v1/me"   "/admin/v1/me"  "$BO_TOKEN"   200
echo
echo "cross-pool (must be refused at the authorizer):"
check "bo token    → /store/v1/me"   "/store/v1/me"  "$BO_TOKEN"   401
check "shop token  → /admin/v1/me"   "/admin/v1/me"  "$SHOP_TOKEN" 401
echo

if [ "$fail" -ne 0 ]; then
  cat <<'DIAG'
FAILED — read the codes carefully, they name the bug:

  403 instead of 401   a route lost its authorizer and fell through to a handler-level check.
                       The gate is no longer structural.

  200 on a cross-pool  a route was attached with the WRONG authorizer id. This is the one mistake
                       the design still permits: the id is an opaque SSM string, so swapping
                       back-office_id and shop_id type-checks fine and deploys fine.
                       → check `authorizer.id` in each service's serverless.yml.

  401 on a same-pool   the console holds a token from a different pool than its VITE_COGNITO_CLIENT_ID,
                       or the token has expired. Re-sign-in and retry before assuming a defect.
DIAG
  exit 1
fi

echo "PASS — a credential is usable only against its own audience, in both directions."
