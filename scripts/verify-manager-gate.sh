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
set -euo pipefail

API="${API_ENDPOINT:?API_ENDPOINT not set}"
MANAGER_TOKEN="${MANAGER_TOKEN:?MANAGER_TOKEN not set}"
STAFF_TOKEN="${STAFF_TOKEN:?STAFF_TOKEN not set}"
NOBODY_TOKEN="${NOBODY_TOKEN:?NOBODY_TOKEN not set (a provisioned account with NO role)}"

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
check "store_manager, active, active store" "/store/v1/manager-ping" "$MANAGER_TOKEN" 200
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

  manager gets 403   the platform record disagrees with the token. Check all three terms:
                       SELECT ss.status, st.code, st.is_active,
                              array_agg(ssr.role_key)
                         FROM public.store_staff ss
                         LEFT JOIN public.store_staff_role ssr ON ssr.staff_id = ss.id
                         LEFT JOIN public.store st ON st.id = ss.store_id
                        WHERE ss.email = '<manager email>' GROUP BY 1,2,3;
                     Most often: they signed in but were never assigned a store
                       → make shop-provision-staff EMAIL=... STORE=CMB-01 ENV=dev

  staff gets 200     THE GATE IS BROKEN. The backend is trusting the claim, or the query lost a
                     term. This is the failure this whole slice exists to prevent.

  anyone gets 503    the DB is unreachable — the gate FAILS CLOSED by design, so this is correct
                     behaviour, not a grant. Check the allowlist / that the instance is running.
DIAG
  exit 1
fi

echo "PASS — role AND status AND store scope, decided from the platform's own record."
