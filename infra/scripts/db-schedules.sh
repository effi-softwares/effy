#!/usr/bin/env bash
# db-schedules.sh <pause|resume|status> [env] — pause or resume the backend's SCHEDULED functions.
#
# WHY THIS EXISTS. Stopping the dev database saves the instance cost. But the backend has functions
# that run on a timer and each one opens a database connection — two of them every minute. With the
# database stopped, every run waits out the connection timeout, fails, and is retried by the
# platform. In September that was about 217,000 GB-seconds of compute — nearly two thirds of the
# month's whole free allowance — spent failing to reach a database that was switched off on purpose
# to save money. It also raises every "this scheduled function keeps failing" alarm.
#
# So the timers are switched off with the database and back on with it. Nothing is lost: each of
# these functions works from a queue or a table in the database, and picks up where it left off.
#
# ⚠ ONE SCHEDULE IS LEFT RUNNING: the mail-sender health probe. It does not use the database, and
# its alarm treats "no data" as a failure — pausing it would page for a problem that does not exist.
#
# ⚠ A `make edge-deploy` of a service while its schedules are paused may switch them back on.
# `resume` is idempotent and `pause` can simply be run again.
#
# Rules are found by what they are, not by a list of names: every schedule belonging to an
# `effy-edge-*` service in this environment. A scheduled function added later is covered without
# editing this file.
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
