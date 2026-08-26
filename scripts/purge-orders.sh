#!/usr/bin/env bash
# purge-orders.sh — delete every order and all order-derived data from an environment's database.
#
# WHY THIS EXISTS: dev accumulates test orders — abandoned checkouts, half-paid intents, fan-outs to
# shops, driver runs — and there is no product surface that deletes them (deliberately: an order is a
# financial record and nothing in the platform may erase one). Clearing them is an operator action, so
# it lives here rather than behind an API.
#
# ⚠ WHAT IT DELETES, and it is not just the `order` table. An order fans out into fulfilment, payment,
#   delivery packages, driver work and event ledgers; two of those chains are ON DELETE RESTRICT, so a
#   plain `DELETE FROM "order"` fails rather than cascading. The order below is the dependency order.
#
# ⚠ WHAT IT DOES NOT TOUCH, on purpose:
#     • customers, carts, addresses, saved items       — not order data
#     • products, shops, drivers, delivery zones/plans — reference data the orders pointed at
#     • customer.stripe_customer_id                    — the link to a shopper's SAVED CARDS. Clearing
#       it would orphan real cards at the provider while leaving them charged-to-able. Not order data.
#     • driver_duty_session                            — a driver being on duty is not an order
#     • anything at Stripe                             — PaymentIntents/charges live there and CANNOT be
#       deleted by this or anything else. Test-mode data is cleared from the Stripe dashboard, if ever.
#
# Usage:
#   ./scripts/purge-orders.sh --dry-run     # count what WOULD go, change nothing (recommended first)
#   ./scripts/purge-orders.sh               # delete, after typing the confirmation phrase
#
# Env: ENV (default dev), AWS_PROFILE (default ef), AWS_REGION (default ap-southeast-2).
#
# ⚠ Refuses any environment but dev unless PURGE_ALLOW_NON_DEV=1 is set. This is a dev-data tool; on a
#   real environment it destroys the record of what people bought and what they were charged.
set -euo pipefail

ENV="${ENV:-dev}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export AWS_PROFILE AWS_REGION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

if [[ "$ENV" != "dev" && "${PURGE_ALLOW_NON_DEV:-0}" != "1" ]]; then
  echo "purge-orders: refusing ENV=$ENV." >&2
  echo "  This deletes the record of what customers bought and what they were charged." >&2
  echo "  If you genuinely mean it: PURGE_ALLOW_NON_DEV=1 ENV=$ENV $0" >&2
  exit 1
fi

command -v psql >/dev/null || { echo "purge-orders: psql not found on PATH" >&2; exit 1; }

DSN="$(bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")" || {
  echo "purge-orders: could not compose the DSN for ENV=$ENV" >&2; exit 1; }

# ── The dependency order. Children first; a RESTRICT parent needs its children gone first. ──────────
#
# ⚠ `event_outbox` and `notification_request` are FILTERED, not truncated: both are shared ledgers that
#   carry non-order rows too. Deleting them wholesale would take unrelated events with them.
# ⚠ `stripe_event` IS taken whole — it is the webhook de-duplication ledger and holds nothing else. It
#   must go, or a re-delivered webhook for a deleted order is silently skipped as "already seen".
read -r -d '' TARGETS <<'LIST' || true
driver_task_event|
proof_of_delivery|
delivery_failure|
delivery_task_package|
delivery_task|
collection_task_issue|
collection_task|
driver_run|
fulfillment_event|
fulfillment_item|
shop_fulfillment|
promo_redemption|
order_package_delivery|
payment|
order_item|
order|
stripe_event|
event_outbox|aggregate_type = 'order'
notification_request|type IN ('order_paid','order_ready','order_out_for_delivery','order_delivered','shop_new_order','run_assigned')
LIST

# Build one transaction. A DO block skips tables a given environment does not have (migrations have
# added and withdrawn several of these), and reports what each step removed.
sql_body() {
  echo "DO \$\$"
  echo "DECLARE removed bigint;"
  echo "BEGIN"
  while IFS='|' read -r table where; do
    [[ -z "$table" ]] && continue
    local_where=""
    [[ -n "$where" ]] && local_where=" WHERE $where"
    cat <<EOSQL
  IF to_regclass('public."$table"') IS NULL THEN
    RAISE NOTICE '  (skipped) %  — table not present in this environment', '$table';
  ELSE
    DELETE FROM public."$table"$local_where;
    GET DIAGNOSTICS removed = ROW_COUNT;
    RAISE NOTICE '  % rows removed from %', lpad(removed::text, 6), '$table';
  END IF;
EOSQL
  done <<< "$TARGETS"
  echo "END"
  echo "\$\$;"
}

# ⚠ COUNTED THROUGH DYNAMIC SQL, because a plain `SELECT count(*) FROM t` fails at PARSE time when `t`
# does not exist — CASE and COALESCE cannot rescue it. Without this the summary would break on exactly
# the environments the purge itself is careful to tolerate (one without the driver tables, say), which
# is a script contradicting its own promise.
counts() {
  psql "$DSN" -v ON_ERROR_STOP=1 -q <<'EOSQL'
DO $$
DECLARE
  t text;
  n bigint;
  parts text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['order', 'order_item', 'payment', 'shop_fulfillment', 'driver_run'] LOOP
    IF to_regclass('public."' || t || '"') IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    parts := parts || (n::text || ' ' || t);
  END LOOP;
  RAISE NOTICE '  %', array_to_string(parts, '  ·  ');
END
$$;
EOSQL
}

echo "purge-orders: ENV=$ENV"
echo "before:"
counts

if [[ "$DRY_RUN" == "1" ]]; then
  echo
  echo "DRY RUN — deleting inside a transaction and rolling back. Nothing is kept."
  psql "$DSN" -v ON_ERROR_STOP=1 -q <<EOSQL
BEGIN;
$(sql_body)
ROLLBACK;
EOSQL
  echo
  echo "Rolled back. Counts are unchanged:"
  counts
  exit 0
fi

echo
echo "⚠ This permanently deletes every order and everything derived from it in ENV=$ENV."
printf 'Type the environment name to continue (%s): ' "$ENV"
read -r reply
[[ "$reply" == "$ENV" ]] || { echo "purge-orders: aborted."; exit 1; }

# ⚠ ONE transaction. A partial purge leaves fulfilments pointing at orders that no longer exist, and
# the RESTRICT constraints mean it can fail halfway — so it either all goes or none of it does.
psql "$DSN" -v ON_ERROR_STOP=1 -q <<EOSQL
BEGIN;
$(sql_body)
COMMIT;
EOSQL

echo
echo "after:"
counts
echo "purge-orders: done."
