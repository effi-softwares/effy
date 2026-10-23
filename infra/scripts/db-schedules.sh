#!/usr/bin/env bash
# db-schedules.sh <pause|resume|status> [env] — pause or resume the backend's scheduled functions.
#
# With the dev database stopped, every scheduled run waits out its connection timeout and fails (most of a
# month's free compute, and every failure alarm), so the schedules stop and start with the database. Nothing
# is lost: each works from a queue or table and resumes where it left off. The mail-sender health probe
# keeps running: it uses no database, and its alarm treats "no data" as failure.
#
# A `make edge-deploy` while paused may switch a service's schedules back on; `pause` again. Rules are found
# as every schedule of an `effy-edge-*` service in this environment, so new ones are covered.
set -euo pipefail

ACTION="${1:-status}"
ENV="${2:-dev}"
PROFILE="${AWS_PROFILE:-ef}"
REGION="${AWS_REGION:-ap-southeast-2}"

# Never paused — see the header.
KEEP_RUNNING='SesIdentityHealth'

rules() {
  aws events list-rules --profile "$PROFILE" --region "$REGION" --name-prefix "effy-edge-" \
    --query 'Rules[?ScheduleExpression!=null].[Name,State,ScheduleExpression]' --output text \
    | awk -v env="-${ENV}-" -v keep="$KEEP_RUNNING" '
        # Service stacks are named effy-edge-<service>-<env>; CloudFormation may truncate the stack
        # part of a rule name, so match the env on the stack prefix OR its truncation.
        { name=$1 }
        name ~ keep { next }
        name ~ ("^effy-edge-[a-z]+" env) || name ~ "^effy-edge-[a-z]+-[a-z]*-[A-Z]" { print }
      '
}

case "$ACTION" in
  status)
    rules | awk '{ printf "  %-9s %-18s %s\n", $2, $3 " " $4, $1 }'
    ;;
  pause|resume)
    want=$([ "$ACTION" = pause ] && echo DISABLED || echo ENABLED)
    verb=$([ "$ACTION" = pause ] && echo disable-rule || echo enable-rule)
    n=0
    while read -r name state _; do
      [ -n "$name" ] || continue
      if [ "$state" != "$want" ]; then
        aws events "$verb" --profile "$PROFILE" --region "$REGION" --name "$name"
        n=$((n + 1))
      fi
    done < <(rules)
    echo "db-schedules: ${ACTION}d ${n} schedule(s) for env '${ENV}' (the mail-sender health probe keeps running)."
    ;;
  *)
    echo "usage: db-schedules.sh <pause|resume|status> [env]" >&2
    exit 1
    ;;
esac
