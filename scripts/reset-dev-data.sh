#!/usr/bin/env bash
# reset-dev-data.sh - empty dev back to its accounts, keeping the people who work on the platform.
#
# Between purge-orders.sh (orders only) and wipe-dev.sh (everything, accounts included). What stays and what
# goes is db/reset/reset_dev_data.sql, table by table; the media under the prefixes below goes with it.
#
# Not touched: Cognito (a customer login gets a new, empty profile at its next sign-in), every AWS resource,
# anything at Stripe.
#
# Usage:
#   ./scripts/reset-dev-data.sh --dry-run   # the whole reset, rolled back; nothing changes
#   ./scripts/reset-dev-data.sh             # the same preview, then deletes after the confirmation phrase
#
# Env: ENV (must be dev), AWS_PROFILE (default ef), AWS_REGION (default ap-southeast-2).
# Refuses any environment but dev, with no override.
set -euo pipefail

ENV="${ENV:-dev}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export AWS_PROFILE AWS_REGION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/db/reset/reset_dev_data.sql"
# Everything the emptied tables pointed at, private prefixes included.
MEDIA_PREFIXES=(products renditions promotions categories imports courier-label proof)

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

[[ "$ENV" == "dev" ]] || { echo "reset-dev-data: refusing ENV=$ENV - this only ever runs against dev." >&2; exit 1; }

for tool in psql aws jq; do
  command -v "$tool" >/dev/null || { echo "reset-dev-data: $tool not found on PATH" >&2; exit 1; }
done

DSN="$(bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")"
HOST="$(printf '%s\n' "$DSN" | tr ' ' '\n' | sed -n 's/^host=//p')"
BUCKET="$(aws ssm get-parameter --name "/effy/$ENV/media/bucket" --query Parameter.Value --output text)"

run_sql() { psql "$DSN" -v ON_ERROR_STOP=1 -v dry_run="$1" -q -f "$SQL" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //'; }

media_count() {
  aws s3api list-object-versions --bucket "$BUCKET" --prefix "$1/" --output json \
    | jq '[.Versions[]?, .DeleteMarkers[]?] | length'
}

echo "reset-dev-data: env '$ENV', database $HOST, media s3://$BUCKET"
echo "These would go (rolled back):"
run_sql true
echo "media:"
for prefix in "${MEDIA_PREFIXES[@]}"; do
  printf '  %7s versions  %s/\n' "$(media_count "$prefix")" "$prefix"
done

if [[ "$DRY_RUN" == "1" ]]; then
  echo
  echo "Dry run: nothing changed."
  exit 0
fi

echo
read -r -p "Type 'reset dev' to delete all of the above permanently: " answer
[[ "$answer" == "reset dev" ]] || { echo "aborted - nothing changed"; exit 1; }

bash "$ROOT/infra/scripts/db-schedules.sh" pause "$ENV"
trap 'bash "$ROOT/infra/scripts/db-schedules.sh" resume "$ENV"' EXIT

echo "== database"
run_sql false

for prefix in "${MEDIA_PREFIXES[@]}"; do
  n=0
  while :; do
    batch="$(aws s3api list-object-versions --bucket "$BUCKET" --prefix "$prefix/" --max-keys 1000 --no-paginate --output json \
      | jq -c '{Objects: ([.Versions[]?, .DeleteMarkers[]?] | map({Key, VersionId})), Quiet: true}')"
    count="$(jq '.Objects | length' <<<"$batch")"
    [[ "$count" -gt 0 ]] || break
    aws s3api delete-objects --bucket "$BUCKET" --delete "$batch" >/dev/null
    n=$((n + count))
  done
  echo "== media: $prefix/ - deleted $n object version(s)"
done

echo
echo "Done. Dev has no categories, windows, postcodes or fee plan until back-office sets them up again."
