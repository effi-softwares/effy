#!/usr/bin/env bash
# Gives the shopper database role (070) a password and lets it log in.
#
# Migration `shopper_role` creates `effy_shopper` WITHOUT a password and unable to log in — a
# migration is committed to the repository and a secret must never be. This script does the part
# that cannot be committed:
#
#   1. generates a password locally,
#   2. stores it in Secrets Manager as /effy/<env>/db/shopper  ({"username":…,"password":…} — the
#      same shape as the RDS-managed master secret, so the edge services' existing connection code
#      reads it unchanged),
#   3. sets it on the role and enables login.
#
# Safe to re-run: a second run ROTATES the password. Warm functions holding the old one reconnect
# on their own — the edge connection code drops its pool and refetches on SQLSTATE 28P01.
#
# ⚠ THE PASSWORD IS NEVER PRINTED, never written to a file, never passed as a command-line argument
# (arguments are visible in `ps`). It travels to Secrets Manager and to psql on stdin only.
#
# Usage:  make db-shopper-role ENV=dev     (OPERATOR — mutates the database and Secrets Manager)
set -euo pipefail

ENV_NAME="${1:?usage: db-shopper-role.sh <dev|qa|staging|prod>}"
REGION="${EFFY_CONTRACT_REGION:-ap-southeast-2}"
ROLE="effy_shopper"
SECRET_NAME="/effy/${ENV_NAME}/db/shopper"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v psql >/dev/null || { echo "db-shopper-role: psql not found on PATH" >&2; exit 1; }
command -v openssl >/dev/null || { echo "db-shopper-role: openssl not found on PATH" >&2; exit 1; }

DSN="$(bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV_NAME")" || {
  echo "db-shopper-role: could not compose the DSN for ENV=$ENV_NAME" >&2; exit 1; }

# The migration must have run first: this script sets a password, it does not create the role.
exists="$(psql "$DSN" -v ON_ERROR_STOP=1 -qtAc "SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}'")"
if [ "$exists" != "1" ]; then
  echo "db-shopper-role: role ${ROLE} does not exist — run 'make db-up ENV=${ENV_NAME}' first" >&2
  exit 1
fi

# Letters and digits only: nothing that needs quoting in SQL, in a DSN, or in JSON.
PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-40)"
if [ "${#PASSWORD}" -lt 32 ]; then
  echo "db-shopper-role: could not generate a password of sufficient length" >&2; exit 1
fi

SECRET_JSON="$(printf '{"username":"%s","password":"%s"}' "$ROLE" "$PASSWORD")"

# Store FIRST. If the database step then fails, the secret is ahead of the role and a re-run fixes
# it; the other order could leave a role whose password nobody recorded.
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  printf '%s' "$SECRET_JSON" | aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" --region "$REGION" --secret-string file:///dev/stdin \
    --query VersionId --output text >/dev/null
  echo "db-shopper-role: rotated secret ${SECRET_NAME}"
else
  printf '%s' "$SECRET_JSON" | aws secretsmanager create-secret \
    --name "$SECRET_NAME" --region "$REGION" --secret-string file:///dev/stdin \
    --description "Database credentials for the shopper-facing edge services (070). Managed by make db-shopper-role." \
    --tags Key=project,Value=effy Key=env,Value="$ENV_NAME" Key=slice,Value=070-retire-core-api \
    --query ARN --output text >/dev/null
  echo "db-shopper-role: created secret ${SECRET_NAME}"
fi

# On stdin, so the statement (and the password in it) never appears in the process list.
psql "$DSN" -v ON_ERROR_STOP=1 -q <<EOSQL
ALTER ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}';
EOSQL
unset PASSWORD SECRET_JSON

limit="$(psql "$DSN" -v ON_ERROR_STOP=1 -qtAc "SELECT rolconnlimit FROM pg_roles WHERE rolname = '${ROLE}'")"
echo "db-shopper-role: ${ROLE} can now log in (connection limit ${limit})."
echo "db-shopper-role: next — 'make apply ENV=${ENV_NAME}' publishes the secret's ARN for the services to read."
