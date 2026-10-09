-- +goose Up
-- 083 (stage 2) — the old delivery arrangement is REMOVED.
--
-- Until now an order could be sold two ways: the 047/069 way (a same-day slot, or a standard day a
-- carrier delivers) or the new way (Delivered by Effy in a window / Courier delivery). The switch
-- (delivery_settings.delivery_model_v2_from) chose between them. From this migration there is one way,
-- and the switch has nothing left to choose.
--
-- ⚠ NOT REVERSIBLE. The columns dropped below take their data with them. The Down section restores
-- nothing but the function, and says so.
--
-- ⚠ WHAT STAYS, ON PURPOSE:
--   · every order, package, round and history row;
--   · shop_fulfillment.delivery_method / order_package_delivery.method — for an Effy order they are
--     the customer's word (same-day = today's window, standard = a later day), and for an order sold
--     before delivery types they are how public.package_delivered_by answers;
--   · the table names delivery_zone / delivery_zone_postcode (the postcode list and its optional
--     groups since 076).

-- ── 1. THE GUARD ────────────────────────────────────────────────────────────────────────────────
-- Refuse while an order sold the old way is still open: it is being finished by the path this removes.
--
-- ⚠ THE DEFINITION OF "STILL OPEN" IS RESTATED HERE FROM LEGACY_OPEN_ORDER_SQL
-- (apis/edge-api/shared/src/delivery/legacy.ts) — no delivery type, paid, a live portion that has not
-- arrived, not fully refunded — because a migration cannot import it. retire.container.test.ts runs
-- both against the same orders and fails if they disagree.
--
-- Refuse, too, on a database that HAS taken orders and was never switched over: removing the old
-- checkout there would leave customers with a model nobody chose to turn on. A database with no
-- order at all (a new environment, a test) has nothing to cut over and proceeds.
-- +goose StatementBegin
DO $$
DECLARE
    v_open   int;
    v_from   timestamptz;
    v_orders boolean;
BEGIN
    SELECT count(*) INTO v_open
      FROM public."order" o
     WHERE o.delivery_type IS NULL
       AND o.status = 'paid'
       AND EXISTS (
             SELECT 1 FROM public.shop_fulfillment sf
              WHERE sf.order_id = o.id
                AND sf.status NOT IN ('withdrawn', 'unfulfillable')
                AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id))
       AND (o.grand_total_amount = 0
            OR COALESCE((SELECT SUM(r.amount) FROM public.refund r
                          WHERE r.order_id = o.id AND r.status IN ('submitted', 'succeeded', 'failed')), 0)
               < o.grand_total_amount);
    IF v_open > 0 THEN
        RAISE EXCEPTION '083: % order(s) sold under the old delivery arrangement are still open. Finish, cancel or refund each one first (back-office: Delivery, Go-live). Nothing was changed.', v_open;
    END IF;

    SELECT delivery_model_v2_from INTO v_from FROM public.delivery_settings WHERE id = 1;
    SELECT EXISTS (SELECT 1 FROM public."order" WHERE status <> 'pending_payment') INTO v_orders;
    IF v_orders AND (v_from IS NULL OR v_from > now()) THEN
        RAISE EXCEPTION '083: the new delivery model is not switched on (back-office: Delivery, Go-live). The old arrangement cannot be removed before the switch. Nothing was changed.';
    END IF;
END
$$;
-- +goose StatementEnd

-- ── 2. THE MARKER ───────────────────────────────────────────────────────────────────────────────
-- When the old arrangement was removed. NOT NULL with a default: every settings row — this one, and
-- one created later in a new environment — says the old arrangement is gone. The go-live route reads
-- it to refuse "turn back off": there is nothing to go back to.
ALTER TABLE public.delivery_settings
    ADD COLUMN legacy_model_removed_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN public.delivery_settings.legacy_model_removed_at IS 'When the old delivery arrangement (same-day slot / standard day by carrier) was removed (083 stage 2). From then the new delivery model is on for good: public.delivery_model_v2_at answers true and the go-live switch cannot be turned back.';

-- The one definition of "is the new model on" stays the one definition: it now answers yes, always.
-- (Its callers — the quote, public.courier_delivery_state — are unchanged.)
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.delivery_model_v2_at(p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT true;
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.delivery_model_v2_at(timestamptz) IS 'Whether the new delivery model applies at an instant. Always true since 083 stage 2 removed the old arrangement (delivery_settings.legacy_model_removed_at). delivery_settings.delivery_model_v2_from is kept as the record of when it began.';
COMMENT ON COLUMN public.delivery_settings.delivery_model_v2_from IS 'When the new delivery model began (078, set through the go-live route in 083). A RECORD since 083 stage 2: nothing reads it to decide anything, and the model cannot be switched off.';

-- ── 3. THE SAME-DAY BRIDGE (076) ────────────────────────────────────────────────────────────────
-- READER AUDIT: no function, view, trigger, index or constraint names either (catalog query against
-- the full schema, 2026-10-09). Code readers — shared zone.ts / sameday.ts (sameDayForShops), admin
-- coverage repository — are deleted in this release.
DROP TABLE public.shop_sameday_exception;
ALTER TABLE public.delivery_zone DROP COLUMN sameday_eligible;
COMMENT ON TABLE public.delivery_zone IS 'An optional GROUP of postcodes on Effy''s delivery list (076; the name is 047''s). A group is how driver clearances are scoped and how staff organise the list. It decides nothing about coverage: a postcode on the list is delivered to whether or not it is in a group.';

-- ── 4. THE METHOD FACTORS (077) ─────────────────────────────────────────────────────────────────
-- READER AUDIT: three CHECK constraints on these columns only (dropped with them); no function reads
-- them since 077 (fee.guard.test.ts). Same-day costs more by the plan's fixed today surcharge.
ALTER TABLE public.delivery_fee_plan
    DROP COLUMN same_day_factor,
    DROP COLUMN standard_factor;

-- ── 5. THE OLD CHECKOUT'S SETTINGS (069, 079) ───────────────────────────────────────────────────
-- READER AUDIT: one CHECK each (dropped with them); no function. standard_lookahead_days was the
-- standard-day picker's reach (the window calendar uses effy_lookahead_days); carrier_lead_days was
-- "hand over on the day minus N" (a courier parcel is due by its service's next pickup since 080);
-- courier_estimate_text was 079's platform-wide estimate (the default courier service carries the
-- timeframe since 080 — public.courier_delivery_state does not read this column).
ALTER TABLE public.delivery_settings
    DROP COLUMN standard_lookahead_days,
    DROP COLUMN carrier_lead_days,
    DROP COLUMN courier_estimate_text;

-- ── 6. PER-PACKAGE DELIVERY MONEY (077) ─────────────────────────────────────────────────────────
-- READER AUDIT: one CHECK each (dropped with them). Delivery is priced once per ORDER
-- ("order".delivery_fee_amount, delivery_fee_breakdown). These held a compatibility split for the
-- checkout removed here; a shop never saw them.
ALTER TABLE public.order_package_delivery DROP COLUMN delivery_fee_amount;
ALTER TABLE public.shop_fulfillment DROP COLUMN delivery_fee_amount;

-- ── 7. THE ROUND LOCK (073) ─────────────────────────────────────────────────────────────────────
-- READER AUDIT: driver_round_lock_ck (dropped with the columns). Unused since 073 replaced locking a
-- round with assigning its packages.
ALTER TABLE public.driver_round
    DROP COLUMN locked_by_sub,
    DROP COLUMN locked_at;

-- ── 8. DRIVER CLEARANCES: ONE ROW PER (DRIVER, FUNCTION, AREA) (082) ────────────────────────────
-- Since 082 a clearance is a function and an area; the method was unread and a driver cleared for
-- both methods held two rows for one fact. Keep the oldest of each, then drop the column.
-- READER AUDIT: driver_zone_capability_uq and the method CHECK name the column (both dropped with
-- it); no function. fleet's driver-method.guard.test.ts has held every code reader out since 082.
DELETE FROM public.driver_zone_capability c
 USING public.driver_zone_capability keep
 WHERE keep.driver_id = c.driver_id
   AND keep.function = c.function
   AND keep.zone_id IS NOT DISTINCT FROM c.zone_id
   AND (keep.created_at, keep.id) < (c.created_at, c.id);
ALTER TABLE public.driver_zone_capability DROP COLUMN method;
-- NULLS NOT DISTINCT: "everywhere" (zone_id NULL) is one clearance, not as many as are inserted.
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, zone_id) NULLS NOT DISTINCT;
COMMENT ON TABLE public.driver_zone_capability IS 'One clearance: a driver may do one kind of work (collection or delivery) in one area — a postcode group, or everywhere when zone_id is NULL, including groups created later (062; one row per clearance since 083).';
COMMENT ON COLUMN public.driver_zone_capability.function IS 'Collecting from shops, or delivering to customers.';

-- +goose Down
-- ⚠ NOT A RESTORE. The dropped columns and their data are gone; putting the old arrangement back
-- means restoring a backup taken before this migration. This only makes the function consult the
-- switch again and removes the marker, for private dev iteration on the Up section.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.delivery_model_v2_at(p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT delivery_model_v2_from IS NOT NULL AND p_at >= delivery_model_v2_from
           FROM public.delivery_settings WHERE id = 1),
        false);
$$;
-- +goose StatementEnd
ALTER TABLE public.delivery_settings DROP COLUMN legacy_model_removed_at;
