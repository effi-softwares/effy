#!/usr/bin/env bash
# wipe-dev.sh — reset dev to an empty platform: database rebuilt from every migration, every Cognito
# user in the four pools deleted, the media bucket emptied (all versions).
#
# Kept: the database roles (effy_shopper keeps its password), every AWS resource, Stripe test data.
# Afterwards: `make load-localities ENV=dev` and `make create-first-admin ...` (printed at the end).
set -euo pipefail

ENV="${ENV:-dev}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export AWS_PROFILE AWS_REGION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/db/migrations"
POOLS=(customer driver shop back-office)

[[ "$ENV" == "dev" ]] || { echo "wipe-dev: refusing ENV=$ENV — this only ever runs against dev." >&2; exit 1; }

for tool in psql goose aws jq; do
  command -v "$tool" >/dev/null || { echo "wipe-dev: $tool not found on PATH" >&2; exit 1; }
done

if [[ -n "$(git -C "$ROOT" status --porcelain db/migrations)" ]]; then
  echo "wipe-dev: uncommitted changes under db/migrations — commit them first." >&2
  exit 1
fi

param() { aws ssm get-parameter --name "$1" --query Parameter.Value --output text; }

DSN="$(bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")"
HOST="$(printf '%s\n' "$DSN" | tr ' ' '\n' | sed -n 's/^host=//p')"
BUCKET="$(param "/effy/$ENV/media/bucket")"
POOL_IDS=()
for pool in "${POOLS[@]}"; do
  POOL_IDS+=("$(param "/effy/$ENV/auth/$pool/user_pool_id")")
done

echo "This PERMANENTLY deletes, in env '$ENV':"
echo "  database   every table, row and function in schemas public + admin on $HOST"
for i in "${!POOLS[@]}"; do
  pool="${POOLS[$i]}"
  n="$(aws cognito-idp describe-user-pool --user-pool-id "${POOL_IDS[$i]}" \
        --query UserPool.EstimatedNumberOfUsers --output text)"
  printf '  cognito    %-12s ~%s user(s)\n' "$pool" "$n"
done
echo "  media      every object and version in s3://$BUCKET"
echo
read -r -p "Type 'wipe dev' to continue: " answer
[[ "$answer" == "wipe dev" ]] || { echo "aborted — nothing changed"; exit 1; }

bash "$ROOT/infra/scripts/db-schedules.sh" pause "$ENV"
trap 'bash "$ROOT/infra/scripts/db-schedules.sh" resume "$ENV"' EXIT

echo "== database: dropping schemas"
psql "$DSN" -v ON_ERROR_STOP=1 -q <<'EOSQL'
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = current_database() AND pid <> pg_backend_pid();
DROP SCHEMA IF EXISTS admin CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO PUBLIC;
EOSQL

echo "== database: applying every migration"
GOOSE_DRIVER=postgres GOOSE_MIGRATION_DIR="$MIGRATIONS_DIR" GOOSE_DBSTRING="$DSN" goose up

for i in "${!POOLS[@]}"; do
  pool="${POOLS[$i]}"
  echo "== cognito: deleting users in $pool"
  n=0
  while read -r username; do
    [[ -n "$username" ]] || continue
    aws cognito-idp admin-delete-user --user-pool-id "${POOL_IDS[$i]}" --username "$username"
    n=$((n + 1))
  done < <(aws cognito-idp list-users --user-pool-id "${POOL_IDS[$i]}" \
             --query 'Users[].Username' --output text | tr '\t' '\n')
  echo "   deleted $n"
done

echo "== media: emptying s3://$BUCKET"
n=0
while :; do
  batch="$(aws s3api list-object-versions --bucket "$BUCKET" --max-keys 1000 --no-paginate --output json \
    | jq -c '{Objects: ([.Versions[]?, .DeleteMarkers[]?] | map({Key, VersionId})), Quiet: true}')"
  count="$(jq '.Objects | length' <<<"$batch")"
  [[ "$count" -gt 0 ]] || break
  aws s3api delete-objects --bucket "$BUCKET" --delete "$batch" >/dev/null
  n=$((n + count))
done
echo "   deleted $n object version(s)"

echo
echo "Done. Next:"
echo "  make load-localities ENV=$ENV"
echo "  make create-first-admin EMAIL=<you> NAME=\"<your name>\" ENV=$ENV"
