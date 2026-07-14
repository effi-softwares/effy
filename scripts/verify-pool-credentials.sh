#!/usr/bin/env bash
# FR-017 — the INTERNAL audiences stay passwordless. A machine check, not a promise.
#
# Constitution v1.7.0 opened THREE credential routes (password, email OTP, Google) and open
# self-registration — for the CUSTOMER audience ONLY. Driver, shop and admin remain strictly
# passwordless EMAIL_OTP and strictly admin-provisioned. They are Effy employees: a password is a
# credential to steal and a reset flow to attack, in exchange for nothing they need.
#
# Until 011, that was guaranteed by the shared Cognito module simply having no password or OAuth
# arguments at all. It now HAS them — which means the guarantee is one careless default away from
# evaporating, on the pools where the blast radius is worst. So it gets a check.
#
#   make verify-pool-credentials ENV=dev
#
# Exits non-zero on any breach.
set -euo pipefail

ENV="${ENV:-dev}"
AWS="aws --profile ${AWS_PROFILE:-ef} --region ${AWS_REGION:-ap-southeast-2}"

fail=0
note() { printf '  %s\n' "$*"; }
bad() {
  printf '  ✗ %s\n' "$*"
  fail=1
}
ok() { printf '  ✓ %s\n' "$*"; }

echo "verify-pool-credentials: the INTERNAL audiences must stay passwordless (FR-017), env=${ENV}"
echo

for audience in driver shop back-office; do
  ssm_key="${audience//-/_}"
  pool_id=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/${ssm_key}/user_pool_id" \
    --query 'Parameter.Value' --output text 2>/dev/null || true)

  if [ -z "$pool_id" ] || [ "$pool_id" = "None" ]; then
    note "· ${audience}: no pool in ${ENV} — skipping"
    continue
  fi

  echo "${audience} (${pool_id})"

  # 1. No password may be a usable first factor. The pool-level policy always lists PASSWORD (the
  #    CreateUserPool API refuses to omit it), so the POOL is not where the answer lives — the APP
  #    CLIENT is. A client without ALLOW_USER_SRP_AUTH / ALLOW_USER_PASSWORD_AUTH cannot run a
  #    password challenge at all.
  client_id=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/${ssm_key}/app_client_id" \
    --query 'Parameter.Value' --output text)

  flows=$($AWS cognito-idp describe-user-pool-client \
    --user-pool-id "$pool_id" --client-id "$client_id" \
    --query 'UserPoolClient.ExplicitAuthFlows' --output text)

  if grep -qE 'ALLOW_USER_SRP_AUTH|ALLOW_USER_PASSWORD_AUTH|ALLOW_ADMIN_USER_PASSWORD_AUTH' <<<"$flows"; then
    bad "${audience}: a PASSWORD auth flow is enabled (${flows}). This audience must be passwordless."
  else
    ok "no password auth flow (${flows})"
  fi

  # 2. No federated identity provider. Only the customer federates.
  idps=$($AWS cognito-idp describe-user-pool-client \
    --user-pool-id "$pool_id" --client-id "$client_id" \
    --query 'UserPoolClient.SupportedIdentityProviders' --output text)

  if [ "$idps" != "COGNITO" ] && [ -n "$idps" ] && [ "$idps" != "None" ]; then
    bad "${audience}: federated identity providers configured (${idps}). Only the customer federates."
  else
    ok "no federated identity providers"
  fi

  # 3. No self-signup. These accounts are provisioned by staff, never created by their holder.
  admin_only=$($AWS cognito-idp describe-user-pool --user-pool-id "$pool_id" \
    --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly' --output text)

  if [ "$admin_only" != "True" ]; then
    bad "${audience}: SELF-SIGNUP IS OPEN. Only the customer audience may self-register."
  else
    ok "admin-provisioned (no self-signup)"
  fi

  echo
done

if [ "$fail" -ne 0 ]; then
  echo "✗ FR-017 BREACHED — an internal audience has gained a public-facing credential route."
  echo "  Constitution v1.7.0 grants password / federation / self-signup to the CUSTOMER POOL ONLY."
  exit 1
fi

echo "✓ driver / shop / back-office are passwordless, unfederated, and admin-provisioned."
