#!/usr/bin/env bash
# SC-005 / SC-005a / SC-012 — the manager gate is backend-authoritative (specs/007-shop-web).
#
# Proves that `GET /store/v1/manager-ping` is decided from the PLATFORM RECORD — role AND status
# AND store scope — and not from the cognito:groups claim or from a hidden nav item.
#
#   usage: make shop-verify-gate MANAGER_TOKEN=eyJ... STAFF_TOKEN=eyJ... NOBODY_TOKEN=eyJ... ENV=dev
#
# Each request below bypasses the interface entirely. A store_staff operator who never sees the
# Management link is refused exactly the same way as one who types the URL.
#
# ── WHICH CHECKS CAN PASS TODAY ──────────────────────────────────────────────────────────────
# 007 ships the store SCHEMA but no way to CREATE a store: that is back-office store management
# (feature 008). Until 008 exists, no operator has a store assignment, so:
#
#   • the DENIAL checks all pass now  — store_staff, role-less, and unassigned are refused, which
#     is exactly the negative half of the gate (SC-005, SC-005a).
#   • the manager POSITIVE check (200) cannot pass — an inner join to public.store finds nothing.
#
# Run with EXPECT_STORE=0 (the default until 008) to assert the manager is refused *for lack of a
# store*, and EXPECT_STORE=1 afterwards to assert they are served. Either way the gate is proven;
# what changes is which side of it there is data for.
set -euo pipefail

API="${API_ENDPOINT:?API_ENDPOINT not set}"
MANAGER_TOKEN="${MANAGER_TOKEN:?MANAGER_TOKEN not set}"
STAFF_TOKEN="${STAFF_TOKEN:?STAFF_TOKEN not set}"
NOBODY_TOKEN="${NOBODY_TOKEN:?NOBODY_TOKEN not set (a provisioned account with NO role)}"

# 0 = no store assignments exist yet (pre-008): the manager must be refused for lack of a store.
# 1 = 008 has created a store and assigned the manager to it: they must be served.
EXPECT_STORE="${EXPECT_STORE:-0}"

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

echo "manager gate → ${API}/store/v1/manager-ping"
echo
echo "/store/v1/me admits everyone (its job is to RECORD them):"
check "store_manager"                 "/store/v1/me" "$MANAGER_TOKEN" 200
check "store_staff"                   "/store/v1/me" "$STAFF_TOKEN"   200
check "role-less"                     "/store/v1/me" "$NOBODY_TOKEN"  200
echo
echo "/store/v1/manager-ping gates (the backend decides, not the interface):"
if [ "$EXPECT_STORE" = "1" ]; then
  check "store_manager, active, at an active store" "/store/v1/manager-ping" "$MANAGER_TOKEN" 200
else
  check "store_manager, but NO store assigned (pre-008)" "/store/v1/manager-ping" "$MANAGER_TOKEN" 403
fi
check "store_staff  → refused by backend"   "/store/v1/manager-ping" "$STAFF_TOKEN"   403
check "role-less    → refused by backend"   "/store/v1/manager-ping" "$NOBODY_TOKEN"  403
echo

# A 403 must not disclose WHICH of the three terms failed — that leaks the platform's record state
# to a caller who was just told they may not read it.
echo "the denial discloses nothing about which term failed:"
denial="$(body /store/v1/manager-ping "$STAFF_TOKEN")"
if printf '%s' "$denial" | grep -qiE '"(title|detail)":[^,]*(disabled|assign|inactive|store_manager|store_staff|role)'; then
  printf '  \033[31m✗\033[0m denial body names a failing term:\n      %s\n' "$denial"
  fail=1
else
  printf '  \033[32m✓\033[0m uniform access-denied body\n'
fi
echo

if [ "$fail" -ne 0 ]; then
  cat <<'DIAG'
FAILED — likely causes:

  manager 403, EXPECT_STORE=1   the platform record disagrees with the token. Inspect all three terms:
                                  SELECT ss.status, st.code, st.is_active, array_agg(ssr.role_key)
                                    FROM public.store_staff ss
                                    LEFT JOIN public.store_staff_role ssr ON ssr.staff_id = ss.id
                                    LEFT JOIN public.store st ON st.id = ss.store_id
                                   WHERE ss.cognito_sub = '<sub>' GROUP BY 1,2,3;
                                Most often the manager has no store assignment — assign one from the
                                back-office store-management console (feature 008), then re-run.

  manager 200, EXPECT_STORE=0   a store assignment exists that this slice cannot have created.
                                Either 008 already shipped (re-run with EXPECT_STORE=1), or a row was
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

if [ "$EXPECT_STORE" = "1" ]; then
  echo "PASS — role AND status AND store scope, decided from the platform's own record."
else
  echo "PASS — the gate refuses every operator without a store. Re-run with EXPECT_STORE=1 once"
  echo "       back-office store management (008) has created a store and assigned the manager,"
  echo "       to prove the positive half."
fi
