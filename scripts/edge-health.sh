#!/usr/bin/env bash
#
# Probe EVERY cold-path service individually — liveness and readiness, side by side.
#
# The pair localizes a fault instantly, which a single combined probe cannot:
#
#   healthz ✓  readyz ✓   → the service is healthy
#   healthz ✓  readyz ✗   → the service is fine; its DATABASE is not
#   healthz ✗             → the service itself is not there (bad deploy / wrong route / dead)
#
# Both are public — no token needed. A probe you can only run when you hold a credential is a probe
# you cannot run when things are actually broken.
#
# Usage:  make edge-health ENV=dev
set -euo pipefail

API_URL="${API_URL:?API_URL not set (should come from /effy/<env>/edge/api_endpoint)}"
SERVICES="${SERVICES:-admin shop}"

printf '\n\033[1mCold-path services @ %s\033[0m\n\n' "${API_URL}"
printf '  %-10s %-22s %-22s\n' "SERVICE" "healthz (liveness)" "readyz (readiness)"
printf '  %-10s %-22s %-22s\n' "-------" "------------------" "------------------"

fail=0

for svc in ${SERVICES}; do
  live=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${API_URL}/${svc}/healthz" || echo "000")
  ready=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${API_URL}/${svc}/readyz" || echo "000")

  if [ "${live}" = "200" ]; then
    live_txt=$'\033[32m200 up\033[0m'
  else
    live_txt=$'\033[31m'"${live} DOWN"$'\033[0m'
    fail=$((fail + 1))
  fi

  case "${ready}" in
    200) ready_txt=$'\033[32m200 ready\033[0m' ;;
    503) ready_txt=$'\033[33m503 db unreachable\033[0m'; fail=$((fail + 1)) ;;
    *)   ready_txt=$'\033[31m'"${ready} DOWN"$'\033[0m'; fail=$((fail + 1)) ;;
  esac

  printf '  %-10s %-31b %-31b\n' "${svc}" "${live_txt}" "${ready_txt}"
done

echo
if [ "${fail}" -eq 0 ]; then
  printf '\033[32mall services live and ready\033[0m\n'
else
  printf '\033[31m%d probe(s) failing\033[0m\n' "${fail}"
  printf 'healthz down → the service is not deployed. readyz 503 → the service is up, the DB is not.\n'
  exit 1
fi
