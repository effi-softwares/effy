-- +goose Up
-- 054-product-inventory: giving the platform a way to know how much of anything a shop has.
--
-- ⚠ THE DEFECT THIS CLOSES (gap register G2). `public.product` carries `status` and nothing else —
-- no count, no reservation, no decrement at finalize. A repo-wide search for stock/inventory/on_hand
-- returned only prose. The only quantity constraint anywhere is `cartpolicy.MaxLineQuantity`, which
-- is a per-line POLICY cap (99) and says nothing about availability. So a shopper could buy 20 of
-- something a shop had 2 of, and the sole discovery mechanism was a picker at an empty shelf hours
-- later — routing straight into the shortfall path, which has no money half either.
--
-- `20260710050004_shop_staff_rbac.sql:22` said it outright: "Deliberately minimal: no address,
-- hours, capacity, or inventory — those arrive with the slice that needs them." This is that slice.
--
-- Three changes, all in `public` (house style: raw SQL, text CHECK enums, an index on every FK,
-- COMMENT ON everything; no native PG enums, no triggers). See
-- specs/054-product-inventory/data-model.md.
--
--   • public.product           — stock_tracked / stock_on_hand / low_stock_threshold
--   • public.stock_movement    — append-only history; the current count is always explicable from it
--   • public.shop_stock_settings — the shop-wide default low-stock threshold
--
-- ⚠ WHY COLUMNS ON `product` AND NOT A `product_stock` TABLE (research R8). The availability rule is
-- evaluated in ~15 hot-path queries, several of them the storefront home read that 029 had to rescue
-- from a 3-second timeout caused by serial round trips to Sydney RDS. Columns keep the predicate a
-- SINGLE-TABLE expression with no join added anywhere; a side table would add a LEFT JOIN to every
-- one of those queries to learn one integer. This does not breach the "a shop-floor action must never
-- mutate a financial record" rule (020 R4) — that protects `order_item`, an immutable receipt line.
-- `public.product` is mutable catalogue data by design; its price and status already change.
--
-- ⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * It does not touch `public.order_item`. Stock is not a financial record.
--   * It does not touch `public.shop_fulfillment` or its status. A portion whose lines were flagged
--     short at payment is still `pending` until a human opens it — the flag lives on the line.
--   * It adds NO `cancellation`/`refund` movement reason. Neither capability exists on the platform
--     (gap register Tier 2), and a value nothing can produce implies a capability we do not have.
--     The CHECK grows when the slice that needs it lands.

-- ── public.product — stock, tracked only where a shop opts in ────────────────────────────────────
-- ⚠ OPT-IN IS LOAD-BEARING, NOT A CONVENIENCE. Defaulting every product to tracked would turn the
-- entire existing catalogue out-of-stock the moment this deployed, and would force a number onto
-- shops with no way to maintain one. `stock_tracked = false` is byte-identical to pre-054 behaviour.

ALTER TABLE public.product
    ADD COLUMN stock_tracked       boolean NOT NULL DEFAULT false,
    ADD COLUMN stock_on_hand       int,
    ADD COLUMN low_stock_threshold int;

COMMENT ON COLUMN public.product.stock_tracked IS
    'Whether this product''s units are counted (054). false = unlimited, and behaves exactly as the product did before 054 existed. Opt-in per product so adopting stock is a shop decision taken one product at a time.';
COMMENT ON COLUMN public.product.stock_on_hand IS
    'Units the owning shop currently has (054). Meaningful only while stock_tracked. ⚠ NEVER written without also inserting a public.stock_movement row in the SAME transaction, and NEVER touches product.updated_at — that column means "someone edited the catalogue entry", and a paid order is not a catalogue edit.';
COMMENT ON COLUMN public.product.low_stock_threshold IS
    'This product''s own low-stock threshold (054), overriding public.shop_stock_settings.default_low_stock_threshold. NULL = fall back to the shop default; both NULL = nothing counts as low, though zero is still reported as out of stock.';

ALTER TABLE public.product
    ADD CONSTRAINT product_stock_on_hand_ck
        CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0),
    ADD CONSTRAINT product_low_stock_threshold_ck
        CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
    -- ⚠ This is what makes "tracked with no count" UNREPRESENTABLE, so FR-003 is enforced by the
    -- database rather than by a service every caller has to remember. Turning tracking on without
    -- supplying a number would otherwise make a product instantly unbuyable with no operator intent
    -- behind it — a state a shop would have to discover from a customer.
    ADD CONSTRAINT product_stock_tracked_needs_count_ck
        CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL);

-- The low-stock list (US5) reads only tracked products, so the index carries only those. Partial
-- keeps it small on a catalogue where most products never opt in.
CREATE INDEX product_low_stock_idx ON public.product (shop_id, stock_on_hand)
    WHERE stock_tracked;

-- ── public.stock_movement — why the number is what it is ────────────────────────────────────────
-- Append-only BY DISCIPLINE, not by trigger — the platform's existing convention for
-- fulfillment_event and admin.audit_log. No UPDATE or DELETE against this table exists in any
-- repository, and a guard test enforces that (FR-008).

CREATE TABLE public.stock_movement (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    shop_id         uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    quantity_delta  int NOT NULL,
    quantity_before int NOT NULL CHECK (quantity_before >= 0),
    quantity_after  int NOT NULL CHECK (quantity_after >= 0),
    reason          text NOT NULL CHECK (reason IN (
                        'received', 'correction', 'damage', 'expiry',
                        'order_paid', 'pick_shortfall',
                        'tracking_enabled', 'tracking_disabled')),
    actor_kind      text NOT NULL CHECK (actor_kind IN ('shop', 'back_office', 'system')),
    actor_sub       text,
    order_id        uuid REFERENCES public."order" (id) ON DELETE SET NULL,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- The platform is the only actor with no person behind it; everything else must name one.
    CONSTRAINT stock_movement_actor_ck
        CHECK ((actor_kind = 'system') = (actor_sub IS NULL))
);

COMMENT ON TABLE public.stock_movement IS
    'Append-only record of every change to a product''s stock (054). The current count is ALWAYS explicable from these rows — that is the whole of SC-005. Never updated, never deleted.';
COMMENT ON COLUMN public.stock_movement.quantity_before IS
    'The count immediately before this change. STORED rather than derived so "the history accounts for the difference" is a single scan and not a fold over every row since creation — and because a delta alone cannot explain a count SET to an absolute value.';
COMMENT ON COLUMN public.stock_movement.reason IS
    'Why the count moved. A closed set: received | correction | damage | expiry | order_paid | pick_shortfall | tracking_enabled | tracking_disabled. ⚠ Deliberately NO cancellation/refund member — neither capability exists on the platform, and a value nothing can produce implies one that does.';
COMMENT ON COLUMN public.stock_movement.actor_kind IS
    'WHO acted, kept separate from WHY (reason) so an assisted back-office change is distinguishable from a shop''s own without inventing a reason for it (FR-027). ''system'' is the paid-order path, which has no person behind it.';
COMMENT ON COLUMN public.stock_movement.actor_sub IS
    'The acting Cognito subject. A SNAPSHOT, not an FK: shop staff live in public.shop_staff and back-office staff in admin.staff, so one audit column cannot reference both. Same pattern as 046''s staff attribution.';
COMMENT ON COLUMN public.stock_movement.order_id IS
    'The order that caused this movement, where one did. ON DELETE SET NULL: the movement is a fact about stock and must outlive any order housekeeping.';

CREATE INDEX stock_movement_product_idx ON public.stock_movement (product_id, created_at DESC);
CREATE INDEX stock_movement_shop_idx    ON public.stock_movement (shop_id, created_at DESC);
CREATE INDEX stock_movement_order_idx   ON public.stock_movement (order_id);

-- ── public.shop_stock_settings — one threshold a shop sets once ──────────────────────────────────
-- Its own table rather than a column on public.shop, whose migration comment calls it deliberately
-- minimal. This is the first of what will be several shop-level operational settings.

CREATE TABLE public.shop_stock_settings (
    shop_id                     uuid PRIMARY KEY REFERENCES public.shop (id) ON DELETE CASCADE,
    default_low_stock_threshold int CHECK (default_low_stock_threshold IS NULL OR default_low_stock_threshold >= 0),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    updated_by                  text NOT NULL
);

COMMENT ON TABLE public.shop_stock_settings IS
    'Per-shop stock settings (054). One row per shop, created on first use. A shop with hundreds of products cannot set a threshold on each, so the useful default is shop-wide with a per-product override (FR-005).';
COMMENT ON COLUMN public.shop_stock_settings.default_low_stock_threshold IS
    'The threshold used by every tracked product that carries none of its own. NULL (or no row at all) means nothing counts as "running low" — but a product at zero is still reported as out of stock (FR-005a).';

-- +goose Down
DROP TABLE IF EXISTS public.shop_stock_settings;
DROP TABLE IF EXISTS public.stock_movement;
DROP INDEX IF EXISTS public.product_low_stock_idx;
ALTER TABLE public.product DROP CONSTRAINT IF EXISTS product_stock_tracked_needs_count_ck;
ALTER TABLE public.product DROP CONSTRAINT IF EXISTS product_low_stock_threshold_ck;
ALTER TABLE public.product DROP CONSTRAINT IF EXISTS product_stock_on_hand_ck;
ALTER TABLE public.product DROP COLUMN IF EXISTS low_stock_threshold;
ALTER TABLE public.product DROP COLUMN IF EXISTS stock_on_hand;
ALTER TABLE public.product DROP COLUMN IF EXISTS stock_tracked;
