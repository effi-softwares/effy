#!/usr/bin/env bash
#
# 037-platform-email-delivery — is the delivery-outcome pipeline actually RUNNING?
#
# `mail-verify` answers a different question: is the platform CONFIGURED to send authenticated mail
# (DKIM/SPF/DMARC published, identity verified, configuration set present with an enabled event
# destination). All of that can be perfectly true while nothing consumes the outcomes — and then the
# platform is exactly as blind to a locked-out person as it was before this feature existed.
#
# WHY BLINDNESS IS THE FAILURE THAT MATTERS. A send to a hard-failed address returns SUCCESS and a
# message id and delivers nothing. For driver, shop and back-office — no password, no federated
# route — that is a permanent account lockout with no signal to anyone. The rate alarms cannot see
# it: one person never moves a rate. Only the per-message outcome stream can, so this script checks
# the parts of that stream that only exist at runtime.
#
# Everything here is READ-ONLY. It creates nothing, sends nothing and repairs nothing.
#
# Usage:  make mail-events-verify ENV=dev
set -euo pipefail

ENV="${ENV:-dev}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"

PREFIX="effy-${ENV}"
CONFIG_SET="${PREFIX}-mail"
CONSUMER="effy-edge-admin-${ENV}-sesEventConsumer"
LOG_GROUP="/aws/lambda/${CONSUMER}"

AWS="aws --region ${AWS_REGION}"
export AWS_PROFILE

pass=0
fail=0
warn=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn + 1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── 1. The topic, and whether anything is actually listening ───────────────────────────────────
head "Outcome topic (${PREFIX}-ses-events)"

topic_arn="$(
  $AWS ssm get-parameter --name "/effy/${ENV}/ses/events_topic_arn" \
    --query 'Parameter.Value' --output text 2>/dev/null || echo ""
)"

if [ -z "${topic_arn}" ]; then
  bad "no /effy/${ENV}/ses/events_topic_arn in SSM — Terraform has not been applied for this env"
else
  ok "topic published in SSM"

  # ⚠ A SUBSCRIPTION IS NOT A DELIVERY. An SNS subscription stuck in PendingConfirmation, or a
  # topic with none at all, publishes happily into nothing. The configuration set still reports a
  # healthy enabled destination, so `mail-verify` stays green while every outcome is discarded.
  # shellcheck disable=SC2016  # the backticks are JMESPath literals, not shell expansion
  subs="$(
    $AWS sns list-subscriptions-by-topic --topic-arn "${topic_arn}" \
      --query 'Subscriptions[?Protocol==`lambda`].Endpoint' --output text 2>/dev/null || echo ""
  )"
  if printf '%s' "${subs}" | grep -q "${CONSUMER}"; then
    ok "the consumer is subscribed to it"
  else
    bad "NO lambda subscription for ${CONSUMER} — outcomes are published into nothing"
  fi
fi

# ── 2. The consumer exists and is permitted to be invoked ──────────────────────────────────────
head "Consumer (${CONSUMER})"

if $AWS lambda get-function --function-name "${CONSUMER}" >/dev/null 2>&1; then
  ok "deployed"

  # ⚠ The subscription and the invoke permission are two separate facts. A subscription without a
  # resource policy allowing sns.amazonaws.com to invoke fails at DELIVERY time, asynchronously,
  # where nobody is looking.
  if $AWS lambda get-policy --function-name "${CONSUMER}" \
      --query 'Policy' --output text 2>/dev/null | grep -q 'sns.amazonaws.com'; then
    ok "SNS is permitted to invoke it"
  else
    bad "no resource policy permitting sns.amazonaws.com — every delivery will be refused"
  fi
else
  bad "not deployed — run: make edge-deploy SERVICE=admin ENV=${ENV}"
fi

# ── 3. Recent behaviour: has it run, and did it error? ─────────────────────────────────────────
head "Recent consumer activity (last 24h)"

since="$(date -u -v-24H +%s 2>/dev/null || date -u -d '24 hours ago' +%s)"

# shellcheck disable=SC2016  # the backticks are JMESPath literals, not shell expansion
metric() { # metric_name statistic
  $AWS cloudwatch get-metric-statistics \
    --namespace AWS/Lambda --metric-name "$1" \
    --dimensions "Name=FunctionName,Value=${CONSUMER}" \
    --start-time "$(date -u -r "${since}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "@${since}" +%Y-%m-%dT%H:%M:%SZ)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --period 86400 --statistics Sum \
    --query 'sum(Datapoints[].Sum) || `0`' --output text 2>/dev/null || echo "0"
}

invocations="$(metric Invocations)"
errors="$(metric Errors)"

# ⚠ ZERO INVOCATIONS IS NOT A FAILURE. On a quiet dev environment where nothing bounced, idle is the
# correct state — which is exactly why this reports rather than fails. Treating idle as broken is
# how a check gets ignored.
printf '  invocations: %s   errors: %s\n' "${invocations%.*}" "${errors%.*}"
if [ "${errors%.*}" != "0" ]; then
  bad "the consumer is erroring — outcomes are being dropped (see ${LOG_GROUP})"
else
  ok "no consumer errors"
fi

# ── 4. SC-020 — no recipient address may ever reach CloudWatch ─────────────────────────────────
head "Log hygiene (SC-020)"

# ⚠ THIS IS THE ONE CHECK NOTHING ELSE PERFORMS. The consumer handles addresses and the receiving
# server's rejection text — which embeds the recipient — on every single invocation. 035's rule is
# that neither ever reaches CloudWatch; a fingerprint correlates the lines instead. A unit test
# proves the code paths it knows about. This proves what actually got written.
if $AWS logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" \
     --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q "${CONSUMER}"; then
  hits="$(
    $AWS logs filter-log-events --log-group-name "${LOG_GROUP}" \
      --filter-pattern '"@"' --max-items 5 \
      --query 'length(events)' --output text 2>/dev/null || echo "0"
  )"
  if [ "${hits}" = "0" ] || [ "${hits}" = "None" ]; then
    ok "no '@' in any consumer log line"
  else
    bad "${hits} log line(s) contain '@' — a recipient address is in CloudWatch. FIX BEFORE PROD."
  fi
else
  note "no log group yet — the consumer has never been invoked"
fi

# ── 5. Every alarm this feature owns must be able to reach a person ────────────────────────────
head "Alarms have a notification target (FR-037)"

# ⚠ AN ALARM WITH NO ACTION IS A DASHBOARD DECORATION. It goes red in a console nobody has open.
# This feature exists so operators find out before customers do, and an unwired alarm defeats that
# completely while looking, in every listing, exactly like a working one.
# ⚠ NAMING. The first two are Terraform's (infra/envs/dev/dns.tf). The consumer alarm is the
# serverless service's, and that is not an inconsistency: only the service that deploys the Lambda
# can `!Ref` it, so an alarm on its Errors metric cannot live in Terraform without hardcoding a
# function name Terraform does not own. The spec's shorthand "mail-consumer-errors" refers to it.
for alarm in \
  "${PREFIX}-mail-hard-bounce" \
  "${PREFIX}-mail-from-unhealthy" \
  "effy-edge-admin-${ENV}-ses-event-consumer-errors"; do
  desc="$(
    $AWS cloudwatch describe-alarms --alarm-names "${alarm}" \
      --query 'MetricAlarms[0].[StateValue, length(AlarmActions)]' --output text 2>/dev/null || echo ""
  )"
  if [ -z "${desc}" ] || [ "${desc}" = "None	None" ]; then
    bad "${alarm}: does not exist"
    continue
  fi
  state="$(printf '%s' "${desc}" | awk '{print $1}')"
  actions="$(printf '%s' "${desc}" | awk '{print $2}')"
  if [ "${actions}" = "0" ] || [ "${actions}" = "None" ]; then
    bad "${alarm}: ${state}, but NO alarm action — nobody is told"
  else
    ok "${alarm}: ${state}, ${actions} action(s)"
  fi
done

# ── 6. The alerts topic must be confirmed, not merely subscribed ───────────────────────────────
head "Alert delivery"

alerts_arn="$(
  $AWS sns list-topics --query "Topics[?contains(TopicArn, '${PREFIX}-alerts')].TopicArn | [0]" \
    --output text 2>/dev/null || echo "None"
)"
if [ "${alerts_arn}" = "None" ] || [ -z "${alerts_arn}" ]; then
  bad "no ${PREFIX}-alerts topic — every alarm above fires into nothing"
else
  # ⚠ PendingConfirmation is the silent one: Terraform reports the subscription created, the alarm
  # reports an action, and no mail is ever sent because the operator never clicked the link.
  pending="$(
    $AWS sns list-subscriptions-by-topic --topic-arn "${alerts_arn}" \
      --query "length(Subscriptions[?SubscriptionArn=='PendingConfirmation'])" --output text 2>/dev/null || echo "0"
  )"
  confirmed="$(
    $AWS sns list-subscriptions-by-topic --topic-arn "${alerts_arn}" \
      --query "length(Subscriptions[?SubscriptionArn!='PendingConfirmation'])" --output text 2>/dev/null || echo "0"
  )"
  if [ "${confirmed}" != "0" ] && [ "${confirmed}" != "None" ]; then
    ok "${confirmed} confirmed subscriber(s)"
  else
    bad "no CONFIRMED subscriber on the alerts topic"
  fi
  if [ "${pending}" != "0" ] && [ "${pending}" != "None" ]; then
    note "${pending} subscription(s) still PendingConfirmation — those people are NOT notified"
  fi
fi

# ── 7. FR-041 — a dev failure must not blind production ────────────────────────────────────────
head "Suppression isolation (FR-041)"

supp="$(
  $AWS sesv2 get-configuration-set --configuration-set-name "${CONFIG_SET}" \
    --query 'SuppressionOptions.SuppressedReasons' --output json 2>/dev/null || echo "missing"
)"
case "${supp}" in
  missing) bad "configuration set ${CONFIG_SET} missing — sends produce no outcomes at all" ;;
  "[]")    ok "override ACTIVE — a bounce here cannot add anyone to the account-wide list" ;;
  *)       note "inherits the account list (${supp}). Correct for PRODUCTION; wrong for ${ENV}." ;;
esac

printf '\n\033[1m%d passed, %d failed, %d note(s)\033[0m\n' "${pass}" "${fail}" "${warn}"
[ "${fail}" -eq 0 ] || exit 1
