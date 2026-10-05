-- +goose Up
-- 070-retire-core-api: the shop console's live updates are withdrawn, so nothing listens any more.
--
-- 058 had every operational change tell open consoles "read again" through a database notification
-- (`pg_notify('shop_ops', <shop id>)`), relayed to browsers by a stream held open on the always-on
-- backend. 070 retires that backend, and the operator chose to drop the stream rather than rebuild
-- it: the console re-reads on its existing 30-second refresh, and the under-ten-seconds target is
-- withdrawn (spec Clarifications, 2026-10-04).
--
-- ⚠ A NOTIFICATION WITH NO LISTENER IS NOT FREE. Every trigger below fired one on every pick, every
-- stock change and every order. Left in place it would be work done on the busiest write paths of
-- the platform to tell nobody anything — and a function whose comment claims consoles are told.
--
-- ⚠ WHAT IS NOT TOUCHED, and it is most of 058: `shop_ops_mark_dirty`, the `insights_dirty` table
-- and EVERY trigger. Insights' rollups are still marked for recomputation exactly as before; only
-- the notification is removed. Each function is replaced with the same body minus that one call.
--
-- ⚠ THREE OF THE SIX NOW DO NOTHING (`shop_ops_item_changed`, `shop_ops_product_changed`,
-- `shop_ops_dismissal_added`): the notification was all they did. They and their triggers are
-- deliberately KEPT as empty hooks rather than dropped — the triggers are the record of which
-- changes a shop's screens depend on, and whatever replaces the stream will want exactly this list.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_portion_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_item_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_product_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_order_status_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;
    FOR v_shop_id IN SELECT DISTINCT shop_id FROM public.order_item WHERE order_id = NEW.id LOOP
        PERFORM public.shop_ops_mark_dirty(v_shop_id, COALESCE(NEW.placed_at, NEW.created_at));
    END LOOP;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_refund_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NULL;
    END IF;
    FOR v_shop_id IN SELECT DISTINCT shop_id FROM public.order_item WHERE order_id = NEW.order_id LOOP
        PERFORM public.shop_ops_mark_dirty(v_shop_id, NEW.created_at);
    END LOOP;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_dismissal_added() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

DROP FUNCTION public.shop_ops_poke(uuid);

-- +goose Down
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

COMMENT ON FUNCTION public.shop_ops_poke(uuid) IS
    'Tell every console open on this shop that something changed (058). Content-free by design: the browser refetches the snapshot, so a duplicated or reordered poke costs one redundant request and can never produce a duplicated row.';

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_portion_changed() RETURNS trigger
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_item_changed() RETURNS trigger
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_product_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.shop_ops_poke(NEW.shop_id);
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_order_status_changed() RETURNS trigger
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_refund_changed() RETURNS trigger
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

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.shop_ops_dismissal_added() RETURNS trigger
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
