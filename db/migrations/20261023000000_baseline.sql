-- +goose Up
-- The whole schema and its reference data. Shopper-facing services connect as effy_shopper, a
-- connection-limited role (DML on public only); `make db-shopper-role` gives it a password.
-- +goose StatementBegin
SET LOCAL check_function_bodies = false;

DO $$
BEGIN
    -- A role belongs to the cluster, not the database, so it may already exist.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effy_shopper') THEN
        CREATE ROLE effy_shopper NOLOGIN CONNECTION LIMIT 40;
    END IF;
END
$$;

CREATE SCHEMA admin;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE FUNCTION public.courier_delivery_state() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    s public.delivery_settings%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.delivery_settings WHERE id = 1;
    IF NOT COALESCE(s.courier_offered, false) THEN
        RETURN 'courier_off';
    END IF;
    -- On, but nothing can sell it yet: no courier fee table, or no default courier service.
    IF NOT EXISTS (SELECT 1 FROM public.courier_service c WHERE c.is_default AND c.status = 'active')
       OR NOT EXISTS (SELECT 1 FROM public.delivery_fee_plan p WHERE p.kind = 'courier' AND p.is_active) THEN
        RETURN 'courier_not_ready';
    END IF;
    RETURN 'courier_offered';
END
$$;

CREATE FUNCTION public.courier_parcel_collection(p_delivery_type text, p_mode text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT CASE WHEN p_delivery_type = 'courier' AND p_mode = 'supplier' THEN 'supplier' ELSE 'hub' END;
$$;

CREATE FUNCTION public.courier_reaches_postcode(p_postcode text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_state text;
BEGIN
    -- A courier cannot be booked to a place the country's place data does not know.
    IF NOT EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = p_postcode) THEN
        RETURN 'unknown_postcode';
    END IF;
    v_state := public.courier_delivery_state();
    IF v_state = 'courier_off' THEN
        RETURN v_state;
    END IF;
    IF EXISTS (SELECT 1 FROM public.courier_excluded_postcode x WHERE x.postcode = p_postcode) THEN
        RETURN 'courier_excluded';
    END IF;
    RETURN v_state;
END
$$;

CREATE FUNCTION public.coverage_computed_distance_km(p_postcode text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
    SELECT round(public.haversine_km(s.hub_latitude, s.hub_longitude, l.latitude, l.longitude), 2)
      FROM public.delivery_settings s
      CROSS JOIN LATERAL (
          SELECT latitude, longitude
            FROM public.locality
           WHERE postcode = p_postcode AND latitude IS NOT NULL AND longitude IS NOT NULL
           ORDER BY address_count DESC, name
           LIMIT 1
      ) l
     WHERE s.id = 1;
$$;

CREATE FUNCTION public.coverage_for_postcode(p_postcode text) RETURNS TABLE(kind text, reason text, distance_km numeric, group_id uuid, group_name text, today_offered boolean)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_reason text;
BEGIN
    -- On Effy's list: delivered by Effy. Nothing else is consulted (not the group's status, not a courier
    -- exclusion, not a shop).
    RETURN QUERY
        SELECT 'effy'::text, 'listed'::text, zp.distance_km, z.id, z.name, zp.today_offered
          FROM public.delivery_zone_postcode zp
          LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
         WHERE zp.postcode = p_postcode;
    IF FOUND THEN
        RETURN;
    END IF;
    -- Not listed: today_offered is true so that it restricts nothing.
    v_reason := public.courier_reaches_postcode(p_postcode);
    RETURN QUERY SELECT CASE WHEN v_reason = 'courier_offered' THEN 'courier' ELSE 'none' END,
                        v_reason, NULL::numeric, NULL::uuid, NULL::text, true;
END
$$;

CREATE FUNCTION public.delivery_plan_activate(p_plan uuid, p_actor text, p_confirm_zero_floor boolean) RETURNS TABLE(plan_id uuid, retired_id uuid)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_plan    public.delivery_fee_plan%ROWTYPE;
    v_gaps    jsonb;
    v_retired uuid;
BEGIN
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    -- One activation at a time per kind. Two managers pressing Activate together queue here; the
    -- second sees the first's result.
    PERFORM pg_advisory_xact_lock(hashtext('delivery_fee_plan:' || v_plan.kind));
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;

    IF v_plan.is_active THEN
        RAISE EXCEPTION 'plan_already_active';
    END IF;
    -- A retired plan is copied to a new draft, never brought back: the record of what was in force
    -- and when stays one line per plan.
    IF v_plan.activated_at IS NOT NULL THEN
        RAISE EXCEPTION 'plan_retired';
    END IF;

    SELECT jsonb_agg(jsonb_build_object('code', g.code, 'blocking', g.blocking, 'detail', g.detail))
      INTO v_gaps
      FROM public.delivery_plan_gaps(p_plan) g
     WHERE g.blocking;
    IF v_gaps IS NOT NULL THEN
        RAISE EXCEPTION 'plan_incomplete' USING DETAIL = v_gaps::text;
    END IF;

    IF v_plan.floor_amount = 0 AND NOT COALESCE(p_confirm_zero_floor, false) THEN
        RAISE EXCEPTION 'zero_floor_unconfirmed';
    END IF;

    -- ⚠ Deactivate FIRST, as its own statement: a partial unique index is checked row by row, so one
    -- UPDATE that swaps both can fail on row order. Nobody can observe the moment in between — it is
    -- inside this function's transaction.
    UPDATE public.delivery_fee_plan f
       SET is_active = false
     WHERE f.kind = v_plan.kind AND f.is_active
    RETURNING f.id INTO v_retired;

    UPDATE public.delivery_fee_plan f
       SET is_active = true, activated_by = p_actor, activated_at = now()
     WHERE f.id = p_plan;

    RETURN QUERY SELECT p_plan, v_retired;
END
$$;

CREATE FUNCTION public.delivery_plan_gaps(p_plan uuid) RETURNS TABLE(code text, blocking boolean, detail jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_plan public.delivery_fee_plan%ROWTYPE;
BEGIN
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_plan.kind = 'effy' THEN
        IF NOT EXISTS (SELECT 1 FROM public.delivery_distance_band b WHERE b.plan_id = p_plan) THEN
            RETURN QUERY SELECT 'distance_bands_missing'::text, true, '{}'::jsonb;
        ELSIF NOT EXISTS (SELECT 1 FROM public.delivery_distance_band b WHERE b.plan_id = p_plan AND b.upper_km IS NULL) THEN
            RETURN QUERY SELECT 'distance_open_band_missing'::text, true,
                jsonb_build_object('lastUpperKm', (SELECT max(b.upper_km) FROM public.delivery_distance_band b WHERE b.plan_id = p_plan));
        END IF;

        -- A farther delivery may not cost less than a nearer one (077 FR-007).
        RETURN QUERY
            SELECT 'distance_not_monotonic'::text, true,
                   jsonb_build_object('lowerKm', o.prev_km, 'lowerAmount', o.prev_amount,
                                      'upperKm', o.upper_km, 'upperAmount', o.add_amount)
              FROM (SELECT b.upper_km, b.add_amount,
                           lag(b.upper_km)   OVER w AS prev_km,
                           lag(b.add_amount) OVER w AS prev_amount
                      FROM public.delivery_distance_band b
                     WHERE b.plan_id = p_plan
                    WINDOW w AS (ORDER BY b.upper_km NULLS LAST)) o
             WHERE o.prev_amount IS NOT NULL AND o.add_amount < o.prev_amount;

        RETURN QUERY
            SELECT 'premium_on_disabled_slot'::text, false,
                   jsonb_build_object('slotId', s.id, 'start', to_char(s.start_time, 'HH24:MI'), 'end', to_char(s.end_time, 'HH24:MI'))
              FROM public.delivery_slot_premium p
              JOIN public.delivery_slot s ON s.id = p.slot_id
             WHERE p.plan_id = p_plan AND s.status <> 'active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.delivery_weight_band b WHERE b.plan_id = p_plan) THEN
        RETURN QUERY SELECT 'weight_bands_missing'::text, true, '{}'::jsonb;
    END IF;

    -- A heavier basket may not cost less than a lighter one.
    RETURN QUERY
        SELECT 'weight_not_monotonic'::text, true,
               jsonb_build_object('lowerGrams', o.prev_grams, 'lowerAmount', o.prev_amount,
                                  'upperGrams', o.upper_grams, 'upperAmount', o.add_amount)
          FROM (SELECT b.upper_grams, b.add_amount,
                       lag(b.upper_grams) OVER w AS prev_grams,
                       lag(b.add_amount)  OVER w AS prev_amount
                  FROM public.delivery_weight_band b
                 WHERE b.plan_id = p_plan
                WINDOW w AS (ORDER BY b.upper_grams)) o
         WHERE o.prev_amount IS NOT NULL AND o.add_amount < o.prev_amount;

    -- Not a gap in the pricing — a thing a person must have meant. Delivery can then be $0 without
    -- the free-delivery amount, so activation asks for it to be confirmed.
    IF v_plan.floor_amount = 0 THEN
        RETURN QUERY SELECT 'floor_is_zero'::text, false, '{}'::jsonb;
    END IF;
END
$_$;

CREATE FUNCTION public.haversine_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
    SELECT (6371 * 2 * asin(least(1, sqrt(
        power(sin(radians((lat2 - lat1)::float8) / 2), 2)
        + cos(radians(lat1::float8)) * cos(radians(lat2::float8))
          * power(sin(radians((lon2 - lon1)::float8) / 2), 2)
    ))))::numeric;
$$;

CREATE FUNCTION public.new_package_code() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    candidate text;
BEGIN
    LOOP
        candidate := '';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM public.shop_fulfillment WHERE package_code = candidate)
           AND NOT EXISTS (SELECT 1 FROM public.package_parcel WHERE parcel_code = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END
$$;

CREATE FUNCTION public.new_parcel_code() RETURNS text
    LANGUAGE sql
    AS $$ SELECT public.new_package_code() $$;

CREATE FUNCTION public.new_variant_code() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    candidate text;
BEGIN
    LOOP
        candidate := 'V';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM public.product_variant WHERE code = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END
$$;

CREATE FUNCTION public.package_coldest_zone(p_fulfillment uuid) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT CASE WHEN bool_or(oi.storage_class = 'frozen')  THEN 'frozen'
                WHEN bool_or(oi.storage_class = 'chilled') THEN 'chilled'
                ELSE 'ambient' END
      FROM public.shop_fulfillment sf
      LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
     WHERE sf.id = p_fulfillment
$$;

CREATE FUNCTION public.points_usable(p_customer uuid, p_at timestamp with time zone, p_except_order uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
    SELECT (
        COALESCE((
            SELECT SUM(e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a
                                             WHERE a.credit_entry_id = e.id), 0))
              FROM public.points_entry e
             WHERE e.customer_id = p_customer
               AND e.points > 0
               AND e.expires_at > p_at
        ), 0)
        - COALESCE((
            SELECT SUM(h.points)
              FROM public.points_hold h
             WHERE h.customer_id = p_customer
               AND h.state = 'held'
               AND h.held_until > p_at
               AND h.order_id IS DISTINCT FROM p_except_order
        ), 0)
    )::int
$$;

CREATE FUNCTION public.promotion_is_used(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    SELECT EXISTS (SELECT 1 FROM public.promotion_use WHERE promotion_id = p_id AND status IN ('held', 'confirmed'))
$$;

CREATE FUNCTION public.promotion_state(p_id uuid, p_at timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT CASE
        WHEN p.archived_at IS NOT NULL THEN 'archived'
        WHEN p.published_at IS NULL THEN 'draft'
        WHEN (p.ended_at IS NOT NULL AND p.ended_at <= p_at) OR (p.ends_at IS NOT NULL AND p.ends_at <= p_at) THEN 'ended'
        WHEN p.paused THEN 'paused'
        WHEN p.starts_at IS NOT NULL AND p.starts_at > p_at THEN 'scheduled'
        WHEN p.max_uses IS NOT NULL AND u.uses >= p.max_uses THEN 'used_up'
        WHEN p.budget_amount IS NOT NULL AND u.given >= p.budget_amount THEN 'out_of_budget'
        ELSE 'active'
    END
    FROM public.promotion p
    CROSS JOIN LATERAL (
        SELECT count(*) AS uses, coalesce(sum(x.goods_amount + x.delivery_amount), 0) AS given
          FROM public.promotion_use x
         WHERE x.promotion_id = p.id
           AND (x.status = 'confirmed' OR (x.status = 'held' AND x.hold_expires_at > p_at))
    ) u
    WHERE p.id = p_id
$$;

CREATE FUNCTION public.round_opens_at(p_kind text, p_deadline_at timestamp with time zone, p_window_start_at timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    AS $$
    SELECT CASE
             WHEN p_kind = 'collection'
               THEN p_deadline_at - make_interval(mins => s.lead)
             WHEN p_window_start_at IS NOT NULL
               THEN p_window_start_at - make_interval(mins => s.lead)
             ELSE NULL
           END
      FROM (SELECT COALESCE((SELECT planning_lead_min FROM public.delivery_settings WHERE id = 1), 45) AS lead) s
$$;

CREATE FUNCTION public.shop_local_hour(ts timestamp with time zone, tz text) RETURNS timestamp with time zone
    LANGUAGE sql STABLE STRICT
    AS $$
    SELECT (date_trunc('hour', ts AT TIME ZONE tz)
            - ((ts AT TIME ZONE tz) - (ts AT TIME ZONE 'UTC'))) AT TIME ZONE 'UTC';
$$;

CREATE FUNCTION public.shop_ops_mark_dirty(p_shop_id uuid, p_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION public.shop_ops_order_item_added() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_placed timestamptz;
BEGIN
    SELECT COALESCE(o.placed_at, o.created_at) INTO v_placed
      FROM public."order" o
     WHERE o.id = NEW.order_id;

    PERFORM public.shop_ops_mark_dirty(NEW.shop_id, v_placed);
    RETURN NULL;
END;
$$;

CREATE FUNCTION public.shop_ops_order_status_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION public.shop_ops_portion_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION public.shop_ops_refund_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE TABLE admin.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_sub text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE admin.role (
    key text NOT NULL,
    description text NOT NULL,
    CONSTRAINT role_key_check CHECK ((key = ANY (ARRAY['admin'::text, 'manager'::text, 'csa'::text])))
);

CREATE TABLE admin.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_sub text NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    name text,
    CONSTRAINT staff_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE admin.staff_role (
    staff_id uuid NOT NULL,
    role_key text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assignment_exclusion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    driver_id uuid,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text NOT NULL,
    CONSTRAINT assignment_exclusion_kind_check CHECK ((kind = ANY (ARRAY['collection'::text, 'delivery'::text]))),
    CONSTRAINT assignment_exclusion_reason_check CHECK ((reason = ANY (ARRAY['not_on_duty'::text, 'not_employable'::text, 'licence_expired'::text, 'no_vehicle'::text, 'not_cleared'::text, 'no_refrigeration'::text, 'over_capacity'::text, 'cannot_meet_deadline'::text])))
);

CREATE TABLE public.attribute_allowed_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribute_definition_id uuid NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.attribute_definition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    data_type text NOT NULL,
    unit text,
    help_text text,
    validation jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attribute_definition_data_type_check CHECK ((data_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'number'::text, 'boolean'::text, 'single_select'::text, 'multi_select'::text]))),
    CONSTRAINT attribute_definition_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

CREATE TABLE public.business_tax (
    id boolean DEFAULT true NOT NULL,
    legal_name text,
    abn text,
    fee_treatment text,
    invoices_enabled boolean DEFAULT false NOT NULL,
    updated_by_sub text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_tax_abn_check CHECK (((abn IS NULL) OR (abn ~ '^[0-9]{11}$'::text))),
    CONSTRAINT business_tax_enabled_complete CHECK (((NOT invoices_enabled) OR ((legal_name IS NOT NULL) AND (abn IS NOT NULL) AND (fee_treatment IS NOT NULL)))),
    CONSTRAINT business_tax_fee_treatment_check CHECK (((fee_treatment IS NULL) OR (fee_treatment = ANY (ARRAY['taxable'::text, 'gst_free'::text])))),
    CONSTRAINT business_tax_id_check CHECK (id),
    CONSTRAINT business_tax_legal_name_check CHECK (((legal_name IS NULL) OR ((length(btrim(legal_name)) >= 2) AND (length(btrim(legal_name)) <= 200))))
);

CREATE TABLE public.carrier_handoff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    reference text,
    carrier_name text,
    handed_over_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_by_sub text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.cart (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    promo_applied_at timestamp with time zone,
    promotion_code_id uuid
);

CREATE TABLE public.cart_change_log (
    cart_id uuid NOT NULL,
    change_id uuid NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.cart_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_price_at_add numeric(12,2),
    variant_id uuid NOT NULL,
    CONSTRAINT cart_item_quantity_check CHECK (((quantity > 0) AND (quantity <= 99))),
    CONSTRAINT cart_item_unit_price_at_add_check CHECK ((unit_price_at_add >= (0)::numeric))
);

CREATE TABLE public.cart_saved_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_at_add numeric(12,2),
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid NOT NULL,
    CONSTRAINT cart_saved_item_quantity_check CHECK (((quantity > 0) AND (quantity <= 99))),
    CONSTRAINT cart_saved_item_unit_price_at_add_check CHECK ((unit_price_at_add >= (0)::numeric))
);

CREATE TABLE public.category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

CREATE TABLE public.courier_consignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    courier_service_id uuid NOT NULL,
    collection text NOT NULL,
    reference text,
    tracking_url text,
    label_key text,
    pickup_date date,
    pickup_from time without time zone,
    pickup_to time without time zone,
    state text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_consignment_collection_check CHECK ((collection = ANY (ARRAY['hub'::text, 'supplier'::text]))),
    CONSTRAINT courier_consignment_label_key_check CHECK (((label_key IS NULL) OR (label_key ~ '^courier-label/'::text))),
    CONSTRAINT courier_consignment_reference_check CHECK (((reference IS NULL) OR ((length(btrim(reference)) >= 1) AND (length(btrim(reference)) <= 100)))),
    CONSTRAINT courier_consignment_state_check CHECK ((state = ANY (ARRAY['booked'::text, 'handed_over'::text, 'in_transit'::text, 'delivered'::text, 'failed'::text, 'lost'::text, 'damaged'::text, 'returned'::text, 'cancelled'::text]))),
    CONSTRAINT courier_consignment_tracking_url_check CHECK (((tracking_url IS NULL) OR ((tracking_url ~ '^https://'::text) AND (length(tracking_url) <= 500)))),
    CONSTRAINT courier_consignment_window_ck CHECK ((((pickup_from IS NULL) = (pickup_to IS NULL)) AND ((pickup_from IS NULL) OR (pickup_from < pickup_to)))),
    CONSTRAINT courier_consignment_window_date_ck CHECK (((pickup_from IS NULL) OR (pickup_date IS NOT NULL)))
);

CREATE TABLE public.courier_consignment_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consignment_id uuid NOT NULL,
    kind text NOT NULL,
    actor_kind text NOT NULL,
    actor_sub text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_consignment_event_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['staff'::text, 'shop'::text]))),
    CONSTRAINT courier_consignment_event_kind_check CHECK ((kind = ANY (ARRAY['booked'::text, 'handed_over'::text, 'in_transit'::text, 'delivered'::text, 'failed'::text, 'lost'::text, 'damaged'::text, 'returned'::text, 'resolved'::text, 'cancelled'::text]))),
    CONSTRAINT courier_consignment_event_note_check CHECK (((note IS NULL) OR (length(note) <= 500)))
);

CREATE TABLE public.courier_excluded_postcode (
    postcode text NOT NULL,
    reason text NOT NULL,
    added_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_excluded_postcode_postcode_check CHECK ((postcode ~ '^[0-9]{4}$'::text)),
    CONSTRAINT courier_excluded_postcode_reason_check CHECK (((length(btrim(reason)) >= 3) AND (length(btrim(reason)) <= 200)))
);

CREATE TABLE public.courier_service (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_name text NOT NULL,
    service_name text NOT NULL,
    estimate_text text NOT NULL,
    max_business_days integer NOT NULL,
    pickup_weekdays integer[] NOT NULL,
    pickup_cutoff time without time zone NOT NULL,
    collects_from_supplier boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_service_courier_name_check CHECK (((length(btrim(courier_name)) >= 2) AND (length(btrim(courier_name)) <= 60))),
    CONSTRAINT courier_service_default_active_ck CHECK (((NOT is_default) OR (status = 'active'::text))),
    CONSTRAINT courier_service_estimate_text_check CHECK (((estimate_text = btrim(estimate_text)) AND ((length(estimate_text) >= 3) AND (length(estimate_text) <= 60)) AND (estimate_text !~ '[\n\r]'::text))),
    CONSTRAINT courier_service_max_business_days_check CHECK (((max_business_days >= 1) AND (max_business_days <= 30))),
    CONSTRAINT courier_service_pickup_weekdays_check CHECK ((((cardinality(pickup_weekdays) >= 1) AND (cardinality(pickup_weekdays) <= 7)) AND (pickup_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]))),
    CONSTRAINT courier_service_service_name_check CHECK (((length(btrim(service_name)) >= 2) AND (length(btrim(service_name)) <= 60))),
    CONSTRAINT courier_service_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

CREATE TABLE public.customer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_sub text NOT NULL,
    email public.citext NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    given_name text,
    family_name text,
    has_password boolean DEFAULT false NOT NULL,
    password_updated_at timestamp with time zone,
    phone text,
    closure_state text DEFAULT 'open'::text NOT NULL,
    stripe_customer_id text,
    CONSTRAINT customer_closure_state_check CHECK ((closure_state = ANY (ARRAY['open'::text, 'closing'::text]))),
    CONSTRAINT customer_status_check CHECK ((status = ANY (ARRAY['active'::text, 'barred'::text])))
);

CREATE TABLE public.customer_address (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    label text,
    recipient_name text NOT NULL,
    phone text,
    line1 text NOT NULL,
    line2 text,
    city text NOT NULL,
    region text,
    postal_code text NOT NULL,
    country character(2) DEFAULT 'AU'::bpchar NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_delivery_handover text,
    default_delivery_note text,
    CONSTRAINT customer_address_default_handover_check CHECK (((default_delivery_handover IS NULL) OR (default_delivery_handover = ANY (ARRAY['leave_at_door'::text, 'meet_at_door'::text])))),
    CONSTRAINT customer_address_default_note_check CHECK (((default_delivery_note IS NULL) OR ((char_length(default_delivery_note) <= 250) AND (btrim(default_delivery_note) <> ''::text))))
);

CREATE TABLE public.customer_closure_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    erase_after timestamp with time zone NOT NULL,
    verification_method text NOT NULL,
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_closure_request_cancelled_reason_check CHECK ((cancelled_reason = 'restored_by_customer'::text)),
    CONSTRAINT customer_closure_request_verification_method_check CHECK ((verification_method = 'email_code'::text))
);

CREATE TABLE public.customer_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_list_name_ck CHECK (((is_default AND (name IS NULL)) OR ((NOT is_default) AND (name IS NOT NULL) AND ((char_length(name) >= 1) AND (char_length(name) <= 40)) AND (name = btrim(name)))))
);

CREATE TABLE public.customer_list_entry (
    list_id uuid NOT NULL,
    product_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_saved_item (
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    saved_price_amount numeric(12,2) NOT NULL,
    saved_currency text NOT NULL,
    saved_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid
);

CREATE TABLE public.delivery_attempt_failure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stop_id uuid NOT NULL,
    reason text NOT NULL,
    note text,
    driver_id uuid NOT NULL,
    failed_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    change_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolution_outcome text,
    resolution_note text,
    CONSTRAINT delivery_attempt_failure_other_note CHECK (((resolution_outcome IS DISTINCT FROM 'other'::text) OR (length(btrim(COALESCE(resolution_note, ''::text))) > 0))),
    CONSTRAINT delivery_attempt_failure_other_note_check CHECK (((reason <> 'other'::text) OR ((note IS NOT NULL) AND (btrim(note) <> ''::text)))),
    CONSTRAINT delivery_attempt_failure_outcome_resolved CHECK (((resolution_outcome IS NULL) OR (resolved_at IS NOT NULL))),
    CONSTRAINT delivery_attempt_failure_reason_check CHECK ((reason = ANY (ARRAY['nobody_home'::text, 'wrong_address'::text, 'customer_refused'::text, 'access_blocked'::text, 'other'::text]))),
    CONSTRAINT delivery_attempt_failure_resolution_note_check CHECK (((resolution_note IS NULL) OR (length(resolution_note) <= 500))),
    CONSTRAINT delivery_attempt_failure_resolution_outcome_check CHECK ((resolution_outcome = ANY (ARRAY['redelivered'::text, 'refunded'::text, 'collected'::text, 'other'::text])))
);

CREATE TABLE public.delivery_collection_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_time time without time zone NOT NULL,
    label text,
    status text DEFAULT 'active'::text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_collection_run_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE public.delivery_distance_band (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    upper_km numeric(7,2),
    add_amount numeric(12,2) NOT NULL,
    CONSTRAINT delivery_distance_band_add_amount_check CHECK ((add_amount >= (0)::numeric)),
    CONSTRAINT delivery_distance_band_upper_km_check CHECK ((upper_km > (0)::numeric))
);

CREATE TABLE public.delivery_fee_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    rounding_step numeric(12,2) DEFAULT 0.50 NOT NULL,
    floor_amount numeric(12,2) NOT NULL,
    cap_amount numeric(12,2) NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_by text,
    activated_at timestamp with time zone,
    kind text DEFAULT 'effy'::text NOT NULL,
    base_amount numeric(12,2) DEFAULT 0 NOT NULL,
    free_over_amount numeric(12,2),
    small_order_under_amount numeric(12,2),
    small_order_fee_amount numeric(12,2),
    today_premium_amount numeric(12,2) DEFAULT 0 NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_fee_plan_base_ck CHECK ((base_amount >= (0)::numeric)),
    CONSTRAINT delivery_fee_plan_cap_amount_check CHECK ((cap_amount > (0)::numeric)),
    CONSTRAINT delivery_fee_plan_cap_floor_ck CHECK ((cap_amount >= floor_amount)),
    CONSTRAINT delivery_fee_plan_cap_step_ck CHECK ((mod(cap_amount, rounding_step) = (0)::numeric)),
    CONSTRAINT delivery_fee_plan_courier_shape_ck CHECK (((kind = 'effy'::text) OR ((small_order_under_amount IS NULL) AND (today_premium_amount = (0)::numeric)))),
    CONSTRAINT delivery_fee_plan_floor_amount_check CHECK ((floor_amount >= (0)::numeric)),
    CONSTRAINT delivery_fee_plan_floor_step_ck CHECK ((mod(floor_amount, rounding_step) = (0)::numeric)),
    CONSTRAINT delivery_fee_plan_free_over_ck CHECK ((free_over_amount > (0)::numeric)),
    CONSTRAINT delivery_fee_plan_kind_ck CHECK ((kind = ANY (ARRAY['effy'::text, 'courier'::text]))),
    CONSTRAINT delivery_fee_plan_rounding_step_check CHECK ((rounding_step > (0)::numeric)),
    CONSTRAINT delivery_fee_plan_small_below_free_ck CHECK (((small_order_under_amount IS NULL) OR (free_over_amount IS NULL) OR (small_order_under_amount < free_over_amount))),
    CONSTRAINT delivery_fee_plan_small_fee_ck CHECK ((small_order_fee_amount > (0)::numeric)),
    CONSTRAINT delivery_fee_plan_small_fee_step_ck CHECK (((small_order_fee_amount IS NULL) OR (mod(small_order_fee_amount, rounding_step) = (0)::numeric))),
    CONSTRAINT delivery_fee_plan_small_pair_ck CHECK (((small_order_under_amount IS NULL) = (small_order_fee_amount IS NULL))),
    CONSTRAINT delivery_fee_plan_small_under_ck CHECK ((small_order_under_amount > (0)::numeric)),
    CONSTRAINT delivery_fee_plan_today_premium_ck CHECK ((today_premium_amount >= (0)::numeric)),
    CONSTRAINT delivery_fee_plan_today_premium_step_ck CHECK ((mod(today_premium_amount, rounding_step) = (0)::numeric))
);

CREATE TABLE public.delivery_non_delivery_date (
    day date NOT NULL,
    label text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.delivery_override (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    change_id uuid NOT NULL,
    order_id uuid NOT NULL,
    to_type text NOT NULL,
    slot_id uuid,
    delivery_date date,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    courier_service_id uuid,
    collection text,
    paid_delivery_cents integer NOT NULL,
    courier_fee_cents integer,
    difference_cents integer,
    compensation text NOT NULL,
    amount_cents integer NOT NULL,
    points integer,
    points_entry_id uuid,
    refund_id uuid,
    compensation_note text,
    actor_sub text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_override_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT delivery_override_back_ck CHECK (((to_type = 'courier'::text) OR ((compensation = 'none'::text) AND (amount_cents = 0)))),
    CONSTRAINT delivery_override_collection_check CHECK ((collection = ANY (ARRAY['hub'::text, 'supplier'::text]))),
    CONSTRAINT delivery_override_compensation_check CHECK ((compensation = ANY (ARRAY['points_difference'::text, 'free_delivery_points'::text, 'free_delivery_refund'::text, 'refund_difference'::text, 'none'::text]))),
    CONSTRAINT delivery_override_compensation_note_check CHECK (((compensation_note IS NULL) OR (length(compensation_note) <= 500))),
    CONSTRAINT delivery_override_courier_ck CHECK ((((to_type = 'courier'::text) = (courier_service_id IS NOT NULL)) AND ((to_type = 'courier'::text) = (collection IS NOT NULL)) AND ((to_type = 'courier'::text) = (courier_fee_cents IS NOT NULL)) AND ((to_type = 'courier'::text) = (difference_cents IS NOT NULL)))),
    CONSTRAINT delivery_override_courier_fee_cents_check CHECK ((courier_fee_cents >= 0)),
    CONSTRAINT delivery_override_difference_cents_check CHECK ((difference_cents >= 0)),
    CONSTRAINT delivery_override_means_ck CHECK ((((compensation = ANY (ARRAY['points_difference'::text, 'free_delivery_points'::text])) AND (refund_id IS NULL) AND (points IS NOT NULL)) OR ((compensation = ANY (ARRAY['free_delivery_refund'::text, 'refund_difference'::text])) AND (points_entry_id IS NULL) AND (points IS NULL)) OR ((compensation = 'none'::text) AND (points_entry_id IS NULL) AND (refund_id IS NULL) AND (points IS NULL) AND (amount_cents = 0)))),
    CONSTRAINT delivery_override_none_note_ck CHECK (((compensation <> 'none'::text) OR (to_type = 'effy'::text) OR ((compensation_note IS NOT NULL) AND (btrim(compensation_note) <> ''::text)))),
    CONSTRAINT delivery_override_paid_delivery_cents_check CHECK ((paid_delivery_cents >= 0)),
    CONSTRAINT delivery_override_points_check CHECK ((points >= 0)),
    CONSTRAINT delivery_override_to_type_check CHECK ((to_type = ANY (ARRAY['effy'::text, 'courier'::text]))),
    CONSTRAINT delivery_override_window_ck CHECK ((((slot_id IS NULL) = (delivery_date IS NULL)) AND ((slot_id IS NULL) = (window_start IS NULL)) AND ((slot_id IS NULL) = (window_end IS NULL))))
);

CREATE TABLE public.delivery_proof (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stop_id uuid NOT NULL,
    method text NOT NULL,
    media_key text,
    note text,
    captured_by_driver_id uuid NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    change_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_proof_method_check CHECK ((method = ANY (ARRAY['photo'::text, 'signature'::text, 'contactless'::text]))),
    CONSTRAINT delivery_proof_photo_media_check CHECK (((method <> 'photo'::text) OR (media_key IS NOT NULL))),
    CONSTRAINT delivery_proof_signature_media_check CHECK (((method <> 'signature'::text) OR (media_key IS NOT NULL)))
);

CREATE TABLE public.delivery_settings (
    id integer DEFAULT 1 NOT NULL,
    hub_latitude numeric(9,6) NOT NULL,
    hub_longitude numeric(9,6) NOT NULL,
    sameday_prep_buffer_min integer DEFAULT 60 NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    planning_lead_min integer DEFAULT 45 NOT NULL,
    per_stop_allowance_min integer DEFAULT 12 NOT NULL,
    slot_hold_min integer DEFAULT 10 NOT NULL,
    sameday_hub_turnaround_min integer DEFAULT 60 NOT NULL,
    standard_no_delivery_weekdays smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    courier_offered boolean DEFAULT false NOT NULL,
    effy_lookahead_days integer DEFAULT 3 NOT NULL,
    courier_when_no_windows boolean DEFAULT false NOT NULL,
    courier_collection_default text DEFAULT 'hub'::text NOT NULL,
    legacy_orders_alert_days integer DEFAULT 7 NOT NULL,
    asap_estimate text DEFAULT 'usually within 2–3 days'::text NOT NULL,
    load_overdue_min integer DEFAULT 20 NOT NULL,
    checkin_overdue_min integer DEFAULT 30 NOT NULL,
    vehicle_check_required boolean DEFAULT false NOT NULL,
    CONSTRAINT delivery_settings_asap_estimate_ck CHECK (((btrim(asap_estimate) <> ''::text) AND (char_length(asap_estimate) <= 80))),
    CONSTRAINT delivery_settings_checkin_overdue_min_check CHECK (((checkin_overdue_min >= 5) AND (checkin_overdue_min <= 240))),
    CONSTRAINT delivery_settings_courier_collection_ck CHECK ((courier_collection_default = ANY (ARRAY['hub'::text, 'supplier'::text]))),
    CONSTRAINT delivery_settings_effy_lookahead_ck CHECK (((effy_lookahead_days >= 1) AND (effy_lookahead_days <= 14))),
    CONSTRAINT delivery_settings_id_check CHECK ((id = 1)),
    CONSTRAINT delivery_settings_legacy_alert_days_ck CHECK (((legacy_orders_alert_days >= 1) AND (legacy_orders_alert_days <= 60))),
    CONSTRAINT delivery_settings_load_overdue_min_check CHECK (((load_overdue_min >= 5) AND (load_overdue_min <= 240))),
    CONSTRAINT delivery_settings_per_stop_allowance_min_check CHECK ((per_stop_allowance_min > 0)),
    CONSTRAINT delivery_settings_planning_lead_min_check CHECK ((planning_lead_min > 0)),
    CONSTRAINT delivery_settings_sameday_prep_buffer_min_check CHECK ((sameday_prep_buffer_min >= 0)),
    CONSTRAINT delivery_settings_slot_hold_ck CHECK ((slot_hold_min > 0)),
    CONSTRAINT delivery_settings_turnaround_ck CHECK ((sameday_hub_turnaround_min >= 0)),
    CONSTRAINT delivery_settings_weekdays_ck CHECK (((standard_no_delivery_weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND (NOT (standard_no_delivery_weekdays @> ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))))
);

CREATE TABLE public.delivery_slot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    cutoff_time time without time zone NOT NULL,
    capacity integer,
    status text DEFAULT 'active'::text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    any_time boolean DEFAULT false NOT NULL,
    CONSTRAINT delivery_slot_any_time_active_ck CHECK (((NOT any_time) OR (status = 'active'::text))),
    CONSTRAINT delivery_slot_capacity_ck CHECK ((capacity >= 1)),
    CONSTRAINT delivery_slot_cutoff_ck CHECK ((cutoff_time <= start_time)),
    CONSTRAINT delivery_slot_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text]))),
    CONSTRAINT delivery_slot_window_ck CHECK ((end_time > start_time))
);

CREATE TABLE public.delivery_slot_booking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    delivery_date date NOT NULL,
    order_id uuid NOT NULL,
    state text NOT NULL,
    held_until timestamp with time zone,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    over_capacity boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_slot_booking_hold_ck CHECK (((state <> 'held'::text) OR (held_until IS NOT NULL))),
    CONSTRAINT delivery_slot_booking_span_ck CHECK ((window_end > window_start)),
    CONSTRAINT delivery_slot_booking_state_check CHECK ((state = ANY (ARRAY['held'::text, 'confirmed'::text, 'released'::text])))
);

CREATE VIEW public.delivery_slot_load AS
 SELECT slot_id,
    delivery_date,
    (count(*) FILTER (WHERE ((state = 'confirmed'::text) OR ((state = 'held'::text) AND (held_until > now())))))::integer AS booked,
    (count(*) FILTER (WHERE ((state = 'confirmed'::text) AND over_capacity)))::integer AS over_capacity
   FROM public.delivery_slot_booking b
  GROUP BY slot_id, delivery_date;

CREATE TABLE public.delivery_slot_premium (
    plan_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    add_amount numeric(12,2) NOT NULL,
    CONSTRAINT delivery_slot_premium_add_amount_check CHECK ((add_amount > (0)::numeric))
);

CREATE TABLE public.delivery_weight_band (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    upper_grams integer NOT NULL,
    add_amount numeric(12,2) NOT NULL,
    CONSTRAINT delivery_weight_band_add_amount_check CHECK ((add_amount >= (0)::numeric)),
    CONSTRAINT delivery_weight_band_upper_grams_check CHECK ((upper_grams > 0))
);

CREATE TABLE public.delivery_zone (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_zone_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE public.delivery_zone_postcode (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_id uuid,
    postcode text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    distance_km numeric(7,2) NOT NULL,
    distance_source text NOT NULL,
    distance_review boolean DEFAULT false NOT NULL,
    added_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    today_offered boolean DEFAULT true NOT NULL,
    CONSTRAINT delivery_zone_postcode_distance_ck CHECK (((distance_km >= (0)::numeric) AND (distance_km <= (5000)::numeric))),
    CONSTRAINT delivery_zone_postcode_postcode_check CHECK ((postcode ~ '^[0-9]{4}$'::text)),
    CONSTRAINT delivery_zone_postcode_source_ck CHECK ((distance_source = ANY (ARRAY['computed'::text, 'manual'::text])))
);

CREATE TABLE public.device_token (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_sub text NOT NULL,
    audience text NOT NULL,
    platform text NOT NULL,
    fcm_token text NOT NULL,
    app_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    muted_types text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT device_token_audience_check CHECK ((audience = ANY (ARRAY['customer'::text, 'shop'::text, 'driver'::text]))),
    CONSTRAINT device_token_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text])))
);

CREATE TABLE public.dispatch_wave (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    kind text NOT NULL,
    planned_for timestamp with time zone NOT NULL,
    trigger text NOT NULL,
    triggered_by_sub text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    packages_considered integer DEFAULT 0 NOT NULL,
    packages_assigned integer DEFAULT 0 NOT NULL,
    packages_unassigned integer DEFAULT 0 NOT NULL,
    CONSTRAINT dispatch_wave_actor_ck CHECK ((((trigger = 'manual'::text) AND (triggered_by_sub IS NOT NULL)) OR ((trigger = 'schedule'::text) AND (triggered_by_sub IS NULL)))),
    CONSTRAINT dispatch_wave_kind_check CHECK ((kind = ANY (ARRAY['collection'::text, 'delivery'::text]))),
    CONSTRAINT dispatch_wave_packages_assigned_check CHECK ((packages_assigned >= 0)),
    CONSTRAINT dispatch_wave_packages_considered_check CHECK ((packages_considered >= 0)),
    CONSTRAINT dispatch_wave_packages_unassigned_check CHECK ((packages_unassigned >= 0)),
    CONSTRAINT dispatch_wave_trigger_check CHECK ((trigger = ANY (ARRAY['schedule'::text, 'manual'::text])))
);

CREATE TABLE public.driver (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_sub text NOT NULL,
    name text NOT NULL,
    work_email public.citext NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status_reason text,
    status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_phone text,
    started_on date,
    emergency_contact_name text,
    emergency_contact_phone text,
    notes text,
    licence_reference text,
    licence_expires_on date,
    licence_class text,
    CONSTRAINT driver_licence_class_check CHECK ((licence_class = ANY (ARRAY['C'::text, 'LR'::text, 'MR'::text, 'HR'::text]))),
    CONSTRAINT driver_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'offboarded'::text])))
);

CREATE TABLE public.driver_duty_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    expected_end_at timestamp with time zone
);

CREATE TABLE public.driver_round (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wave_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    deadline_at timestamp with time zone NOT NULL,
    changed_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    window_start_at timestamp with time zone,
    CONSTRAINT driver_round_kind_check CHECK ((kind = ANY (ARRAY['collection'::text, 'delivery'::text]))),
    CONSTRAINT driver_round_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE public.driver_zone_capability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    function text NOT NULL,
    zone_id uuid,
    granted_by_sub text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_zone_capability_function_check CHECK ((function = ANY (ARRAY['collection'::text, 'delivery'::text])))
);

CREATE TABLE public.email_delivery_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    address public.citext NOT NULL,
    raw_address text NOT NULL,
    event_type text NOT NULL,
    sub_type text,
    reason text,
    message_id text NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id text,
    CONSTRAINT email_delivery_event_event_type_check CHECK ((event_type = ANY (ARRAY['bounce'::text, 'complaint'::text, 'delivery'::text, 'reject'::text, 'delivery_delay'::text])))
);

CREATE TABLE public.email_delivery_status (
    address public.citext NOT NULL,
    raw_address text NOT NULL,
    state text DEFAULT 'reachable'::text NOT NULL,
    reason text,
    diagnostic text,
    last_event_at timestamp with time zone NOT NULL,
    last_message_id text,
    bounce_count integer DEFAULT 0 NOT NULL,
    complaint_count integer DEFAULT 0 NOT NULL,
    repaired_at timestamp with time zone,
    repaired_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_delivery_status_state_check CHECK ((state = ANY (ARRAY['reachable'::text, 'soft_failing'::text, 'undeliverable'::text, 'complained'::text])))
);

CREATE TABLE public.feedback_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    body text NOT NULL,
    staff_sub text NOT NULL,
    staff_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_note_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 2000)))
);

CREATE TABLE public.feedback_reply (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    body text NOT NULL,
    staff_sub text NOT NULL,
    staff_name text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_reply_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 5000)))
);

CREATE TABLE public.feedback_submission (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_code text NOT NULL,
    category text NOT NULL,
    message text NOT NULL,
    rating smallint,
    submitter_name text,
    submitter_email public.citext,
    email_verified boolean DEFAULT false NOT NULL,
    customer_id uuid,
    source text DEFAULT 'general'::text NOT NULL,
    platform text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    source_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_submission_category_check CHECK ((category = ANY (ARRAY['bug'::text, 'suggestion'::text, 'complaint'::text, 'compliment'::text, 'other'::text]))),
    CONSTRAINT feedback_submission_message_check CHECK (((char_length(btrim(message)) >= 1) AND (char_length(btrim(message)) <= 5000))),
    CONSTRAINT feedback_submission_platform_check CHECK ((platform = ANY (ARRAY['web'::text, 'ios'::text, 'android'::text]))),
    CONSTRAINT feedback_submission_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT feedback_submission_source_check CHECK ((source = ANY (ARRAY['checkout'::text, 'general'::text, 'other'::text]))),
    CONSTRAINT feedback_submission_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_review'::text, 'replied'::text, 'resolved'::text, 'archived'::text, 'spam'::text])))
);

CREATE TABLE public.fulfillment_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    actor_staff_id uuid,
    event_type text NOT NULL,
    from_status text,
    to_status text,
    order_item_id uuid,
    quantity integer,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    detail text,
    CONSTRAINT fulfillment_event_event_type_check CHECK ((event_type = ANY (ARRAY['state_changed'::text, 'item_gathered'::text, 'item_unavailable'::text, 'item_restored'::text, 'note_added'::text, 'tags_changed'::text])))
);

CREATE TABLE public.fulfillment_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    ordered_quantity integer NOT NULL,
    gathered_quantity integer DEFAULT 0 NOT NULL,
    unavailable_quantity integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pick_note text,
    CONSTRAINT fulfillment_item_accounted_ck CHECK (((gathered_quantity + unavailable_quantity) <= ordered_quantity)),
    CONSTRAINT fulfillment_item_gathered_quantity_check CHECK ((gathered_quantity >= 0)),
    CONSTRAINT fulfillment_item_ordered_quantity_check CHECK ((ordered_quantity >= 1)),
    CONSTRAINT fulfillment_item_pick_note_check CHECK (((pick_note IS NULL) OR ((btrim(pick_note) <> ''::text) AND (char_length(pick_note) <= 500)))),
    CONSTRAINT fulfillment_item_unavailable_quantity_check CHECK ((unavailable_quantity >= 0))
);

CREATE TABLE public.fulfillment_note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    body text NOT NULL,
    author_staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fulfillment_note_body_check CHECK (((btrim(body) <> ''::text) AND (char_length(body) <= 2000)))
);

CREATE TABLE public.fulfillment_tag (
    shop_fulfillment_id uuid NOT NULL,
    tag text NOT NULL,
    created_by_staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fulfillment_tag_tag_check CHECK (((btrim(tag) <> ''::text) AND (char_length(tag) <= 32)))
);

CREATE TABLE public.hub_checkin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    packages_expected integer NOT NULL,
    packages_arrived integer NOT NULL,
    closed_by text DEFAULT 'driver'::text NOT NULL,
    closed_by_sub text,
    CONSTRAINT hub_checkin_closed_by_check CHECK ((closed_by = ANY (ARRAY['driver'::text, 'admin_staff'::text]))),
    CONSTRAINT hub_checkin_packages_arrived_check CHECK ((packages_arrived >= 0)),
    CONSTRAINT hub_checkin_packages_expected_check CHECK ((packages_expected >= 0))
);

CREATE TABLE public.insights_dirty (
    shop_id uuid NOT NULL,
    bucket_start timestamp with time zone NOT NULL,
    marked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.insights_state (
    shop_id uuid NOT NULL,
    timezone text NOT NULL,
    computed_at timestamp with time zone NOT NULL
);

CREATE TABLE public.label_print (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parcel_id uuid NOT NULL,
    shop_staff_id uuid,
    layout text NOT NULL,
    path text NOT NULL,
    change_id uuid NOT NULL,
    printed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT label_print_layout_check CHECK ((layout = ANY (ARRAY['a6'::text, 'a4x4'::text, 'roll62'::text]))),
    CONSTRAINT label_print_path_check CHECK ((path = ANY (ARRAY['browser'::text, 'zpl'::text])))
);

CREATE TABLE public.label_read (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_read_id uuid NOT NULL,
    actor_kind text NOT NULL,
    driver_id uuid,
    shop_staff_id uuid,
    admin_sub text,
    surface text NOT NULL,
    step text NOT NULL,
    raw text NOT NULL,
    read_method text NOT NULL,
    client_outcome text,
    server_outcome text NOT NULL,
    parcel_id uuid,
    round_id uuid,
    device_id text,
    app_version text,
    device_at timestamp with time zone,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT label_read_actor_check CHECK ((((actor_kind = 'driver'::text) AND (driver_id IS NOT NULL)) OR ((actor_kind = 'shop_staff'::text) AND (shop_staff_id IS NOT NULL)) OR ((actor_kind = 'admin_staff'::text) AND (admin_sub IS NOT NULL)))),
    CONSTRAINT label_read_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['driver'::text, 'shop_staff'::text, 'admin_staff'::text]))),
    CONSTRAINT label_read_app_version_check CHECK (((app_version IS NULL) OR (length(app_version) <= 32))),
    CONSTRAINT label_read_device_id_check CHECK (((device_id IS NULL) OR (length(device_id) <= 64))),
    CONSTRAINT label_read_outcome_check CHECK (((server_outcome = ANY (ARRAY['accepted'::text, 'already_counted'::text, 'belongs_elsewhere'::text, 'not_on_this_work'::text, 'voided'::text, 'cancelled'::text, 'not_a_label'::text, 'not_found'::text])) AND ((client_outcome IS NULL) OR (client_outcome = ANY (ARRAY['accepted'::text, 'already_counted'::text, 'belongs_elsewhere'::text, 'not_on_this_work'::text, 'voided'::text, 'cancelled'::text, 'not_a_label'::text, 'not_found'::text]))))),
    CONSTRAINT label_read_raw_check CHECK (((length(raw) >= 1) AND (length(raw) <= 64))),
    CONSTRAINT label_read_read_method_check CHECK ((read_method = ANY (ARRAY['scan'::text, 'typed'::text]))),
    CONSTRAINT label_read_step_check CHECK ((step = ANY (ARRAY['pack'::text, 'collect'::text, 'checkin'::text, 'load'::text, 'deliver'::text, 'return'::text, 'lookup'::text]))),
    CONSTRAINT label_read_surface_check CHECK ((surface = ANY (ARRAY['driver_app'::text, 'shop_web'::text, 'back_office'::text])))
);

CREATE TABLE public.locality (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    state text NOT NULL,
    postcode text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    address_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT locality_address_count_check CHECK ((address_count >= 0)),
    CONSTRAINT locality_postcode_check CHECK ((postcode ~ '^[0-9]{4}$'::text)),
    CONSTRAINT locality_state_check CHECK ((state = ANY (ARRAY['ACT'::text, 'NSW'::text, 'NT'::text, 'QLD'::text, 'SA'::text, 'TAS'::text, 'VIC'::text, 'WA'::text])))
);

CREATE TABLE public.media_rendition (
    storage_key text NOT NULL,
    status text NOT NULL,
    widths integer[] DEFAULT '{}'::integer[] NOT NULL,
    source_width integer,
    source_height integer,
    failure text,
    rendered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_rendition_failed_empty_ck CHECK (((status = 'ready'::text) OR (cardinality(widths) = 0))),
    CONSTRAINT media_rendition_failure_ck CHECK ((((status = 'failed'::text) AND (failure = ANY (ARRAY['unsupported'::text, 'corrupt'::text, 'too_large'::text]))) OR ((status = 'ready'::text) AND (failure IS NULL)))),
    CONSTRAINT media_rendition_key_ck CHECK (((storage_key ~~ 'products/%'::text) OR (storage_key ~~ 'promotions/%'::text))),
    CONSTRAINT media_rendition_status_ck CHECK ((status = ANY (ARRAY['ready'::text, 'failed'::text]))),
    CONSTRAINT media_rendition_widths_ck CHECK (((1 <= ALL (widths)) AND (1280 >= ALL (widths)) AND (array_position(widths, NULL::integer) IS NULL)))
);

CREATE TABLE public.newsletter_subscriber (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirm_token_hash text,
    confirm_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT newsletter_subscriber_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'unsubscribed'::text])))
);

CREATE TABLE public.notification_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_sub text NOT NULL,
    audience text NOT NULL,
    type text NOT NULL,
    payload jsonb NOT NULL,
    dedupe_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    channel text DEFAULT 'push'::text NOT NULL,
    recipient_email text,
    CONSTRAINT notification_request_audience_check CHECK ((audience = ANY (ARRAY['customer'::text, 'shop'::text, 'driver'::text]))),
    CONSTRAINT notification_request_channel_check CHECK ((channel = ANY (ARRAY['push'::text, 'email'::text]))),
    CONSTRAINT notification_request_email_addressed CHECK (((channel <> 'email'::text) OR (recipient_email IS NOT NULL))),
    CONSTRAINT notification_request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT notification_request_type_check CHECK ((type = ANY (ARRAY['order_paid'::text, 'order_ready'::text, 'order_out_for_delivery'::text, 'order_delivered'::text, 'shop_new_order'::text, 'run_assigned'::text, 'shop_awaiting_pick'::text, 'shop_out_of_stock'::text, 'shop_low_stock'::text, 'shop_refund_proposed'::text, 'shop_product_approved'::text, 'shop_product_sent_back'::text, 'points_credited'::text, 'points_expiring'::text, 'order_with_courier'::text, 'order_delivery_changed'::text, 'run_changed'::text, 'run_withdrawn'::text, 'run_opens_soon'::text])))
);

CREATE TABLE public."order" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    order_number text NOT NULL,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    item_subtotal_amount numeric(12,2) NOT NULL,
    grand_total_amount numeric(12,2) NOT NULL,
    delivery_address jsonb NOT NULL,
    placed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_address jsonb,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    promo_code text,
    delivery_fee_amount numeric(12,2),
    delivery_handover text,
    delivery_note text,
    points_used integer DEFAULT 0 NOT NULL,
    points_cents_per_point integer,
    points_value_amount numeric(12,2) DEFAULT 0 NOT NULL,
    points_shortfall_amount numeric(12,2) DEFAULT 0 NOT NULL,
    delivery_fee_breakdown jsonb,
    delivery_type text,
    delivery_type_reason text,
    courier_estimate text,
    courier_service_id uuid,
    courier_collection text,
    delivery_promise text,
    asap_estimate text,
    delivery_discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT order_asap_estimate_ck CHECK (((NOT (delivery_promise IS DISTINCT FROM 'asap'::text)) = (asap_estimate IS NOT NULL))),
    CONSTRAINT order_courier_collection_ck CHECK ((courier_collection = ANY (ARRAY['hub'::text, 'supplier'::text]))),
    CONSTRAINT order_courier_estimate_ck CHECK (((NOT (delivery_type IS DISTINCT FROM 'courier'::text)) = (courier_estimate IS NOT NULL))),
    CONSTRAINT order_delivery_discount_amount_check CHECK ((delivery_discount_amount >= (0)::numeric)),
    CONSTRAINT order_delivery_fee_amount_check CHECK ((delivery_fee_amount >= (0)::numeric)),
    CONSTRAINT order_delivery_handover_check CHECK (((delivery_handover IS NULL) OR (delivery_handover = ANY (ARRAY['leave_at_door'::text, 'meet_at_door'::text])))),
    CONSTRAINT order_delivery_note_check CHECK (((delivery_note IS NULL) OR ((char_length(delivery_note) <= 250) AND (btrim(delivery_note) <> ''::text)))),
    CONSTRAINT order_delivery_promise_ck CHECK ((delivery_promise = ANY (ARRAY['window'::text, 'day'::text, 'asap'::text]))),
    CONSTRAINT order_delivery_promise_effy_ck CHECK (((delivery_promise IS NULL) OR (NOT (delivery_type IS DISTINCT FROM 'effy'::text)))),
    CONSTRAINT order_delivery_type_ck CHECK ((delivery_type = ANY (ARRAY['effy'::text, 'courier'::text]))),
    CONSTRAINT order_delivery_type_pair_ck CHECK (((delivery_type IS NULL) = (delivery_type_reason IS NULL))),
    CONSTRAINT order_delivery_type_reason_ck CHECK ((delivery_type_reason = ANY (ARRAY['in_coverage'::text, 'out_of_coverage'::text, 'no_window'::text, 'staff_change'::text]))),
    CONSTRAINT order_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT order_grand_total_amount_check CHECK ((grand_total_amount >= (0)::numeric)),
    CONSTRAINT order_item_subtotal_amount_check CHECK ((item_subtotal_amount >= (0)::numeric)),
    CONSTRAINT order_paid_delivery_type_ck CHECK (((status <> 'paid'::text) OR (delivery_type IS NOT NULL))),
    CONSTRAINT order_points_cents_per_point_check CHECK ((points_cents_per_point > 0)),
    CONSTRAINT order_points_shortfall_amount_check CHECK ((points_shortfall_amount >= (0)::numeric)),
    CONSTRAINT order_points_used_check CHECK ((points_used >= 0)),
    CONSTRAINT order_points_value_amount_check CHECK ((points_value_amount >= (0)::numeric)),
    CONSTRAINT order_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'failed'::text, 'canceled'::text])))
);

CREATE TABLE public.order_business_identity (
    order_id uuid NOT NULL,
    business_name text,
    abn text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_business_identity_abn_check CHECK (((abn IS NULL) OR (abn ~ '^[0-9]{11}$'::text))),
    CONSTRAINT order_business_identity_business_name_check CHECK (((business_name IS NULL) OR ((length(btrim(business_name)) >= 2) AND (length(btrim(business_name)) <= 200))))
);

CREATE TABLE public.order_courier_collection_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    from_mode text NOT NULL,
    to_mode text NOT NULL,
    actor_sub text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_courier_collection_change_from_mode_check CHECK ((from_mode = ANY (ARRAY['hub'::text, 'supplier'::text]))),
    CONSTRAINT order_courier_collection_change_moves_ck CHECK ((from_mode <> to_mode)),
    CONSTRAINT order_courier_collection_change_note_check CHECK (((note IS NULL) OR (length(note) <= 500))),
    CONSTRAINT order_courier_collection_change_to_mode_check CHECK ((to_mode = ANY (ARRAY['hub'::text, 'supplier'::text])))
);

CREATE TABLE public.order_delivery_type_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    from_type text,
    to_type text NOT NULL,
    reason text NOT NULL,
    actor_kind text NOT NULL,
    actor_sub text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_delivery_type_change_actor_ck CHECK (((actor_kind = 'staff'::text) = (actor_sub IS NOT NULL))),
    CONSTRAINT order_delivery_type_change_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['checkout'::text, 'staff'::text]))),
    CONSTRAINT order_delivery_type_change_from_type_check CHECK ((from_type = ANY (ARRAY['effy'::text, 'courier'::text]))),
    CONSTRAINT order_delivery_type_change_moves_ck CHECK ((from_type IS DISTINCT FROM to_type)),
    CONSTRAINT order_delivery_type_change_note_check CHECK (((note IS NULL) OR (length(note) <= 500))),
    CONSTRAINT order_delivery_type_change_reason_check CHECK ((reason = ANY (ARRAY['in_coverage'::text, 'out_of_coverage'::text, 'no_window'::text, 'staff_change'::text]))),
    CONSTRAINT order_delivery_type_change_to_type_check CHECK ((to_type = ANY (ARRAY['effy'::text, 'courier'::text])))
);

CREATE TABLE public.order_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    product_name text NOT NULL,
    unit_price_amount numeric(12,2) NOT NULL,
    quantity integer NOT NULL,
    line_subtotal_amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_class text DEFAULT 'ambient'::text NOT NULL,
    shop_unit_price_amount numeric(12,2) NOT NULL,
    shop_line_subtotal_amount numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
    gst_status text,
    variant_id uuid NOT NULL,
    variant_label text,
    sku text,
    gtin text,
    variant_code text,
    CONSTRAINT order_item_check CHECK (((discount_amount >= (0)::numeric) AND (discount_amount <= (unit_price_amount * (quantity)::numeric)))),
    CONSTRAINT order_item_gst_status_check CHECK (((gst_status IS NULL) OR (gst_status = ANY (ARRAY['taxable'::text, 'gst_free'::text])))),
    CONSTRAINT order_item_line_subtotal_amount_check CHECK ((line_subtotal_amount >= (0)::numeric)),
    CONSTRAINT order_item_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_item_shop_line_subtotal_amount_check CHECK (((shop_line_subtotal_amount IS NULL) OR (shop_line_subtotal_amount >= (0)::numeric))),
    CONSTRAINT order_item_shop_unit_price_amount_check CHECK (((shop_unit_price_amount IS NULL) OR (shop_unit_price_amount >= (0)::numeric))),
    CONSTRAINT order_item_storage_class_check CHECK ((storage_class = ANY (ARRAY['frozen'::text, 'chilled'::text, 'ambient'::text]))),
    CONSTRAINT order_item_unit_price_amount_check CHECK ((unit_price_amount >= (0)::numeric)),
    CONSTRAINT order_item_variant_label_check CHECK (((variant_label IS NULL) OR (variant_label <> ''::text)))
);

CREATE TABLE public.order_package_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    method text NOT NULL,
    promised_from date,
    promised_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slot_id uuid,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    CONSTRAINT order_package_delivery_method_check CHECK ((method = ANY (ARRAY['same_day'::text, 'standard'::text]))),
    CONSTRAINT order_package_delivery_window_ck CHECK ((((slot_id IS NULL) AND (window_start IS NULL) AND (window_end IS NULL)) OR ((slot_id IS NOT NULL) AND (window_start IS NOT NULL) AND (window_end IS NOT NULL))))
);

CREATE TABLE public.order_policy (
    singleton boolean DEFAULT true NOT NULL,
    minimum_subtotal_amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    max_line_quantity integer DEFAULT 99 NOT NULL,
    max_distinct_items integer DEFAULT 100 NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_policy_max_distinct_items_check CHECK (((max_distinct_items >= 1) AND (max_distinct_items <= 500))),
    CONSTRAINT order_policy_max_line_quantity_check CHECK (((max_line_quantity >= 1) AND (max_line_quantity <= 99))),
    CONSTRAINT order_policy_minimum_subtotal_amount_check CHECK ((minimum_subtotal_amount >= (0)::numeric)),
    CONSTRAINT order_policy_singleton_check CHECK (singleton)
);

CREATE TABLE public.order_promotion (
    order_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    code_id uuid,
    code_text text,
    name text NOT NULL,
    headline text,
    kind text NOT NULL,
    goods_amount numeric(12,2) DEFAULT 0 NOT NULL,
    delivery_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT order_promotion_delivery_amount_check CHECK ((delivery_amount >= (0)::numeric)),
    CONSTRAINT order_promotion_goods_amount_check CHECK ((goods_amount >= (0)::numeric)),
    CONSTRAINT order_promotion_kind_check CHECK ((kind = ANY (ARRAY['cart'::text, 'item'::text, 'bxgy'::text, 'delivery'::text])))
);

CREATE TABLE public.package_arrival (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    arrived_at timestamp with time zone DEFAULT now() NOT NULL,
    source text NOT NULL,
    recorded_by_sub text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT package_arrival_source_check CHECK ((source = ANY (ARRAY['driver_proof'::text, 'staff_recorded'::text, 'carrier_signal'::text]))),
    CONSTRAINT package_arrival_staff_attributed CHECK (((source <> 'staff_recorded'::text) OR (recorded_by_sub IS NOT NULL)))
);

CREATE TABLE public.package_handover (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    round_id uuid,
    driver_id uuid,
    step text NOT NULL,
    handover_method text NOT NULL,
    change_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    parcel_id uuid NOT NULL,
    actor_kind text NOT NULL,
    shop_staff_id uuid,
    admin_sub text,
    device_at timestamp with time zone,
    CONSTRAINT package_handover_actor_check CHECK ((((actor_kind = 'driver'::text) AND (driver_id IS NOT NULL)) OR ((actor_kind = 'shop_staff'::text) AND (shop_staff_id IS NOT NULL)) OR ((actor_kind = 'admin_staff'::text) AND (admin_sub IS NOT NULL)))),
    CONSTRAINT package_handover_handover_method_check CHECK ((handover_method = ANY (ARRAY['scan'::text, 'typed'::text, 'manual'::text]))),
    CONSTRAINT package_handover_step_check CHECK ((step = ANY (ARRAY['pack'::text, 'collect'::text, 'courier_handover'::text, 'shop_pickup'::text, 'checkin'::text, 'load'::text, 'deliver'::text, 'return'::text])))
);

CREATE TABLE public.package_hold (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    step text NOT NULL,
    reason text NOT NULL,
    note text,
    driver_id uuid NOT NULL,
    round_id uuid NOT NULL,
    change_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolution text,
    resolved_by_sub text,
    resolved_at timestamp with time zone,
    parcel_id uuid,
    CONSTRAINT package_hold_other_note CHECK (((reason <> 'other'::text) OR (length(btrim(COALESCE(note, ''::text))) > 0))),
    CONSTRAINT package_hold_reason_check CHECK ((reason = ANY (ARRAY['not_at_shop'::text, 'not_in_van'::text, 'not_at_hub'::text, 'damaged'::text, 'wrong_temperature'::text, 'other'::text]))),
    CONSTRAINT package_hold_reason_step CHECK ((((step <> 'checkin'::text) OR (reason = 'not_in_van'::text)) AND ((reason <> 'not_in_van'::text) OR (step = ANY (ARRAY['checkin'::text, 'deliver'::text, 'return'::text]))) AND ((reason <> 'not_at_shop'::text) OR (step = 'collect'::text)) AND ((reason <> 'not_at_hub'::text) OR (step = 'load'::text)))),
    CONSTRAINT package_hold_resolution_check CHECK ((resolution = ANY (ARRAY['found'::text, 'lost'::text]))),
    CONSTRAINT package_hold_resolved CHECK (((resolution IS NULL) = (resolved_at IS NULL))),
    CONSTRAINT package_hold_step_check CHECK ((step = ANY (ARRAY['collect'::text, 'checkin'::text, 'load'::text, 'deliver'::text, 'return'::text])))
);

CREATE TABLE public.package_parcel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    parcel_code text NOT NULL,
    seq integer NOT NULL,
    zone text NOT NULL,
    declared boolean DEFAULT false NOT NULL,
    voided_at timestamp with time zone,
    voided_by_staff_id uuid,
    pack_scanned_at timestamp with time zone,
    pack_scanned_by_staff_id uuid,
    numbered_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT package_parcel_code_check CHECK ((parcel_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$'::text)),
    CONSTRAINT package_parcel_first_never_voided CHECK (((seq <> 1) OR (voided_at IS NULL))),
    CONSTRAINT package_parcel_seq_check CHECK (((seq >= 1) AND (seq <= 50))),
    CONSTRAINT package_parcel_zone_check CHECK ((zone = ANY (ARRAY['ambient'::text, 'chilled'::text, 'frozen'::text])))
);

CREATE TABLE public.parcel_return (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    recorded_by text NOT NULL,
    recorded_by_sub text NOT NULL,
    package_count integer NOT NULL,
    returned_at timestamp with time zone DEFAULT now() NOT NULL,
    change_id uuid NOT NULL,
    CONSTRAINT parcel_return_package_count_check CHECK ((package_count > 0)),
    CONSTRAINT parcel_return_recorded_by_check CHECK ((recorded_by = ANY (ARRAY['driver'::text, 'staff'::text])))
);

CREATE TABLE public.payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    stripe_payment_intent_id text,
    amount numeric(12,2) NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    status text DEFAULT 'requires_payment'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    method_type text,
    method_brand text,
    method_last4 text,
    CONSTRAINT payment_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_status_check CHECK ((status = ANY (ARRAY['requires_payment'::text, 'requires_action'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);

CREATE TABLE public.points_account (
    customer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.points_allocation (
    debit_entry_id uuid NOT NULL,
    credit_entry_id uuid NOT NULL,
    points integer NOT NULL,
    CONSTRAINT points_allocation_points_check CHECK ((points > 0))
);

CREATE TABLE public.points_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    kind text NOT NULL,
    points integer NOT NULL,
    reason text NOT NULL,
    note text,
    order_id uuid,
    refund_id uuid,
    author_kind text NOT NULL,
    author_sub text,
    author_flow text,
    dedupe_key text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT points_entry_author_ck CHECK ((((author_kind = 'system'::text) AND (author_flow IS NOT NULL)) OR ((author_kind = ANY (ARRAY['staff'::text, 'customer'::text])) AND (author_sub IS NOT NULL)))),
    CONSTRAINT points_entry_author_kind_check CHECK ((author_kind = ANY (ARRAY['staff'::text, 'system'::text, 'customer'::text]))),
    CONSTRAINT points_entry_kind_check CHECK ((kind = ANY (ARRAY['staff_credit'::text, 'auto_credit'::text, 'returned'::text, 'staff_debit'::text, 'spent'::text, 'expired'::text, 'forfeited'::text]))),
    CONSTRAINT points_entry_note_ck CHECK (((reason <> 'other'::text) OR ((note IS NOT NULL) AND (btrim(note) <> ''::text)))),
    CONSTRAINT points_entry_reason_check CHECK ((reason = ANY (ARRAY['late_delivery'::text, 'missing_item'::text, 'quality_issue'::text, 'goodwill'::text, 'correction'::text, 'other'::text, 'credited_in_error'::text, 'courier_override_compensation'::text, 'spent'::text, 'returned'::text, 'expired'::text, 'forfeited'::text]))),
    CONSTRAINT points_entry_refund_ck CHECK (((kind = 'returned'::text) = (refund_id IS NOT NULL))),
    CONSTRAINT points_entry_sign_ck CHECK ((((kind = ANY (ARRAY['staff_credit'::text, 'auto_credit'::text, 'returned'::text])) AND (points > 0) AND (expires_at IS NOT NULL)) OR ((kind = ANY (ARRAY['staff_debit'::text, 'spent'::text, 'expired'::text, 'forfeited'::text])) AND (points < 0) AND (expires_at IS NULL))))
);

CREATE TABLE public.points_expiry_notice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    expiry_date date NOT NULL,
    points integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT points_expiry_notice_points_check CHECK ((points > 0))
);

CREATE TABLE public.points_hold (
    order_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    points integer NOT NULL,
    state text NOT NULL,
    held_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT points_hold_points_check CHECK ((points > 0)),
    CONSTRAINT points_hold_state_check CHECK ((state = ANY (ARRAY['held'::text, 'spent'::text, 'released'::text]))),
    CONSTRAINT points_hold_until_ck CHECK (((state = 'held'::text) = (held_until IS NOT NULL)))
);

CREATE TABLE public.points_settings (
    id smallint DEFAULT 1 NOT NULL,
    cents_per_point integer DEFAULT 1 NOT NULL,
    expiry_months integer DEFAULT 12 NOT NULL,
    csa_credit_limit_points integer DEFAULT 2000 NOT NULL,
    warning_days integer DEFAULT 30 NOT NULL,
    hold_minutes integer DEFAULT 30 NOT NULL,
    updated_by text DEFAULT 'migration'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT points_settings_cents_per_point_check CHECK ((cents_per_point > 0)),
    CONSTRAINT points_settings_csa_credit_limit_points_check CHECK ((csa_credit_limit_points >= 0)),
    CONSTRAINT points_settings_expiry_months_check CHECK (((expiry_months >= 1) AND (expiry_months <= 120))),
    CONSTRAINT points_settings_hold_minutes_check CHECK (((hold_minutes >= 5) AND (hold_minutes <= 240))),
    CONSTRAINT points_settings_id_check CHECK ((id = 1)),
    CONSTRAINT points_settings_warning_days_check CHECK (((warning_days >= 1) AND (warning_days <= 365)))
);

CREATE TABLE public.points_settings_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    field text NOT NULL,
    old_value text NOT NULL,
    new_value text NOT NULL,
    changed_by text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    product_type_id uuid NOT NULL,
    primary_category_id uuid NOT NULL,
    name text NOT NULL,
    brand text,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    short_description text NOT NULL,
    long_description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    margin_kind text,
    margin_value numeric(12,4),
    approved_at timestamp with time zone,
    review_state text DEFAULT 'none'::text NOT NULL,
    review_reason text,
    submitted_at timestamp with time zone,
    gst_status text,
    unit_basis text,
    list_price_amount numeric(12,2),
    list_compare_at_amount numeric(12,2),
    price_varies boolean DEFAULT false NOT NULL,
    CONSTRAINT product_active_requires_approval_check CHECK (((status <> 'active'::text) OR (approved_at IS NOT NULL))),
    CONSTRAINT product_gst_status_check CHECK (((gst_status IS NULL) OR (gst_status = ANY (ARRAY['taxable'::text, 'gst_free'::text])))),
    CONSTRAINT product_in_review_has_submitted_at_check CHECK (((review_state <> 'in_review'::text) OR (submitted_at IS NOT NULL))),
    CONSTRAINT product_list_compare_at_amount_check CHECK (((list_compare_at_amount IS NULL) OR (list_compare_at_amount >= (0)::numeric))),
    CONSTRAINT product_list_price_amount_check CHECK (((list_price_amount IS NULL) OR (list_price_amount >= (0)::numeric))),
    CONSTRAINT product_margin_kind_check CHECK (((margin_kind IS NULL) OR (margin_kind = ANY (ARRAY['percent'::text, 'amount'::text])))),
    CONSTRAINT product_margin_pair_check CHECK (((margin_kind IS NULL) = (margin_value IS NULL))),
    CONSTRAINT product_margin_value_check CHECK (((margin_value IS NULL) OR (margin_value >= (0)::numeric))),
    CONSTRAINT product_review_state_check CHECK ((review_state = ANY (ARRAY['none'::text, 'in_review'::text, 'sent_back'::text]))),
    CONSTRAINT product_review_state_only_before_approval_check CHECK (((review_state = 'none'::text) OR (approved_at IS NULL))),
    CONSTRAINT product_sent_back_has_reason_check CHECK (((review_state <> 'sent_back'::text) OR (review_reason IS NOT NULL))),
    CONSTRAINT product_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'unavailable'::text, 'archived'::text]))),
    CONSTRAINT product_unit_basis_check CHECK (((unit_basis IS NULL) OR (unit_basis = ANY (ARRAY['per_100g'::text, 'per_kg'::text, 'per_100ml'::text, 'per_l'::text, 'each'::text]))))
);

CREATE TABLE public.product_attribute_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    attribute_definition_id uuid NOT NULL,
    value_text text,
    value_number numeric,
    value_boolean boolean,
    value_options text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_attribute_value_check CHECK (((value_text IS NOT NULL) OR (value_number IS NOT NULL) OR (value_boolean IS NOT NULL) OR (value_options IS NOT NULL)))
);

CREATE TABLE public.product_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    proposed jsonb DEFAULT '{}'::jsonb NOT NULL,
    media_changed boolean DEFAULT false NOT NULL,
    state text DEFAULT 'in_review'::text NOT NULL,
    reason text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_change_proposed_is_object_check CHECK ((jsonb_typeof(proposed) = 'object'::text)),
    CONSTRAINT product_change_sent_back_has_reason_check CHECK (((state <> 'sent_back'::text) OR (reason IS NOT NULL))),
    CONSTRAINT product_change_state_check CHECK ((state = ANY (ARRAY['in_review'::text, 'sent_back'::text])))
);

CREATE TABLE public.product_change_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    change_id uuid NOT NULL,
    storage_key text NOT NULL,
    source_media_id uuid,
    is_primary boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_gst_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_kind text NOT NULL,
    shop_staff_id uuid,
    admin_sub text,
    via text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_gst_change_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['shop_staff'::text, 'admin_staff'::text]))),
    CONSTRAINT product_gst_change_to_status_check CHECK ((to_status = ANY (ARRAY['taxable'::text, 'gst_free'::text]))),
    CONSTRAINT product_gst_change_via_check CHECK ((via = ANY (ARRAY['create'::text, 'review'::text, 'direct'::text, 'bulk'::text])))
);

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    storage_key text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_option (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    "position" smallint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_option_name_check CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 40)))),
    CONSTRAINT product_option_position_check CHECK (("position" = ANY (ARRAY[1, 2])))
);

CREATE TABLE public.product_option_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    option_id uuid NOT NULL,
    value text NOT NULL,
    "position" smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_option_value_position_check CHECK ((("position" >= 0) AND ("position" <= 19))),
    CONSTRAINT product_option_value_value_check CHECK (((value = btrim(value)) AND ((char_length(value) >= 1) AND (char_length(value) <= 40))))
);

CREATE TABLE public.product_section (
    product_id uuid NOT NULL,
    shop_section_id uuid NOT NULL
);

CREATE TABLE public.product_type (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_type_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);

CREATE TABLE public.product_type_attribute (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_type_id uuid NOT NULL,
    attribute_definition_id uuid NOT NULL,
    is_mandatory boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    group_label text
);

CREATE TABLE public.product_variant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    option1_value_id uuid,
    option2_value_id uuid,
    "position" smallint DEFAULT 0 NOT NULL,
    sku text,
    gtin text,
    shop_price_amount numeric(12,2) NOT NULL,
    shop_compare_at_amount numeric(12,2),
    price_amount numeric(12,2),
    compare_at_amount numeric(12,2),
    weight_grams integer DEFAULT 500 NOT NULL,
    weight_is_assumed boolean DEFAULT true NOT NULL,
    pack_quantity numeric(10,3),
    pack_unit text,
    media_id uuid,
    stock_tracked boolean DEFAULT false NOT NULL,
    stock_on_hand integer,
    low_stock_threshold integer,
    state text DEFAULT 'active'::text NOT NULL,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text DEFAULT public.new_variant_code() NOT NULL,
    CONSTRAINT product_variant_code_check CHECK ((code ~ '^V[2-9A-HJKMNP-TV-Z]{6}$'::text)),
    CONSTRAINT product_variant_compare_at_amount_check CHECK (((compare_at_amount IS NULL) OR (compare_at_amount >= (0)::numeric))),
    CONSTRAINT product_variant_gtin_check CHECK (((gtin IS NULL) OR ((gtin = btrim(gtin)) AND (gtin <> ''::text)))),
    CONSTRAINT product_variant_low_stock_threshold_check CHECK (((low_stock_threshold IS NULL) OR (low_stock_threshold >= 0))),
    CONSTRAINT product_variant_pack_pair_ck CHECK (((pack_quantity IS NULL) = (pack_unit IS NULL))),
    CONSTRAINT product_variant_pack_quantity_check CHECK (((pack_quantity IS NULL) OR (pack_quantity > (0)::numeric))),
    CONSTRAINT product_variant_pack_unit_check CHECK (((pack_unit IS NULL) OR (pack_unit = ANY (ARRAY['g'::text, 'kg'::text, 'ml'::text, 'l'::text, 'each'::text])))),
    CONSTRAINT product_variant_position_check CHECK ((("position" >= 0) AND ("position" <= 49))),
    CONSTRAINT product_variant_price_amount_check CHECK (((price_amount IS NULL) OR (price_amount >= (0)::numeric))),
    CONSTRAINT product_variant_removed_at_ck CHECK (((state = 'removed'::text) = (removed_at IS NOT NULL))),
    CONSTRAINT product_variant_shop_compare_at_amount_check CHECK (((shop_compare_at_amount IS NULL) OR (shop_compare_at_amount >= (0)::numeric))),
    CONSTRAINT product_variant_shop_price_amount_check CHECK ((shop_price_amount >= (0)::numeric)),
    CONSTRAINT product_variant_sku_check CHECK (((sku IS NULL) OR ((sku = btrim(sku)) AND (sku <> ''::text)))),
    CONSTRAINT product_variant_state_check CHECK ((state = ANY (ARRAY['active'::text, 'inactive'::text, 'removed'::text]))),
    CONSTRAINT product_variant_stock_on_hand_check CHECK (((stock_on_hand IS NULL) OR (stock_on_hand >= 0))),
    CONSTRAINT product_variant_tracked_needs_count_ck CHECK (((NOT stock_tracked) OR (stock_on_hand IS NOT NULL))),
    CONSTRAINT product_variant_weight_grams_check CHECK ((weight_grams > 0))
);

CREATE TABLE public.promotion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    trigger text NOT NULL,
    value_type text NOT NULL,
    percent_off numeric(5,2),
    amount_off numeric(12,2),
    max_discount_amount numeric(12,2),
    bxgy_buy_qty integer,
    bxgy_get_qty integer,
    bxgy_max_per_order integer,
    applies_to text NOT NULL,
    delivery_types text[] DEFAULT ARRAY['effy'::text, 'courier'::text] NOT NULL,
    audience text DEFAULT 'everyone'::text NOT NULL,
    min_subtotal_amount numeric(12,2) DEFAULT 0 NOT NULL,
    min_quantity integer,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    days_of_week integer[],
    time_from time without time zone,
    time_to time without time zone,
    max_uses integer,
    max_uses_per_customer integer,
    budget_amount numeric(12,2),
    combinable boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    paused boolean DEFAULT false NOT NULL,
    ended_at timestamp with time zone,
    archived_at timestamp with time zone,
    headline text,
    supporting_line text,
    label text,
    created_by text NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_amount_off_check CHECK ((amount_off > (0)::numeric)),
    CONSTRAINT promotion_applies_to_check CHECK ((applies_to = ANY (ARRAY['cart'::text, 'products'::text, 'categories'::text, 'brands'::text]))),
    CONSTRAINT promotion_applies_to_chk CHECK (((kind = ANY (ARRAY['cart'::text, 'delivery'::text])) = (applies_to = 'cart'::text))),
    CONSTRAINT promotion_audience_check CHECK ((audience = ANY (ARRAY['everyone'::text, 'first_order'::text, 'new_customers'::text, 'chosen'::text]))),
    CONSTRAINT promotion_budget_amount_check CHECK ((budget_amount > (0)::numeric)),
    CONSTRAINT promotion_bxgy_buy_qty_check CHECK ((bxgy_buy_qty > 0)),
    CONSTRAINT promotion_bxgy_chk CHECK ((((kind = 'bxgy'::text) = ((bxgy_buy_qty IS NOT NULL) AND (bxgy_get_qty IS NOT NULL))) AND ((kind = 'bxgy'::text) OR (bxgy_max_per_order IS NULL)))),
    CONSTRAINT promotion_bxgy_get_qty_check CHECK ((bxgy_get_qty > 0)),
    CONSTRAINT promotion_bxgy_max_per_order_check CHECK ((bxgy_max_per_order > 0)),
    CONSTRAINT promotion_days_of_week_check CHECK (((days_of_week IS NULL) OR ((cardinality(days_of_week) > 0) AND (days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7])))),
    CONSTRAINT promotion_delivery_types_check CHECK (((cardinality(delivery_types) > 0) AND (delivery_types <@ ARRAY['effy'::text, 'courier'::text]))),
    CONSTRAINT promotion_headline_check CHECK (((headline IS NULL) OR ((length(btrim(headline)) >= 1) AND (length(btrim(headline)) <= 80)))),
    CONSTRAINT promotion_hours_chk CHECK ((((time_from IS NULL) = (time_to IS NULL)) AND ((time_from IS NULL) OR (time_to > time_from)))),
    CONSTRAINT promotion_kind_check CHECK ((kind = ANY (ARRAY['cart'::text, 'item'::text, 'bxgy'::text, 'delivery'::text]))),
    CONSTRAINT promotion_label_check CHECK (((label IS NULL) OR (length(label) <= 24))),
    CONSTRAINT promotion_max_discount_amount_check CHECK ((max_discount_amount > (0)::numeric)),
    CONSTRAINT promotion_max_uses_check CHECK ((max_uses > 0)),
    CONSTRAINT promotion_max_uses_per_customer_check CHECK ((max_uses_per_customer > 0)),
    CONSTRAINT promotion_min_quantity_check CHECK ((min_quantity > 0)),
    CONSTRAINT promotion_min_subtotal_amount_check CHECK ((min_subtotal_amount >= (0)::numeric)),
    CONSTRAINT promotion_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 120))),
    CONSTRAINT promotion_percent_off_check CHECK (((percent_off > (0)::numeric) AND (percent_off <= (100)::numeric))),
    CONSTRAINT promotion_supporting_line_check CHECK (((supporting_line IS NULL) OR (length(supporting_line) <= 160))),
    CONSTRAINT promotion_trigger_check CHECK ((trigger = ANY (ARRAY['automatic'::text, 'code'::text]))),
    CONSTRAINT promotion_value_chk CHECK ((((value_type = 'percent'::text) AND (percent_off IS NOT NULL) AND (amount_off IS NULL)) OR ((value_type = 'amount'::text) AND (amount_off IS NOT NULL) AND (percent_off IS NULL) AND (max_discount_amount IS NULL)) OR ((value_type = 'free'::text) AND (percent_off IS NULL) AND (amount_off IS NULL) AND (max_discount_amount IS NULL) AND (kind = ANY (ARRAY['delivery'::text, 'bxgy'::text]))))),
    CONSTRAINT promotion_value_type_check CHECK ((value_type = ANY (ARRAY['percent'::text, 'amount'::text, 'free'::text]))),
    CONSTRAINT promotion_window_chk CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
);

CREATE TABLE public.promotion_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    code text NOT NULL,
    single_use boolean DEFAULT false NOT NULL,
    batch_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_code_batch_chk CHECK ((single_use = (batch_id IS NOT NULL))),
    CONSTRAINT promotion_code_code_check CHECK (((length(btrim(code)) >= 1) AND (length(btrim(code)) <= 64)))
);

CREATE TABLE public.promotion_customer (
    promotion_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.promotion_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    sort integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    size text NOT NULL,
    default_skin_id uuid NOT NULL,
    default_code_skin_id uuid,
    CONSTRAINT promotion_group_description_check CHECK (((description IS NULL) OR (length(description) <= 240))),
    CONSTRAINT promotion_group_key_check CHECK (((key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(key) <= 40))),
    CONSTRAINT promotion_group_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80))),
    CONSTRAINT promotion_group_size_check CHECK ((size = ANY (ARRAY['large'::text, 'medium'::text, 'small'::text, 'strip'::text])))
);

CREATE TABLE public.promotion_group_member (
    group_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    "position" integer NOT NULL,
    skin_id uuid,
    image_id uuid,
    CONSTRAINT promotion_group_member_position_check CHECK (("position" >= 0))
);

CREATE TABLE public.promotion_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    storage_key text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    alt text NOT NULL,
    focus_x numeric(4,3) DEFAULT 0.5 NOT NULL,
    focus_y numeric(4,3) DEFAULT 0.5 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_image_alt_check CHECK (((length(btrim(alt)) >= 1) AND (length(btrim(alt)) <= 150))),
    CONSTRAINT promotion_image_focus_x_check CHECK (((focus_x >= (0)::numeric) AND (focus_x <= (1)::numeric))),
    CONSTRAINT promotion_image_focus_y_check CHECK (((focus_y >= (0)::numeric) AND (focus_y <= (1)::numeric))),
    CONSTRAINT promotion_image_height_check CHECK ((height > 0)),
    CONSTRAINT promotion_image_position_check CHECK (("position" >= 0)),
    CONSTRAINT promotion_image_storage_key_check CHECK ((storage_key ~~ 'promotions/%'::text)),
    CONSTRAINT promotion_image_width_check CHECK ((width > 0))
);

CREATE TABLE public.promotion_skin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    layout text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_skin_layout_check CHECK ((layout = ANY (ARRAY['classic'::text, 'panel'::text, 'header_card'::text, 'full_picture'::text, 'picture_beside'::text, 'tile'::text, 'strip'::text]))),
    CONSTRAINT promotion_skin_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 60))),
    CONSTRAINT promotion_skin_settings_check CHECK ((jsonb_typeof(settings) = 'object'::text)),
    CONSTRAINT promotion_skin_version_check CHECK ((version >= 1))
);

CREATE TABLE public.promotion_target (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    target_type text NOT NULL,
    product_id uuid,
    category_id uuid,
    brand text,
    CONSTRAINT promotion_target_brand_check CHECK (((brand IS NULL) OR ((length(btrim(brand)) >= 1) AND (length(btrim(brand)) <= 120)))),
    CONSTRAINT promotion_target_one_chk CHECK ((((target_type = 'product'::text) AND (product_id IS NOT NULL) AND (category_id IS NULL) AND (brand IS NULL)) OR ((target_type = 'category'::text) AND (category_id IS NOT NULL) AND (product_id IS NULL) AND (brand IS NULL)) OR ((target_type = 'brand'::text) AND (brand IS NOT NULL) AND (product_id IS NULL) AND (category_id IS NULL)))),
    CONSTRAINT promotion_target_target_type_check CHECK ((target_type = ANY (ARRAY['product'::text, 'category'::text, 'brand'::text])))
);

CREATE TABLE public.promotion_use (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_id uuid NOT NULL,
    code_id uuid,
    single_use boolean DEFAULT false NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid NOT NULL,
    goods_amount numeric(12,2) DEFAULT 0 NOT NULL,
    delivery_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text NOT NULL,
    hold_expires_at timestamp with time zone,
    release_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    released_at timestamp with time zone,
    CONSTRAINT promotion_use_delivery_amount_check CHECK ((delivery_amount >= (0)::numeric)),
    CONSTRAINT promotion_use_goods_amount_check CHECK ((goods_amount >= (0)::numeric)),
    CONSTRAINT promotion_use_release_reason_check CHECK ((release_reason = ANY (ARRAY['payment_failed'::text, 'expired'::text, 'superseded'::text, 'cancelled'::text]))),
    CONSTRAINT promotion_use_status_check CHECK ((status = ANY (ARRAY['held'::text, 'confirmed'::text, 'released'::text]))),
    CONSTRAINT promotion_use_status_chk CHECK ((((status = 'held'::text) AND (hold_expires_at IS NOT NULL) AND (released_at IS NULL)) OR ((status = 'confirmed'::text) AND (confirmed_at IS NOT NULL) AND (released_at IS NULL)) OR ((status = 'released'::text) AND (released_at IS NOT NULL) AND (release_reason IS NOT NULL))))
);

CREATE TABLE public.receipt_dispatch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    reason text NOT NULL,
    recipient public.citext NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT receipt_dispatch_reason_check CHECK ((reason = ANY (ARRAY['order_paid'::text, 'customer_request'::text]))),
    CONSTRAINT receipt_dispatch_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);

CREATE TABLE public.refund (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    kind text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character(3) DEFAULT 'AUD'::bpchar NOT NULL,
    reason text NOT NULL,
    note text,
    status text DEFAULT 'submitting'::text NOT NULL,
    failure_reason text,
    provider_refund_id text,
    idempotency_key text NOT NULL,
    actor_kind text NOT NULL,
    actor_sub text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    card_amount numeric(12,2),
    points_returned integer DEFAULT 0 NOT NULL,
    points_value_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT refund_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['back_office'::text, 'customer'::text, 'shop'::text, 'system'::text]))),
    CONSTRAINT refund_actor_sub_ck CHECK (((actor_kind = 'system'::text) = (actor_sub IS NULL))),
    CONSTRAINT refund_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT refund_cancellation_reason_ck CHECK (((kind <> 'cancellation'::text) OR (reason = 'order_cancelled'::text))),
    CONSTRAINT refund_card_amount_check CHECK ((card_amount >= (0)::numeric)),
    CONSTRAINT refund_delivery_reason_ck CHECK (((kind = 'delivery'::text) = (reason = 'courier_override'::text))),
    CONSTRAINT refund_external_needs_note_ck CHECK (((kind <> 'external'::text) OR ((note IS NOT NULL) AND (btrim(note) <> ''::text)))),
    CONSTRAINT refund_failure_has_reason_ck CHECK (((status <> 'failed'::text) OR (failure_reason IS NOT NULL))),
    CONSTRAINT refund_goodwill_needs_note_ck CHECK (((kind <> 'goodwill'::text) OR ((note IS NOT NULL) AND (btrim(note) <> ''::text)))),
    CONSTRAINT refund_goodwill_reason_ck CHECK (((kind = 'goodwill'::text) OR (reason <> 'goodwill'::text))),
    CONSTRAINT refund_kind_check CHECK ((kind = ANY (ARRAY['item'::text, 'goodwill'::text, 'cancellation'::text, 'external'::text, 'delivery'::text]))),
    CONSTRAINT refund_points_returned_check CHECK ((points_returned >= 0)),
    CONSTRAINT refund_points_split_ck CHECK (((card_amount IS NULL) OR ((card_amount + points_value_amount) = amount))),
    CONSTRAINT refund_points_value_amount_check CHECK ((points_value_amount >= (0)::numeric)),
    CONSTRAINT refund_reason_check CHECK ((reason = ANY (ARRAY['item_not_supplied'::text, 'item_unusable'::text, 'order_cancelled'::text, 'goodwill'::text, 'external'::text, 'courier_override'::text]))),
    CONSTRAINT refund_status_check CHECK ((status = ANY (ARRAY['submitting'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'refused'::text])))
);

CREATE TABLE public.refund_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    refund_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    CONSTRAINT refund_line_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT refund_line_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.refund_proposal_dismissal (
    shop_fulfillment_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    dismissed_by text NOT NULL,
    reason text NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refund_proposal_dismissal_reason_check CHECK ((btrim(reason) <> ''::text))
);

CREATE TABLE public.refund_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    outcome_note text,
    decided_by text,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refund_request_message_check CHECK ((btrim(message) <> ''::text)),
    CONSTRAINT refund_request_status_check CHECK ((status = ANY (ARRAY['open'::text, 'refunded'::text, 'declined'::text])))
);

CREATE TABLE public.refund_request_item (
    request_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT refund_request_item_quantity_check CHECK ((quantity > 0))
);

CREATE TABLE public.round_package (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stop_id uuid NOT NULL,
    shop_fulfillment_id uuid NOT NULL,
    state text DEFAULT 'assigned'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    assigned_by_sub text,
    assigned_note text,
    return_id uuid,
    CONSTRAINT round_package_state_check CHECK ((state = ANY (ARRAY['assigned'::text, 'picked_up'::text, 'not_available'::text, 'delivered'::text, 'failed'::text, 'returned'::text])))
);

CREATE TABLE public.round_sequence_waiver (
    round_id uuid NOT NULL,
    reason text NOT NULL,
    staff_sub text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT round_sequence_waiver_reason_check CHECK (((length(btrim(reason)) >= 3) AND (length(btrim(reason)) <= 500)))
);

CREATE TABLE public.round_stop (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    seq integer,
    kind text NOT NULL,
    shop_id uuid,
    order_id uuid,
    zone_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT round_stop_kind_check CHECK ((kind = ANY (ARRAY['shop_pickup'::text, 'customer_drop'::text, 'hub_checkin'::text]))),
    CONSTRAINT round_stop_seq_check CHECK ((seq >= 0)),
    CONSTRAINT round_stop_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'out_for_delivery'::text, 'en_route'::text, 'arrived'::text, 'done'::text, 'skipped'::text]))),
    CONSTRAINT round_stop_target_ck CHECK ((((kind = 'shop_pickup'::text) AND (shop_id IS NOT NULL) AND (order_id IS NULL)) OR ((kind = 'customer_drop'::text) AND (order_id IS NOT NULL) AND (shop_id IS NULL)) OR ((kind = 'hub_checkin'::text) AND (shop_id IS NULL) AND (order_id IS NULL))))
);

CREATE TABLE public.shop (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    contact_phone text,
    notes text,
    timezone text DEFAULT 'Australia/Melbourne'::text NOT NULL,
    address_line1 text,
    address_line2 text,
    suburb text,
    postcode text,
    state text,
    pack_scan_required boolean DEFAULT false NOT NULL,
    CONSTRAINT shop_postcode_check CHECK ((postcode ~ '^[0-9]{4}$'::text)),
    CONSTRAINT shop_state_check CHECK ((state = ANY (ARRAY['ACT'::text, 'NSW'::text, 'NT'::text, 'QLD'::text, 'SA'::text, 'TAS'::text, 'VIC'::text, 'WA'::text]))),
    CONSTRAINT shop_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'disabled'::text])))
);

CREATE TABLE public.shop_attention_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    kind text NOT NULL,
    subject_key text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    notified_at timestamp with time zone,
    CONSTRAINT shop_attention_state_kind_check CHECK ((kind = ANY (ARRAY['awaiting_pick'::text, 'out_of_stock'::text, 'low_stock'::text, 'refund_proposed'::text])))
);

CREATE TABLE public.shop_fulfillment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    item_count integer NOT NULL,
    subtotal_amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    state_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_method text,
    unfulfillable_reason text,
    shop_subtotal_amount numeric(12,2),
    package_code text DEFAULT public.new_package_code() NOT NULL,
    CONSTRAINT shop_fulfillment_delivery_method_check CHECK ((delivery_method = ANY (ARRAY['same_day'::text, 'standard'::text]))),
    CONSTRAINT shop_fulfillment_item_count_check CHECK ((item_count >= 1)),
    CONSTRAINT shop_fulfillment_package_code_check CHECK ((package_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$'::text)),
    CONSTRAINT shop_fulfillment_shop_subtotal_amount_check CHECK (((shop_subtotal_amount IS NULL) OR (shop_subtotal_amount >= (0)::numeric))),
    CONSTRAINT shop_fulfillment_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'picking'::text, 'ready_for_pickup'::text, 'collected'::text, 'delivered'::text, 'unfulfillable'::text, 'withdrawn'::text]))),
    CONSTRAINT shop_fulfillment_subtotal_amount_check CHECK ((subtotal_amount >= (0)::numeric)),
    CONSTRAINT shop_fulfillment_unfulfillable_reason_ck CHECK (((status <> 'unfulfillable'::text) OR ((unfulfillable_reason IS NOT NULL) AND (btrim(unfulfillable_reason) <> ''::text))))
);

CREATE TABLE public.shop_product_sales_day (
    shop_id uuid NOT NULL,
    local_date date NOT NULL,
    product_id uuid NOT NULL,
    units integer NOT NULL,
    gross_goods numeric(12,2) NOT NULL,
    CONSTRAINT shop_product_sales_day_gross_goods_check CHECK ((gross_goods >= (0)::numeric)),
    CONSTRAINT shop_product_sales_day_units_check CHECK ((units >= 0))
);

CREATE TABLE public.shop_role (
    key text NOT NULL,
    description text NOT NULL,
    CONSTRAINT shop_role_key_check CHECK ((key = ANY (ARRAY['shop_manager'::text, 'shop_staff'::text])))
);

CREATE TABLE public.shop_sales_hour (
    shop_id uuid NOT NULL,
    bucket_start timestamp with time zone NOT NULL,
    gross_goods numeric(12,2) DEFAULT 0 NOT NULL,
    refunds numeric(12,2) DEFAULT 0 NOT NULL,
    refunded_orders integer DEFAULT 0 NOT NULL,
    orders integer DEFAULT 0 NOT NULL,
    units integer DEFAULT 0 NOT NULL,
    cant_supply integer DEFAULT 0 NOT NULL,
    cant_supply_units integer DEFAULT 0 NOT NULL,
    cancelled integer DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_sales_hour_cancelled_check CHECK ((cancelled >= 0)),
    CONSTRAINT shop_sales_hour_cant_supply_check CHECK ((cant_supply >= 0)),
    CONSTRAINT shop_sales_hour_cant_supply_units_check CHECK ((cant_supply_units >= 0)),
    CONSTRAINT shop_sales_hour_gross_goods_check CHECK ((gross_goods >= (0)::numeric)),
    CONSTRAINT shop_sales_hour_orders_check CHECK ((orders >= 0)),
    CONSTRAINT shop_sales_hour_refunded_orders_check CHECK ((refunded_orders >= 0)),
    CONSTRAINT shop_sales_hour_refunds_check CHECK ((refunds >= (0)::numeric)),
    CONSTRAINT shop_sales_hour_units_check CHECK ((units >= 0))
);

CREATE TABLE public.shop_section (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shop_id uuid NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.shop_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_sub text NOT NULL,
    email text,
    name text,
    status text DEFAULT 'active'::text NOT NULL,
    shop_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    CONSTRAINT shop_staff_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE public.shop_staff_role (
    staff_id uuid NOT NULL,
    role_key text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.shop_stock_settings (
    shop_id uuid NOT NULL,
    default_low_stock_threshold integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text NOT NULL,
    CONSTRAINT shop_stock_settings_default_low_stock_threshold_check CHECK (((default_low_stock_threshold IS NULL) OR (default_low_stock_threshold >= 0)))
);

CREATE TABLE public.stock_movement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    shop_id uuid NOT NULL,
    quantity_delta integer NOT NULL,
    quantity_before integer NOT NULL,
    quantity_after integer NOT NULL,
    reason text NOT NULL,
    actor_kind text NOT NULL,
    actor_sub text,
    order_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid NOT NULL,
    CONSTRAINT stock_movement_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['shop'::text, 'back_office'::text, 'system'::text]))),
    CONSTRAINT stock_movement_quantity_after_check CHECK ((quantity_after >= 0)),
    CONSTRAINT stock_movement_quantity_before_check CHECK ((quantity_before >= 0)),
    CONSTRAINT stock_movement_reason_check CHECK ((reason = ANY (ARRAY['received'::text, 'correction'::text, 'damage'::text, 'expiry'::text, 'order_paid'::text, 'pick_shortfall'::text, 'refund'::text, 'tracking_enabled'::text, 'tracking_disabled'::text]))),
    CONSTRAINT stock_movement_system_is_anonymous_ck CHECK (((actor_kind <> 'system'::text) OR (actor_sub IS NULL)))
);

CREATE TABLE public.stripe_event (
    event_id text NOT NULL,
    type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tax_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    order_id uuid NOT NULL,
    refund_id uuid,
    number text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb NOT NULL,
    issuer jsonb NOT NULL,
    CONSTRAINT tax_document_kind_check CHECK ((kind = ANY (ARRAY['invoice'::text, 'adjustment'::text]))),
    CONSTRAINT tax_document_refund_kind CHECK (((kind = 'adjustment'::text) = (refund_id IS NOT NULL)))
);

CREATE SEQUENCE public.tax_document_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.vehicle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    registration_plate text NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    year integer,
    body_type text NOT NULL,
    fuel_type text,
    ownership text DEFAULT 'effy_owned'::text NOT NULL,
    payload_kg integer,
    load_volume_litres integer,
    crate_capacity integer,
    can_carry_chilled boolean DEFAULT false NOT NULL,
    can_carry_frozen boolean DEFAULT false NOT NULL,
    registration_expires_on date,
    insurance_policy_reference text,
    insurance_expires_on date,
    roadworthy_expires_on date,
    odometer_km integer,
    status text DEFAULT 'active'::text NOT NULL,
    status_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_body_type_check CHECK ((body_type = ANY (ARRAY['van'::text, 'ute'::text, 'truck_light'::text, 'car'::text, 'motorcycle'::text, 'bicycle'::text]))),
    CONSTRAINT vehicle_crate_capacity_check CHECK ((crate_capacity >= 0)),
    CONSTRAINT vehicle_fuel_type_check CHECK ((fuel_type = ANY (ARRAY['petrol'::text, 'diesel'::text, 'hybrid'::text, 'electric'::text, 'none'::text]))),
    CONSTRAINT vehicle_load_volume_litres_check CHECK ((load_volume_litres > 0)),
    CONSTRAINT vehicle_make_check CHECK ((btrim(make) <> ''::text)),
    CONSTRAINT vehicle_model_check CHECK ((btrim(model) <> ''::text)),
    CONSTRAINT vehicle_odometer_km_check CHECK ((odometer_km >= 0)),
    CONSTRAINT vehicle_ownership_check CHECK ((ownership = ANY (ARRAY['effy_owned'::text, 'driver_owned'::text]))),
    CONSTRAINT vehicle_payload_kg_check CHECK ((payload_kg > 0)),
    CONSTRAINT vehicle_registration_plate_check CHECK ((btrim(registration_plate) <> ''::text)),
    CONSTRAINT vehicle_status_check CHECK ((status = ANY (ARRAY['active'::text, 'off_road'::text, 'retired'::text]))),
    CONSTRAINT vehicle_year_check CHECK (((year >= 1950) AND (year <= 2100)))
);

CREATE TABLE public.vehicle_check (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    local_date date NOT NULL,
    answers jsonb NOT NULL,
    unsafe boolean NOT NULL,
    minor boolean NOT NULL,
    change_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cleared_by_sub text,
    cleared_at timestamp with time zone,
    clear_note text,
    CONSTRAINT vehicle_check_cleared CHECK (((cleared_at IS NULL) = (cleared_by_sub IS NULL)))
);

CREATE TABLE public.vehicle_holding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    odometer_start_km integer,
    odometer_end_km integer,
    issued_by_sub text,
    returned_by_sub text,
    note text,
    CONSTRAINT vehicle_holding_odo_ck CHECK (((odometer_end_km IS NULL) OR (odometer_start_km IS NULL) OR (odometer_end_km >= odometer_start_km))),
    CONSTRAINT vehicle_holding_odometer_end_km_check CHECK ((odometer_end_km >= 0)),
    CONSTRAINT vehicle_holding_odometer_start_km_check CHECK ((odometer_start_km >= 0)),
    CONSTRAINT vehicle_holding_period_ck CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);

ALTER TABLE ONLY admin.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY admin.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (key);

ALTER TABLE ONLY admin.staff
    ADD CONSTRAINT staff_cognito_sub_key UNIQUE (cognito_sub);

ALTER TABLE ONLY admin.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);

ALTER TABLE ONLY admin.staff_role
    ADD CONSTRAINT staff_role_pkey PRIMARY KEY (staff_id, role_key);

ALTER TABLE ONLY public.assignment_exclusion
    ADD CONSTRAINT assignment_exclusion_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attribute_allowed_value
    ADD CONSTRAINT attribute_allowed_value_attribute_definition_id_value_key UNIQUE (attribute_definition_id, value);

ALTER TABLE ONLY public.attribute_allowed_value
    ADD CONSTRAINT attribute_allowed_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attribute_definition
    ADD CONSTRAINT attribute_definition_key_key UNIQUE (key);

ALTER TABLE ONLY public.attribute_definition
    ADD CONSTRAINT attribute_definition_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_tax
    ADD CONSTRAINT business_tax_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.carrier_handoff
    ADD CONSTRAINT carrier_handoff_package_uq UNIQUE (shop_fulfillment_id);

ALTER TABLE ONLY public.carrier_handoff
    ADD CONSTRAINT carrier_handoff_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cart_change_log
    ADD CONSTRAINT cart_change_log_pkey PRIMARY KEY (cart_id, change_id);

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_customer_id_key UNIQUE (customer_id);

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_cart_variant_uq UNIQUE (cart_id, variant_id);

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cart_saved_item
    ADD CONSTRAINT cart_saved_item_cart_variant_uq UNIQUE (cart_id, variant_id);

ALTER TABLE ONLY public.cart_saved_item
    ADD CONSTRAINT cart_saved_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_key_key UNIQUE (key);

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.courier_consignment_event
    ADD CONSTRAINT courier_consignment_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.courier_consignment
    ADD CONSTRAINT courier_consignment_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.courier_excluded_postcode
    ADD CONSTRAINT courier_excluded_postcode_pkey PRIMARY KEY (postcode);

ALTER TABLE ONLY public.courier_service
    ADD CONSTRAINT courier_service_name_uq UNIQUE (courier_name, service_name);

ALTER TABLE ONLY public.courier_service
    ADD CONSTRAINT courier_service_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_address
    ADD CONSTRAINT customer_address_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_closure_request
    ADD CONSTRAINT customer_closure_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_cognito_sub_key UNIQUE (cognito_sub);

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_email_key UNIQUE (email);

ALTER TABLE ONLY public.customer_list_entry
    ADD CONSTRAINT customer_list_entry_pkey PRIMARY KEY (list_id, product_id);

ALTER TABLE ONLY public.customer_list
    ADD CONSTRAINT customer_list_owner_uq UNIQUE (id, customer_id);

ALTER TABLE ONLY public.customer_list
    ADD CONSTRAINT customer_list_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_saved_item
    ADD CONSTRAINT customer_saved_item_pkey PRIMARY KEY (customer_id, product_id);

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_stripe_customer_id_key UNIQUE (stripe_customer_id);

ALTER TABLE ONLY public.delivery_attempt_failure
    ADD CONSTRAINT delivery_attempt_failure_change_uq UNIQUE (change_id);

ALTER TABLE ONLY public.delivery_attempt_failure
    ADD CONSTRAINT delivery_attempt_failure_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_collection_run
    ADD CONSTRAINT delivery_collection_run_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_collection_run
    ADD CONSTRAINT delivery_collection_run_time_uq UNIQUE (run_time);

ALTER TABLE ONLY public.delivery_distance_band
    ADD CONSTRAINT delivery_distance_band_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_distance_band
    ADD CONSTRAINT delivery_distance_band_uq UNIQUE (plan_id, upper_km);

ALTER TABLE ONLY public.delivery_fee_plan
    ADD CONSTRAINT delivery_fee_plan_name_key UNIQUE (name);

ALTER TABLE ONLY public.delivery_fee_plan
    ADD CONSTRAINT delivery_fee_plan_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_non_delivery_date
    ADD CONSTRAINT delivery_non_delivery_date_pkey PRIMARY KEY (day);

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_change_id_key UNIQUE (change_id);

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_points_entry_id_key UNIQUE (points_entry_id);

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_refund_id_key UNIQUE (refund_id);

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_change_uq UNIQUE (change_id);

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_stop_uq UNIQUE (stop_id);

ALTER TABLE ONLY public.delivery_settings
    ADD CONSTRAINT delivery_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_slot_booking
    ADD CONSTRAINT delivery_slot_booking_order_uq UNIQUE (order_id);

ALTER TABLE ONLY public.delivery_slot_booking
    ADD CONSTRAINT delivery_slot_booking_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_slot
    ADD CONSTRAINT delivery_slot_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_slot_premium
    ADD CONSTRAINT delivery_slot_premium_pkey PRIMARY KEY (plan_id, slot_id);

ALTER TABLE ONLY public.delivery_slot
    ADD CONSTRAINT delivery_slot_window_uq UNIQUE (start_time, end_time);

ALTER TABLE ONLY public.delivery_weight_band
    ADD CONSTRAINT delivery_weight_band_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_weight_band
    ADD CONSTRAINT delivery_weight_band_uq UNIQUE (plan_id, upper_grams);

ALTER TABLE ONLY public.delivery_zone
    ADD CONSTRAINT delivery_zone_code_key UNIQUE (code);

ALTER TABLE ONLY public.delivery_zone
    ADD CONSTRAINT delivery_zone_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_zone_postcode
    ADD CONSTRAINT delivery_zone_postcode_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.delivery_zone_postcode
    ADD CONSTRAINT delivery_zone_postcode_postcode_key UNIQUE (postcode);

ALTER TABLE ONLY public.device_token
    ADD CONSTRAINT device_token_fcm_token_key UNIQUE (fcm_token);

ALTER TABLE ONLY public.device_token
    ADD CONSTRAINT device_token_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.dispatch_wave
    ADD CONSTRAINT dispatch_wave_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver
    ADD CONSTRAINT driver_cognito_sub_key UNIQUE (cognito_sub);

ALTER TABLE ONLY public.driver_duty_session
    ADD CONSTRAINT driver_duty_session_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver
    ADD CONSTRAINT driver_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver_round
    ADD CONSTRAINT driver_round_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.driver
    ADD CONSTRAINT driver_work_email_key UNIQUE (work_email);

ALTER TABLE ONLY public.driver_zone_capability
    ADD CONSTRAINT driver_zone_capability_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_delivery_event
    ADD CONSTRAINT email_delivery_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_delivery_status
    ADD CONSTRAINT email_delivery_status_pkey PRIMARY KEY (address);

ALTER TABLE ONLY public.feedback_note
    ADD CONSTRAINT feedback_note_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_reply
    ADD CONSTRAINT feedback_reply_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_submission
    ADD CONSTRAINT feedback_submission_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feedback_submission
    ADD CONSTRAINT feedback_submission_reference_code_key UNIQUE (reference_code);

ALTER TABLE ONLY public.fulfillment_event
    ADD CONSTRAINT fulfillment_event_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fulfillment_item
    ADD CONSTRAINT fulfillment_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fulfillment_item
    ADD CONSTRAINT fulfillment_item_shop_fulfillment_id_order_item_id_key UNIQUE (shop_fulfillment_id, order_item_id);

ALTER TABLE ONLY public.fulfillment_note
    ADD CONSTRAINT fulfillment_note_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.fulfillment_tag
    ADD CONSTRAINT fulfillment_tag_pkey PRIMARY KEY (shop_fulfillment_id, tag);

ALTER TABLE ONLY public.hub_checkin
    ADD CONSTRAINT hub_checkin_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.hub_checkin
    ADD CONSTRAINT hub_checkin_round_uq UNIQUE (round_id);

ALTER TABLE ONLY public.insights_dirty
    ADD CONSTRAINT insights_dirty_pkey PRIMARY KEY (shop_id, bucket_start);

ALTER TABLE ONLY public.insights_state
    ADD CONSTRAINT insights_state_pkey PRIMARY KEY (shop_id);

ALTER TABLE ONLY public.label_print
    ADD CONSTRAINT label_print_once UNIQUE (change_id, parcel_id);

ALTER TABLE ONLY public.label_print
    ADD CONSTRAINT label_print_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_client_uq UNIQUE (client_read_id);

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.locality
    ADD CONSTRAINT locality_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.locality
    ADD CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode);

ALTER TABLE ONLY public.media_rendition
    ADD CONSTRAINT media_rendition_pkey PRIMARY KEY (storage_key);

ALTER TABLE ONLY public.newsletter_subscriber
    ADD CONSTRAINT newsletter_subscriber_email_key UNIQUE (email);

ALTER TABLE ONLY public.newsletter_subscriber
    ADD CONSTRAINT newsletter_subscriber_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_request
    ADD CONSTRAINT notification_request_dedupe_key_key UNIQUE (dedupe_key);

ALTER TABLE ONLY public.notification_request
    ADD CONSTRAINT notification_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_business_identity
    ADD CONSTRAINT order_business_identity_pkey PRIMARY KEY (order_id);

ALTER TABLE ONLY public.order_courier_collection_change
    ADD CONSTRAINT order_courier_collection_change_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_delivery_type_change
    ADD CONSTRAINT order_delivery_type_change_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_order_variant_uq UNIQUE (order_id, variant_id);

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_order_number_key UNIQUE (order_number);

ALTER TABLE ONLY public.order_package_delivery
    ADD CONSTRAINT order_package_delivery_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_package_delivery
    ADD CONSTRAINT order_package_delivery_uq UNIQUE (order_id, shop_id);

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_policy
    ADD CONSTRAINT order_policy_pkey PRIMARY KEY (singleton);

ALTER TABLE ONLY public.order_promotion
    ADD CONSTRAINT order_promotion_pkey PRIMARY KEY (order_id, promotion_id);

ALTER TABLE ONLY public.package_arrival
    ADD CONSTRAINT package_arrival_package_uq UNIQUE (shop_fulfillment_id);

ALTER TABLE ONLY public.package_arrival
    ADD CONSTRAINT package_arrival_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_once UNIQUE (change_id, parcel_id);

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_once UNIQUE NULLS NOT DISTINCT (change_id, shop_fulfillment_id, parcel_id);

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.package_parcel
    ADD CONSTRAINT package_parcel_code_uq UNIQUE (parcel_code);

ALTER TABLE ONLY public.package_parcel
    ADD CONSTRAINT package_parcel_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.parcel_return
    ADD CONSTRAINT parcel_return_change_id_key UNIQUE (change_id);

ALTER TABLE ONLY public.parcel_return
    ADD CONSTRAINT parcel_return_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);

ALTER TABLE ONLY public.points_account
    ADD CONSTRAINT points_account_pkey PRIMARY KEY (customer_id);

ALTER TABLE ONLY public.points_allocation
    ADD CONSTRAINT points_allocation_pkey PRIMARY KEY (debit_entry_id, credit_entry_id);

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_dedupe_key_key UNIQUE (dedupe_key);

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_refund_id_key UNIQUE (refund_id);

ALTER TABLE ONLY public.points_expiry_notice
    ADD CONSTRAINT points_expiry_notice_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.points_expiry_notice
    ADD CONSTRAINT points_expiry_notice_uq UNIQUE (customer_id, expiry_date);

ALTER TABLE ONLY public.points_hold
    ADD CONSTRAINT points_hold_pkey PRIMARY KEY (order_id);

ALTER TABLE ONLY public.points_settings_change
    ADD CONSTRAINT points_settings_change_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.points_settings
    ADD CONSTRAINT points_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_attribute_value
    ADD CONSTRAINT product_attribute_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_attribute_value
    ADD CONSTRAINT product_attribute_value_product_id_attribute_definition_id_key UNIQUE (product_id, attribute_definition_id);

ALTER TABLE ONLY public.product_change_media
    ADD CONSTRAINT product_change_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_change
    ADD CONSTRAINT product_change_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_change
    ADD CONSTRAINT product_change_product_uq UNIQUE (product_id);

ALTER TABLE ONLY public.product_gst_change
    ADD CONSTRAINT product_gst_change_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_id_shop_uq UNIQUE (id, shop_id);

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_option
    ADD CONSTRAINT product_option_id_product_uq UNIQUE (id, product_id);

ALTER TABLE ONLY public.product_option
    ADD CONSTRAINT product_option_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_option
    ADD CONSTRAINT product_option_position_uq UNIQUE (product_id, "position") DEFERRABLE;

ALTER TABLE ONLY public.product_option_value
    ADD CONSTRAINT product_option_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_option_value
    ADD CONSTRAINT product_option_value_position_uq UNIQUE (option_id, "position") DEFERRABLE;

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_section
    ADD CONSTRAINT product_section_pkey PRIMARY KEY (product_id, shop_section_id);

ALTER TABLE ONLY public.product_type_attribute
    ADD CONSTRAINT product_type_attribute_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_type_attribute
    ADD CONSTRAINT product_type_attribute_product_type_id_attribute_definition_key UNIQUE (product_type_id, attribute_definition_id);

ALTER TABLE ONLY public.product_type
    ADD CONSTRAINT product_type_key_key UNIQUE (key);

ALTER TABLE ONLY public.product_type
    ADD CONSTRAINT product_type_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_code_uq UNIQUE (code);

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_id_product_uq UNIQUE (id, product_id);

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_code
    ADD CONSTRAINT promotion_code_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_customer
    ADD CONSTRAINT promotion_customer_pkey PRIMARY KEY (promotion_id, customer_id);

ALTER TABLE ONLY public.promotion_group
    ADD CONSTRAINT promotion_group_key_key UNIQUE (key);

ALTER TABLE ONLY public.promotion_group_member
    ADD CONSTRAINT promotion_group_member_pkey PRIMARY KEY (group_id, promotion_id);

ALTER TABLE ONLY public.promotion_group
    ADD CONSTRAINT promotion_group_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_image
    ADD CONSTRAINT promotion_image_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_image
    ADD CONSTRAINT promotion_image_storage_key_key UNIQUE (storage_key);

ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT promotion_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_skin
    ADD CONSTRAINT promotion_skin_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_target
    ADD CONSTRAINT promotion_target_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_once_per_order UNIQUE (order_id, promotion_id);

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.receipt_dispatch
    ADD CONSTRAINT receipt_dispatch_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refund
    ADD CONSTRAINT refund_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY public.refund_line
    ADD CONSTRAINT refund_line_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refund_line
    ADD CONSTRAINT refund_line_refund_id_order_item_id_key UNIQUE (refund_id, order_item_id);

ALTER TABLE ONLY public.refund
    ADD CONSTRAINT refund_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.refund_proposal_dismissal
    ADD CONSTRAINT refund_proposal_dismissal_pkey PRIMARY KEY (shop_fulfillment_id, order_item_id);

ALTER TABLE ONLY public.refund
    ADD CONSTRAINT refund_provider_refund_id_key UNIQUE (provider_refund_id);

ALTER TABLE ONLY public.refund_request_item
    ADD CONSTRAINT refund_request_item_pkey PRIMARY KEY (request_id, order_item_id);

ALTER TABLE ONLY public.refund_request
    ADD CONSTRAINT refund_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.round_package
    ADD CONSTRAINT round_package_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.round_sequence_waiver
    ADD CONSTRAINT round_sequence_waiver_pkey PRIMARY KEY (round_id);

ALTER TABLE ONLY public.round_stop
    ADD CONSTRAINT round_stop_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop_attention_state
    ADD CONSTRAINT shop_attention_state_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop_attention_state
    ADD CONSTRAINT shop_attention_state_uq UNIQUE (shop_id, kind, subject_key);

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_code_key UNIQUE (code);

ALTER TABLE ONLY public.shop_fulfillment
    ADD CONSTRAINT shop_fulfillment_order_id_shop_id_key UNIQUE (order_id, shop_id);

ALTER TABLE ONLY public.shop_fulfillment
    ADD CONSTRAINT shop_fulfillment_package_code_uq UNIQUE (package_code);

ALTER TABLE ONLY public.shop_fulfillment
    ADD CONSTRAINT shop_fulfillment_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop
    ADD CONSTRAINT shop_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop_product_sales_day
    ADD CONSTRAINT shop_product_sales_day_pkey PRIMARY KEY (shop_id, local_date, product_id);

ALTER TABLE ONLY public.shop_role
    ADD CONSTRAINT shop_role_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.shop_sales_hour
    ADD CONSTRAINT shop_sales_hour_pkey PRIMARY KEY (shop_id, bucket_start);

ALTER TABLE ONLY public.shop_section
    ADD CONSTRAINT shop_section_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop_section
    ADD CONSTRAINT shop_section_shop_id_name_key UNIQUE (shop_id, name);

ALTER TABLE ONLY public.shop_staff
    ADD CONSTRAINT shop_staff_cognito_sub_key UNIQUE (cognito_sub);

ALTER TABLE ONLY public.shop_staff
    ADD CONSTRAINT shop_staff_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shop_staff_role
    ADD CONSTRAINT shop_staff_role_pkey PRIMARY KEY (staff_id, role_key);

ALTER TABLE ONLY public.shop_stock_settings
    ADD CONSTRAINT shop_stock_settings_pkey PRIMARY KEY (shop_id);

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stripe_event
    ADD CONSTRAINT stripe_event_pkey PRIMARY KEY (event_id);

ALTER TABLE ONLY public.tax_document
    ADD CONSTRAINT tax_document_number_uq UNIQUE (number);

ALTER TABLE ONLY public.tax_document
    ADD CONSTRAINT tax_document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vehicle_check
    ADD CONSTRAINT vehicle_check_change_id_key UNIQUE (change_id);

ALTER TABLE ONLY public.vehicle_check
    ADD CONSTRAINT vehicle_check_once_a_day UNIQUE (driver_id, vehicle_id, local_date);

ALTER TABLE ONLY public.vehicle_check
    ADD CONSTRAINT vehicle_check_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vehicle_holding
    ADD CONSTRAINT vehicle_holding_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vehicle
    ADD CONSTRAINT vehicle_pkey PRIMARY KEY (id);

CREATE INDEX audit_log_actor_idx ON admin.audit_log USING btree (actor_sub, created_at DESC);

CREATE INDEX audit_log_target_idx ON admin.audit_log USING btree (target_type, target_id, created_at DESC);

CREATE INDEX assignment_exclusion_driver_idx ON public.assignment_exclusion USING btree (driver_id);

CREATE INDEX assignment_exclusion_sf_idx ON public.assignment_exclusion USING btree (shop_fulfillment_id);

CREATE UNIQUE INDEX assignment_exclusion_standing_uq ON public.assignment_exclusion USING btree (shop_fulfillment_id, kind, driver_id, reason) NULLS NOT DISTINCT WHERE (kind IS NOT NULL);

CREATE INDEX attribute_allowed_value_attr_idx ON public.attribute_allowed_value USING btree (attribute_definition_id);

CREATE INDEX cart_change_log_applied_idx ON public.cart_change_log USING btree (applied_at);

CREATE INDEX cart_item_cart_idx ON public.cart_item USING btree (cart_id);

CREATE INDEX cart_item_product_idx ON public.cart_item USING btree (product_id);

CREATE INDEX cart_item_variant_idx ON public.cart_item USING btree (variant_id);

CREATE INDEX cart_saved_item_cart_idx ON public.cart_saved_item USING btree (cart_id);

CREATE INDEX cart_saved_item_product_idx ON public.cart_saved_item USING btree (product_id);

CREATE INDEX cart_saved_item_variant_idx ON public.cart_saved_item USING btree (variant_id);

CREATE INDEX category_parent_idx ON public.category USING btree (parent_id);

CREATE INDEX courier_consignment_event_idx ON public.courier_consignment_event USING btree (consignment_id, created_at);

CREATE UNIQUE INDEX courier_consignment_live_uq ON public.courier_consignment USING btree (shop_fulfillment_id) WHERE (state <> 'cancelled'::text);

CREATE INDEX courier_consignment_state_idx ON public.courier_consignment USING btree (state, updated_at);

CREATE UNIQUE INDEX courier_service_one_default_uq ON public.courier_service USING btree (is_default) WHERE is_default;

CREATE INDEX customer_address_customer_idx ON public.customer_address USING btree (customer_id);

CREATE UNIQUE INDEX customer_address_default_uq ON public.customer_address USING btree (customer_id) WHERE is_default;

CREATE INDEX customer_closure_request_erase_after_idx ON public.customer_closure_request USING btree (erase_after) WHERE (cancelled_at IS NULL);

CREATE UNIQUE INDEX customer_closure_request_live_idx ON public.customer_closure_request USING btree (customer_id) WHERE (cancelled_at IS NULL);

CREATE UNIQUE INDEX customer_list_default_uq ON public.customer_list USING btree (customer_id) WHERE is_default;

CREATE INDEX customer_list_entry_list_idx ON public.customer_list_entry USING btree (list_id, added_at DESC);

CREATE INDEX customer_list_entry_saved_idx ON public.customer_list_entry USING btree (customer_id, product_id);

CREATE UNIQUE INDEX customer_list_name_uq ON public.customer_list USING btree (customer_id, lower(name)) WHERE (NOT is_default);

CREATE INDEX customer_saved_item_customer_idx ON public.customer_saved_item USING btree (customer_id, saved_at DESC);

CREATE INDEX customer_saved_item_product_idx ON public.customer_saved_item USING btree (product_id);

CREATE INDEX customer_saved_item_variant_idx ON public.customer_saved_item USING btree (variant_id);

CREATE INDEX delivery_attempt_failure_open_idx ON public.delivery_attempt_failure USING btree (failed_at DESC) WHERE (resolved_at IS NULL);

CREATE INDEX delivery_attempt_failure_stop_idx ON public.delivery_attempt_failure USING btree (stop_id);

CREATE UNIQUE INDEX delivery_distance_band_open_uq ON public.delivery_distance_band USING btree (plan_id) WHERE (upper_km IS NULL);

CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan USING btree (kind) WHERE is_active;

CREATE INDEX delivery_override_order_idx ON public.delivery_override USING btree (order_id, created_at);

CREATE INDEX delivery_proof_captured_idx ON public.delivery_proof USING btree (captured_at DESC);

CREATE UNIQUE INDEX delivery_slot_any_time_uq ON public.delivery_slot USING btree ((true)) WHERE any_time;

CREATE INDEX delivery_slot_booking_slot_idx ON public.delivery_slot_booking USING btree (slot_id, delivery_date);

CREATE INDEX delivery_slot_premium_slot_idx ON public.delivery_slot_premium USING btree (slot_id);

CREATE INDEX delivery_weight_band_plan_idx ON public.delivery_weight_band USING btree (plan_id, upper_grams);

CREATE INDEX delivery_zone_postcode_zone_idx ON public.delivery_zone_postcode USING btree (zone_id);

CREATE INDEX device_token_subject_idx ON public.device_token USING btree (subject_sub, audience);

CREATE INDEX dispatch_wave_run_idx ON public.dispatch_wave USING btree (run_id);

CREATE INDEX dispatch_wave_started_idx ON public.dispatch_wave USING btree (started_at DESC);

CREATE INDEX driver_duty_session_driver_idx ON public.driver_duty_session USING btree (driver_id);

CREATE UNIQUE INDEX driver_duty_session_open_uq ON public.driver_duty_session USING btree (driver_id) WHERE (ended_at IS NULL);

CREATE INDEX driver_name_trgm_idx ON public.driver USING gin (name public.gin_trgm_ops);

CREATE INDEX driver_register_idx ON public.driver USING btree (name, id);

CREATE INDEX driver_round_bucket_idx ON public.driver_round USING btree (driver_id, kind, deadline_at) WHERE (status = 'planned'::text);

CREATE INDEX driver_round_driver_idx ON public.driver_round USING btree (driver_id, status);

CREATE INDEX driver_round_open_idx ON public.driver_round USING btree (status) WHERE (status = ANY (ARRAY['planned'::text, 'in_progress'::text]));

CREATE INDEX driver_round_wave_idx ON public.driver_round USING btree (wave_id);

CREATE INDEX driver_status_idx ON public.driver USING btree (status);

CREATE INDEX driver_zone_capability_driver_idx ON public.driver_zone_capability USING btree (driver_id);

CREATE UNIQUE INDEX driver_zone_capability_uq ON public.driver_zone_capability USING btree (driver_id, function, zone_id) NULLS NOT DISTINCT;

CREATE INDEX driver_zone_capability_zone_idx ON public.driver_zone_capability USING btree (zone_id);

CREATE INDEX email_delivery_event_address_idx ON public.email_delivery_event USING btree (address, occurred_at DESC);

CREATE UNIQUE INDEX email_delivery_event_idem_idx ON public.email_delivery_event USING btree (message_id, event_type, address);

CREATE INDEX email_delivery_status_attention_idx ON public.email_delivery_status USING btree (last_event_at DESC) WHERE (state <> 'reachable'::text);

CREATE INDEX feedback_note_submission_idx ON public.feedback_note USING btree (submission_id, created_at);

CREATE INDEX feedback_reply_submission_idx ON public.feedback_reply USING btree (submission_id, sent_at);

CREATE INDEX feedback_submission_category_idx ON public.feedback_submission USING btree (category);

CREATE INDEX feedback_submission_created_idx ON public.feedback_submission USING btree (created_at DESC);

CREATE INDEX feedback_submission_email_idx ON public.feedback_submission USING btree (submitter_email);

CREATE INDEX feedback_submission_message_trgm_idx ON public.feedback_submission USING gin (message public.gin_trgm_ops);

CREATE INDEX feedback_submission_source_key_idx ON public.feedback_submission USING btree (source_key, created_at DESC) WHERE (source_key IS NOT NULL);

CREATE INDEX feedback_submission_status_idx ON public.feedback_submission USING btree (status);

CREATE INDEX fulfillment_event_actor_idx ON public.fulfillment_event USING btree (actor_staff_id);

CREATE INDEX fulfillment_event_portion_idx ON public.fulfillment_event USING btree (shop_fulfillment_id, occurred_at DESC);

CREATE INDEX fulfillment_item_order_item_idx ON public.fulfillment_item USING btree (order_item_id);

CREATE INDEX fulfillment_item_portion_idx ON public.fulfillment_item USING btree (shop_fulfillment_id);

CREATE INDEX fulfillment_note_portion_idx ON public.fulfillment_note USING btree (shop_fulfillment_id, created_at DESC);

CREATE INDEX fulfillment_tag_tag_idx ON public.fulfillment_tag USING btree (tag);

CREATE INDEX hub_checkin_driver_idx ON public.hub_checkin USING btree (driver_id, checked_in_at DESC);

CREATE INDEX insights_dirty_marked_idx ON public.insights_dirty USING btree (marked_at);

CREATE INDEX label_print_parcel_idx ON public.label_print USING btree (parcel_id);

CREATE INDEX label_read_parcel_idx ON public.label_read USING btree (parcel_id);

CREATE INDEX label_read_received_idx ON public.label_read USING btree (received_at);

CREATE INDEX label_read_refused_idx ON public.label_read USING btree (server_outcome) WHERE (server_outcome <> 'accepted'::text);

CREATE INDEX locality_name_prefix_idx ON public.locality USING btree (lower(name) text_pattern_ops);

CREATE INDEX locality_postcode_idx ON public.locality USING btree (postcode);

CREATE INDEX notification_request_channel_status_idx ON public.notification_request USING btree (channel, status) WHERE (status = 'pending'::text);

CREATE INDEX notification_request_pending_idx ON public.notification_request USING btree (status, created_at);

CREATE INDEX order_courier_collection_change_order_idx ON public.order_courier_collection_change USING btree (order_id, created_at);

CREATE INDEX order_customer_created_idx ON public."order" USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX order_delivery_type_change_first_uq ON public.order_delivery_type_change USING btree (order_id) WHERE (from_type IS NULL);

CREATE INDEX order_delivery_type_change_order_idx ON public.order_delivery_type_change USING btree (order_id, created_at);

CREATE INDEX order_delivery_type_idx ON public."order" USING btree (delivery_type, placed_at DESC) WHERE (delivery_type IS NOT NULL);

CREATE INDEX order_item_order_idx ON public.order_item USING btree (order_id);

CREATE INDEX order_item_shop_idx ON public.order_item USING btree (shop_id);

CREATE INDEX order_item_variant_idx ON public.order_item USING btree (variant_id);

CREATE INDEX order_package_delivery_order_idx ON public.order_package_delivery USING btree (order_id);

CREATE INDEX order_package_delivery_shop_idx ON public.order_package_delivery USING btree (shop_id);

CREATE INDEX order_status_idx ON public."order" USING btree (status);

CREATE INDEX package_arrival_arrived_at_idx ON public.package_arrival USING btree (arrived_at DESC);

CREATE INDEX package_handover_package_idx ON public.package_handover USING btree (shop_fulfillment_id);

CREATE INDEX package_handover_parcel_idx ON public.package_handover USING btree (parcel_id);

CREATE UNIQUE INDEX package_hold_open_idx ON public.package_hold USING btree (shop_fulfillment_id, parcel_id) NULLS NOT DISTINCT WHERE (resolution IS NULL);

CREATE INDEX package_hold_package_idx ON public.package_hold USING btree (shop_fulfillment_id);

CREATE UNIQUE INDEX package_parcel_live_seq_uq ON public.package_parcel USING btree (shop_fulfillment_id, seq) WHERE (voided_at IS NULL);

CREATE INDEX package_parcel_package_idx ON public.package_parcel USING btree (shop_fulfillment_id);

CREATE INDEX parcel_return_round_idx ON public.parcel_return USING btree (round_id);

CREATE INDEX payment_order_idx ON public.payment USING btree (order_id);

CREATE INDEX points_allocation_credit_idx ON public.points_allocation USING btree (credit_entry_id);

CREATE INDEX points_entry_history_idx ON public.points_entry USING btree (customer_id, created_at DESC, id DESC);

CREATE INDEX points_entry_lots_idx ON public.points_entry USING btree (customer_id, expires_at) WHERE (points > 0);

CREATE INDEX points_entry_order_idx ON public.points_entry USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE UNIQUE INDEX points_entry_spent_uq ON public.points_entry USING btree (order_id) WHERE (kind = 'spent'::text);

CREATE INDEX points_hold_customer_idx ON public.points_hold USING btree (customer_id) WHERE (state = 'held'::text);

CREATE INDEX points_settings_change_at_idx ON public.points_settings_change USING btree (changed_at DESC);

CREATE INDEX product_active_brand_idx ON public.product USING btree (brand) WHERE (status = 'active'::text);

CREATE INDEX product_attribute_value_attr_idx ON public.product_attribute_value USING btree (attribute_definition_id);

CREATE INDEX product_attribute_value_def_product_idx ON public.product_attribute_value USING btree (attribute_definition_id, product_id);

CREATE INDEX product_attribute_value_product_idx ON public.product_attribute_value USING btree (product_id);

CREATE INDEX product_brand_trgm_idx ON public.product USING gin (brand public.gin_trgm_ops);

CREATE INDEX product_change_media_change_idx ON public.product_change_media USING btree (change_id);

CREATE UNIQUE INDEX product_change_media_primary_uq ON public.product_change_media USING btree (change_id) WHERE is_primary;

CREATE INDEX product_change_queue_idx ON public.product_change USING btree (submitted_at) WHERE (state = 'in_review'::text);

CREATE INDEX product_change_shop_idx ON public.product_change USING btree (shop_id);

CREATE INDEX product_gst_change_product_idx ON public.product_gst_change USING btree (product_id);

CREATE INDEX product_in_review_idx ON public.product USING btree (submitted_at) WHERE (review_state = 'in_review'::text);

CREATE INDEX product_list_price_idx ON public.product USING btree (status, list_price_amount, id);

CREATE INDEX product_margin_not_set_idx ON public.product USING btree (shop_id) WHERE ((approved_at IS NOT NULL) AND (margin_kind IS NULL));

CREATE UNIQUE INDEX product_media_primary_uq ON public.product_media USING btree (product_id) WHERE is_primary;

CREATE INDEX product_media_product_idx ON public.product_media USING btree (product_id);

CREATE INDEX product_name_trgm_idx ON public.product USING gin (name public.gin_trgm_ops);

CREATE UNIQUE INDEX product_option_name_uq ON public.product_option USING btree (product_id, lower(name));

CREATE UNIQUE INDEX product_option_value_uq ON public.product_option_value USING btree (option_id, lower(value));

CREATE INDEX product_primary_category_id_idx ON public.product USING btree (primary_category_id);

CREATE INDEX product_search_trgm_idx ON public.product USING gin (lower(((((name || ' '::text) || COALESCE(brand, ''::text)) || ' '::text) || short_description)) public.gin_trgm_ops);

CREATE INDEX product_section_section_idx ON public.product_section USING btree (shop_section_id);

CREATE INDEX product_shop_created_idx ON public.product USING btree (shop_id, created_at DESC);

CREATE INDEX product_shop_id_idx ON public.product USING btree (shop_id);

CREATE INDEX product_shop_status_idx ON public.product USING btree (shop_id, status);

CREATE INDEX product_type_attribute_attr_idx ON public.product_type_attribute USING btree (attribute_definition_id);

CREATE INDEX product_type_attribute_type_idx ON public.product_type_attribute USING btree (product_type_id);

CREATE INDEX product_type_id_idx ON public.product USING btree (product_type_id);

CREATE INDEX product_variant_active_idx ON public.product_variant USING btree (product_id) WHERE (state = 'active'::text);

CREATE UNIQUE INDEX product_variant_combination_uq ON public.product_variant USING btree (product_id, option1_value_id, option2_value_id) NULLS NOT DISTINCT WHERE (state <> 'removed'::text);

CREATE INDEX product_variant_gtin_idx ON public.product_variant USING btree (gtin) WHERE (gtin IS NOT NULL);

CREATE INDEX product_variant_low_stock_idx ON public.product_variant USING btree (shop_id, stock_on_hand) WHERE stock_tracked;

CREATE INDEX product_variant_media_idx ON public.product_variant USING btree (media_id);

CREATE INDEX product_variant_option1_idx ON public.product_variant USING btree (option1_value_id);

CREATE INDEX product_variant_option2_idx ON public.product_variant USING btree (option2_value_id);

CREATE INDEX product_variant_product_idx ON public.product_variant USING btree (product_id, "position");

CREATE INDEX product_variant_shop_idx ON public.product_variant USING btree (shop_id);

CREATE UNIQUE INDEX product_variant_shop_sku_uq ON public.product_variant USING btree (shop_id, lower(sku)) WHERE ((sku IS NOT NULL) AND (state <> 'removed'::text));

CREATE UNIQUE INDEX promotion_code_code_uq ON public.promotion_code USING btree (upper(code));

CREATE UNIQUE INDEX promotion_code_one_shared_uq ON public.promotion_code USING btree (promotion_id) WHERE (NOT single_use);

CREATE INDEX promotion_code_promotion_idx ON public.promotion_code USING btree (promotion_id);

CREATE INDEX promotion_customer_customer_idx ON public.promotion_customer USING btree (customer_id);

CREATE INDEX promotion_group_member_promotion_idx ON public.promotion_group_member USING btree (promotion_id);

CREATE INDEX promotion_group_member_skin_idx ON public.promotion_group_member USING btree (skin_id) WHERE (skin_id IS NOT NULL);

CREATE INDEX promotion_image_promotion_idx ON public.promotion_image USING btree (promotion_id, "position");

CREATE INDEX promotion_live_idx ON public.promotion USING btree (trigger) WHERE ((published_at IS NOT NULL) AND (archived_at IS NULL));

CREATE UNIQUE INDEX promotion_skin_name_key ON public.promotion_skin USING btree (lower(btrim(name)));

CREATE UNIQUE INDEX promotion_skin_one_classic ON public.promotion_skin USING btree ((true)) WHERE (layout = 'classic'::text);

CREATE UNIQUE INDEX promotion_target_brand_uq ON public.promotion_target USING btree (promotion_id, lower(btrim(brand))) WHERE (brand IS NOT NULL);

CREATE UNIQUE INDEX promotion_target_category_uq ON public.promotion_target USING btree (promotion_id, category_id) WHERE (category_id IS NOT NULL);

CREATE UNIQUE INDEX promotion_target_product_uq ON public.promotion_target USING btree (promotion_id, product_id) WHERE (product_id IS NOT NULL);

CREATE INDEX promotion_target_promotion_idx ON public.promotion_target USING btree (promotion_id);

CREATE UNIQUE INDEX promotion_use_code_once ON public.promotion_use USING btree (code_id) WHERE (single_use AND (status = ANY (ARRAY['held'::text, 'confirmed'::text])));

CREATE INDEX promotion_use_customer_idx ON public.promotion_use USING btree (promotion_id, customer_id, status);

CREATE INDEX promotion_use_order_idx ON public.promotion_use USING btree (order_id);

CREATE INDEX promotion_use_promotion_idx ON public.promotion_use USING btree (promotion_id, status);

CREATE UNIQUE INDEX receipt_dispatch_auto_uq ON public.receipt_dispatch USING btree (order_id) WHERE (reason = 'order_paid'::text);

CREATE INDEX receipt_dispatch_order_idx ON public.receipt_dispatch USING btree (order_id, created_at DESC);

CREATE INDEX receipt_dispatch_pending_idx ON public.receipt_dispatch USING btree (status, created_at);

CREATE INDEX refund_line_order_item_idx ON public.refund_line USING btree (order_item_id);

CREATE INDEX refund_order_idx ON public.refund USING btree (order_id, created_at DESC);

CREATE INDEX refund_request_customer_idx ON public.refund_request USING btree (customer_id, created_at DESC);

CREATE INDEX refund_request_item_order_item_idx ON public.refund_request_item USING btree (order_item_id);

CREATE UNIQUE INDEX refund_request_one_open_uq ON public.refund_request USING btree (order_id) WHERE (status = 'open'::text);

CREATE INDEX refund_unsettled_idx ON public.refund USING btree (status) WHERE (status = ANY (ARRAY['submitting'::text, 'submitted'::text]));

CREATE UNIQUE INDEX round_package_open_uq ON public.round_package USING btree (shop_fulfillment_id) WHERE (state = 'assigned'::text);

CREATE INDEX round_package_sf_idx ON public.round_package USING btree (shop_fulfillment_id);

CREATE INDEX round_package_stop_idx ON public.round_package USING btree (stop_id);

CREATE INDEX round_stop_order_idx ON public.round_stop USING btree (order_id);

CREATE INDEX round_stop_round_idx ON public.round_stop USING btree (round_id, seq);

CREATE INDEX round_stop_shop_idx ON public.round_stop USING btree (shop_id);

CREATE INDEX round_stop_zone_idx ON public.round_stop USING btree (zone_id);

CREATE INDEX shop_attention_state_pending_idx ON public.shop_attention_state USING btree (shop_id) WHERE (notified_at IS NULL);

CREATE INDEX shop_fulfillment_shop_idx ON public.shop_fulfillment USING btree (shop_id);

CREATE INDEX shop_product_sales_day_product_idx ON public.shop_product_sales_day USING btree (product_id);

CREATE INDEX shop_section_shop_idx ON public.shop_section USING btree (shop_id);

CREATE INDEX shop_staff_role_role_key_idx ON public.shop_staff_role USING btree (role_key);

CREATE INDEX shop_staff_shop_id_idx ON public.shop_staff USING btree (shop_id);

CREATE INDEX stock_movement_order_idx ON public.stock_movement USING btree (order_id);

CREATE INDEX stock_movement_product_idx ON public.stock_movement USING btree (product_id, created_at DESC);

CREATE INDEX stock_movement_shop_idx ON public.stock_movement USING btree (shop_id, created_at DESC);

CREATE INDEX stock_movement_variant_idx ON public.stock_movement USING btree (variant_id, created_at DESC);

CREATE UNIQUE INDEX tax_document_adjustment_uq ON public.tax_document USING btree (refund_id) WHERE (kind = 'adjustment'::text);

CREATE UNIQUE INDEX tax_document_invoice_uq ON public.tax_document USING btree (order_id) WHERE (kind = 'invoice'::text);

CREATE INDEX vehicle_holding_driver_idx ON public.vehicle_holding USING btree (driver_id);

CREATE UNIQUE INDEX vehicle_holding_open_driver_uq ON public.vehicle_holding USING btree (driver_id) WHERE (ended_at IS NULL);

CREATE UNIQUE INDEX vehicle_holding_open_vehicle_uq ON public.vehicle_holding USING btree (vehicle_id) WHERE (ended_at IS NULL);

CREATE INDEX vehicle_holding_vehicle_idx ON public.vehicle_holding USING btree (vehicle_id);

CREATE UNIQUE INDEX vehicle_plate_active_uq ON public.vehicle USING btree (upper(registration_plate)) WHERE (status <> 'retired'::text);

CREATE INDEX vehicle_status_idx ON public.vehicle USING btree (status);

CREATE TRIGGER shop_ops_order_item_ins AFTER INSERT ON public.order_item FOR EACH ROW EXECUTE FUNCTION public.shop_ops_order_item_added();

CREATE TRIGGER shop_ops_order_status AFTER UPDATE OF status ON public."order" FOR EACH ROW EXECUTE FUNCTION public.shop_ops_order_status_changed();

CREATE TRIGGER shop_ops_portion_ins AFTER INSERT ON public.shop_fulfillment FOR EACH ROW EXECUTE FUNCTION public.shop_ops_portion_changed();

CREATE TRIGGER shop_ops_portion_upd AFTER UPDATE OF status ON public.shop_fulfillment FOR EACH ROW EXECUTE FUNCTION public.shop_ops_portion_changed();

CREATE TRIGGER shop_ops_refund_ins AFTER INSERT ON public.refund FOR EACH ROW EXECUTE FUNCTION public.shop_ops_refund_changed();

CREATE TRIGGER shop_ops_refund_upd AFTER UPDATE OF status ON public.refund FOR EACH ROW EXECUTE FUNCTION public.shop_ops_refund_changed();

ALTER TABLE ONLY admin.staff_role
    ADD CONSTRAINT staff_role_role_key_fkey FOREIGN KEY (role_key) REFERENCES admin.role(key);

ALTER TABLE ONLY admin.staff_role
    ADD CONSTRAINT staff_role_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES admin.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assignment_exclusion
    ADD CONSTRAINT assignment_exclusion_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.assignment_exclusion
    ADD CONSTRAINT assignment_exclusion_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attribute_allowed_value
    ADD CONSTRAINT attribute_allowed_value_attribute_definition_id_fkey FOREIGN KEY (attribute_definition_id) REFERENCES public.attribute_definition(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.carrier_handoff
    ADD CONSTRAINT carrier_handoff_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.cart_change_log
    ADD CONSTRAINT cart_change_log_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.cart(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.cart(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.cart_item
    ADD CONSTRAINT cart_item_variant_fk FOREIGN KEY (variant_id, product_id) REFERENCES public.product_variant(id, product_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.cart
    ADD CONSTRAINT cart_promotion_code_id_fkey FOREIGN KEY (promotion_code_id) REFERENCES public.promotion_code(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.cart_saved_item
    ADD CONSTRAINT cart_saved_item_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.cart(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cart_saved_item
    ADD CONSTRAINT cart_saved_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.cart_saved_item
    ADD CONSTRAINT cart_saved_item_variant_fk FOREIGN KEY (variant_id, product_id) REFERENCES public.product_variant(id, product_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.courier_consignment
    ADD CONSTRAINT courier_consignment_courier_service_id_fkey FOREIGN KEY (courier_service_id) REFERENCES public.courier_service(id);

ALTER TABLE ONLY public.courier_consignment_event
    ADD CONSTRAINT courier_consignment_event_consignment_id_fkey FOREIGN KEY (consignment_id) REFERENCES public.courier_consignment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.courier_consignment
    ADD CONSTRAINT courier_consignment_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.customer_address
    ADD CONSTRAINT customer_address_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_closure_request
    ADD CONSTRAINT customer_closure_request_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_list
    ADD CONSTRAINT customer_list_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_list_entry
    ADD CONSTRAINT customer_list_entry_list_fk FOREIGN KEY (list_id, customer_id) REFERENCES public.customer_list(id, customer_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_list_entry
    ADD CONSTRAINT customer_list_entry_saved_fk FOREIGN KEY (customer_id, product_id) REFERENCES public.customer_saved_item(customer_id, product_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_saved_item
    ADD CONSTRAINT customer_saved_item_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_saved_item
    ADD CONSTRAINT customer_saved_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.customer_saved_item
    ADD CONSTRAINT customer_saved_item_variant_fk FOREIGN KEY (variant_id, product_id) REFERENCES public.product_variant(id, product_id) ON DELETE SET NULL (variant_id);

ALTER TABLE ONLY public.delivery_attempt_failure
    ADD CONSTRAINT delivery_attempt_failure_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.delivery_attempt_failure
    ADD CONSTRAINT delivery_attempt_failure_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.round_stop(id);

ALTER TABLE ONLY public.delivery_distance_band
    ADD CONSTRAINT delivery_distance_band_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.delivery_fee_plan(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_change_id_fkey FOREIGN KEY (change_id) REFERENCES public.order_delivery_type_change(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_courier_service_id_fkey FOREIGN KEY (courier_service_id) REFERENCES public.courier_service(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_points_entry_id_fkey FOREIGN KEY (points_entry_id) REFERENCES public.points_entry(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refund(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_override
    ADD CONSTRAINT delivery_override_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.delivery_slot(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_captured_by_driver_id_fkey FOREIGN KEY (captured_by_driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.round_stop(id);

ALTER TABLE ONLY public.delivery_slot_booking
    ADD CONSTRAINT delivery_slot_booking_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_slot_booking
    ADD CONSTRAINT delivery_slot_booking_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.delivery_slot(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.delivery_slot_premium
    ADD CONSTRAINT delivery_slot_premium_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.delivery_fee_plan(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_slot_premium
    ADD CONSTRAINT delivery_slot_premium_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.delivery_slot(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_weight_band
    ADD CONSTRAINT delivery_weight_band_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.delivery_fee_plan(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.delivery_zone_postcode
    ADD CONSTRAINT delivery_zone_postcode_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.delivery_zone(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dispatch_wave
    ADD CONSTRAINT dispatch_wave_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.delivery_collection_run(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.driver_duty_session
    ADD CONSTRAINT driver_duty_session_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.driver_round
    ADD CONSTRAINT driver_round_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.driver_round
    ADD CONSTRAINT driver_round_wave_id_fkey FOREIGN KEY (wave_id) REFERENCES public.dispatch_wave(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.driver_zone_capability
    ADD CONSTRAINT driver_zone_capability_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.driver_zone_capability
    ADD CONSTRAINT driver_zone_capability_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.delivery_zone(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_note
    ADD CONSTRAINT feedback_note_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.feedback_submission(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_reply
    ADD CONSTRAINT feedback_reply_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.feedback_submission(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feedback_submission
    ADD CONSTRAINT feedback_submission_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fulfillment_event
    ADD CONSTRAINT fulfillment_event_actor_staff_id_fkey FOREIGN KEY (actor_staff_id) REFERENCES public.shop_staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fulfillment_event
    ADD CONSTRAINT fulfillment_event_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_item(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fulfillment_event
    ADD CONSTRAINT fulfillment_event_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fulfillment_item
    ADD CONSTRAINT fulfillment_item_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_item(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fulfillment_item
    ADD CONSTRAINT fulfillment_item_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fulfillment_note
    ADD CONSTRAINT fulfillment_note_author_staff_id_fkey FOREIGN KEY (author_staff_id) REFERENCES public.shop_staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fulfillment_note
    ADD CONSTRAINT fulfillment_note_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.fulfillment_tag
    ADD CONSTRAINT fulfillment_tag_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.shop_staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.fulfillment_tag
    ADD CONSTRAINT fulfillment_tag_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.hub_checkin
    ADD CONSTRAINT hub_checkin_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.hub_checkin
    ADD CONSTRAINT hub_checkin_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.insights_dirty
    ADD CONSTRAINT insights_dirty_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.insights_state
    ADD CONSTRAINT insights_state_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.label_print
    ADD CONSTRAINT label_print_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.package_parcel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.label_print
    ADD CONSTRAINT label_print_shop_staff_id_fkey FOREIGN KEY (shop_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.package_parcel(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.label_read
    ADD CONSTRAINT label_read_shop_staff_id_fkey FOREIGN KEY (shop_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.order_business_identity
    ADD CONSTRAINT order_business_identity_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id);

ALTER TABLE ONLY public.order_courier_collection_change
    ADD CONSTRAINT order_courier_collection_change_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_courier_service_id_fkey FOREIGN KEY (courier_service_id) REFERENCES public.courier_service(id);

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_delivery_type_change
    ADD CONSTRAINT order_delivery_type_change_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_item
    ADD CONSTRAINT order_item_variant_fk FOREIGN KEY (variant_id, product_id) REFERENCES public.product_variant(id, product_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_package_delivery
    ADD CONSTRAINT order_package_delivery_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_package_delivery
    ADD CONSTRAINT order_package_delivery_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_package_delivery
    ADD CONSTRAINT order_package_delivery_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.delivery_slot(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_promotion
    ADD CONSTRAINT order_promotion_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.promotion_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_promotion
    ADD CONSTRAINT order_promotion_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_promotion
    ADD CONSTRAINT order_promotion_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.package_arrival
    ADD CONSTRAINT package_arrival_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.package_parcel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id);

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id);

ALTER TABLE ONLY public.package_handover
    ADD CONSTRAINT package_handover_shop_staff_id_fkey FOREIGN KEY (shop_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.package_parcel(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id);

ALTER TABLE ONLY public.package_hold
    ADD CONSTRAINT package_hold_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id);

ALTER TABLE ONLY public.package_parcel
    ADD CONSTRAINT package_parcel_pack_scanned_by_staff_id_fkey FOREIGN KEY (pack_scanned_by_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.package_parcel
    ADD CONSTRAINT package_parcel_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.package_parcel
    ADD CONSTRAINT package_parcel_voided_by_staff_id_fkey FOREIGN KEY (voided_by_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.parcel_return
    ADD CONSTRAINT parcel_return_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.parcel_return
    ADD CONSTRAINT parcel_return_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id);

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.points_account
    ADD CONSTRAINT points_account_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.points_allocation
    ADD CONSTRAINT points_allocation_credit_entry_id_fkey FOREIGN KEY (credit_entry_id) REFERENCES public.points_entry(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.points_allocation
    ADD CONSTRAINT points_allocation_debit_entry_id_fkey FOREIGN KEY (debit_entry_id) REFERENCES public.points_entry(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.points_entry
    ADD CONSTRAINT points_entry_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refund(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.points_expiry_notice
    ADD CONSTRAINT points_expiry_notice_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.points_hold
    ADD CONSTRAINT points_hold_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.points_hold
    ADD CONSTRAINT points_hold_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_attribute_value
    ADD CONSTRAINT product_attribute_value_attribute_definition_id_fkey FOREIGN KEY (attribute_definition_id) REFERENCES public.attribute_definition(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_attribute_value
    ADD CONSTRAINT product_attribute_value_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_change_media
    ADD CONSTRAINT product_change_media_change_id_fkey FOREIGN KEY (change_id) REFERENCES public.product_change(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_change
    ADD CONSTRAINT product_change_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_change
    ADD CONSTRAINT product_change_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_gst_change
    ADD CONSTRAINT product_gst_change_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_gst_change
    ADD CONSTRAINT product_gst_change_shop_staff_id_fkey FOREIGN KEY (shop_staff_id) REFERENCES public.shop_staff(id);

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_option
    ADD CONSTRAINT product_option_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_option_value
    ADD CONSTRAINT product_option_value_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.product_option(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_primary_category_id_fkey FOREIGN KEY (primary_category_id) REFERENCES public.category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES public.product_type(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_section
    ADD CONSTRAINT product_section_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_section
    ADD CONSTRAINT product_section_shop_section_id_fkey FOREIGN KEY (shop_section_id) REFERENCES public.shop_section(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_type_attribute
    ADD CONSTRAINT product_type_attribute_attribute_definition_id_fkey FOREIGN KEY (attribute_definition_id) REFERENCES public.attribute_definition(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_type_attribute
    ADD CONSTRAINT product_type_attribute_product_type_id_fkey FOREIGN KEY (product_type_id) REFERENCES public.product_type(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.product_media(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_option1_value_id_fkey FOREIGN KEY (option1_value_id) REFERENCES public.product_option_value(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_option2_value_id_fkey FOREIGN KEY (option2_value_id) REFERENCES public.product_option_value(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_product_fk FOREIGN KEY (product_id, shop_id) REFERENCES public.product(id, shop_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_code
    ADD CONSTRAINT promotion_code_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_customer
    ADD CONSTRAINT promotion_customer_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_customer
    ADD CONSTRAINT promotion_customer_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_group
    ADD CONSTRAINT promotion_group_default_code_skin_id_fkey FOREIGN KEY (default_code_skin_id) REFERENCES public.promotion_skin(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_group
    ADD CONSTRAINT promotion_group_default_skin_id_fkey FOREIGN KEY (default_skin_id) REFERENCES public.promotion_skin(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_group_member
    ADD CONSTRAINT promotion_group_member_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.promotion_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_group_member
    ADD CONSTRAINT promotion_group_member_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.promotion_image(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.promotion_group_member
    ADD CONSTRAINT promotion_group_member_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_group_member
    ADD CONSTRAINT promotion_group_member_skin_id_fkey FOREIGN KEY (skin_id) REFERENCES public.promotion_skin(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_image
    ADD CONSTRAINT promotion_image_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_target
    ADD CONSTRAINT promotion_target_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_target
    ADD CONSTRAINT promotion_target_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_target
    ADD CONSTRAINT promotion_target_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.promotion_code(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.promotion_use
    ADD CONSTRAINT promotion_use_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.receipt_dispatch
    ADD CONSTRAINT receipt_dispatch_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_line
    ADD CONSTRAINT refund_line_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_item(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.refund_line
    ADD CONSTRAINT refund_line_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refund(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund
    ADD CONSTRAINT refund_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.refund_proposal_dismissal
    ADD CONSTRAINT refund_proposal_dismissal_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_item(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_proposal_dismissal
    ADD CONSTRAINT refund_proposal_dismissal_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_request
    ADD CONSTRAINT refund_request_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_request_item
    ADD CONSTRAINT refund_request_item_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_item(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_request_item
    ADD CONSTRAINT refund_request_item_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.refund_request(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_request
    ADD CONSTRAINT refund_request_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.round_package
    ADD CONSTRAINT round_package_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.parcel_return(id);

ALTER TABLE ONLY public.round_package
    ADD CONSTRAINT round_package_shop_fulfillment_id_fkey FOREIGN KEY (shop_fulfillment_id) REFERENCES public.shop_fulfillment(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.round_package
    ADD CONSTRAINT round_package_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.round_stop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.round_sequence_waiver
    ADD CONSTRAINT round_sequence_waiver_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id);

ALTER TABLE ONLY public.round_stop
    ADD CONSTRAINT round_stop_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.round_stop
    ADD CONSTRAINT round_stop_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.driver_round(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.round_stop
    ADD CONSTRAINT round_stop_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.round_stop
    ADD CONSTRAINT round_stop_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.delivery_zone(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.shop_attention_state
    ADD CONSTRAINT shop_attention_state_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_fulfillment
    ADD CONSTRAINT shop_fulfillment_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_fulfillment
    ADD CONSTRAINT shop_fulfillment_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.shop_product_sales_day
    ADD CONSTRAINT shop_product_sales_day_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_product_sales_day
    ADD CONSTRAINT shop_product_sales_day_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_sales_hour
    ADD CONSTRAINT shop_sales_hour_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_section
    ADD CONSTRAINT shop_section_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_staff_role
    ADD CONSTRAINT shop_staff_role_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.shop_role(key);

ALTER TABLE ONLY public.shop_staff_role
    ADD CONSTRAINT shop_staff_role_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.shop_staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shop_staff
    ADD CONSTRAINT shop_staff_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.shop_stock_settings
    ADD CONSTRAINT shop_stock_settings_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shop(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_variant_fk FOREIGN KEY (variant_id, product_id) REFERENCES public.product_variant(id, product_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tax_document
    ADD CONSTRAINT tax_document_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(id);

ALTER TABLE ONLY public.tax_document
    ADD CONSTRAINT tax_document_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.refund(id);

ALTER TABLE ONLY public.vehicle_check
    ADD CONSTRAINT vehicle_check_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id);

ALTER TABLE ONLY public.vehicle_check
    ADD CONSTRAINT vehicle_check_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicle(id);

ALTER TABLE ONLY public.vehicle_holding
    ADD CONSTRAINT vehicle_holding_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.vehicle_holding
    ADD CONSTRAINT vehicle_holding_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicle(id) ON DELETE RESTRICT;

GRANT USAGE ON SCHEMA public TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assignment_exclusion TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.attribute_allowed_value TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.attribute_definition TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.business_tax TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.carrier_handoff TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cart TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cart_change_log TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cart_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cart_saved_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.category TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_consignment TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.courier_consignment_event TO effy_shopper;

GRANT SELECT ON TABLE public.courier_excluded_postcode TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_service TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_address TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_closure_request TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_list TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_list_entry TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_saved_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_attempt_failure TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_collection_run TO effy_shopper;

GRANT SELECT ON TABLE public.delivery_distance_band TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_fee_plan TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_non_delivery_date TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.delivery_override TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_proof TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_settings TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_slot TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_slot_booking TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_slot_load TO effy_shopper;

GRANT SELECT ON TABLE public.delivery_slot_premium TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_weight_band TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_zone TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_zone_postcode TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.device_token TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.dispatch_wave TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.driver TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.driver_duty_session TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.driver_round TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.driver_zone_capability TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_delivery_event TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_delivery_status TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feedback_note TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feedback_reply TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feedback_submission TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfillment_event TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfillment_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfillment_note TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfillment_tag TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.hub_checkin TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.insights_dirty TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.insights_state TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.label_print TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.label_read TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.locality TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.media_rendition TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.newsletter_subscriber TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notification_request TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."order" TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_business_identity TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.order_courier_collection_change TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.order_delivery_type_change TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_package_delivery TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_policy TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_promotion TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.package_arrival TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.package_handover TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.package_hold TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.package_parcel TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.parcel_return TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payment TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.points_account TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.points_allocation TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.points_entry TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.points_expiry_notice TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.points_hold TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.points_settings TO effy_shopper;

GRANT SELECT,INSERT ON TABLE public.points_settings_change TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_attribute_value TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_change TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_change_media TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_gst_change TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_media TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_option TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_option_value TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_section TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_type TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_type_attribute TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_variant TO effy_shopper;

GRANT SELECT ON TABLE public.promotion TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_code TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_customer TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_group TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_group_member TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_image TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_skin TO effy_shopper;

GRANT SELECT ON TABLE public.promotion_target TO effy_shopper;

GRANT SELECT,INSERT,UPDATE ON TABLE public.promotion_use TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.receipt_dispatch TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund_line TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund_proposal_dismissal TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund_request TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.refund_request_item TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.round_package TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.round_sequence_waiver TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.round_stop TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_attention_state TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_fulfillment TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_product_sales_day TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_role TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_sales_hour TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_section TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_staff TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_staff_role TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shop_stock_settings TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stock_movement TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stripe_event TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tax_document TO effy_shopper;

GRANT SELECT,USAGE ON SEQUENCE public.tax_document_number_seq TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.vehicle TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.vehicle_check TO effy_shopper;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.vehicle_holding TO effy_shopper;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO effy_shopper;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO effy_shopper;

INSERT INTO admin.role (key, description) VALUES ('admin', 'Administrator — full back-office access');
INSERT INTO admin.role (key, description) VALUES ('manager', 'Manager — elevated operational access');
INSERT INTO admin.role (key, description) VALUES ('csa', 'Customer-service agent — support access');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('3537f808-2679-4d93-850e-213d04ec57f2', 'dietary_labels', 'Dietary Labels', 'multi_select', NULL, 'Applicable dietary labels', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('044667ba-e3ab-4ade-ba87-e701202b9041', 'allergens', 'Allergens', 'multi_select', NULL, 'Declared allergens', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('34a7c738-4cc2-4b39-9997-95eedd816190', 'spice_level', 'Spice Level', 'single_select', NULL, 'Heat level', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('67cf567a-ff9a-4d8d-b95a-70840d49c451', 'prep_time', 'Prep Time', 'number', 'min', 'Preparation time in minutes', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('1a8a01f0-3574-48a2-8712-c4df2cf25d99', 'storage', 'Storage', 'single_select', NULL, 'Storage requirement', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('f6d3daa0-1827-4159-8188-5ff5dab931de', 'country_of_origin', 'Country of Origin', 'short_text', NULL, 'Country of origin', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('f50a7712-eb8a-4b63-9de4-005e552a82f9', 'ingredients', 'Ingredients', 'long_text', NULL, 'Full ingredient list', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('7c95da19-9415-42d6-94ca-8dbe265bb091', 'material', 'Material', 'short_text', NULL, 'Primary material', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES ('1a82d077-155a-4850-a19a-fe65357c602f', 'dimensions', 'Dimensions', 'short_text', NULL, 'Product dimensions', NULL, 'active', '2026-10-23 14:24:23.559097+00', '2026-10-23 14:24:23.559097+00');
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('03fce1f5-c40a-4fca-8a55-08f3d1a4b5df', '3537f808-2679-4d93-850e-213d04ec57f2', 'kosher', 'Kosher', 4);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('23b20eec-abb2-445f-a6fe-681919c834ff', '3537f808-2679-4d93-850e-213d04ec57f2', 'halal', 'Halal', 3);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('e5bae53d-c1c6-4501-af35-c576b5e8f06e', '3537f808-2679-4d93-850e-213d04ec57f2', 'gluten_free', 'Gluten Free', 2);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('bfb97fcf-69aa-4232-ba00-2b6b8c4609ac', '3537f808-2679-4d93-850e-213d04ec57f2', 'vegan', 'Vegan', 1);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('57dd370e-f79b-4058-a070-5a80dd08d64d', '3537f808-2679-4d93-850e-213d04ec57f2', 'vegetarian', 'Vegetarian', 0);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('381424a8-52be-4fac-a4e5-a5d3ff6c28a1', '044667ba-e3ab-4ade-ba87-e701202b9041', 'shellfish', 'Shellfish', 7);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('1999e0dd-5bd3-4aa3-9d11-731929a17529', '044667ba-e3ab-4ade-ba87-e701202b9041', 'fish', 'Fish', 6);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('14b9b146-53d6-4613-86f0-275686e656c5', '044667ba-e3ab-4ade-ba87-e701202b9041', 'wheat', 'Wheat', 5);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('14043200-962b-40c7-8dd6-3d3efaa025b3', '044667ba-e3ab-4ade-ba87-e701202b9041', 'soy', 'Soy', 4);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('cae2e9b3-3408-4cdb-a454-b0b3811afe84', '044667ba-e3ab-4ade-ba87-e701202b9041', 'tree_nuts', 'Tree Nuts', 3);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('43574109-b476-46ee-9cab-85f9d3245723', '044667ba-e3ab-4ade-ba87-e701202b9041', 'peanuts', 'Peanuts', 2);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('b237053b-e9c1-4d7b-99fb-cc7487133499', '044667ba-e3ab-4ade-ba87-e701202b9041', 'eggs', 'Eggs', 1);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('3385a72e-55bb-4ae4-9f3c-7542405c4988', '044667ba-e3ab-4ade-ba87-e701202b9041', 'milk', 'Milk', 0);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('e691c960-7e78-4232-adce-25c94e614038', '34a7c738-4cc2-4b39-9997-95eedd816190', 'extra_hot', 'Extra Hot', 4);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('c2595479-3bca-45d4-8b6c-eb1cf0146c4e', '34a7c738-4cc2-4b39-9997-95eedd816190', 'hot', 'Hot', 3);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('6e715dbd-ec42-4cca-9f96-dbd0795d47d2', '34a7c738-4cc2-4b39-9997-95eedd816190', 'medium', 'Medium', 2);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('1492c4b6-0a66-41ce-b6d6-bf42db0b35c6', '34a7c738-4cc2-4b39-9997-95eedd816190', 'mild', 'Mild', 1);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('ac6439e3-0fe7-4fcf-b7f7-218cd056f2b8', '34a7c738-4cc2-4b39-9997-95eedd816190', 'none', 'None', 0);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('c378660b-22d6-461d-8f2f-e9c547179bf8', '1a8a01f0-3574-48a2-8712-c4df2cf25d99', 'frozen', 'Frozen', 2);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('fc089f59-b970-4202-9720-5aa22a9aa9be', '1a8a01f0-3574-48a2-8712-c4df2cf25d99', 'chilled', 'Chilled', 1);
INSERT INTO public.attribute_allowed_value (id, attribute_definition_id, value, label, display_order) VALUES ('68ade59d-9edf-4cd0-a119-f02fef7d14f8', '1a8a01f0-3574-48a2-8712-c4df2cf25d99', 'ambient', 'Ambient', 0);
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('7451ae3b-c4d5-4ffd-ba89-1e000aa393f4', NULL, 'food', 'Food', 0, 'active', '2026-10-23 14:24:23.561915+00', '2026-10-23 14:24:23.561915+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('4bad5596-e6fa-4f5a-8ac3-68fecb801702', NULL, 'grocery', 'Grocery', 1, 'active', '2026-10-23 14:24:23.561915+00', '2026-10-23 14:24:23.561915+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('da12a078-9f8c-435e-b760-44a5c06c8579', NULL, 'household', 'Household', 2, 'active', '2026-10-23 14:24:23.561915+00', '2026-10-23 14:24:23.561915+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('eb3efd7c-5ae2-4c64-9a20-74baa49d20db', '7451ae3b-c4d5-4ffd-ba89-1e000aa393f4', 'snacks', 'Snacks', 2, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('776c7a64-4b05-4f97-8f6b-32d377e85008', '7451ae3b-c4d5-4ffd-ba89-1e000aa393f4', 'bakery', 'Bakery', 1, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('033ed643-bb52-42be-b666-5426142516d6', '7451ae3b-c4d5-4ffd-ba89-1e000aa393f4', 'meals', 'Meals', 0, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('c0b82da2-bf51-42e6-bb84-49f403b89950', '4bad5596-e6fa-4f5a-8ac3-68fecb801702', 'beverages', 'Beverages', 3, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('6d6364c2-56a2-4ae2-98d2-ce902083e144', '4bad5596-e6fa-4f5a-8ac3-68fecb801702', 'frozen', 'Frozen', 2, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('1d178857-4f0a-4781-a677-f8e4040b7805', '4bad5596-e6fa-4f5a-8ac3-68fecb801702', 'chilled', 'Chilled', 1, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('e9fa5e10-1a9e-43c7-85f8-9de96f7fd85c', '4bad5596-e6fa-4f5a-8ac3-68fecb801702', 'pantry', 'Pantry', 0, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('0650c09d-2750-4888-8e2d-c787f4779f44', 'da12a078-9f8c-435e-b760-44a5c06c8579', 'paper_goods', 'Paper Goods', 1, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.category (id, parent_id, key, name, display_order, status, created_at, updated_at) VALUES ('f5f8f0ea-a4c7-40ff-a939-d23de9ae98bd', 'da12a078-9f8c-435e-b760-44a5c06c8579', 'cleaning', 'Cleaning', 0, 'active', '2026-10-23 14:24:23.562505+00', '2026-10-23 14:24:23.562505+00');
INSERT INTO public.product_type (id, key, name, description, status, created_at, updated_at) VALUES ('a0e74544-e7dc-4d9e-818b-fd80f7e87cec', 'prepared_food', 'Prepared Food', 'Ready-to-eat meals and dishes', 'active', '2026-10-23 14:24:23.558532+00', '2026-10-23 14:24:23.558532+00');
INSERT INTO public.product_type (id, key, name, description, status, created_at, updated_at) VALUES ('c16203dc-dff8-43c0-b77e-38d1b52b254d', 'packaged_grocery', 'Packaged Grocery', 'Shelf-stable and chilled packaged goods', 'active', '2026-10-23 14:24:23.558532+00', '2026-10-23 14:24:23.558532+00');
INSERT INTO public.product_type (id, key, name, description, status, created_at, updated_at) VALUES ('eefee447-c3a6-4003-829d-ea62cf695bb5', 'beverage', 'Beverage', 'Drinks — soft, hot, and others', 'active', '2026-10-23 14:24:23.558532+00', '2026-10-23 14:24:23.558532+00');
INSERT INTO public.product_type (id, key, name, description, status, created_at, updated_at) VALUES ('b295d766-4828-43df-8adc-54f68d6b1a83', 'household', 'Household', 'Non-food household products', 'active', '2026-10-23 14:24:23.558532+00', '2026-10-23 14:24:23.558532+00');
INSERT INTO public.delivery_slot (id, start_time, end_time, cutoff_time, capacity, status, updated_by, created_at, updated_at, any_time) VALUES ('4be9eace-1796-4fa0-8ca7-0bbae0eeb8cb', '09:00:00', '21:00:00', '09:00:00', NULL, 'active', 'migration:085', '2026-10-23 14:24:24.519389+00', '2026-10-23 14:24:24.519389+00', true);
INSERT INTO public.order_policy (singleton, minimum_subtotal_amount, currency, max_line_quantity, max_distinct_items, updated_by, updated_at) VALUES (true, 0.00, 'AUD', 99, 100, NULL, '2026-10-23 14:24:23.682075+00');
INSERT INTO public.points_settings (id, cents_per_point, expiry_months, csa_credit_limit_points, warning_days, hold_minutes, updated_by, updated_at) VALUES (1, 1, 12, 2000, 30, 30, 'migration', '2026-10-23 14:24:24.342209+00');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('aae90db3-adb8-4ff6-9599-d2d1917fecd8', 'a0e74544-e7dc-4d9e-818b-fd80f7e87cec', 'f50a7712-eb8a-4b63-9de4-005e552a82f9', false, 4, 'Details');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('718796e0-2bd0-4cbd-a36a-2ac3179ed900', 'a0e74544-e7dc-4d9e-818b-fd80f7e87cec', '67cf567a-ff9a-4d8d-b95a-70840d49c451', false, 3, 'Preparation');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('cf876b42-de3e-411e-80d9-58d374a501b0', 'a0e74544-e7dc-4d9e-818b-fd80f7e87cec', '34a7c738-4cc2-4b39-9997-95eedd816190', false, 2, 'Dietary');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('26817ce5-e880-46c1-aeb4-5e11253b78e2', 'a0e74544-e7dc-4d9e-818b-fd80f7e87cec', '044667ba-e3ab-4ade-ba87-e701202b9041', true, 1, 'Dietary');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('edcd6d78-2c03-4180-be9a-5fc241e342b8', 'a0e74544-e7dc-4d9e-818b-fd80f7e87cec', '3537f808-2679-4d93-850e-213d04ec57f2', false, 0, 'Dietary');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('01ce80c4-5c26-46e3-a34d-143ebe5b23f1', 'c16203dc-dff8-43c0-b77e-38d1b52b254d', 'f50a7712-eb8a-4b63-9de4-005e552a82f9', false, 4, 'Details');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('d7006688-18e4-4876-adf0-771ef2906ada', 'c16203dc-dff8-43c0-b77e-38d1b52b254d', 'f6d3daa0-1827-4159-8188-5ff5dab931de', false, 2, 'Details');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('320b17d8-9579-4b0e-8849-2f97bae8ebfe', 'c16203dc-dff8-43c0-b77e-38d1b52b254d', '1a8a01f0-3574-48a2-8712-c4df2cf25d99', true, 1, 'Storage');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('d7900e60-7a37-4016-8f77-5b517bc96886', 'c16203dc-dff8-43c0-b77e-38d1b52b254d', '044667ba-e3ab-4ade-ba87-e701202b9041', false, 3, 'Dietary');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('7746689e-93e8-4d3a-bf30-93696c5a3486', 'eefee447-c3a6-4003-829d-ea62cf695bb5', 'f6d3daa0-1827-4159-8188-5ff5dab931de', false, 2, 'Details');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('463ddb1a-1f17-4321-bfd3-972b8d819ead', 'eefee447-c3a6-4003-829d-ea62cf695bb5', '1a8a01f0-3574-48a2-8712-c4df2cf25d99', false, 1, 'Storage');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('68cd1ba0-49ed-41fd-98b7-b44a1edceb67', 'b295d766-4828-43df-8adc-54f68d6b1a83', '1a82d077-155a-4850-a19a-fe65357c602f', false, 1, 'Physical');
INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label) VALUES ('ff5d0dce-d5bd-4505-b552-e9284a68b89a', 'b295d766-4828-43df-8adc-54f68d6b1a83', '7c95da19-9415-42d6-94ca-8dbe265bb091', false, 0, 'Physical');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('6905aff3-80b5-479b-8344-71da1072d0b7', 'Classic', 'classic', '{}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.671939+00', '2026-10-23 14:24:24.671939+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('073ee152-7ead-49d9-94af-f897ca1c35da', 'Panel — Effy blue', 'panel', '{"chip": {"fill": "#ffffff", "show": true, "text": "#ffffff", "style": "dashed"}, "align": "start", "label": {"show": true, "size": "xs", "words": "auto", "colour": "#ffffff", "tracking": "wide"}, "shape": {"radius": "xl", "outline": null, "spacing": "regular"}, "button": {"fill": "#ffffff", "icon": true, "text": "#111827", "style": "filled", "words": "auto"}, "headline": {"size": "xl", "lines": 2, "colour": "#ffffff", "weight": "semibold"}, "background": {"colour": "#1d4ed8", "picture": "none"}, "supporting": {"show": true, "size": "sm", "lines": 2, "colour": "#ffffff", "weight": "regular"}, "decorations": {"set": "food", "show": true, "colour": "#ffffff", "strength": 0.2}}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('9cce1ae2-a6e5-4cd6-81da-a2f210a30584', 'Header card — Effy orange', 'header_card', '{"body": {"colour": "#ffffff", "tagColour": "#18181b"}, "chip": {"fill": "#f4f4f5", "show": false, "text": "#18181b", "style": "filled"}, "align": "start", "label": {"show": true, "size": "xs", "words": "auto", "colour": "#ffffff", "tracking": "wide"}, "shape": {"radius": "xl", "outline": null, "spacing": "regular"}, "button": {"fill": "#ffffff", "icon": true, "text": "#1d4ed8", "style": "link", "words": "auto"}, "headline": {"size": "xl", "lines": 2, "colour": "#ffffff", "weight": "semibold"}, "background": {"colour": "#c2410c", "picture": "none"}, "supporting": {"show": true, "size": "sm", "lines": 2, "colour": "#52525b", "weight": "regular"}, "decorations": {"set": "food", "show": true, "colour": "#ffffff", "strength": 0.2}}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('08e7235d-7846-48c8-ad6c-f051f5afd286', 'Full picture — dark tint', 'full_picture', '{"chip": {"fill": "#ffffff", "show": true, "text": "#ffffff", "style": "dashed"}, "align": "start", "label": {"show": true, "size": "xs", "words": "auto", "colour": "#ffffff", "tracking": "wide"}, "shape": {"radius": "xl", "outline": null, "spacing": "regular"}, "button": {"fill": "#ffffff", "icon": true, "text": "#111827", "style": "filled", "words": "auto"}, "headline": {"size": "xl", "lines": 2, "colour": "#ffffff", "weight": "semibold"}, "background": {"tint": {"colour": "#000000", "strength": 0.6}, "colour": "#18181b", "picture": "show"}, "supporting": {"show": true, "size": "sm", "lines": 2, "colour": "#ffffff", "weight": "regular"}, "textCorner": "bottom-start", "decorations": {"set": "food", "show": false, "colour": "#ffffff", "strength": 0.2}}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('cb97a603-70b8-4736-a7ab-b55cf3a3cb10', 'Picture beside — white', 'picture_beside', '{"chip": {"fill": "#ffffff", "show": true, "text": "#18181b", "style": "dashed"}, "align": "start", "label": {"show": true, "size": "xs", "words": "auto", "colour": "#1d4ed8", "tracking": "wide"}, "shape": {"radius": "xl", "outline": "#e4e4e7", "spacing": "regular"}, "button": {"fill": "#1d4ed8", "icon": true, "text": "#ffffff", "style": "filled", "words": "auto"}, "headline": {"size": "xl", "lines": 2, "colour": "#18181b", "weight": "semibold"}, "background": {"colour": "#ffffff", "picture": "show"}, "pictureFit": "cover", "supporting": {"show": true, "size": "sm", "lines": 2, "colour": "#52525b", "weight": "regular"}, "decorations": {"set": "food", "show": false, "colour": "#ffffff", "strength": 0.2}, "pictureSide": "end"}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('b050729f-ecfb-4be9-9411-9a8584b3b664', 'Tile — Effy blue', 'tile', '{"chip": {"fill": "#ffffff", "show": false, "text": "#ffffff", "style": "dashed"}, "align": "start", "label": {"show": true, "size": "xs", "words": "auto", "colour": "#ffffff", "tracking": "wide"}, "shape": {"radius": "xl", "outline": null, "spacing": "regular"}, "button": {"fill": "#ffffff", "icon": true, "text": "#111827", "style": "none", "words": "auto"}, "headline": {"size": "lg", "lines": 2, "colour": "#ffffff", "weight": "semibold"}, "background": {"colour": "#1d4ed8", "picture": "none"}, "supporting": {"show": false, "size": "sm", "lines": 2, "colour": "#ffffff", "weight": "regular"}, "decorations": {"set": "food", "show": true, "colour": "#ffffff", "strength": 0.2}}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by, created_at, updated_at) VALUES ('3f91136e-e47e-49f6-b917-e3ecdd13c543', 'Strip — Effy blue', 'strip', '{"chip": {"fill": "#ffffff", "show": true, "text": "#ffffff", "style": "dashed"}, "align": "start", "label": {"show": false, "size": "xs", "words": "auto", "colour": "#ffffff", "tracking": "wide"}, "shape": {"radius": "lg", "outline": null, "spacing": "compact"}, "button": {"fill": "#ffffff", "icon": true, "text": "#ffffff", "style": "link", "words": "auto"}, "headline": {"size": "md", "lines": 1, "colour": "#ffffff", "weight": "semibold"}, "background": {"colour": "#1d4ed8", "picture": "none"}, "supporting": {"show": false, "size": "sm", "lines": 2, "colour": "#ffffff", "weight": "regular"}, "decorations": {"set": "food", "show": false, "colour": "#ffffff", "strength": 0.2}}', 1, 'migration:095', NULL, '2026-10-23 14:24:24.672574+00', '2026-10-23 14:24:24.672574+00');
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('841eec3f-0fbe-4075-ac4c-9b44ac6f367a', 'home-hero', 'Home hero', 'The carousel at the top of Home.', 10, '2026-10-23 14:24:24.653011+00', '2026-10-23 14:24:24.653011+00', 'large', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('517e35de-e163-482c-81db-32ec58549e22', 'home-side', 'Home side cards', 'The cards beside the Home carousel (website) and under it (app).', 20, '2026-10-23 14:24:24.653011+00', '2026-10-23 14:24:24.653011+00', 'medium', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('6eafad41-aa40-4b5e-a00e-ce1b5ec7bc79', 'home-between', 'Between Home sections', 'Banners between the rails on Home.', 30, '2026-10-23 14:24:24.653011+00', '2026-10-23 14:24:24.653011+00', 'medium', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('ed04b70c-ad9e-4a29-9462-b03b912ddbc0', 'offers', 'Offers page', 'Everything on the Offers page.', 40, '2026-10-23 14:24:24.653011+00', '2026-10-23 14:24:24.653011+00', 'medium', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('a18672d2-f57f-47b9-a6ad-9406eafb5820', 'cart', 'Cart suggestions', 'Offers suggested in the cart.', 50, '2026-10-23 14:24:24.653011+00', '2026-10-23 14:24:24.653011+00', 'strip', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.promotion_group (id, key, name, description, sort, created_at, updated_at, size, default_skin_id, default_code_skin_id) VALUES ('e934eb2f-598b-4ad0-8201-a3e60c067ef9', 'mega-nav', 'Aisles menu', 'The offers in the website''s All aisles menu.', 60, '2026-10-23 14:24:24.674157+00', '2026-10-23 14:24:24.674157+00', 'small', '6905aff3-80b5-479b-8344-71da1072d0b7', NULL);
INSERT INTO public.shop_role (key, description) VALUES ('shop_manager', 'Manages a shop: full operator access plus shop-level administration.');
INSERT INTO public.shop_role (key, description) VALUES ('shop_staff', 'Baseline shop operator: day-to-day fulfillment work.');
-- +goose StatementEnd
