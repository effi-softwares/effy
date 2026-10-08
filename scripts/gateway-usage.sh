#!/usr/bin/env bash
#
# How full is each API gateway? Read-only. (075 FR-016, SC-007.)
#
# An HTTP API holds at most 300 routes and 300 integrations. The route limit can be raised by a
# quota request; the INTEGRATION limit cannot. On 2026-10-08 the shared gateway reached both and a
# deployment was refused — nothing had been counting. This counts what is DEPLOYED right now.
# (What the tree is ABOUT to deploy: `pnpm --filter @effy/edge-shared test`, gateway-capacity.)
#
#   usage: make gateway-usage ENV=dev            both gateways
#          make gateway-usage ENV=dev BY=1       …and routes per service prefix
#
# Exits non-zero when either gateway is at or above 90% — the "stop adding" line
# (docs/api/path-assignment.md, "When a gateway nears its ceiling").
set -euo pipefail

ENV="${ENV:?ENV not set}"
REGION="${AWS_REGION:?AWS_REGION not set}"
BY_SERVICE="${BY_SERVICE:-}"
CEILING=300

param() { aws ssm get-parameter --region "${REGION}" --query Parameter.Value --output text --name "$1" 2>/dev/null || true; }
# ⚠ The CLI follows NextToken itself but applies --query to EACH PAGE, so `length(Items)` prints one
# number per page (25, 25, … 24), not a total. Print one id per item across all pages and count them.
count() { # <get-routes|get-integrations> <id field> <api id>
  aws apigatewayv2 "$1" --region "${REGION}" --api-id "$3" --query "Items[].$2" --output text | tr '\t' '\n' | grep -c . || true
}
pct() { echo $(( ($1 * 100 + CEILING - 1) / CEILING )); } # rounded UP, as the hourly metric is

worst=0
printf '\n  %-8s %-14s %-14s %s\n' "gateway" "routes" "integrations" "fullest"
printf '  %-8s %-14s %-14s %s\n' "-------" "------" "------------" "-------"

for gw in shared staff; do
  [ "${gw}" = "shared" ] && key="edge" || key="staff"
  id="$(param "/effy/${ENV}/${key}/http_api_id")"
  if [ -z "${id}" ] || [ "${id}" = "None" ]; then
    printf '  %-8s (no such gateway in %s yet — /effy/%s/%s/http_api_id is not published)\n' "${gw}" "${ENV}" "${ENV}" "${key}"
    continue
  fi
  routes="$(count get-routes RouteId "${id}")"
  integrations="$(count get-integrations IntegrationId "${id}")"
  top=$(( routes > integrations ? routes : integrations ))
  p="$(pct "${top}")"
  [ "${p}" -gt "${worst}" ] && worst="${p}"
  if   [ "${p}" -ge 90 ]; then colour=$'\033[31m'
  elif [ "${p}" -ge 75 ]; then colour=$'\033[33m'
  else                         colour=$'\033[32m'; fi
  printf '  %-8s %-14s %-14s %b%s%%\033[0m\n' "${gw}" "${routes} / ${CEILING}" "${integrations} / ${CEILING}" "${colour}" "${p}"

  if [ -n "${BY_SERVICE}" ]; then
    aws apigatewayv2 get-routes --region "${REGION}" --api-id "${id}" --query 'Items[].RouteKey' --output text \
      | tr '\t' '\n' | awk '{ split($2, seg, "/"); n[seg[2]]++ } END { for (s in n) printf "             %-18s %d\n", "/" s, n[s] }' | sort
  fi
done

echo
if [ "${worst}" -ge 90 ]; then
  printf '\033[31mAt or above 90%% — stop adding routes to that gateway.\033[0m See docs/api/path-assignment.md.\n'
  exit 1
elif [ "${worst}" -ge 75 ]; then
  printf '\033[33mAt or above 75%% — plan what moves, before it is urgent.\033[0m See docs/api/path-assignment.md.\n'
fi
