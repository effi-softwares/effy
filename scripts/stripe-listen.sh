#!/usr/bin/env bash
# stripe-listen.sh — dev-only Stripe webhook helper (019 checkout / 020 fulfilment).
#
# WHY THIS EXISTS: `stripe listen` signs every forwarded webhook with the CLI account's webhook
# signing secret. core-api reads that secret ONCE at boot from Secrets Manager
# (/effy/<env>/stripe/webhook_secret). If the two ever disagree, EVERY webhook fails signature
# verification with a 400 and every paid order is stranded at `pending_payment` with no shop fan-out
# — the exact failure this repo hit on its first live checkout. This script removes the drift by
# syncing the secret into Secrets Manager BEFORE it starts forwarding, so they cannot fall out of
# step.
#
# It does three things, then forwards in the foreground:
#   1. reads the account's current webhook signing secret     (stripe listen --print-secret)
#   2. syncs it into Secrets Manager /effy/<env>/stripe/webhook_secret  (only if it changed)
#   3. records the forward URL in SSM Parameter Store /effy/<env>/stripe/webhook_url
#   4. execs `stripe listen --forward-to <url>`                (Ctrl-C to stop)
#
# ⚠ If step 2 CHANGES the secret while core-api is already running, restart core-api
#   (Ctrl-C the `make core-run`, then `make core-run`) — it only reads the secret at boot.
#
# Usage:  ./scripts/stripe-listen.sh [forward-url]
#   forward-url defaults to localhost:8080/v1/stripe/webhook (local core-api). Pass an ngrok/tunnel
#   URL here if you are forwarding somewhere else.
#
# Env overrides: ENV (default dev), AWS_PROFILE (default ef), AWS_REGION (default ap-southeast-2).
set -euo pipefail

ENV="${ENV:-dev}"
PROFILE="${AWS_PROFILE:-ef}"
REGION="${AWS_REGION:-ap-southeast-2}"
FORWARD_URL="${1:-localhost:8080/v1/stripe/webhook}"

SECRET_ID="/effy/${ENV}/stripe/webhook_secret"   # Secrets Manager — read by core-api at boot
URL_PARAM="/effy/${ENV}/stripe/webhook_url"       # SSM Parameter Store — the forward URL, discoverable

aws_ssm() { aws ssm "$@" --profile "$PROFILE" --region "$REGION"; }
aws_sm()  { aws secretsmanager "$@" --profile "$PROFILE" --region "$REGION"; }

command -v stripe >/dev/null || { echo "stripe-listen: stripe CLI not installed (brew install stripe/stripe-cli/stripe)"; exit 1; }
command -v aws    >/dev/null || { echo "stripe-listen: aws CLI not installed"; exit 1; }

# 1. The account's webhook signing secret. --print-secret reveals the SAME secret `listen` will sign
#    with, then exits — so what we store below is exactly what core-api will need to verify.
echo "stripe-listen: reading the account webhook signing secret…"
WHSEC="$(stripe listen --print-secret)"
[[ "$WHSEC" == whsec_* ]] || { echo "stripe-listen: unexpected value from 'stripe listen --print-secret' — are you logged in? run: stripe login"; exit 1; }

# 2. Sync into Secrets Manager, but only write when it actually changed (so core-api is not needlessly
#    told to restart).
CURRENT="$(aws_sm get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text 2>/dev/null || true)"
if [[ "$CURRENT" == "$WHSEC" ]]; then
  echo "stripe-listen: ✓ $SECRET_ID already matches"
else
  if [[ -n "$CURRENT" ]]; then
    aws_sm put-secret-value --secret-id "$SECRET_ID" --secret-string "$WHSEC" >/dev/null
  else
    aws_sm create-secret --name "$SECRET_ID" --secret-string "$WHSEC" >/dev/null
  fi
  echo "stripe-listen: ✓ updated $SECRET_ID → ${WHSEC:0:12}…"
  echo "stripe-listen: ⚠ core-api reads this at boot — RESTART it (Ctrl-C 'make core-run', then 'make core-run') or webhooks will 400."
fi

# 3. Record the forward URL in SSM Parameter Store (plain config, not a secret).
aws_ssm put-parameter --name "$URL_PARAM" --type String --value "$FORWARD_URL" --overwrite >/dev/null
echo "stripe-listen: ✓ $URL_PARAM → $FORWARD_URL"

# 4. Forward (foreground; Ctrl-C stops it). exec so signals go straight to the CLI.
echo "stripe-listen: forwarding Stripe webhooks to $FORWARD_URL  (Ctrl-C to stop)"
exec stripe listen --forward-to "$FORWARD_URL"
