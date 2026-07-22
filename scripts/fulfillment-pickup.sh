#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# DEV TOOL — mark an order PICKED UP (every shop portion: ready_for_pickup → collected).
#
# Simulates the driver collecting the order before a driver app exists. Pairs with
# fulfillment-deliver.sh (collected → delivered). See docs/dev/fulfillment-dev-tools.md.
#
# Only portions currently at `ready_for_pickup` move — the same guard the shop lifecycle enforces.
# A portion still `pending`/`received`/`picking` is left untouched (advance it in the shop app first);
# one already `collected`/`delivered` is left untouched too. Writes the same append-only audit event
# the real pickup stub records. DEV ONLY — direct DB write against the env's database.
#
# Usage:
#   scripts/fulfillment-pickup.sh <ORDER_NUMBER> [ENV] [DRIVER_REF]
#   scripts/fulfillment-pickup.sh EFY-HVX2AE                # env=dev, driver=test-driver-1
#   scripts/fulfillment-pickup.sh EFY-HVX2AE dev my-driver  # override
# ─────────────────────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ORDER="${1:?usage: scripts/fulfillment-pickup.sh <ORDER_NUMBER> [ENV] [DRIVER_REF]}"
ENV="${2:-dev}"
DRIVER_REF="${3:-test-driver-1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSN="$(AWS_PROFILE="${AWS_PROFILE:-ef}" bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")"

echo "→ Marking ${ORDER} picked up (ready_for_pickup → collected) in ${ENV}…"

psql "$DSN" -P pager=off -v ON_ERROR_STOP=1 \
  -v order="$ORDER" -v ref="collected:placeholder:${DRIVER_REF}" <<'SQL'
BEGIN;
-- Audit first (append-only), then the guarded transition — only ready_for_pickup portions move.
INSERT INTO public.fulfillment_event (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status)
  SELECT sf.id, NULL, 'state_changed', 'ready_for_pickup', :'ref'
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  WHERE o.order_number = :'order' AND sf.status = 'ready_for_pickup';

UPDATE public.shop_fulfillment sf
   SET status = 'collected', state_changed_at = now(), updated_at = now()
  FROM public."order" o
 WHERE o.id = sf.order_id AND o.order_number = :'order' AND sf.status = 'ready_for_pickup';
COMMIT;

-- Result: every portion of the order and where it now sits.
SELECT s.name AS shop, sf.status
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  JOIN public.shop s ON s.id = sf.shop_id
 WHERE o.order_number = :'order'
 ORDER BY s.name;
SQL

echo "✓ Done. (Portions not at ready_for_pickup were left untouched — advance them in the shop app, then re-run.)"
