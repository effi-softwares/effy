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

# ⚠ The SSM path uses the HYPHENATED audience name (`back-office`), even though the Cognito module
# takes the underscored one (`back_office`). Both spellings are live in infra/envs/<env>/*.tf, which
# is exactly the sort of split the 008 one-name rule exists to prevent — but the SSM keys are a
# published contract that other services read, so this script conforms to reality rather than
# "correcting" it. Do not "fix" the hyphen here; you will break the lookup.
for audience in driver shop back-office; do
  pool_id=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/${audience}/user_pool_id" \
    --query 'Parameter.Value' --output text 2>/dev/null || true)

  # ⚠ A MISSING POOL IS A FAILURE, NOT A SKIP.
  #
  # The first version of this script printed "no pool — skipping" and exited 0. It therefore
  # reported ✓ PASS while silently not checking back-office AT ALL, because it was looking up the
  # wrong SSM path. That is the worst possible behaviour for a security guard: a green tick over an
  # audience nobody inspected. If an expected pool cannot be found, the guard has failed to do its
  # job and must say so.
  if [ -z "$pool_id" ] || [ "$pool_id" = "None" ]; then
    bad "${audience}: NO POOL FOUND at /effy/${ENV}/auth/${audience}/user_pool_id — this audience was NOT verified."
    echo
    continue
  fi

  echo "${audience} (${pool_id})"

  # 1. No password may be a usable first factor. The pool-level policy always lists PASSWORD (the
  #    CreateUserPool API refuses to omit it), so the POOL is not where the answer lives — the APP
  #    CLIENT is. A client without ALLOW_USER_SRP_AUTH / ALLOW_USER_PASSWORD_AUTH cannot run a
  #    password challenge at all.
  client_id=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/${audience}/app_client_id" \
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

# --- The other half: the CUSTOMER pool must have actually GAINED what 011 gave it. ------------
#
# A guard that only checks "nothing widened" would pass just as happily if the apply had done
# nothing at all. So we also assert the intended change landed — otherwise a green tick here would
# be compatible with a storefront where nobody can sign in.
cust_pool=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/customer/user_pool_id" \
  --query 'Parameter.Value' --output text 2>/dev/null || true)

if [ -z "$cust_pool" ] || [ "$cust_pool" = "None" ]; then
  bad "customer: NO POOL FOUND — the audience this slice exists for was not verified."
else
  echo "customer (${cust_pool})  ← the ONLY audience allowed passwords / self-signup"
  cust_client=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/customer/app_client_id" \
    --query 'Parameter.Value' --output text)

  cust_flows=$($AWS cognito-idp describe-user-pool-client \
    --user-pool-id "$cust_pool" --client-id "$cust_client" \
    --query 'UserPoolClient.ExplicitAuthFlows' --output text)

  if grep -q 'ALLOW_USER_SRP_AUTH' <<<"$cust_flows"; then
    ok "password route is usable (ALLOW_USER_SRP_AUTH — SRP, so the password never goes on the wire)"
  else
    bad "customer: ALLOW_USER_SRP_AUTH is MISSING — the email+password route cannot work (${cust_flows})."
  fi

  cust_signup=$($AWS cognito-idp describe-user-pool --user-pool-id "$cust_pool" \
    --query 'UserPool.AdminCreateUserConfig.AllowAdminCreateUserOnly' --output text)

  if [ "$cust_signup" = "False" ]; then
    ok "open self-registration (the platform's only self-registering audience)"
  else
    bad "customer: SELF-SIGNUP IS CLOSED — no member of the public can create an account."
  fi
  echo
fi

if [ "$fail" -ne 0 ]; then
  echo "✗ FAILED."
  echo "  FR-017: password / federation / self-signup belong to the CUSTOMER POOL ONLY"
  echo "  (constitution v1.7.0). An internal audience must never gain a public-facing"
  echo "  credential route — and the customer must never LOSE one."
  exit 1
fi

echo "✓ driver / shop / back-office: passwordless, unfederated, admin-provisioned."
echo "✓ customer: password + open self-registration, as intended."
