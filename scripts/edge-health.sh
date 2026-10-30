#!/usr/bin/env bash
#
# Probe every service individually, on the gateway it is attached to - liveness and readiness, side by side.
#
# The pair localizes a fault instantly, which a single combined probe cannot:
#
# healthz ✓ readyz ✓ → the service is healthy
# healthz ✓ readyz ✗ → the service is fine; its database is not
# healthz ✗ → the service itself is not there (bad deploy / wrong route / dead)
#
# Both are public - no token needed. A probe you can only run when you hold a credential is a probe
# you cannot run when things are actually broken.
#
# Usage: make edge-health ENV=dev
set -euo pipefail

# TARGETS="<url>=<svc svc …>;<url>=<svc …>", one group per gateway: a service answers on the gateway it
# is attached to and 404s on the other. `auth`, `live` and `media` have no HTTP route and stay absent.
: "${TARGETS:?set TARGETS (make edge-health ENV=<env> does)}"

fail=0
IFS=';' read -r -a groups <<<"${TARGETS}"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" || echo "000"; }

for g in "${groups[@]}"; do
  url="${g%%=*}"
  services="${g#*=}"

  printf '\n\033[1mServices @ %s\033[0m\n\n' "${url}"
  printf '  %-16s %-22s %-22s\n' "SERVICE" "healthz (liveness)" "readyz (readiness)"
  printf '  %-16s %-22s %-22s\n' "-------" "------------------" "------------------"

  for svc in ${services}; do
    live=$(code "${url}/${svc}/healthz")
    ready=$(code "${url}/${svc}/readyz")

    if [ "${live}" = "200" ]; then
      live_txt=$'\033[32m200 up\033[0m'
    else
      live_txt=$'\033[31m'"${live} DOWN"$'\033[0m'
      fail=$((fail + 1))
    fi

    case "${ready}" in
      200) ready_txt=$'\033[32m200 ready\033[0m' ;;
      # A service with no database-dependent readiness route (catalog) declares healthz only. With
      # liveness proven, a 404 here is "no such probe", not "down".
      404) if [ "${live}" = "200" ]; then ready_txt=$'\033[2m(no readyz route)\033[0m'; else ready_txt=$'\033[31m404 DOWN\033[0m'; fail=$((fail + 1)); fi ;;
      503) ready_txt=$'\033[33m503 db unreachable\033[0m'; fail=$((fail + 1)) ;;
      *)   ready_txt=$'\033[31m'"${ready} DOWN"$'\033[0m'; fail=$((fail + 1)) ;;
    esac

    printf '  %-16s %-31b %-31b\n' "${svc}" "${live_txt}" "${ready_txt}"
  done
done

echo
if [ "${fail}" -eq 0 ]; then
  printf '\033[32mall services live and ready\033[0m\n'
else
  printf '\033[31m%d probe(s) failing\033[0m\n' "${fail}"
  printf 'healthz down → the service is not deployed, or is attached to the other gateway. readyz 503 → the service is up, the DB is not.\n'
  exit 1
fi
