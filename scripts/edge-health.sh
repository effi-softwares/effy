#!/usr/bin/env bash
#
# Probe EVERY service individually, on the gateway it is attached to — liveness and readiness, side by side.
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

# ⚠ TWO GATEWAYS SINCE 075 — a service answers on the one it is attached to and 404s on the other.
#
#   TARGETS="<url>=<svc svc …>;<url>=<svc …>"     one group per gateway
#   API_URL=… SERVICES="…"                        still accepted: one gateway, as before
#
# CUTOVER=1 — while back-office is being moved a service is on one gateway or the other depending on
# whether it has been redeployed yet. With this set, a service that does not answer where it is
# listed is tried on the other gateway(s) and reported with WHERE it answered, instead of as down.
#
# ⚠ `auth` (035) and `live` (071) are deliberately ABSENT and must stay absent: neither has an HTTP
# route to probe. Adding one would report DOWN forever and train everyone to ignore a red row.
if [ -z "${TARGETS:-}" ]; then
  API_URL="${API_URL:?set TARGETS, or API_URL (from /effy/<env>/edge/api_endpoint)}"
  TARGETS="${API_URL}=${SERVICES:-admin shop}"
fi
CUTOVER="${CUTOVER:-}"

fail=0
urls=()
IFS=';' read -r -a groups <<<"${TARGETS}"
for g in "${groups[@]}"; do urls+=("${g%%=*}"); done

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" || echo "000"; }

for g in "${groups[@]}"; do
  url="${g%%=*}"
  services="${g#*=}"

  printf '\n\033[1mServices @ %s\033[0m\n\n' "${url}"
  printf '  %-16s %-22s %-22s\n' "SERVICE" "healthz (liveness)" "readyz (readiness)"
  printf '  %-16s %-22s %-22s\n' "-------" "------------------" "------------------"

  for svc in ${services}; do
    at="${url}"
    live=$(code "${at}/${svc}/healthz")
    note=""
    if [ "${live}" != "200" ] && [ -n "${CUTOVER}" ]; then
      for other in "${urls[@]}"; do
        [ "${other}" = "${url}" ] && continue
        if [ "$(code "${other}/${svc}/healthz")" = "200" ]; then
          at="${other}"; live="200"; note="  ← answering on ${other} (not moved yet, or moved early)"
          break
        fi
      done
    fi
    ready=$(code "${at}/${svc}/readyz")

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

    printf '  %-16s %-31b %-31b%s\n' "${svc}" "${live_txt}" "${ready_txt}" "${note}"
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
