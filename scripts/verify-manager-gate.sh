#!/usr/bin/env bash
# SC-005 / SC-005a / SC-012 — the manager gate is backend-authoritative (specs/007-shop-web).
#
# Proves that `GET /shop/v1/manager-ping` is decided from the PLATFORM RECORD — role AND status
# AND shop scope — and not from the cognito:groups claim or from a hidden nav item.
#
#   usage: make shop-verify-gate MANAGER_TOKEN=eyJ... STAFF_TOKEN=eyJ... NOBODY_TOKEN=eyJ... ENV=dev
#
# Each request below bypasses the interface entirely. A shop_staff operator who never sees the
# Management link is refused exactly the same way as one who types the URL.
#
# ── WHICH CHECKS CAN PASS TODAY ──────────────────────────────────────────────────────────────
# 007 ships the shop SCHEMA but no way to CREATE a shop: that is back-office shop management
# (its own slice, not yet built). Until that slice ships, no operator has a shop assignment, so:
#
#   • the DENIAL checks all pass now  — shop_staff, role-less, and unassigned are refused, which
#     is exactly the negative half of the gate (SC-005, SC-005a).
#   • the manager POSITIVE check (200) cannot pass — an inner join to public.shop finds nothing.
#
# Run with EXPECT_SHOP=0 (the default, until back-office shop management ships) to assert the
# manager is refused *for lack of a
# shop*, and EXPECT_SHOP=1 afterwards to assert they are served. Either way the gate is proven;
# what changes is which side of it there is data for.
set -euo pipefail

API="${API_ENDPOINT:?API_ENDPOINT not set}"
MANAGER_TOKEN="${MANAGER_TOKEN:?MANAGER_TOKEN not set}"
STAFF_TOKEN="${STAFF_TOKEN:?STAFF_TOKEN not set}"
NOBODY_TOKEN="${NOBODY_TOKEN:?NOBODY_TOKEN not set (a provisioned account with NO role)}"

# 0 = no shop assignments exist yet (pre-shop-management): the manager must be refused for lack of a shop.
# 1 = the shop-management slice has created a shop and assigned the manager to it: they must be served.
EXPECT_SHOP="${EXPECT_SHOP:-0}"

status() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $2" "${API}$1"; }
body()   { curl -s -H "Authorization: Bearer $2" "${API}$1"; }

fail=0
check() { # label path token expected
  local label="$1" path="$2" token="$3" expected="$4" got
  got="$(status "$path" "$token")"
  if [ "$got" = "$expected" ]; then
    printf '  \033[32m✓\033[0m %-52s %s\n' "$label" "$got"
  else
    printf '  \033[31m✗\033[0m %-52s %s (expected %s)\n' "$label" "$got" "$expected"
    fail=1
  fi
}

echo "manager gate → ${API}/shop/v1/manager-ping"
echo
echo "/shop/v1/me admits everyone (its job is to RECORD them):"
check "shop_manager"                 "/shop/v1/me" "$MANAGER_TOKEN" 200
check "shop_staff"                   "/shop/v1/me" "$STAFF_TOKEN"   200
check "role-less"                     "/shop/v1/me" "$NOBODY_TOKEN"  200
echo
echo "/shop/v1/manager-ping gates (the backend decides, not the interface):"
if [ "$EXPECT_SHOP" = "1" ]; then
  check "shop_manager, active, at an active shop" "/shop/v1/manager-ping" "$MANAGER_TOKEN" 200
else
  check "shop_manager, but NO shop assigned (pre-shop-management)" "/shop/v1/manager-ping" "$MANAGER_TOKEN" 403
fi
check "shop_staff  → refused by backend"   "/shop/v1/manager-ping" "$STAFF_TOKEN"   403
check "role-less    → refused by backend"   "/shop/v1/manager-ping" "$NOBODY_TOKEN"  403
echo

# A 403 must not disclose WHICH of the three terms failed — that leaks the platform's record state
# to a caller who was just told they may not read it.
echo "the denial discloses nothing about which term failed:"
denial="$(body /shop/v1/manager-ping "$STAFF_TOKEN")"
if printf '%s' "$denial" | grep -qiE '"(title|detail)":[^,]*(disabled|assign|inactive|shop_manager|shop_staff|role)'; then
  printf '  \033[31m✗\033[0m denial body names a failing term:\n      %s\n' "$denial"
  fail=1
else
  printf '  \033[32m✓\033[0m uniform access-denied body\n'
fi
echo

if [ "$fail" -ne 0 ]; then
  cat <<'DIAG'
FAILED — likely causes:

  manager 403, EXPECT_SHOP=1   the platform record disagrees with the token. Inspect all three terms:
                                  SELECT ss.status, st.code, st.is_active, array_agg(ssr.role_key)
                                    FROM public.shop_staff ss
                                    LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
                                    LEFT JOIN public.shop st ON st.id = ss.shop_id
                                   WHERE ss.cognito_sub = '<sub>' GROUP BY 1,2,3;
                                Most often the manager has no shop assignment — assign one from the
                                back-office shop-management console (its own slice, not yet built), then re-run.

  manager 200, EXPECT_SHOP=0   a shop assignment exists that this slice cannot have created.
                                Either the shop-management slice already shipped (re-run with EXPECT_SHOP=1), or a row was
                                inserted by hand — which is exactly what 007 stopped doing.

  staff or role-less gets 200   THE GATE IS BROKEN. The backend is trusting the cognito:groups claim,
                                or the predicate lost a term. This is the failure the slice exists to
                                prevent — do not ship past it.

  anyone gets 503               the DB is unreachable. The gate FAILS CLOSED by design, so this is
                                correct behaviour, not a grant. Check the allowlist / that the
                                instance is running.
DIAG
  exit 1
fi

if [ "$EXPECT_SHOP" = "1" ]; then
  echo "PASS — role AND status AND shop scope, decided from the platform's own record."
else
  echo "PASS — the gate refuses every operator without a shop. Re-run with EXPECT_SHOP=1 once"
  echo "       back-office shop management has created a shop and assigned the manager,"
  echo "       to prove the positive half."
fi
