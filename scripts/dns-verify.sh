#!/usr/bin/env bash
#
# 010-domain-dns-foundation — SC-001 / SC-002 / SC-004.
#
# Proves three things that cannot be unit-tested because they are properties of the live internet:
#   1. the platform is authoritative for its domain, and the env namespace is DELEGATED  (SC-001)
#   2. the branded API address serves over a TRUSTED TLS connection                      (SC-002)
#   3. the raw execute-api URL STILL WORKS — the cutover was additive, nobody broke      (SC-004)
#
# Usage (via the Makefile, which reads both URLs from the SSM contract — never hard-coded):
#   make dns-verify ENV=dev
set -euo pipefail

ENV="${ENV:-dev}"
ROOT_DOMAIN="${ROOT_DOMAIN:-effyshopping.com}"
ZONE="${ENV}.${ROOT_DOMAIN}"
API_URL="${API_URL:?API_URL not set (should come from /effy/<env>/edge/api_endpoint)}"
RAW_URL="${RAW_URL:?RAW_URL not set (should come from /effy/<env>/edge/api_default_endpoint)}"

pass=0
fail=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── SC-001: authority + delegation ────────────────────────────────────────────────────────────
head "SC-001 — namespace authority & delegation"

parent_ns="$(dig +short NS "${ROOT_DOMAIN}" | sort | tr '\n' ' ')"
if grep -q "awsdns" <<<"${parent_ns}"; then
  ok "${ROOT_DOMAIN} is answered by Route 53: ${parent_ns}"
else
  bad "${ROOT_DOMAIN} is NOT delegated to Route 53 (got: ${parent_ns:-<empty>})"
  bad "  → the GoDaddy name-server repoint has not propagated. Nothing below can pass yet."
fi

child_ns="$(dig +short NS "${ZONE}" | sort | tr '\n' ' ')"
if grep -q "awsdns" <<<"${child_ns}"; then
  ok "${ZONE} is delegated to its own zone: ${child_ns}"
else
  bad "${ZONE} is NOT delegated (got: ${child_ns:-<empty>})"
fi

# ── SC-002: the branded address, over a trusted connection ────────────────────────────────────
head "SC-002 — the branded API address is trusted"

api_host="${API_URL#https://}"
if dig +short "${api_host}" | grep -qE '[0-9]'; then
  ok "${api_host} resolves"
else
  bad "${api_host} does not resolve"
fi

# --fail-with-body is deliberately NOT used: a 401/403 from the authorizer is a SUCCESSFUL TLS
# handshake plus a reachable API, which is exactly what this assertion is about. What must not
# happen is a certificate error — curl exits 60 for that, and we check the exit code.
set +e
branded_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${API_URL}/admin/healthz")"
branded_exit=$?
set -e
if [ "${branded_exit}" -eq 60 ]; then
  bad "${API_URL} — TLS certificate NOT trusted (curl 60). The cert is missing, wrong, or not yet issued."
elif [ -n "${branded_code}" ] && [ "${branded_code}" != "000" ]; then
  ok "${API_URL} serves over trusted TLS (HTTP ${branded_code}, no certificate warning)"
else
  bad "${API_URL} unreachable"
fi

# ── SC-004: the raw URL still works — the cutover was additive ────────────────────────────────
head "SC-004 — the cutover is additive (zero callers broken)"

set +e
raw_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${RAW_URL}/admin/healthz")"
set -e
if [ -n "${raw_code}" ] && [ "${raw_code}" != "000" ]; then
  ok "the raw execute-api URL still answers (HTTP ${raw_code}) — no existing caller was broken"
else
  bad "the raw execute-api URL is DEAD (${RAW_URL})"
  bad "  → check that disable_execute_api_endpoint is still false. Killing it violates FR-011/SC-004."
fi

if [ "${branded_code}" = "${raw_code}" ]; then
  ok "both addresses return the same status (${branded_code}) — they are the same API"
else
  bad "the two addresses disagree: branded=${branded_code} raw=${raw_code}"
fi

# ── verdict ───────────────────────────────────────────────────────────────────────────────────
printf '\n\033[1m%d passed, %d failed\033[0m\n' "${pass}" "${fail}"
[ "${fail}" -eq 0 ] || exit 1
