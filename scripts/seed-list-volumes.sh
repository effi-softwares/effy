#!/usr/bin/env bash
# seed-list-volumes.sh - fill dev with enough rows to prove the console lists at volume (103, quickstart §4).
#
# why this exists: the lists are judged on a full table (paging past page 400, search over 100 000 orders,
# EXPLAIN on the new indexes). Dev holds a few hundred rows, so a plan that scans everything still looks fast.
#
# what it writes, all tagged so `--remove` takes exactly these and nothing else:
# • 20 000 customers - cognito_sub `seed-list-<n>`, email `seed-list-<n>@seed.invalid` (the reserved
#   `.invalid` domain: no mail can ever be sent to it). They cannot sign in: no Cognito user exists.
# • 100 000 paid orders - order_number `SEED-<n>`, Delivered by Effy on a day, spread over the last year,
#   for those customers. No fulfilment, payment or package rows: they are list rows, not work.
# • 20 000 products - created_by `seed-list-volumes`, drafts in the first shop and the first leaf category,
#   one size each. Drafts are never on sale and never reach review.
#
# Usage:
#   ./scripts/seed-list-volumes.sh            # write the rows (after typing the confirmation phrase)
#   ./scripts/seed-list-volumes.sh --remove   # delete every row this script wrote
#
# Env: ENV (must be dev), AWS_PROFILE (default ef), AWS_REGION (default ap-southeast-2).
# Refuses any environment but dev, with no override: seeded orders on a real environment are false records.
set -euo pipefail

ENV="${ENV:-dev}"
AWS_PROFILE="${AWS_PROFILE:-ef}"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
export AWS_PROFILE AWS_REGION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="seed"
[[ "${1:-}" == "--remove" ]] && MODE="remove"

if [[ "$ENV" != "dev" ]]; then
  echo "seed-list-volumes: refusing ENV=$ENV. This is a dev-only tool." >&2
  exit 1
fi

command -v psql >/dev/null || { echo "seed-list-volumes: psql not found on PATH" >&2; exit 1; }

DSN="$(bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")" || {
  echo "seed-list-volumes: could not compose the DSN for ENV=$ENV" >&2; exit 1; }

if [[ "$MODE" == "remove" ]]; then
  psql "$DSN" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM public."order" WHERE order_number LIKE 'SEED-%';
DELETE FROM public.product_variant WHERE product_id IN (SELECT id FROM public.product WHERE created_by = 'seed-list-volumes');
DELETE FROM public.product WHERE created_by = 'seed-list-volumes';
DELETE FROM public.customer WHERE cognito_sub LIKE 'seed-list-%';
COMMIT;
SQL
  echo "seed-list-volumes: removed."
  exit 0
fi

read -r -p "Type 'seed dev' to write 100 000 orders, 20 000 customers and 20 000 products to dev: " phrase
[[ "$phrase" == "seed dev" ]] || { echo "seed-list-volumes: not confirmed; nothing written." >&2; exit 1; }

psql "$DSN" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

INSERT INTO public.customer (cognito_sub, email, created_at)
SELECT 'seed-list-' || n, 'seed-list-' || n || '@seed.invalid', now() - (n % 365) * interval '1 day'
  FROM generate_series(1, 20000) AS n
ON CONFLICT DO NOTHING;

INSERT INTO public."order"
       (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address,
        delivery_type, delivery_type_reason, delivery_promise, created_at)
SELECT c.id,
       'SEED-' || lpad(n::text, 6, '0'),
       'paid',
       amount,
       amount,
       jsonb_build_object('line1', n || ' Seed Street', 'suburb', 'Seedville', 'state', 'NSW', 'postcode', '2000'),
       'effy',
       'in_coverage',
       'day',
       now() - (n % 365) * interval '1 day' - (n % 1440) * interval '1 minute'
  FROM generate_series(1, 100000) AS n
  CROSS JOIN LATERAL (SELECT round((10 + (n % 190))::numeric, 2) AS amount) a
  JOIN public.customer c ON c.cognito_sub = 'seed-list-' || (1 + n % 20000);

WITH home AS (
  SELECT (SELECT id FROM public.shop ORDER BY created_at LIMIT 1) AS shop_id,
         (SELECT category_id FROM public.category_resolved WHERE is_leaf ORDER BY category_id LIMIT 1) AS leaf
), made AS (
  INSERT INTO public.product
         (shop_id, primary_category_id, name, short_description, created_by, storage, gst_status, age_restricted)
  SELECT home.shop_id, home.leaf, 'Seed product ' || n, 'A seeded product for list volume tests.', 'seed-list-volumes',
         'ambient', 'taxable', false
    FROM generate_series(1, 20000) AS n, home
  RETURNING id, shop_id
)
INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, sku)
SELECT id, shop_id, 4.50, 'SEED-' || left(id::text, 8) FROM made;

COMMIT;
SQL

echo "seed-list-volumes: done. Remove with: ENV=dev $0 --remove"
