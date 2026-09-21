-- Reset the DEV order & dispatch state to zero, keeping everything a fresh test run needs.
--
-- ⚠ DEV ONLY, AND DESTRUCTIVE. It deletes every order the platform has ever taken, along with the
-- whole fulfilment, dispatch, payment and refund chain hanging off it. There is no undo.
--
-- ⚠ WHAT IT DELIBERATELY KEEPS, because a fresh run needs a platform to run on:
--   shops · staff · products · categories · attributes · media · stock settings
--   drivers · vehicles · holdings · zone clearances
--   delivery zones · postcodes · rings · fee plans · weight bands · collection runs · settings
--   customers · customer addresses · promo codes · order policy
--
-- ⚠ ONE JUDGEMENT CALL WORTH KNOWING: duty sessions are CLOSED, not deleted. A driver's shift is a
-- record of something that physically happened; erasing it would be a lie of a different kind than
-- erasing a test order. Closing them leaves every driver off duty, which is the correct starting
-- state for a walk anyway.
--
-- ⚠ stock_movement rows that reference an order are deleted, so the on-hand counts those orders
-- decremented are NOT restored. Stock is a physical claim; re-inflating it here would invent
-- inventory. Re-seed or adjust counts deliberately if the fresh run needs them.
--
-- Run:  psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)" -f db/scripts/reset-orders-dev.sql

BEGIN;

-- Refuse to run anywhere that looks like production.
DO $$
BEGIN
  IF current_database() NOT LIKE '%dev%' THEN
    RAISE EXCEPTION 'reset-orders-dev.sql refused: database % is not a dev database', current_database();
  END IF;
END $$;

-- ── Dispatch (063) ──────────────────────────────────────────────────────────────────────────────
DELETE FROM public.assignment_exclusion;
DELETE FROM public.round_package;
DELETE FROM public.hub_checkin;
DELETE FROM public.round_stop;
DELETE FROM public.driver_round;
DELETE FROM public.dispatch_wave;

-- ── Post-purchase lifecycle (053 / 055) ─────────────────────────────────────────────────────────
DELETE FROM public.package_arrival;
DELETE FROM public.carrier_handoff;
DELETE FROM public.refund_line;
DELETE FROM public.refund;
DELETE FROM public.refund_request_item;
DELETE FROM public.refund_request;
DELETE FROM public.refund_proposal_dismissal;

-- ── Shop fulfilment (020 / 057) ─────────────────────────────────────────────────────────────────
DELETE FROM public.fulfillment_event;
DELETE FROM public.fulfillment_item;
DELETE FROM public.fulfillment_note;
DELETE FROM public.fulfillment_tag;
DELETE FROM public.shop_fulfillment;

-- ── Money, receipts, promotions (019 / 027 / 052) ───────────────────────────────────────────────
DELETE FROM public.payment;
DELETE FROM public.receipt_dispatch;
DELETE FROM public.promo_redemption;
DELETE FROM public.stripe_event;

-- ── The orders themselves ───────────────────────────────────────────────────────────────────────
DELETE FROM public.stock_movement WHERE order_id IS NOT NULL;
DELETE FROM public.order_package_delivery;
DELETE FROM public.order_item;
DELETE FROM public."order";

-- ── Carts, so a fresh run starts from an empty basket ───────────────────────────────────────────
DELETE FROM public.cart_change_log;
DELETE FROM public.cart_item;
DELETE FROM public.cart_saved_item;
DELETE FROM public.cart;

-- ── Derived state that described the orders just removed ────────────────────────────────────────
-- ⚠ Rollups and the attention set are DERIVED. Left behind they would report revenue for orders
-- that no longer exist, and 058's own rule is that a figure must be recomputable from source.
DELETE FROM public.shop_product_sales_day;
DELETE FROM public.shop_sales_hour;
DELETE FROM public.shop_attention_state;
DELETE FROM public.insights_dirty;
DELETE FROM public.insights_state;

-- ── Outbound work queues that referenced those orders ───────────────────────────────────────────
-- ⚠ NOT a record of a defect worth keeping (contrast 059's deliberate no-backfill): these are
-- pending sends for orders that no longer exist, and draining them would notify real inboxes.
DELETE FROM public.notification_request;
DELETE FROM public.event_outbox;

-- ── Drivers end the reset off duty, with their history intact ───────────────────────────────────
UPDATE public.driver_duty_session
   SET ended_at = now()
 WHERE ended_at IS NULL;

COMMIT;

-- What survived, for a one-glance confirmation.
SELECT 'orders'    AS kept, count(*) FROM public."order"
UNION ALL SELECT 'shops',     count(*) FROM public.shop
UNION ALL SELECT 'products',  count(*) FROM public.product
UNION ALL SELECT 'drivers',   count(*) FROM public.driver
UNION ALL SELECT 'vehicles',  count(*) FROM public.vehicle
UNION ALL SELECT 'zones',     count(*) FROM public.delivery_zone
UNION ALL SELECT 'runs',      count(*) FROM public.delivery_collection_run
UNION ALL SELECT 'customers', count(*) FROM public.customer;
