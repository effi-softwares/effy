#!/usr/bin/env bash
# stripe-listen.sh - dev-only Stripe webhook helper.
#
# `stripe listen` signs forwarded webhooks with the CLI account's secret, and the commerce service verifies
# against /effy/<env>/stripe/webhook_secret; if they differ, every webhook fails with a 400 and paid orders
# wait at `pending_payment`. So this:
# 1. reads the account's current webhook signing secret (stripe listen --print-secret)
# 2. syncs it into Secrets Manager /effy/<env>/stripe/webhook_secret (only if it changed)
# 3. records the forward URL in SSM Parameter Store /effy/<env>/stripe/webhook_url
# 4. execs `stripe listen --forward-to <url>` (Ctrl-C to stop)
#
# No restart after step 2: the service re-reads the secret once when a signature fails.
#
# The deployed endpoint registered in the Stripe dashboard signs with its own secret and reads the same
# entry, so while this runs its events fail verification until that secret is put back. Local work only.
#
# Usage: ./scripts/stripe-listen.sh [forward-url]
# forward-url defaults to localhost:3000/commerce/v1/stripe/webhook - the commerce service under
# `make edge-offline SERVICE=commerce`. Pass a tunnel URL to forward somewhere else.
#
# Env overrides: ENV (default dev), AWS_PROFILE (default ef), AWS_REGION (default ap-southeast-2).
set -euo pipefail

ENV="${ENV:-dev}"
PROFILE="${AWS_PROFILE:-ef}"
REGION="${AWS_REGION:-ap-southeast-2}"
FORWARD_URL="${1:-localhost:3000/commerce/v1/stripe/webhook}"

SECRET_ID="/effy/${ENV}/stripe/webhook_secret"   # Secrets Manager - read by the commerce service
URL_PARAM="/effy/${ENV}/stripe/webhook_url"       # SSM Parameter Store - the forward URL, discoverable

aws_ssm() { aws ssm "$@" --profile "$PROFILE" --region "$REGION"; }
aws_sm()  { aws secretsmanager "$@" --profile "$PROFILE" --region "$REGION"; }

command -v stripe >/dev/null || { echo "stripe-listen: stripe CLI not installed (brew install stripe/stripe-cli/stripe)"; exit 1; }
command -v aws    >/dev/null || { echo "stripe-listen: aws CLI not installed"; exit 1; }

# 1. The account's webhook signing secret. --print-secret reveals the same secret `listen` will sign
# with, then exits - so what we store below is exactly what the service will need to verify.
echo "stripe-listen: reading the account webhook signing secret…"
WHSEC="$(stripe listen --print-secret)"
[[ "$WHSEC" == whsec_* ]] || { echo "stripe-listen: unexpected value from 'stripe listen --print-secret' - are you logged in? run: stripe login"; exit 1; }

# 2. Sync into Secrets Manager, but only write when it actually changed.
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
fi

# 3. Record the forward URL in SSM Parameter Store (plain config, not a secret).
aws_ssm put-parameter --name "$URL_PARAM" --type String --value "$FORWARD_URL" --overwrite >/dev/null
echo "stripe-listen: ✓ $URL_PARAM → $FORWARD_URL"

# 4. Forward (foreground; Ctrl-C stops it). exec so signals go straight to the CLI.
echo "stripe-listen: forwarding Stripe webhooks to $FORWARD_URL  (Ctrl-C to stop)"
exec stripe listen --forward-to "$FORWARD_URL"
