-- +goose Up
-- 096 — parcels (one row per physical bag), per-parcel hand-overs and holds, the read record, label
-- prints, and the customer's order documents (tax invoice, adjustment note) with the GST data they need.
-- Spec: specs/096-parcel-labels-scanning/. Decisions: research.md R1–R18.

-- ── Parcels (R1–R4) ────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.package_parcel (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- A bag goes with its package (shop_fulfillment goes with its order, ON DELETE CASCADE).
    shop_fulfillment_id  uuid        NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    -- ⚠ ONE CODE SPACE (R2): parcel 1's code IS the package's 089 code; parcels 2..N get new codes.
    -- This UNIQUE is the one guarantee that no two bags anywhere share a code.
    parcel_code          text        NOT NULL,
    seq                  int         NOT NULL CHECK (seq BETWEEN 1 AND 50),
    zone                 text        NOT NULL CHECK (zone IN ('ambient', 'chilled', 'frozen')),
    -- True once the shop has declared its bags; until then parcel 1 stands in from the backfill.
    declared             boolean     NOT NULL DEFAULT false,
    voided_at            timestamptz NULL,
    voided_by_staff_id   uuid        NULL REFERENCES public.shop_staff (id),
    voided_by_sub        text        NULL,
    pack_scanned_at      timestamptz NULL,
    pack_scanned_by_staff_id uuid    NULL REFERENCES public.shop_staff (id),
    -- When this bag's number, its package's bag count or its zone last changed. "Printed" means a
    -- label_print at or after this moment: a re-declaration after printing makes every changed label
    -- need printing again without touching the append-only print record (R4).
    numbered_at          timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT package_parcel_code_uq UNIQUE (parcel_code),
    CONSTRAINT package_parcel_code_check CHECK (parcel_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$'),
    -- R4 — bag 1 carries the package code that old labels and lookups resolve to; it is never voided.
    CONSTRAINT package_parcel_first_never_voided CHECK (seq <> 1 OR voided_at IS NULL)
);
CREATE UNIQUE INDEX package_parcel_live_seq_uq ON public.package_parcel (shop_fulfillment_id, seq) WHERE voided_at IS NULL;
CREATE INDEX package_parcel_package_idx ON public.package_parcel (shop_fulfillment_id);

COMMENT ON TABLE public.package_parcel IS
    '096 — one physical bag or box of a package. Parcel 1''s code is the package''s 089 code; every package has at least one. "n of N" = seq of count(live). Printed = a label_print at or after numbered_at.';

-- The generator now tests BOTH tables, so a new package code is never a live parcel code and vice versa.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.new_package_code() RETURNS text
LANGUAGE plpgsql
VOLATILE
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
-- +goose StatementEnd

-- +goose StatementBegin
CREATE FUNCTION public.new_parcel_code() RETURNS text
LANGUAGE sql
VOLATILE
AS $$ SELECT public.new_package_code() $$;
-- +goose StatementEnd

-- The zone a package's single stand-in bag gets: the coldest storage class among its lines (065), as
-- 089's cold mark did. A declaration replaces it.
-- +goose StatementBegin
CREATE FUNCTION public.package_coldest_zone(p_fulfillment uuid) RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT CASE WHEN bool_or(oi.storage_class = 'frozen')  THEN 'frozen'
                WHEN bool_or(oi.storage_class = 'chilled') THEN 'chilled'
                ELSE 'ambient' END
      FROM public.shop_fulfillment sf
      LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
     WHERE sf.id = p_fulfillment
$$;
-- +goose StatementEnd

-- ⚠ NO TRIGGER CREATES BAG 1. A trigger would run inside the payment transaction, invisible to every
-- review of the service that owns the write (shop db/triggers.guard.test.ts). The one writer of
-- `shop_fulfillment` (payments/finalize.ts) creates bag 1 through `createFirstParcels`, and
-- `labels.guard.test.ts` fails a writer that does not.

-- Backfill: one parcel per existing package, carrying its 089 code.
-- +goose StatementBegin
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT id, package_code FROM public.shop_fulfillment LOOP
        INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone)
        VALUES (r.id, r.package_code, 1, public.package_coldest_zone(r.id));
    END LOOP;
END
$$;
-- +goose StatementEnd

-- ── Hand-overs per parcel, by any actor (R5) ───────────────────────────────────────────────────────

ALTER TABLE public.package_handover
    ADD COLUMN parcel_id     uuid NULL REFERENCES public.package_parcel (id) ON DELETE CASCADE,
    ADD COLUMN actor_kind    text NOT NULL DEFAULT 'driver',
    ADD COLUMN shop_staff_id uuid NULL REFERENCES public.shop_staff (id),
    ADD COLUMN admin_sub     text NULL,
    ADD COLUMN device_at     timestamptz NULL;

UPDATE public.package_handover h
   SET parcel_id = p.id
  FROM public.package_parcel p
 WHERE p.shop_fulfillment_id = h.shop_fulfillment_id AND p.seq = 1;

ALTER TABLE public.package_handover
    ALTER COLUMN parcel_id SET NOT NULL,
    ALTER COLUMN actor_kind DROP DEFAULT,
    ALTER COLUMN driver_id DROP NOT NULL,
    ALTER COLUMN round_id DROP NOT NULL,
    DROP CONSTRAINT package_handover_once,
    DROP CONSTRAINT package_handover_step_check,
    ADD CONSTRAINT package_handover_once UNIQUE (change_id, parcel_id),
    -- Arrival at the hub is ONE step, `checkin`, whoever scans it (R5).
    ADD CONSTRAINT package_handover_step_check
        CHECK (step IN ('pack', 'collect', 'courier_handover', 'shop_pickup', 'checkin', 'load', 'deliver', 'return')),
    ADD CONSTRAINT package_handover_actor_check CHECK (
        (actor_kind = 'driver'      AND driver_id IS NOT NULL) OR
        (actor_kind = 'shop_staff'  AND shop_staff_id IS NOT NULL) OR
        (actor_kind = 'admin_staff' AND admin_sub IS NOT NULL)
    );
CREATE INDEX package_handover_parcel_idx ON public.package_handover (parcel_id);

COMMENT ON TABLE public.package_handover IS
    '090/096 — one row per PARCEL per hand-over and how it was done (scan, typed, manual), by a driver, shop staff or hub staff. Append-only. One writer: @effy/edge-shared/labels/handovers.ts.';

-- ── Holds per parcel (R6) ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.package_hold
    ADD COLUMN parcel_id uuid NULL REFERENCES public.package_parcel (id) ON DELETE CASCADE,
    DROP CONSTRAINT package_hold_once,
    DROP CONSTRAINT package_hold_reason_step,
    DROP CONSTRAINT package_hold_step_check,
    DROP CONSTRAINT package_hold_reason_check,
    ADD CONSTRAINT package_hold_step_check CHECK (step IN ('collect', 'checkin', 'load', 'deliver', 'return')),
    ADD CONSTRAINT package_hold_reason_check
        CHECK (reason IN ('not_at_shop', 'not_in_van', 'not_at_hub', 'damaged', 'wrong_temperature', 'other')),
    ADD CONSTRAINT package_hold_once UNIQUE NULLS NOT DISTINCT (change_id, shop_fulfillment_id, parcel_id),
    -- Where each reason can be said: check-in only ever finds a bag not in the van; "not at the shop"
    -- is said at the counter and "not at the hub" while loading.
    ADD CONSTRAINT package_hold_reason_step CHECK (
        (step <> 'checkin' OR reason = 'not_in_van') AND
        (reason <> 'not_in_van'  OR step IN ('checkin', 'deliver', 'return')) AND
        (reason <> 'not_at_shop' OR step = 'collect') AND
        (reason <> 'not_at_hub'  OR step = 'load')
    );
DROP INDEX public.package_hold_open_idx;
-- One open hold per package (parcel_id NULL) and one per parcel.
CREATE UNIQUE INDEX package_hold_open_idx ON public.package_hold (shop_fulfillment_id, parcel_id) NULLS NOT DISTINCT
    WHERE resolution IS NULL;

COMMENT ON COLUMN public.package_hold.parcel_id IS
    '096 — NULL: the whole package is held (093 — planners do not gather it). Set: one bag is missing; the package continues and the bag is not expected at later steps until resolved found.';

-- ── Hub check-in can be closed by hub staff (R8) ───────────────────────────────────────────────────

ALTER TABLE public.hub_checkin
    ADD COLUMN closed_by     text NOT NULL DEFAULT 'driver' CHECK (closed_by IN ('driver', 'admin_staff')),
    ADD COLUMN closed_by_sub text NULL;

-- ── Label prints (FR-015) and reads (R7) ───────────────────────────────────────────────────────────

CREATE TABLE public.label_print (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id      uuid        NOT NULL REFERENCES public.package_parcel (id) ON DELETE CASCADE,
    shop_staff_id  uuid        NULL REFERENCES public.shop_staff (id),
    layout         text        NOT NULL CHECK (layout IN ('a6', 'a4x4', 'roll62')),
    path           text        NOT NULL CHECK (path IN ('browser', 'zpl')),
    change_id      uuid        NOT NULL,
    printed_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT label_print_once UNIQUE (change_id, parcel_id)
);
CREATE INDEX label_print_parcel_idx ON public.label_print (parcel_id);
COMMENT ON TABLE public.label_print IS '096 — every print and reprint of a parcel label, recorded only after the print was sent. Append-only (labels.guard.test.ts).';

CREATE TABLE public.label_read (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_read_id    uuid        NOT NULL,
    actor_kind        text        NOT NULL CHECK (actor_kind IN ('driver', 'shop_staff', 'admin_staff')),
    driver_id         uuid        NULL REFERENCES public.driver (id),
    shop_staff_id     uuid        NULL REFERENCES public.shop_staff (id),
    admin_sub         text        NULL,
    surface           text        NOT NULL CHECK (surface IN ('driver_app', 'shop_web', 'back_office')),
    step              text        NOT NULL CHECK (step IN ('pack', 'collect', 'checkin', 'load', 'deliver', 'return', 'lookup')),
    raw               text        NOT NULL CHECK (length(raw) BETWEEN 1 AND 64),
    -- ⚠ Not `method`: that name belonged to a column 083 dropped, and the schema-drift guard tracks
    -- dropped names schema-wide (090's `handover_method` met the same rule).
    read_method       text        NOT NULL CHECK (read_method IN ('scan', 'typed')),
    client_outcome    text        NULL,
    server_outcome    text        NOT NULL,
    parcel_id         uuid        NULL REFERENCES public.package_parcel (id) ON DELETE SET NULL,
    round_id          uuid        NULL REFERENCES public.driver_round (id) ON DELETE SET NULL,
    device_id         text        NULL CHECK (device_id IS NULL OR length(device_id) <= 64),
    app_version       text        NULL CHECK (app_version IS NULL OR length(app_version) <= 32),
    device_at         timestamptz NULL,
    received_at       timestamptz NOT NULL DEFAULT now(),
    corrects_read_id  uuid        NULL REFERENCES public.label_read (id),
    CONSTRAINT label_read_client_uq UNIQUE (client_read_id),
    CONSTRAINT label_read_outcome_check CHECK (
        server_outcome IN ('accepted', 'already_counted', 'belongs_elsewhere', 'not_on_this_work', 'voided', 'cancelled', 'not_a_label', 'not_found')
        AND (client_outcome IS NULL OR client_outcome IN ('accepted', 'already_counted', 'belongs_elsewhere', 'not_on_this_work', 'voided', 'cancelled', 'not_a_label', 'not_found'))
    ),
    CONSTRAINT label_read_actor_check CHECK (
        (actor_kind = 'driver'      AND driver_id IS NOT NULL) OR
        (actor_kind = 'shop_staff'  AND shop_staff_id IS NOT NULL) OR
        (actor_kind = 'admin_staff' AND admin_sub IS NOT NULL)
    )
);
CREATE INDEX label_read_received_idx ON public.label_read (received_at);
CREATE INDEX label_read_parcel_idx ON public.label_read (parcel_id);
CREATE INDEX label_read_refused_idx ON public.label_read (server_outcome) WHERE server_outcome <> 'accepted';
COMMENT ON TABLE public.label_read IS
    '096 — every attempt to identify a bag (scan or typed), accepted or refused, on every surface. Append-only; a correction is a new row (corrects_read_id). One writer: @effy/edge-shared/labels/reads.ts.';

-- ── Tax data (R15, R17, R18) ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.product
    ADD COLUMN gst_status text NULL CHECK (gst_status IS NULL OR gst_status IN ('taxable', 'gst_free'));
COMMENT ON COLUMN public.product.gst_status IS '096 — taxable or GST-free; set by the shop (reviewed) or back-office. NULL = not yet classified.';

ALTER TABLE public.order_item
    ADD COLUMN gst_status text NULL CHECK (gst_status IS NULL OR gst_status IN ('taxable', 'gst_free'));
COMMENT ON COLUMN public.order_item.gst_status IS '096 — the product''s GST status captured at checkout. NULL for orders before 096: they have no tax invoice.';

CREATE TABLE public.product_gst_change (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     uuid        NOT NULL REFERENCES public.product (id),
    from_status    text        NULL,
    to_status      text        NOT NULL CHECK (to_status IN ('taxable', 'gst_free')),
    actor_kind     text        NOT NULL CHECK (actor_kind IN ('shop_staff', 'admin_staff')),
    shop_staff_id  uuid        NULL REFERENCES public.shop_staff (id),
    admin_sub      text        NULL,
    via            text        NOT NULL CHECK (via IN ('create', 'review', 'direct', 'bulk')),
    changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_gst_change_product_idx ON public.product_gst_change (product_id);

-- Singleton. ⚠ NO SEED: the legal name and ABN are real-world identifiers supplied by the operator
-- (constitution, Real-World Identifiers). Invoices stay off until the service accepts them.
CREATE TABLE public.business_tax (
    id                boolean     PRIMARY KEY DEFAULT true CHECK (id),
    legal_name        text        NULL CHECK (legal_name IS NULL OR length(btrim(legal_name)) BETWEEN 2 AND 200),
    abn               text        NULL CHECK (abn IS NULL OR abn ~ '^[0-9]{11}$'),
    fee_treatment     text        NULL CHECK (fee_treatment IS NULL OR fee_treatment IN ('taxable', 'gst_free')),
    invoices_enabled  boolean     NOT NULL DEFAULT false,
    updated_by_sub    text        NULL,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT business_tax_enabled_complete CHECK (
        NOT invoices_enabled OR (legal_name IS NOT NULL AND abn IS NOT NULL AND fee_treatment IS NOT NULL)
    )
);

CREATE TABLE public.order_business_identity (
    order_id       uuid        PRIMARY KEY REFERENCES public."order" (id),
    business_name  text        NULL CHECK (business_name IS NULL OR length(btrim(business_name)) BETWEEN 2 AND 200),
    abn            text        NULL CHECK (abn IS NULL OR abn ~ '^[0-9]{11}$'),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE public.tax_document_number_seq;

CREATE TABLE public.tax_document (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    kind       text        NOT NULL CHECK (kind IN ('invoice', 'adjustment')),
    order_id   uuid        NOT NULL REFERENCES public."order" (id),
    refund_id  uuid        NULL REFERENCES public.refund (id),
    number     text        NOT NULL,
    issued_at  timestamptz NOT NULL DEFAULT now(),
    snapshot   jsonb       NOT NULL,
    issuer     jsonb       NOT NULL,
    CONSTRAINT tax_document_number_uq UNIQUE (number),
    CONSTRAINT tax_document_refund_kind CHECK ((kind = 'adjustment') = (refund_id IS NOT NULL))
);
CREATE UNIQUE INDEX tax_document_invoice_uq ON public.tax_document (order_id) WHERE kind = 'invoice';
CREATE UNIQUE INDEX tax_document_adjustment_uq ON public.tax_document (refund_id) WHERE kind = 'adjustment';
COMMENT ON TABLE public.tax_document IS
    '096 — tax invoices and adjustment notes as issued: a frozen snapshot of exactly what the PDF prints. Never altered.';

-- ── Shop setting (FR-022) ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shop ADD COLUMN pack_scan_required boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.shop.pack_scan_required IS
    '096 — when true, every bag must be pack-scanned before the portion is ready for pickup. Written only by PUT /fleet/v1/shops/{id}/pack-scanning.';

-- ── Append-only (SC-007) ───────────────────────────────────────────────────────────────────────────
-- label_print, label_read and tax_document are never updated or deleted. Enforced by
-- labels.guard.test.ts (no UPDATE / DELETE of them anywhere in the services), not by a trigger: a
-- trigger that raises inside another service's transaction is what the shop trigger guard exists to
-- prevent.

-- +goose Down
ALTER TABLE public.shop DROP COLUMN pack_scan_required;
DROP TABLE public.tax_document;
DROP SEQUENCE public.tax_document_number_seq;
DROP TABLE public.order_business_identity;
DROP TABLE public.business_tax;
DROP TABLE public.product_gst_change;
ALTER TABLE public.order_item DROP COLUMN gst_status;
ALTER TABLE public.product DROP COLUMN gst_status;
DROP TABLE public.label_read;
DROP TABLE public.label_print;
ALTER TABLE public.hub_checkin DROP COLUMN closed_by_sub, DROP COLUMN closed_by;

-- Parcel-level holds and non-driver hand-overs have no 093/090 shape to return to.
DELETE FROM public.package_hold WHERE parcel_id IS NOT NULL;
DROP INDEX public.package_hold_open_idx;
CREATE UNIQUE INDEX package_hold_open_idx ON public.package_hold (shop_fulfillment_id) WHERE resolution IS NULL;
ALTER TABLE public.package_hold
    DROP CONSTRAINT package_hold_reason_step,
    DROP CONSTRAINT package_hold_once,
    DROP CONSTRAINT package_hold_reason_check,
    DROP CONSTRAINT package_hold_step_check,
    DROP COLUMN parcel_id;
DELETE FROM public.package_hold WHERE step NOT IN ('load', 'checkin') OR reason NOT IN ('not_at_hub', 'damaged', 'wrong_temperature', 'not_in_van', 'other');
ALTER TABLE public.package_hold
    ADD CONSTRAINT package_hold_step_check CHECK (step IN ('load', 'checkin')),
    ADD CONSTRAINT package_hold_reason_check CHECK (reason IN ('not_at_hub', 'damaged', 'wrong_temperature', 'not_in_van', 'other')),
    ADD CONSTRAINT package_hold_once UNIQUE (change_id, shop_fulfillment_id),
    ADD CONSTRAINT package_hold_reason_step CHECK ((reason = 'not_in_van') = (step = 'checkin'));

DELETE FROM public.package_handover
 WHERE actor_kind <> 'driver'
    OR step NOT IN ('collect', 'checkin', 'load', 'deliver', 'return')
    OR id NOT IN (SELECT DISTINCT ON (change_id, shop_fulfillment_id) id FROM public.package_handover ORDER BY change_id, shop_fulfillment_id, recorded_at);
DROP INDEX public.package_handover_parcel_idx;
ALTER TABLE public.package_handover
    DROP CONSTRAINT package_handover_actor_check,
    DROP CONSTRAINT package_handover_step_check,
    DROP CONSTRAINT package_handover_once,
    ADD CONSTRAINT package_handover_step_check CHECK (step IN ('collect', 'checkin', 'load', 'deliver', 'return')),
    ADD CONSTRAINT package_handover_once UNIQUE (change_id, shop_fulfillment_id),
    ALTER COLUMN round_id SET NOT NULL,
    ALTER COLUMN driver_id SET NOT NULL,
    DROP COLUMN device_at,
    DROP COLUMN admin_sub,
    DROP COLUMN shop_staff_id,
    DROP COLUMN actor_kind,
    DROP COLUMN parcel_id;

DROP FUNCTION public.package_coldest_zone(uuid);
DROP FUNCTION public.new_parcel_code();
DROP TABLE public.package_parcel;
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION public.new_package_code() RETURNS text
LANGUAGE plpgsql
VOLATILE
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
        IF NOT EXISTS (SELECT 1 FROM public.shop_fulfillment WHERE package_code = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END
$$;
-- +goose StatementEnd
