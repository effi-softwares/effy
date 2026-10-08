-- +goose Up
-- 077-delivery-fee-engine-v2, second migration — the distance tiers go.
--
-- ⚠ APPLY THIS ONLY AFTER THE 077 SERVICES ARE DEPLOYED. Until then the running checkout prices from
-- `delivery_ring_price`; dropping it first would refuse every order between the two steps. The first
-- 077 migration copied every tier price into `delivery_distance_band`, and since 077's code nothing
-- reads a tier (`fee.guard.test.ts` P21 fails a source file that does).
--
-- What goes: the tier tables, the bridge that tiered a postcode by its distance (076), and the four
-- zone columns that only ever served tiers. A coverage group (`delivery_zone`) keeps its name, status
-- and the same-day flag the live checkout still reads until the checkout feature (E5).

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'delivery_fee_plan' AND column_name = 'kind') THEN
        RAISE EXCEPTION '077: the fee engine''s first migration has not been applied. Apply it, deploy the services, then this.';
    END IF;
    -- ⚠ Only the plan IN FORCE must be able to price without tiers. A courier table or a half-built
    -- draft legitimately has no distance bands, and must not block this.
    IF EXISTS (SELECT 1 FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy')
       AND NOT (SELECT public.delivery_plan_is_complete(id) FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy') THEN
        RAISE EXCEPTION '077: the active fee plan cannot price every delivery without distance tiers. Fix it on the Pricing tab first.';
    END IF;
END
$$;
-- +goose StatementEnd

DROP FUNCTION public.coverage_ring_for_km(numeric);
DROP TABLE public.delivery_ring_price;

DROP INDEX IF EXISTS public.delivery_zone_ring_idx;
ALTER TABLE public.delivery_zone
    DROP COLUMN ring_id,
    DROP COLUMN suggested_ring_id,
    DROP COLUMN ring_is_overridden,
    DROP COLUMN hub_distance_km;

DROP TABLE public.delivery_ring;

COMMENT ON TABLE public.delivery_zone IS 'A COVERAGE GROUP (076): a name staff give to some of the postcodes Effy delivers to. Organisational only — it decides no answer and no price (077 priced by each postcode''s own distance and removed the tiers). The name is historical; it changes at the delivery-model cutover. ⚠ sameday_eligible is a FROZEN bridge for the live checkout, removed by the checkout feature (E5).';

-- +goose Down
-- Dev only. ⚠ LOSSY: the tiers and their prices are not restored — only empty structures, so the
-- previous migration's Down can run. Re-applying this migration needs nothing restored.
CREATE TABLE public.delivery_ring (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    name             text NOT NULL,
    ordinal          int  NOT NULL UNIQUE CHECK (ordinal > 0),
    suggest_upper_km numeric(7, 2) CHECK (suggest_upper_km > 0),
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by       text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_zone
    ADD COLUMN ring_id uuid REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    ADD COLUMN suggested_ring_id uuid REFERENCES public.delivery_ring (id) ON DELETE SET NULL,
    ADD COLUMN ring_is_overridden boolean NOT NULL DEFAULT false,
    ADD COLUMN hub_distance_km numeric(7, 2);
CREATE TABLE public.delivery_ring_price (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    ring_id      uuid NOT NULL REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    price_amount numeric(12, 2) NOT NULL,
    CONSTRAINT delivery_ring_price_uq UNIQUE (plan_id, ring_id)
);
-- +goose StatementBegin
CREATE FUNCTION public.coverage_ring_for_km(p_km numeric)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULL::uuid;
$$;
-- +goose StatementEnd
