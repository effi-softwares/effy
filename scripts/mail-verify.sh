#!/usr/bin/env bash
#
# 010-domain-dns-foundation — SC-010 (and the precondition for flipping ses_sender_enabled).
#
# Proves the platform is AUTHORIZED to send mail as its environment's namespace: DKIM signs it, SPF
# authorizes the envelope, DMARC declares the policy, and SES agrees the domain is verified.
#
# WHY THIS MATTERS: passwordless EMAIL_OTP is the ONLY credential this platform issues. If this mail
# does not arrive, nobody on ANY of the four audiences can sign in. There is no password fallback.
#
# This is ALSO the gate on `ses_sender_enabled = true`: Cognito REJECTS a source_arn whose identity
# is not yet verified, and verification completes minutes AFTER the apply that creates these records
# returns. Run this until it is green, THEN flip the flag and apply again.
#
# Usage:  make mail-verify ENV=dev
set -euo pipefail

ENV="${ENV:-dev}"
ROOT_DOMAIN="${ROOT_DOMAIN:-effyshopping.com}"
DOMAIN="${ENV}.${ROOT_DOMAIN}"
MAIL_FROM="mail.${DOMAIN}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"

pass=0
fail=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── DKIM ──────────────────────────────────────────────────────────────────────────────────────
head "DKIM — the platform signs its mail (${DOMAIN})"

dkim_found=0
while read -r token; do
  [ -n "${token}" ] || continue
  if dig +short CNAME "${token}._domainkey.${DOMAIN}" | grep -q "dkim.amazonses.com"; then
    dkim_found=$((dkim_found + 1))
  fi
done < <(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-email-identity \
    --email-identity "${DOMAIN}" --region "${AWS_REGION}" \
    --query 'DkimAttributes.Tokens[]' --output text 2>/dev/null | tr '\t' '\n'
)

if [ "${dkim_found}" -eq 3 ]; then
  ok "all 3 DKIM CNAMEs resolve"
else
  bad "only ${dkim_found}/3 DKIM CNAMEs resolve — mail will not be signed"
fi

# ── SPF / MAIL FROM ───────────────────────────────────────────────────────────────────────────
head "SPF & custom MAIL FROM (${MAIL_FROM})"

if dig +short MX "${MAIL_FROM}" | grep -q "feedback-smtp"; then
  ok "MAIL FROM MX resolves — the envelope sender is ours, so SPF aligns to ${DOMAIN}"
else
  bad "MAIL FROM MX missing — SPF would align to amazonses.com, not ${DOMAIN}"
fi

if dig +short TXT "${MAIL_FROM}" | grep -q "v=spf1"; then
  ok "SPF record published"
else
  bad "SPF record missing"
fi

# ── DMARC ─────────────────────────────────────────────────────────────────────────────────────
head "DMARC (_dmarc.${DOMAIN})"

dmarc="$(dig +short TXT "_dmarc.${DOMAIN}")"
if grep -q "v=DMARC1" <<<"${dmarc}"; then
  ok "DMARC published: ${dmarc}"
  if grep -q "p=none" <<<"${dmarc}"; then
    printf '    \033[33mnote\033[0m p=none is monitor-only, and that is deliberate for now:\n'
    printf '         p=reject on day one silently destroys ALL sign-in mail on any misconfiguration.\n'
  fi
else
  bad "DMARC record missing"
fi

# ── SES identity status ───────────────────────────────────────────────────────────────────────
head "SES identity status"

status="$(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-email-identity \
    --email-identity "${DOMAIN}" --region "${AWS_REGION}" \
    --query 'VerifiedForSendingStatus' --output text 2>/dev/null || echo "MISSING"
)"
dkim_status="$(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-email-identity \
    --email-identity "${DOMAIN}" --region "${AWS_REGION}" \
    --query 'DkimAttributes.Status' --output text 2>/dev/null || echo "MISSING"
)"

if [ "${status}" = "True" ]; then
  ok "SES reports the domain VERIFIED for sending"
else
  bad "SES has not verified the domain yet (VerifiedForSendingStatus=${status})"
  bad "  → verification is asynchronous and takes minutes. Do NOT set ses_sender_enabled = true yet:"
  bad "    Cognito rejects an unverified source_arn and the apply will fail."
fi

if [ "${dkim_status}" = "SUCCESS" ]; then
  ok "DKIM status: SUCCESS"
else
  bad "DKIM status: ${dkim_status}"
fi

# ── sandbox warning ───────────────────────────────────────────────────────────────────────────
quota="$(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-account --region "${AWS_REGION}" \
    --query 'ProductionAccessEnabled' --output text 2>/dev/null || echo "unknown"
)"
head "Sending account"
if [ "${quota}" = "True" ]; then
  ok "SES production access granted — mail can reach any recipient"
else
  bad "SES is in the SANDBOX — verified recipients only. 037 SC-001 CANNOT be met in this state."
  printf '    ⚠ Production access was GRANTED before 037 began (research R1). If this is failing,\n'
  printf '    it has been REVOKED — check the SES account dashboard before doing anything else.\n'
fi

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# 037-platform-email-delivery — the apex's mail identity, and the outcome pipeline.
# ═══════════════════════════════════════════════════════════════════════════════════════════════

head "Apex mail identity (${ROOT_DOMAIN})"

# ⚠ INBOUND IS LOAD-BEARING AND LIVE. This is the only route to the company's mailbox, and every
# apply against the parent zone risks clobbering it (Route 53 holds ONE record set per name+type).
# Checked FIRST because if this is broken, nothing else matters (SC-022).
apex_mx="$(dig +short MX "${ROOT_DOMAIN}" 2>/dev/null | tr -d '\r')"
if printf '%s' "${apex_mx}" | grep -qi 'google.com'; then
  ok "inbound mail routes to the operator mail service"
else
  bad "NO inbound route on ${ROOT_DOMAIN} — hello@ CANNOT RECEIVE MAIL (got: ${apex_mx:-none})"
fi

apex_txt="$(dig +short TXT "${ROOT_DOMAIN}" 2>/dev/null | tr -d '\r')"
if printf '%s' "${apex_txt}" | grep -q 'v=spf1'; then
  ok "apex authorises its sender (v=spf1 present)"
else
  bad "no v=spf1 on ${ROOT_DOMAIN} — mail SENT from hello@ fails sender-policy checks"
fi

# ⚠ TWO v=spf1 STRINGS IS A PERMANENT FAILURE FOR EVERY MESSAGE FROM THE DOMAIN (RFC 7208 §4.5) —
# a verifier discards non-SPF records, then errors if more than one remains. This is the single most
# common way a working domain's mail is broken, and it happens by ADDING a record rather than
# editing the existing one.
spf_count="$(printf '%s\n' "${apex_txt}" | grep -c 'v=spf1' || true)"
if [ "${spf_count}" -le 1 ]; then
  ok "exactly one sender-policy record"
else
  bad "${spf_count} v=spf1 records on ${ROOT_DOMAIN} — ALL mail from this domain now fails SPF"
fi

if printf '%s' "${apex_txt}" | grep -q 'google-site-verification'; then
  ok "domain-ownership proof still published"
else
  bad "the ownership proof is gone from ${ROOT_DOMAIN} — the mail service may de-verify the domain"
fi

apex_dmarc="$(dig +short TXT "_dmarc.${ROOT_DOMAIN}" 2>/dev/null | tr -d '\r')"
if printf '%s' "${apex_dmarc}" | grep -q 'v=DMARC1'; then
  ok "apex publishes an alignment policy"
  if printf '%s' "${apex_dmarc}" | grep -q 'rua='; then
    ok "  aggregate reporting enabled"
  else
    bad "  no rua= — monitor mode collects NOTHING, so the policy can never be tightened on evidence"
  fi
else
  bad "no _dmarc on ${ROOT_DOMAIN} — anyone can forge mail as Effy and no receiver is told to distrust it"
fi

head "Mail-service signing key"

# ⚠ THE 255-CHARACTER SPLIT IS THE DANGEROUS PART. A key published as TWO separate TXT records is
# valid DNS and a BROKEN key — a verifier sees two records, neither a complete key, and nothing
# errors. This reassembles what DNS actually returns and compares it with the operator-supplied
# value, byte for byte.
dkim_txt="$(dig +short TXT "google._domainkey.${ROOT_DOMAIN}" 2>/dev/null | tr -d '\r')"
dkim_records="$(printf '%s\n' "${dkim_txt}" | grep -c 'v=DKIM1' || true)"
if [ "${dkim_records}" -eq 0 ]; then
  bad "no signing key at google._domainkey.${ROOT_DOMAIN} — mail from hello@ is unsigned"
elif [ "${dkim_records}" -gt 1 ]; then
  bad "${dkim_records} SEPARATE records — the key was split into records instead of strings. BROKEN."
else
  # Strip the quoting dig applies, joining adjacent character-strings without adding a space.
  assembled="$(printf '%s' "${dkim_txt}" | sed 's/" "//g; s/^"//; s/"$//')"
  expected_file="specs/037-platform-email-delivery/operator-inputs.md"
  if [ -f "${expected_file}" ] && grep -qF "${assembled}" "${expected_file}"; then
    ok "signing key reassembles byte-for-byte to the operator-supplied value"
  else
    bad "the published key does NOT match operator-inputs.md — signatures will not verify"
  fi
fi

head "Delivery outcomes (${ENV})"

CONFIG_SET="effy-${ENV}-mail"
supp="$(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-configuration-set \
    --configuration-set-name "${CONFIG_SET}" --region "${AWS_REGION}" \
    --query 'SuppressionOptions.SuppressedReasons' --output json 2>/dev/null || echo "missing"
)"
if [ "${supp}" = "missing" ]; then
  bad "configuration set ${CONFIG_SET} does not exist — sends produce NO per-message outcomes"
elif [ "${supp}" = "[]" ]; then
  ok "suppression override ACTIVE — a failure here cannot make someone unreachable in production"
else
  # ⚠ Not necessarily wrong: production SHOULD inherit. It is wrong for a non-production env.
  printf '  \033[33m!\033[0m suppression inherits the account list (%s).\n' "${supp}"
  printf '    Correct for PRODUCTION. In dev this means a mistyped address here also blocks that\n'
  printf '    person in prod (FR-041) — check ses_suppressed_reasons.\n'
fi

# shellcheck disable=SC2016  # the backticks below are JMESPath literals, not shell expansion
dests="$(
  AWS_PROFILE="${AWS_PROFILE}" aws sesv2 get-configuration-set-event-destinations \
    --configuration-set-name "${CONFIG_SET}" --region "${AWS_REGION}" \
    --query 'EventDestinations[?Enabled==`true`] | length(@)' --output text 2>/dev/null || echo "0"
)"
if [ "${dests}" != "0" ] && [ "${dests}" != "None" ]; then
  ok "${dests} ENABLED event destination(s) — outcomes are being published"
else
  # ⚠ The provider defaults `enabled` to false, and an inert destination looks perfectly healthy.
  bad "no ENABLED event destination — the platform is blind to per-address failures"
fi

# ⚠ FR-018 / SC-017: a code-bearing message must never carry an unsubscribe affordance. Someone who
# unsubscribed from their own sign-in codes would be locked out permanently.
if printf '%s' "${supp}" | grep -q 'SUBSCRIPTION' 2>/dev/null; then
  bad "subscription management is configured on the auth configuration set (FR-018)"
else
  ok "no subscription management on the auth configuration set"
fi

printf '\n\033[1m%d passed, %d failed\033[0m\n' "${pass}" "${fail}"
[ "${fail}" -eq 0 ] || exit 1
