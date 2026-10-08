#!/usr/bin/env bash
# Cross-pool isolation, EVERY direction (007 SC-004; 075 SC-005).
#
# The four-pool isolation rule (constitution Principle IV) is enforced structurally, by the
# gateways' JWT authorizers — not by application code. That means it cannot be unit-tested: a vitest
# assertion would only prove the test's own fixture is shaped as expected. This script is the honest
# verification, run against the real gateways with real tokens.
#
# ⚠ TWO GATEWAYS SINCE 075, and the boundary is now per GATEWAY as well as per route:
#   · the STAFF gateway carries only the back-office authorizer — a customer, shop or driver token
#     has nothing there that could accept it;
#   · the SHARED gateway carries no back-office authorizer — a staff token has nothing there.
#
#   usage: make shop-verify-isolation SHOP_TOKEN=eyJ... BO_TOKEN=eyJ... [CUSTOMER_TOKEN=..] [DRIVER_TOKEN=..] ENV=dev
#
# Pass = every same-pool call 200, every cross-pool call 401.
set -euo pipefail

SHARED="${SHARED_API:?SHARED_API not set (from /effy/<env>/edge/api_endpoint)}"
STAFF="${STAFF_API:?STAFF_API not set (from /effy/<env>/staff/api_endpoint)}"
SHOP_TOKEN="${SHOP_TOKEN:?SHOP_TOKEN not set (sign in to shop-web, copy the access token)}"
BO_TOKEN="${BO_TOKEN:?BO_TOKEN not set (sign in to back-office, copy the access token)}"
CUSTOMER_TOKEN="${CUSTOMER_TOKEN:-}"
DRIVER_TOKEN="${DRIVER_TOKEN:-}"

status() { # url token
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Authorization: Bearer $2" "$1"
}

fail=0
skipped=0
check() { # label url token expected
  local label="$1" url="$2" token="$3" expected="$4" got
  got="$(status "$url" "$token")"
  if [ "$got" = "$expected" ]; then
    printf '  \033[32m✓\033[0m %-52s %s\n' "$label" "$got"
  else
    printf '  \033[31m✗\033[0m %-52s %s (expected %s)\n' "$label" "$got" "$expected"
    fail=1
  fi
}
skip() { # label
  printf '  \033[33m–\033[0m %-52s NOT CHECKED (no token given)\n' "$1"
  skipped=$((skipped + 1))
}

echo "cross-pool isolation"
echo "  shared → ${SHARED}"
echo "  staff  → ${STAFF}"
echo
echo "same-pool (must be served):"
check "shop token     → shared /shop/v1/me"  "${SHARED}/shop/v1/me"  "$SHOP_TOKEN" 200
check "staff token    → staff  /admin/v1/me" "${STAFF}/admin/v1/me"  "$BO_TOKEN"   200
echo
echo "at the STAFF gateway (must be refused — it has no authorizer for them):"
check "shop token     → staff  /admin/v1/me" "${STAFF}/admin/v1/me"  "$SHOP_TOKEN" 401
if [ -n "$CUSTOMER_TOKEN" ]; then check "customer token → staff  /admin/v1/me" "${STAFF}/admin/v1/me" "$CUSTOMER_TOKEN" 401; else skip "customer token → staff  /admin/v1/me"; fi
if [ -n "$DRIVER_TOKEN" ];   then check "driver token   → staff  /admin/v1/me" "${STAFF}/admin/v1/me" "$DRIVER_TOKEN"   401; else skip "driver token   → staff  /admin/v1/me"; fi
echo
echo "a STAFF token at the shared gateway (must be refused on every audience's routes):"
check "staff token    → shared /shop/v1/me"          "${SHARED}/shop/v1/me"          "$BO_TOKEN" 401
check "staff token    → shared /customer/v1/points"  "${SHARED}/customer/v1/points"  "$BO_TOKEN" 401
check "staff token    → shared /inventory/v1/low-stock" "${SHARED}/inventory/v1/low-stock" "$BO_TOKEN" 401
echo

if [ "$fail" -ne 0 ]; then
  cat <<'DIAG'
FAILED — read the codes carefully, they name the bug:

  403 instead of 401   a route lost its authorizer and fell through to a handler-level check.
                       The gate is no longer structural.

  200 on a cross-pool  a route was attached with the WRONG authorizer id, or a stack is on the
                       wrong gateway. The id is an opaque SSM string, so a swap type-checks and
                       deploys fine. → `pnpm --filter @effy/edge-shared test` (gateway-placement).

  404 on a same-pool   the service has not been redeployed onto that gateway yet (during the 075
                       move), or the two addresses were passed the wrong way round.

  401 on a same-pool   the console holds a token from a different pool than its
                       VITE_COGNITO_CLIENT_ID, or the token has expired. Re-sign-in and retry.
DIAG
  exit 1
fi

if [ "$skipped" -gt 0 ]; then
  echo "PASS for the directions checked — ⚠ ${skipped} direction(s) were NOT checked. Pass CUSTOMER_TOKEN and DRIVER_TOKEN for the full result."
else
  echo "PASS — a credential is usable only against its own audience, at both gateways, in every direction."
fi
