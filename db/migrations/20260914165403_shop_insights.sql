-- +goose Up
-- 058 — Shop console Today & Insights: the analytics rollups, their work queue, and the one signal
-- that tells both the rollup job and an open console that something changed.
--
-- ⚠ THE PLATFORM'S FIRST TRIGGERS, and they are deliberate rather than convenient (research R6).
-- Six services on two backends write the tables these rollups and screens are derived from —
-- core-api (payment, refunds), edge-shop (picking, handover, can't-supply, stock), edge-orders
-- (handoff, arrival), edge-driver (collection, delivery), edge-fleet (release) and edge-inventory
-- (stock). A poke or a dirty mark written in application code has to be remembered by every one of
-- them, now and forever; missing one leaves a screen quietly stale and a figure quietly wrong, with
-- nothing failing — 054's `availability` lesson, where one rule written in 14 places was one
-- omission away from selling what a shop did not have. A trigger cannot be forgotten, and NOTIFY is
-- transactional: it is delivered only if the transaction that fired it commits.
--
-- ⚠ WHAT A TRIGGER HERE MAY DO IS BOUNDED TO TWO STATEMENTS: pg_notify, and an
-- ON CONFLICT DO NOTHING insert into insights_dirty. No business rule, no write to an operational
-- table, no read beyond resolving the shop and its timezone. `triggers.guard.test.ts` enumerates
-- every trigger function in `public` and fails naming any that does anything else.
--
-- ⚠ THE NOTIFY CHANNEL IS NOT THE EVENT BACKBONE (Principle VI, research R19). It carries a shop id
-- and nothing else, it has no envelope, and no business process may consume it. When the SNS
-- backbone lands, domain events go there; this stays a cache-invalidation hint for open browsers.
--
-- House style: raw SQL, text CHECK enums, an index on every FK, COMMENT ON everything.

-- ── The shop's clock ────────────────────────────────────────────────────────────────────────────
--
-- "Today", hour boundaries, day boundaries and Monday-start weeks are all the SHOP's, not the
-- server's and not the browser's. Shops carry no address yet (049 R13), so every shop starts on the
-- platform's operating timezone — the same one 047 already judges the same-day cutoff in.

ALTER TABLE public.shop
    ADD COLUMN timezone text NOT NULL DEFAULT 'Australia/Melbourne';

COMMENT ON COLUMN public.shop.timezone IS
    'IANA zone name defining this shop''s day, hours and weeks (058). Defaults to the platform''s operating timezone until shops carry their own location; validated against pg_timezone_names on read, never trusted blindly. Changing it makes this shop''s rollups stale by definition — insights_state.timezone records what they were built under, and the nightly reconcile rebuilds a shop whose value has moved.';

-- ── One bucketing rule, in one place ────────────────────────────────────────────────────────────
--
-- The UTC instant at which a local hour BEGAN in a given zone. Everything buckets through this
-- function — the triggers, the rollup job and the reads — so the three can never disagree about
-- which hour a sale belongs to.
--
-- ⚠ IT IS NOT date_trunc('hour', ts AT TIME ZONE tz) AT TIME ZONE tz, which is the obvious version
-- and is WRONG on the day daylight saving ends: 02:00–03:00 happens twice, both wall clocks read
-- 02:xx, and that expression collapses two real hours into one bucket. Subtracting the offset that
-- was in force AT THAT INSTANT keeps them apart, so a 25-hour day has 25 buckets and a 23-hour day
-- has 23. It is also what makes half-hour zones (Adelaide, Darwin) correct: their local hours begin
-- at :30 UTC, which a UTC-hour bucket could never express.
--
-- ⚠ STABLE, not IMMUTABLE: `AT TIME ZONE <text>` depends on the timezone database, which can change
-- under us. Declaring it IMMUTABLE would be a lie the planner is entitled to believe (and would let
-- it into an index, where a tzdata update would silently corrupt the answers).

-- +goose StatementBegin
CREATE FUNCTION public.shop_local_hour(ts timestamptz, tz text) RETURNS timestamptz
LANGUAGE sql STABLE STRICT AS $$
    SELECT (date_trunc('hour', ts AT TIME ZONE tz)
            - ((ts AT TIME ZONE tz) - (ts AT TIME ZONE 'UTC'))) AT TIME ZONE 'UTC';
$$;
-- +goose StatementEnd

COMMENT ON FUNCTION public.shop_local_hour(timestamptz, text) IS
    'The UTC instant at which the local hour containing `ts` began in zone `tz` (058). The single bucketing rule for shop_sales_hour: used by the triggers that mark buckets dirty, by the rollup job that recomputes them, and by the reads that group them into days and weeks.';

-- ── Rollups: the ONLY thing Insights reads ──────────────────────────────────────────────────────
--
-- ⚠ Recomputed FROM SOURCE per dirty bucket, never incremented (research R5). An incremental `+=`
-- is exact only if every change arrives exactly once and in order; Effy's corrections arrive late
-- and can un-happen — 055 is explicit that a submitted refund can be rejected by the bank up to
-- thirty days later. Recomputing a bucket is idempotent, so running it twice, late, or after a
-- reversal gives the same answer, and there is no drift to reconcile.

CREATE TABLE public.shop_sales_hour (
    shop_id          uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    bucket_start     timestamptz NOT NULL,
    gross_goods      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (gross_goods >= 0),
    refunds          numeric(12, 2) NOT NULL DEFAULT 0 CHECK (refunds >= 0),
    refunded_orders  int NOT NULL DEFAULT 0 CHECK (refunded_orders >= 0),
    orders           int NOT NULL DEFAULT 0 CHECK (orders >= 0),
    units            int NOT NULL DEFAULT 0 CHECK (units >= 0),
    cant_supply      int NOT NULL DEFAULT 0 CHECK (cant_supply >= 0),
    cant_supply_units int NOT NULL DEFAULT 0 CHECK (cant_supply_units >= 0),
    cancelled        int NOT NULL DEFAULT 0 CHECK (cancelled >= 0),
    computed_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, bucket_start)
);

COMMENT ON TABLE public.shop_sales_hour IS
    'Per-shop, per-local-hour prepared figures for the Insights screen (058). The screen reads ONLY this and shop_product_sales_day — never raw orders (FR-026), which is why opening Insights costs a bounded indexed scan instead of an aggregate over the shop''s whole history. Rows exist only for hours with activity.';
COMMENT ON COLUMN public.shop_sales_hour.bucket_start IS
    'From public.shop_local_hour(): the UTC instant the local hour began. Days and weeks are derived at read time with AT TIME ZONE, so no second bucketing rule exists.';
COMMENT ON COLUMN public.shop_sales_hour.gross_goods IS
    'Σ this shop''s order_item.line_subtotal_amount on orders PAID in this hour. Goods only — the delivery fee and any order-level discount are Effy''s, set for the whole order, and counting them per shop would count one fee in several shops (FR-032).';
COMMENT ON COLUMN public.shop_sales_hour.refunds IS
    '⚠ Refunds attributed to this shop and ISSUED in this hour — NOT in the hour of the sale (FR-032, research R4). Shopify''s sales reports date every reversal on the day it was processed, and that is what keeps a reported past day stable: a refund next week cannot silently change what yesterday said. Revenue for a window is Σ gross_goods − Σ refunds.';
COMMENT ON COLUMN public.shop_sales_hour.cant_supply IS
    'Portions moved to unfulfillable in this hour, read from fulfillment_event rather than shop_fulfillment.status — the event is append-only, while state_changed_at is overwritten by the next transition, and a rollup must be recomputable from facts that do not move.';

CREATE TABLE public.shop_product_sales_day (
    shop_id     uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    local_date  date NOT NULL,
    product_id  uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    units       int NOT NULL CHECK (units >= 0),
    gross_goods numeric(12, 2) NOT NULL CHECK (gross_goods >= 0),
    PRIMARY KEY (shop_id, local_date, product_id)
);

COMMENT ON TABLE public.shop_product_sales_day IS
    'Per-shop, per-local-day, per-product sales for the Insights "Top products" list (058). Daily is the finest grain that list ever needs — its shortest range is one local day. Name, SKU and image are joined from public.product at read time, so a renamed product shows its current name rather than a stale copy.';

CREATE INDEX shop_product_sales_day_product_idx ON public.shop_product_sales_day (product_id);

-- ── The work queue ──────────────────────────────────────────────────────────────────────────────
--
-- ⚠ THIS TABLE IS THE DURABLE QUEUE, which is why the slice needs no dead-letter queue: a rollup
-- run that fails leaves its rows exactly where they were, and the next run (a minute later) picks
-- them up. The alarm is on the AGE of the oldest row, because that is the honest measure of "how
-- far behind are the figures" — a count says nothing about how long anyone has been waiting.

CREATE TABLE public.insights_dirty (
    shop_id      uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    bucket_start timestamptz NOT NULL,
    marked_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, bucket_start)
);

COMMENT ON TABLE public.insights_dirty IS
    'Buckets whose figures may be out of date (058). Written by triggers inside the SAME transaction as the change, so a crash between the change and the mark is impossible; drained by the scheduled rollup, which recomputes each bucket from source. ON CONFLICT DO NOTHING keeps the FIRST marked_at, so the oldest row measures the real lag.';
COMMENT ON COLUMN public.insights_dirty.marked_at IS
    'Kept from the first mark, never bumped — this is the backlog-age alarm''s input (FR-027, SC-004).';

CREATE INDEX insights_dirty_marked_idx ON public.insights_dirty (marked_at);

CREATE TABLE public.insights_state (
    shop_id     uuid PRIMARY KEY REFERENCES public.shop (id) ON DELETE CASCADE,
    timezone    text NOT NULL,
    computed_at timestamptz NOT NULL
);

COMMENT ON TABLE public.insights_state IS
    'Per-shop rollup watermark (058). computed_at is what the Insights subtitle reports ("updated a moment ago") — a claim about freshness the screen must be able to make honestly. timezone records what the rollups were BUILT under: if it no longer matches public.shop.timezone, every bucket boundary for that shop has moved and the nightly reconcile rebuilds it rather than leaving two eras of buckets mixed together.';

-- ── Triggers: the poke, and the dirty mark ──────────────────────────────────────────────────────
--
-- Two helpers keep the trigger bodies to the two permitted statements.

-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_poke(p_shop_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    -- Identical payloads within one transaction collapse to a single delivered notification, so a
    -- twenty-line pick recorded in one transaction wakes an open console once, not twenty times.
    PERFORM pg_notify('shop_ops', p_shop_id::text);
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_mark_dirty(p_shop_id uuid, p_at timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_tz text;
BEGIN
    SELECT timezone INTO v_tz FROM public.shop WHERE id = p_shop_id;
    IF v_tz IS NULL OR p_at IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO public.insights_dirty (shop_id, bucket_start)
    VALUES (p_shop_id, public.shop_local_hour(p_at, v_tz))
    ON CONFLICT DO NOTHING;
END;
$$;
-- +goose StatementEnd

COMMENT ON FUNCTION public.shop_ops_poke(uuid) IS
    'Tell every console open on this shop that something changed (058). Content-free by design: the browser refetches the snapshot, so a duplicated or reordered poke costs one redundant request and can never produce a duplicated row.';
COMMENT ON FUNCTION public.shop_ops_mark_dirty(uuid, timestamptz) IS
    'Mark the bucket containing `p_at` (in the shop''s own timezone) as needing recomputation (058).';

-- Portions: created by the payment fan-out, advanced by the shop, the driver and back-office.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_portion_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.shop_ops_poke(NEW.shop_id);
    -- Only the two terminal declarations move an Insights figure; every other transition is
    -- operational and shows up on Today without touching a rollup.
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('unfulfillable', 'withdrawn') THEN
        PERFORM public.shop_ops_mark_dirty(NEW.shop_id, now());
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_portion_ins AFTER INSERT ON public.shop_fulfillment
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_portion_changed();
CREATE TRIGGER shop_ops_portion_upd AFTER UPDATE OF status ON public.shop_fulfillment
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_portion_changed();

-- Pick progress: gathered and unavailable counts drive the attention list and the refund proposals.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_item_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    SELECT shop_id INTO v_shop_id FROM public.shop_fulfillment WHERE id = NEW.shop_fulfillment_id;
    IF v_shop_id IS NOT NULL THEN
        PERFORM public.shop_ops_poke(v_shop_id);
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_item_ins AFTER INSERT ON public.fulfillment_item
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_item_changed();
CREATE TRIGGER shop_ops_item_upd
    AFTER UPDATE OF gathered_quantity, unavailable_quantity ON public.fulfillment_item
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_item_changed();

-- Stock: the out-of-stock and below-threshold rows on Today come from these four columns.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_product_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.shop_ops_poke(NEW.shop_id);
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_product_upd
    AFTER UPDATE OF stock_on_hand, low_stock_threshold, stock_tracked, status ON public.product
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_product_changed();

-- An order becoming paid (or cancelled) is the one event that changes a shop's revenue for a past
-- hour, and it touches every shop with goods on that order.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_order_status_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;
    FOR v_shop_id IN SELECT DISTINCT shop_id FROM public.order_item WHERE order_id = NEW.id LOOP
        PERFORM public.shop_ops_poke(v_shop_id);
        PERFORM public.shop_ops_mark_dirty(v_shop_id, COALESCE(NEW.placed_at, NEW.created_at));
    END LOOP;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_order_status AFTER UPDATE OF status ON public."order"
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_order_status_changed();

-- Refunds: created, and then settling or failing later. Marked against the hour the refund was
-- ISSUED (FR-032), which is the bucket its figures belong to whichever way it ends.
-- ⚠ Every shop with goods on the order is marked, not only shops named by refund_line: a
-- cancellation refund names no lines at all, and recomputing a bucket that did not change is free.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_refund_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;
    FOR v_shop_id IN SELECT DISTINCT shop_id FROM public.order_item WHERE order_id = NEW.order_id LOOP
        PERFORM public.shop_ops_poke(v_shop_id);
        PERFORM public.shop_ops_mark_dirty(v_shop_id, NEW.created_at);
    END LOOP;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_refund_ins AFTER INSERT ON public.refund
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_refund_changed();
CREATE TRIGGER shop_ops_refund_upd AFTER UPDATE OF status ON public.refund
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_refund_changed();

-- Dismissing a proposed refund removes a row from the attention list, so the console must hear it.
-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_dismissal_added() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    SELECT shop_id INTO v_shop_id FROM public.shop_fulfillment WHERE id = NEW.shop_fulfillment_id;
    IF v_shop_id IS NOT NULL THEN
        PERFORM public.shop_ops_poke(v_shop_id);
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER shop_ops_dismissal_ins AFTER INSERT ON public.refund_proposal_dismissal
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_dismissal_added();

-- ── Backfill: mark every bucket that already has history ────────────────────────────────────────
--
-- The rollup job builds history by draining this queue, so the tables start empty and fill in
-- minutes rather than needing a separate one-off script that could drift from the job's own rules.

INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT oi.shop_id, public.shop_local_hour(COALESCE(o.placed_at, o.created_at), s.timezone)
  FROM public.order_item oi
  JOIN public."order" o ON o.id = oi.order_id
  JOIN public.shop     s ON s.id = oi.shop_id
 WHERE o.status IN ('paid', 'canceled')
 GROUP BY 1, 2
ON CONFLICT DO NOTHING;

INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT oi.shop_id, public.shop_local_hour(r.created_at, s.timezone)
  FROM public.refund r
  JOIN public.order_item oi ON oi.order_id = r.order_id
  JOIN public.shop       s  ON s.id = oi.shop_id
 GROUP BY 1, 2
ON CONFLICT DO NOTHING;

INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT sf.shop_id, public.shop_local_hour(fe.occurred_at, s.timezone)
  FROM public.fulfillment_event fe
  JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
  JOIN public.shop             s  ON s.id = sf.shop_id
 WHERE fe.to_status IN ('unfulfillable', 'withdrawn')
 GROUP BY 1, 2
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TRIGGER IF EXISTS shop_ops_dismissal_ins ON public.refund_proposal_dismissal;
DROP TRIGGER IF EXISTS shop_ops_refund_upd ON public.refund;
DROP TRIGGER IF EXISTS shop_ops_refund_ins ON public.refund;
DROP TRIGGER IF EXISTS shop_ops_order_status ON public."order";
DROP TRIGGER IF EXISTS shop_ops_product_upd ON public.product;
DROP TRIGGER IF EXISTS shop_ops_item_upd ON public.fulfillment_item;
DROP TRIGGER IF EXISTS shop_ops_item_ins ON public.fulfillment_item;
DROP TRIGGER IF EXISTS shop_ops_portion_upd ON public.shop_fulfillment;
DROP TRIGGER IF EXISTS shop_ops_portion_ins ON public.shop_fulfillment;
DROP FUNCTION IF EXISTS public.shop_ops_dismissal_added();
DROP FUNCTION IF EXISTS public.shop_ops_refund_changed();
DROP FUNCTION IF EXISTS public.shop_ops_order_status_changed();
DROP FUNCTION IF EXISTS public.shop_ops_product_changed();
DROP FUNCTION IF EXISTS public.shop_ops_item_changed();
DROP FUNCTION IF EXISTS public.shop_ops_portion_changed();
DROP FUNCTION IF EXISTS public.shop_ops_mark_dirty(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.shop_ops_poke(uuid);
DROP TABLE IF EXISTS public.insights_state;
DROP TABLE IF EXISTS public.insights_dirty;
DROP TABLE IF EXISTS public.shop_product_sales_day;
DROP TABLE IF EXISTS public.shop_sales_hour;
DROP FUNCTION IF EXISTS public.shop_local_hour(timestamptz, text);
ALTER TABLE public.shop DROP COLUMN IF EXISTS timezone;
