#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# DEV TOOL — mark an order DELIVERED (every shop portion: collected → delivered).
#
# The second half of the placeholder driver flow, after fulfillment-pickup.sh. Simulates the driver
# completing delivery before a driver app exists. See docs/dev/fulfillment-dev-tools.md.
#
# Only portions currently at `collected` move — the same forward-only guard the lifecycle enforces
# (an order must be picked up before it can be delivered). Anything not `collected` is left untouched.
# Writes the same append-only audit event the real deliver stub records. DEV ONLY — direct DB write.
#
# ⚠ Requires the `delivered` state migration applied (make db-up ENV=<env>); otherwise the status
#   CHECK rejects it and this fails.
#
# Usage:
#   scripts/fulfillment-deliver.sh <ORDER_NUMBER> [ENV] [DRIVER_REF]
#   scripts/fulfillment-deliver.sh EFY-HVX2AE
# ─────────────────────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ORDER="${1:?usage: scripts/fulfillment-deliver.sh <ORDER_NUMBER> [ENV] [DRIVER_REF]}"
ENV="${2:-dev}"
DRIVER_REF="${3:-test-driver-1}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSN="$(AWS_PROFILE="${AWS_PROFILE:-ef}" bash "$ROOT/infra/scripts/db-dsn.sh" "$ENV")"

echo "→ Marking ${ORDER} delivered (collected → delivered) in ${ENV}…"

psql "$DSN" -P pager=off -v ON_ERROR_STOP=1 \
  -v order="$ORDER" -v ref="delivered:placeholder:${DRIVER_REF}" <<'SQL'
BEGIN;
INSERT INTO public.fulfillment_event (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status)
  SELECT sf.id, NULL, 'state_changed', 'collected', :'ref'
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  WHERE o.order_number = :'order' AND sf.status = 'collected';

UPDATE public.shop_fulfillment sf
   SET status = 'delivered', state_changed_at = now(), updated_at = now()
  FROM public."order" o
 WHERE o.id = sf.order_id AND o.order_number = :'order' AND sf.status = 'collected';
COMMIT;

SELECT s.name AS shop, sf.status
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  JOIN public.shop s ON s.id = sf.shop_id
 WHERE o.order_number = :'order'
 ORDER BY s.name;
SQL

echo "✓ Done. (Only picked-up portions were delivered — run fulfillment-pickup.sh first for any still earlier.)"
