-- Empty dev back to its accounts. DEV ONLY, operator-run through `make reset-dev-data` (scripts/reset-dev-data.sh).
--
-- Stays: back-office staff, shops and their staff (and their guided-tour state), localities.
-- Goes: everything else - orders, products, categories, attributes, delivery windows, the postcode list, fee plans,
-- customers, drivers (their clearances, vans, checks and duty sessions), promotions, points, feedback, the
-- notification and mail history, the audit log.
--
-- Cognito: scripts/reset-dev-data.sh deletes every user in the customer and driver pools after this commits.
--
-- Run with -v dry_run=true to do all of it and roll back.
--
-- Every table in the database must be named below: a table added by a later migration stops the run until
-- someone decides what happens to it. TRUNCATE has no CASCADE on purpose, so a table outside the list that
-- points at one inside it is refused too. Sequences are not restarted: package and order codes are never reused.

\set ON_ERROR_STOP on
\if :{?dry_run}
\else
\set dry_run false
\endif

BEGIN;

SET LOCAL lock_timeout = '30s';

CREATE TEMP TABLE reset_plan (
    tbl    text PRIMARY KEY,
    action text NOT NULL,
    quoted text GENERATED ALWAYS AS (quote_ident(split_part(tbl, '.', 1)) || '.' || quote_ident(split_part(tbl, '.', 2))) STORED
) ON COMMIT DROP;

INSERT INTO reset_plan (tbl, action)
SELECT t, 'keep' FROM unnest(ARRAY[
    -- The accounts.
    'admin.role', 'admin.staff', 'admin.staff_role',
    'public.shop', 'public.shop_role', 'public.shop_section', 'public.shop_staff', 'public.shop_staff_role',
    'public.shop_stock_settings', 'public.console_tour_state',
    'public.locality',
    -- Rows a migration creates once and the platform cannot run without. Nothing puts these back.
    'public.goose_db_version', 'public.order_policy', 'public.points_settings',
    'public.promotion_group', 'public.promotion_skin'
]) AS t
UNION ALL
SELECT t, 'some' FROM unnest(ARRAY[
    -- Partly kept: the DELETEs below say which rows go.
    'public.delivery_slot', 'public.device_token'
]) AS t
UNION ALL
SELECT t, 'wipe' FROM unnest(ARRAY[
    'admin.audit_log',
    -- Orders and everything an order fans out into.
    'public.order', 'public.order_item', 'public.order_business_identity', 'public.order_courier_collection_change',
    'public.order_delivery_type_change', 'public.order_package_delivery', 'public.order_promotion',
    'public.payment', 'public.receipt_dispatch', 'public.stripe_event', 'public.tax_document',
    'public.refund', 'public.refund_line', 'public.refund_proposal_dismissal', 'public.refund_request',
    'public.refund_request_item',
    'public.shop_fulfillment', 'public.fulfillment_event', 'public.fulfillment_item', 'public.fulfillment_note',
    'public.fulfillment_tag', 'public.package_arrival', 'public.package_handover', 'public.package_hold',
    'public.package_parcel', 'public.label_print', 'public.label_read',
    'public.carrier_handoff', 'public.courier_consignment', 'public.courier_consignment_event',
    'public.delivery_override',
    -- Drivers and their work.
    'public.driver', 'public.driver_duty_session', 'public.driver_zone_capability', 'public.vehicle',
    'public.vehicle_check', 'public.vehicle_holding',
    'public.assignment_exclusion', 'public.delivery_attempt_failure', 'public.delivery_proof', 'public.dispatch_wave',
    'public.driver_round', 'public.hub_checkin', 'public.parcel_return', 'public.round_package',
    'public.round_sequence_waiver', 'public.round_stop',
    -- The catalogue.
    'public.product', 'public.product_attribute_value', 'public.product_change', 'public.product_change_media',
    'public.product_gst_change', 'public.product_import', 'public.product_import_row', 'public.product_media',
    'public.product_option', 'public.product_option_value', 'public.product_placement', 'public.product_section',
    'public.product_variant', 'public.media_rendition', 'public.stock_movement',
    'public.category', 'public.category_ancestor', 'public.category_attribute', 'public.category_form',
    'public.category_resolved', 'public.attribute_allowed_value', 'public.attribute_definition',
    -- Figures and flags derived from the above; the shop service rebuilds these for each shop.
    'public.insights_dirty', 'public.insights_state', 'public.shop_attention_state', 'public.shop_product_sales_day',
    'public.shop_sales_hour', 'public.shop_run_figures', 'public.shop_picker_day', 'public.shop_product_pair_day',
    -- Delivery configuration.
    'public.business_tax', 'public.courier_excluded_postcode', 'public.courier_service',
    'public.delivery_collection_run', 'public.delivery_distance_band', 'public.delivery_fee_plan',
    'public.delivery_non_delivery_date', 'public.delivery_settings', 'public.delivery_slot_booking',
    'public.delivery_slot_premium', 'public.delivery_weight_band', 'public.delivery_zone', 'public.delivery_zone_postcode',
    -- Customers. A customer's Cognito login stays and gets a new, empty profile at its next sign-in.
    'public.customer', 'public.customer_address', 'public.customer_closure_request', 'public.customer_list',
    'public.customer_list_entry', 'public.customer_saved_item', 'public.cart', 'public.cart_change_log',
    'public.cart_item', 'public.cart_saved_item', 'public.newsletter_subscriber',
    'public.feedback_note', 'public.feedback_reply', 'public.feedback_submission',
    -- Points and promotions.
    'public.points_account', 'public.points_allocation', 'public.points_entry', 'public.points_expiry_notice',
    'public.points_hold', 'public.points_settings_change',
    'public.promotion', 'public.promotion_code', 'public.promotion_customer', 'public.promotion_group_member',
    'public.promotion_image', 'public.promotion_target', 'public.promotion_use',
    -- Notification and mail history.
    'public.email_delivery_event', 'public.email_delivery_status', 'public.notification_request',
    'public.notification', 'public.notification_delivery'
]) AS t;

DO $$
DECLARE
    unlisted text;
    missing  text;
    r        record;
    n        bigint;
    removed  bigint := 0;
    gone     bigint;
BEGIN
    WITH live AS (
        SELECT ns.nspname || '.' || c.relname AS tbl
          FROM pg_class c
          JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE c.relkind IN ('r', 'p') AND ns.nspname IN ('public', 'admin')
    )
    SELECT (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM live WHERE tbl NOT IN (SELECT tbl FROM reset_plan)),
           (SELECT string_agg(tbl, ', ' ORDER BY tbl) FROM reset_plan WHERE tbl NOT IN (SELECT tbl FROM live))
      INTO unlisted, missing;

    IF unlisted IS NOT NULL THEN
        RAISE EXCEPTION 'reset: tables in this database are not in the list: %. Nothing was removed. Fix db/reset/reset_dev_data.sql.',
            unlisted;
    END IF;

    -- A listed table that is absent belongs to a migration not applied here yet: skipped, never an error.
    IF missing IS NOT NULL THEN
        RAISE NOTICE 'not in this database yet (skipped): %', missing;
        DELETE FROM reset_plan WHERE tbl NOT IN (
            SELECT ns.nspname || '.' || c.relname
              FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
             WHERE c.relkind IN ('r', 'p') AND ns.nspname IN ('public', 'admin'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.delivery_slot WHERE any_time) THEN
        RAISE EXCEPTION 'reset: the "any time" delivery window is missing before the reset. Nothing was removed.';
    END IF;

    FOR r IN SELECT tbl, quoted FROM reset_plan WHERE action = 'wipe' ORDER BY tbl LOOP
        EXECUTE format('SELECT count(*) FROM %s', r.quoted) INTO n;
        IF n > 0 THEN
            RAISE NOTICE '  % rows  %', lpad(n::text, 7), r.tbl;
            removed := removed + n;
        END IF;
    END LOOP;

    EXECUTE (SELECT 'TRUNCATE ' || string_agg(quoted, ', ') FROM reset_plan WHERE action = 'wipe');

    -- The "any time" window stays: its migration made it, it is never made again, and a day-only order needs it.
    DELETE FROM public.delivery_slot WHERE NOT any_time;
    GET DIAGNOSTICS gone = ROW_COUNT;
    RAISE NOTICE '  % rows  public.delivery_slot (every window but "any time")', lpad(gone::text, 7);

    -- Shop staff's phones stay registered; customers' and drivers' go with their accounts.
    DELETE FROM public.device_token WHERE audience IN ('customer', 'driver');
    GET DIAGNOSTICS gone = ROW_COUNT;
    RAISE NOTICE '  % rows  public.device_token (customers and drivers)', lpad(gone::text, 7);

    RAISE NOTICE '  % rows removed in all from the fully emptied tables', lpad(removed::text, 7);
    RAISE NOTICE 'kept:';
    FOR r IN SELECT tbl, quoted FROM reset_plan WHERE action IN ('keep', 'some') ORDER BY tbl LOOP
        EXECUTE format('SELECT count(*) FROM %s', r.quoted) INTO n;
        RAISE NOTICE '  % rows  %', lpad(n::text, 7), r.tbl;
    END LOOP;
END
$$;

\if :dry_run
ROLLBACK;
\else
COMMIT;
\endif
