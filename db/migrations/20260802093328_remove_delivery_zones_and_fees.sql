-- +goose Up
-- Remove delivery zones, serviceability, delivery pricing and the delivery fee, entirely.
--
-- ⚠⚠ THIS IS A WITHDRAWAL, NOT A REFACTOR. Operator decision, 2026-08-02. Four stacked slices (021
-- zones + rate grid, 030 locality lookup, 031 area decisions, 032 banded pricing + same-day approvals)
-- built a configuration surface with so many independent terms that when a shopper was told "we don't
-- deliver here", nobody could say WHICH term refused — postcode-not-in-zone, no origin zone on the
-- shop, no active offering on the leg, or no active pricing rule for the method. The feature is being
-- taken out whole and will be rebuilt from scratch. Nothing here is preserved for a future version.
--
-- ⚠ AFTER THIS MIGRATION THE PLATFORM HAS NO DELIVERY FEE AND NO SERVICEABILITY. Every address is
-- implicitly deliverable, checkout charges items minus discount, and no surface asks where the shopper
-- lives. That is the intended end state, not a gap to be worked around.
--
-- ⚠ IT IS LOSSY BY INSTRUCTION, INCLUDING ON HISTORICAL ORDERS. order.delivery_fee_amount,
-- order.delivery_quote and public.order_package_delivery are DROPPED rather than frozen, so a past
-- order that charged a delivery fee will show a grand total larger than its item subtotal with nothing
-- explaining the difference. The operator was shown that consequence and chose it: "we should not have
-- any trace or any word about this feature."
--
-- ⚠ public.locality goes too (030). It is the suburb lookup that fed serviceability; the operator chose
-- the full clean slate. Its source data (db/reference/au-localities.csv, derived from G-NAF under
-- CC BY 4.0) is removed from the repo in the same change, along with `make derive-localities` and
-- `make load-localities`. Re-deriving it is a 1.7 GB download and a documented procedure — it is not
-- recoverable from anything left in this repository.

-- ── Per-order delivery capture (021) ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.order_package_delivery;

ALTER TABLE public."order"
    DROP COLUMN IF EXISTS delivery_fee_amount,
    DROP COLUMN IF EXISTS delivery_quote,
    DROP COLUMN IF EXISTS delivery_quote_expires_at;

ALTER TABLE public.shop_fulfillment
    DROP COLUMN IF EXISTS delivery_service_level,
    DROP COLUMN IF EXISTS delivery_method,
    DROP COLUMN IF EXISTS delivery_fee_amount,
    DROP COLUMN IF EXISTS promised_ready_at;

-- ⚠ 020's queue ordering read promised_ready_at when present and fell back to a uniform placed_at
-- derivation. With the column gone it returns to that fallback, which is the behaviour it had before
-- 021 — not a regression introduced here.

-- ── Same-day declarations and approvals (032) ──────────────────────────────────────────────────────
-- Child first: shop_sameday_area references the declaration.
DROP TABLE IF EXISTS public.shop_sameday_area;
DROP TABLE IF EXISTS public.shop_sameday_declaration;

-- ── Banded pricing rules (032) ─────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.delivery_price_band;
DROP TABLE IF EXISTS public.delivery_pricing_rule;
DROP TABLE IF EXISTS public.postcode_centroid;

ALTER TABLE public.product
    DROP COLUMN IF EXISTS weight_grams,
    DROP COLUMN IF EXISTS weight_is_assumed;

-- ── Area decisions (031) ───────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.delivery_area_decision;

-- ── Zones, the rate grid and shop origins (021) ────────────────────────────────────────────────────
-- delivery_offering references delivery_zone twice (origin + destination), so it goes first.
DROP TABLE IF EXISTS public.delivery_offering;
DROP TABLE IF EXISTS public.delivery_zone_postcode;
DROP TABLE IF EXISTS public.delivery_zone;

ALTER TABLE public.shop DROP COLUMN IF EXISTS postcode;

-- ── The locality lookup (030) ──────────────────────────────────────────────────────────────────────
-- ⚠ 15,414 rows derived from a 1.7 GB G-NAF download. Not recoverable from this repository after this
-- migration, by instruction.
DROP TABLE IF EXISTS public.locality;

-- +goose Down
-- ⚠⚠ THERE IS NO DOWN. This migration destroys every zone, rate, pricing rule, same-day approval,
-- locality row and per-order delivery capture on the platform. Recreating the empty tables would not
-- restore any of it, and a rollback that silently produces an EMPTY delivery configuration is more
-- dangerous than no rollback at all: the platform would answer "we deliver nowhere" while looking
-- restored.
--
-- The platform is forward-only (003). Fix forward — and the forward fix here is the operator's own
-- plan: build the replacement from scratch.
SELECT 1; -- irreversible: fix forward (033 delivery withdrawal)
