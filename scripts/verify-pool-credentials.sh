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

  # 1b. ⚠ THE SIGN-IN CODE FLOW (035). Added because this script would otherwise report a green
  #     tick while all four pools gained a brand-new FIRST-FACTOR auth flow.
  #
  #     Check 1 above greps for three flow names. `ALLOW_CUSTOM_AUTH` is not one of them, so
  #     switching the platform from Cognito's managed 8-digit EMAIL_OTP to our own 6-digit
  #     challenge would have passed silently — exactly the failure this file's own header warns
  #     about ("one careless default away from evaporating, on the pools where the blast radius is
  #     worst"), and exactly the failure it already suffered once when it did not check back-office
  #     at all.
  #
  #     What is asserted, per specs/035-six-digit-otp/contracts/auth-triggers.contract.md § 2:
  #       - ALLOW_CUSTOM_AUTH is PRESENT  → the platform's own 6-digit code is reachable
  #       - ALLOW_USER_AUTH  is ABSENT    → Cognito's managed 8-digit EMAIL_OTP is NOT
  #
  #     The second half is the one that matters. These audiences have no self-signup, so nothing
  #     needs the choice-based flow; leaving it enabled would keep an 8-digit path alive that
  #     bypasses our attempt cap, our TTL and both rate limits.
  #
  #     ⚠ The customer pool is NOT checked here and MUST keep ALLOW_USER_AUTH — passwordless
  #     SignUp is only legal while it is present (035 research R4b).
  if grep -q 'ALLOW_CUSTOM_AUTH' <<<"$flows"; then
    ok "sign-in code flow present (ALLOW_CUSTOM_AUTH)"
  else
    bad "${audience}: ALLOW_CUSTOM_AUTH is MISSING (${flows}). The platform's 6-digit sign-in code is unreachable on this pool (035 FR-002)."
  fi

  if grep -q 'ALLOW_USER_AUTH' <<<"$flows"; then
    bad "${audience}: ALLOW_USER_AUTH is still enabled (${flows}). Cognito's managed 8-DIGIT EMAIL_OTP remains reachable and bypasses the 3-attempt cap, the 5-minute TTL and both rate limits (035 FR-001)."
  else
    ok "managed 8-digit EMAIL_OTP flow removed (no ALLOW_USER_AUTH)"
  fi

  # 1c. ⚠ THE MOBILE CLIENTS WERE ENTIRELY UNGUARDED until 035. This script read only
  #     .../app_client_id, so `shop_mobile` and `customer_mobile` — whose auth flows are hardcoded
  #     in the env root rather than set by the module — were never checked by anything.
  mobile_client_id=$($AWS ssm get-parameter --name "/effy/${ENV}/auth/${audience}/mobile_app_client_id" \
    --query 'Parameter.Value' --output text 2>/dev/null || echo "")

  if [ -n "$mobile_client_id" ] && [ "$mobile_client_id" != "None" ]; then
    mobile_flows=$($AWS cognito-idp describe-user-pool-client \
      --user-pool-id "$pool_id" --client-id "$mobile_client_id" \
      --query 'UserPoolClient.ExplicitAuthFlows' --output text)

    if grep -qE 'ALLOW_USER_SRP_AUTH|ALLOW_USER_PASSWORD_AUTH|ALLOW_ADMIN_USER_PASSWORD_AUTH' <<<"$mobile_flows"; then
      bad "${audience} (mobile client): a PASSWORD auth flow is enabled (${mobile_flows}). This audience must be passwordless."
    else
      ok "mobile client: no password auth flow (${mobile_flows})"
    fi

    if grep -q 'ALLOW_USER_AUTH' <<<"$mobile_flows"; then
      bad "${audience} (mobile client): ALLOW_USER_AUTH is still enabled (${mobile_flows}). The managed 8-digit EMAIL_OTP flow remains reachable (035 FR-001)."
    else
      ok "mobile client: managed 8-digit EMAIL_OTP flow removed"
    fi
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
