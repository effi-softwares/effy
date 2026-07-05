#!/usr/bin/env bash
# Belt-and-braces account guard (research.md D8): assert the resolved AWS credentials
# point at the account the target env expects BEFORE any mutating terraform command.
# The authoritative gate is the provider's allowed_account_ids; this fails faster and
# with a friendlier message. Called by `make apply` / `make destroy`; skip with
# SKIP_PREFLIGHT=1.
set -euo pipefail

ENV="${1:?usage: preflight.sh <dev|qa|staging|prod>}"
TFVARS="infra/envs/${ENV}/${ENV}.tfvars"

fail() {
  echo "preflight FAILED: $*" >&2
  exit 1
}

[[ -f "$TFVARS" ]] || fail "$TFVARS not found — run from the repo root with a valid ENV"

expected="$(awk -F'"' '/^[[:space:]]*aws_account_id[[:space:]]*=/ { print $2; exit }' "$TFVARS")"

[[ -n "$expected" ]] || fail "no aws_account_id found in $TFVARS"
[[ "$expected" =~ ^[0-9]{12}$ ]] ||
  fail "aws_account_id in $TFVARS is '$expected' — replace the placeholder with the real 12-digit account id"

command -v aws > /dev/null 2>&1 || fail "aws CLI not found on PATH"

actual="$(aws sts get-caller-identity --query Account --output text)" ||
  fail "could not resolve caller identity — is the '${AWS_PROFILE:-ef}' profile configured?"

[[ "$actual" == "$expected" ]] ||
  fail "credential/account mismatch: profile '${AWS_PROFILE:-ef}' resolves to account ${actual}, but ${TFVARS} expects ${expected}"

echo "preflight OK: profile '${AWS_PROFILE:-ef}' → account ${actual} matches ${TFVARS}"
