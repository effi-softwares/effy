-- +goose Up
-- 080 — Courier fulfilment: how a courier order's parcels reach the courier (via the hub, or picked up
-- from the supplier), the courier services Effy uses, and one consignment per parcel handed over.
--
-- ⚠ ADDITIVE. The services running when this is applied read none of it. ⚠ NO COURIER SERVICE IS
-- CREATED: a courier's name is a real-world identifier, entered by the operator (CLAUDE.md, prohibited
-- values). Until one is added and made the default, courier delivery reads "not ready".
--
-- ⚠ ONE RECORD PER FACT, UNCHANGED. "Handed over" is still public.carrier_handoff and "delivered" is
-- still public.package_arrival (053). A consignment holds the booking and the journey around them;
-- @effy/edge-shared/delivery consignment.ts writes all three together.

-- ── 1. Courier services ──────────────────────────────────────────────────────────────────────────

CREATE TABLE public.courier_service (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_name           text NOT NULL CHECK (length(btrim(courier_name)) BETWEEN 2 AND 60),
    service_name           text NOT NULL CHECK (length(btrim(service_name)) BETWEEN 2 AND 60),
    estimate_text          text NOT NULL CHECK (
                               estimate_text = btrim(estimate_text)
                               AND length(estimate_text) BETWEEN 3 AND 60
                               AND estimate_text !~ '[\n\r]'),
    max_business_days      int  NOT NULL CHECK (max_business_days BETWEEN 1 AND 30),
    pickup_weekdays        int[] NOT NULL CHECK (
                               cardinality(pickup_weekdays) BETWEEN 1 AND 7
                               AND pickup_weekdays <@ ARRAY[1,2,3,4,5,6,7]),
    pickup_cutoff          time NOT NULL,
    collects_from_supplier boolean NOT NULL DEFAULT false,
    status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    is_default             boolean NOT NULL DEFAULT false,
    updated_by             text NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT courier_service_name_uq UNIQUE (courier_name, service_name),
    CONSTRAINT courier_service_default_active_ck CHECK (NOT is_default OR status = 'active')
);
CREATE UNIQUE INDEX courier_service_one_default_uq ON public.courier_service (is_default) WHERE is_default;
COMMENT ON TABLE public.courier_service IS 'A courier company''s service Effy uses (080). Entered by the operator — never seeded. Exactly one active service may be the default: checkout tells a courier customer ITS timeframe. Retired services stay on the consignments that name them.';
COMMENT ON COLUMN public.courier_service.estimate_text IS 'What a customer reads, completing "Usually arrives in …" — e.g. "2–4 business days". An estimate, never a promise. An order keeps the text it was sold ("order".courier_estimate).';
COMMENT ON COLUMN public.courier_service.max_business_days IS 'When a handed-over parcel with no progress is OVERDUE (staff only). The estimate text is for customers and is never parsed.';
COMMENT ON COLUMN public.courier_service.pickup_weekdays IS 'ISO weekdays the courier collects (1 = Monday). With pickup_cutoff, decides when a parcel at the hub is due out (nextCourierPickup).';
COMMENT ON COLUMN public.courier_service.pickup_cutoff IS 'Melbourne wall clock. A parcel ready after it goes on the next pickup day.';

-- ── 2. How a courier order's parcels reach the courier ──────────────────────────────────────────

ALTER TABLE public.delivery_settings
    ADD COLUMN courier_collection_default text NOT NULL DEFAULT 'hub'
        CONSTRAINT delivery_settings_courier_collection_ck CHECK (courier_collection_default IN ('hub', 'supplier'));
COMMENT ON COLUMN public.delivery_settings.courier_collection_default IS 'How NEW courier orders reach the courier (080): hub = Effy drivers collect, hub staff hand over (as before); supplier = the courier collects from each supplier. Existing orders keep their own "order".courier_collection.';
COMMENT ON COLUMN public.delivery_settings.courier_estimate_text IS '079 — NO LONGER READ since 080: the customer is told the default courier service''s estimate_text. Dropped at the cutover (E9).';

ALTER TABLE public."order"
    ADD COLUMN courier_service_id uuid REFERENCES public.courier_service(id),
    ADD COLUMN courier_collection text
        CONSTRAINT order_courier_collection_ck CHECK (courier_collection IN ('hub', 'supplier'));
COMMENT ON COLUMN public."order".courier_service_id IS 'The DEFAULT courier service when the order was placed (080) — whose timeframe the customer was told. Staff may book another; the customer keeps what they were told. NULL unless a courier delivers.';
COMMENT ON COLUMN public."order".courier_collection IS 'How this courier order''s parcels reach the courier (080): hub | supplier. From the platform default at checkout; changed by staff only through @effy/edge-shared/delivery consignment.ts, until a parcel has left. NULL unless a courier delivers.';

CREATE TABLE public.order_courier_collection_change (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid NOT NULL REFERENCES public."order"(id) ON DELETE CASCADE,
    from_mode  text NOT NULL CHECK (from_mode IN ('hub', 'supplier')),
    to_mode    text NOT NULL CHECK (to_mode IN ('hub', 'supplier')),
    actor_sub  text NOT NULL,
    note       text CHECK (note IS NULL OR length(note) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_courier_collection_change_moves_ck CHECK (from_mode <> to_mode)
);
CREATE INDEX order_courier_collection_change_order_idx ON public.order_courier_collection_change (order_id, created_at);
COMMENT ON TABLE public.order_courier_collection_change IS 'APPEND-ONLY history of a courier order''s collection mode (080): who changed it, when and why.';

-- +goose StatementBegin
CREATE FUNCTION public.courier_parcel_collection(p_delivery_type text, p_mode text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE WHEN p_delivery_type = 'courier' AND p_mode = 'supplier' THEN 'supplier' ELSE 'hub' END;
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.courier_parcel_collection(text, text) IS '⚠ THE ONE DEFINITION of whether a package reaches its courier from the supplier (080): supplier only for a courier order in supplier mode; every other package goes through the hub. The collection planner excludes ''supplier'' packages and the hub handover list never lists them.';

-- ── 3. Consignments ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.courier_consignment (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment(id) ON DELETE RESTRICT,
    courier_service_id  uuid NOT NULL REFERENCES public.courier_service(id),
    collection          text NOT NULL CHECK (collection IN ('hub', 'supplier')),
    reference           text CHECK (reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 100),
    tracking_url        text CHECK (tracking_url IS NULL OR (tracking_url ~ '^https://' AND length(tracking_url) <= 500)),
    label_key           text CHECK (label_key IS NULL OR label_key ~ '^courier-label/'),
    pickup_date         date,
    pickup_from         time,
    pickup_to           time,
    state               text NOT NULL CHECK (state IN (
                            'booked', 'handed_over', 'in_transit', 'delivered',
                            'failed', 'lost', 'damaged', 'returned', 'cancelled')),
    created_by          text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT courier_consignment_window_ck CHECK ((pickup_from IS NULL) = (pickup_to IS NULL)
                                                    AND (pickup_from IS NULL OR pickup_from < pickup_to)),
    CONSTRAINT courier_consignment_window_date_ck CHECK (pickup_from IS NULL OR pickup_date IS NOT NULL)
);
CREATE UNIQUE INDEX courier_consignment_live_uq ON public.courier_consignment (shop_fulfillment_id)
    WHERE state <> 'cancelled';
CREATE INDEX courier_consignment_state_idx ON public.courier_consignment (state, updated_at);
COMMENT ON TABLE public.courier_consignment IS 'One parcel''s journey with a courier (080): the booking (service, reference, tracking link, label, pickup) and where it is. At most ONE live (not cancelled) consignment per package. ⚠ "Handed over" and "delivered" are still carrier_handoff and package_arrival; `state` is the latest event''s, kept for lists. ⚠ ONE WRITER — @effy/edge-shared/delivery consignment.ts.';
COMMENT ON COLUMN public.courier_consignment.collection IS 'How it reached (or will reach) the courier: hub | supplier — as it was when booked.';
COMMENT ON COLUMN public.courier_consignment.label_key IS 'The courier''s label, uploaded by staff, under courier-label/ in the media bucket. Read only through short-lived presigned URLs: it carries the customer''s name and address.';

CREATE TABLE public.courier_consignment_event (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consignment_id uuid NOT NULL REFERENCES public.courier_consignment(id) ON DELETE CASCADE,
    kind           text NOT NULL CHECK (kind IN (
                       'booked', 'handed_over', 'in_transit', 'delivered',
                       'failed', 'lost', 'damaged', 'returned', 'resolved', 'cancelled')),
    actor_kind     text NOT NULL CHECK (actor_kind IN ('staff', 'shop')),
    actor_sub      text NOT NULL,
    note           text CHECK (note IS NULL OR length(note) <= 500),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courier_consignment_event_idx ON public.courier_consignment_event (consignment_id, created_at);
COMMENT ON TABLE public.courier_consignment_event IS 'APPEND-ONLY steps of a consignment (080), each with who and when. A problem (failed | lost | damaged | returned) is OPEN until a later resolved or delivered. ⚠ One writer — consignment.ts.';

REVOKE UPDATE, DELETE ON public.order_courier_collection_change, public.courier_consignment_event FROM effy_shopper;

-- ── 4. Courier delivery is ready only with a default service ─────────────────────────────────────

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.courier_delivery_state(p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    s public.delivery_settings%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.delivery_settings WHERE id = 1;
    IF NOT COALESCE(s.courier_offered, false) THEN
        RETURN 'courier_off';
    END IF;

    -- Switched on, but nothing can sell it yet: no price, or no courier service to tell the customer
    -- the timeframe of (080 — the default service replaces 079's single estimate text).
    IF NOT EXISTS (SELECT 1 FROM public.courier_service c WHERE c.is_default AND c.status = 'active')
       OR NOT EXISTS (SELECT 1 FROM public.delivery_fee_plan p WHERE p.kind = 'courier' AND p.is_active) THEN
        RETURN 'courier_not_ready';
    END IF;

    IF NOT public.delivery_model_v2_at(p_at) THEN
        RETURN 'courier_pending';
    END IF;

    RETURN 'courier_offered';
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.courier_delivery_state(timestamptz) IS 'Where courier delivery stands at an instant, for the whole platform (079, 080): courier_off | courier_not_ready (on, but no active courier fee table or no active default courier service) | courier_pending (ready; the new delivery model is not on yet) | courier_offered. ⚠ The one definition.';

-- ── 5. The customer is told when it is with the courier ─────────────────────────────────────────

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring',
        'order_with_courier'
    ));

-- +goose Down
-- Dev-only single-step reversal. ⚠ Refuses rather than throw away a parcel's courier record.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.courier_consignment) THEN
        RAISE EXCEPTION '080 down: a consignment exists; refusing to drop it';
    END IF;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
DELETE FROM public.notification_request WHERE type = 'order_with_courier';
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring'
    ));
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.courier_delivery_state(p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    s public.delivery_settings%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.delivery_settings WHERE id = 1;
    IF NOT COALESCE(s.courier_offered, false) THEN
        RETURN 'courier_off';
    END IF;
    IF s.courier_estimate_text IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.delivery_fee_plan p WHERE p.kind = 'courier' AND p.is_active) THEN
        RETURN 'courier_not_ready';
    END IF;
    IF NOT public.delivery_model_v2_at(p_at) THEN
        RETURN 'courier_pending';
    END IF;
    RETURN 'courier_offered';
END
$$;
-- +goose StatementEnd
DROP TABLE public.courier_consignment_event;
DROP TABLE public.courier_consignment;
DROP FUNCTION public.courier_parcel_collection(text, text);
DROP TABLE public.order_courier_collection_change;
ALTER TABLE public."order" DROP COLUMN courier_collection, DROP COLUMN courier_service_id;
ALTER TABLE public.delivery_settings DROP COLUMN courier_collection_default;
DROP TABLE public.courier_service;
