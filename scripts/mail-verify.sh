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
  printf '  \033[33m!\033[0m SES is still in the SANDBOX: 200/day, 1/sec, VERIFIED RECIPIENTS ONLY.\n'
  printf '    200/day already beats Cognito%s built-in ~50/day ceiling, so SC-011 is met.\n' "'s"
  printf '    But SC-010 (a real consumer inbox) needs production access — request it if you have not.\n'
fi

printf '\n\033[1m%d passed, %d failed\033[0m\n' "${pass}" "${fail}"
[ "${fail}" -eq 0 ] || exit 1
