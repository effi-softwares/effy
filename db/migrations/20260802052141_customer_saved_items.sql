-- +goose Up
-- 033-customer-saved-items: replace the favourites capability with a watchlist.
--
-- ⚠ THIS MIGRATION DELETES DATA, DELIBERATELY. It drops public.customer_favorite. Spec FR-005 makes
-- that an accepted consequence of the replacement rather than an oversight: those rows carry no
-- save-time price, and the whole point of a watchlist is to answer "has this changed since I saved
-- it?". Carrying them forward would mean inventing a baseline price that was never observed — and a
-- fabricated fact is worse than an empty list.
--
-- ⚠ WHY THE PREDECESSOR IS REPLACED RATHER THAN EXTENDED. Two things it got wrong:
--
--   1. Nothing on the platform could answer "is this product already saved?" for a given product, so
--      every surface assumed NOT SAVED on every render. A shopper who saved something yesterday saw
--      an empty heart today, tapped it (a no-op PUT), tapped again — and silently un-saved the thing
--      they were trying to save.
--   2. The list reported a product available whenever the catalogue said `status = 'active'`. With
--      hidden fulfilment and zone-scoped delivery, a product can be perfectly active and still not
--      purchasable at the shopper's address, so the list invited people into a checkout that refuses
--      them. That is the 031 REGIONAL defect reappearing on a new surface.
--
-- ⚠⚠ public.cart_saved_item IS A DIFFERENT TABLE AND IS NOT TOUCHED HERE. It is the CART's set-aside
-- ("save for later", 027) — a bookmark, not a heart. 027's research explicitly REJECTED reusing
-- customer_favorite for it, and the mobile cart carries the comment "A bookmark, deliberately NOT a
-- heart: the heart is Favourites, a different capability." The two names are adjacent enough to be
-- dangerous. If you are reading this while debugging set-aside behaviour, you are in the wrong file.
--
-- House style (007/009/019/027/028/029/030/031): text CHECK enums, no native PG enums, no triggers,
-- an index on every FK, COMMENT ON everything. See specs/033-customer-saved-items/data-model.md.

CREATE TABLE public.customer_saved_item (
    customer_id        uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    product_id         uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    -- ⚠ The price AT THE MOMENT OF SAVING, and the only thing about the product that is copied. Name,
    -- image and current price are read live (FR-045), so a renamed or re-imaged product shows its
    -- true current identity. This column exists solely so FR-043 can detect movement — the live price
    -- alone cannot tell you that anything changed.
    saved_price_amount numeric(12, 2) NOT NULL,
    saved_currency     text           NOT NULL,
    -- ⚠ WRITABLE, NOT ALWAYS now(). FR-018 draws a distinction the schema has to be able to express:
    -- UNDO of a removal restores the row with its ORIGINAL saved_at, so it lands back in the position
    -- it held; a deliberate RE-SAVE after a completed removal takes now() and lands at the top. A
    -- column that were always DEFAULT now() on insert could not tell those two apart, and undo would
    -- be lossy in a direction the shopper never asked for.
    saved_at           timestamptz    NOT NULL DEFAULT now(),
    created_at         timestamptz    NOT NULL DEFAULT now(),
    updated_at         timestamptz    NOT NULL DEFAULT now(),
    -- ⚠ THE COMPOSITE PK CARRIES THE WHOLE IDEMPOTENCY REQUIREMENT (FR-009/FR-010/FR-011). It makes a
    -- duplicate UNREPRESENTABLE, so INSERT ... ON CONFLICT DO NOTHING is idempotent by construction
    -- and DELETE is idempotent by nature. No application-level guard is needed and none should be
    -- added: a second mechanism is how two answers to one question start disagreeing.
    PRIMARY KEY (customer_id, product_id)
);

COMMENT ON TABLE public.customer_saved_item IS 'A shopper''s deliberate record of interest in a product (033) — a WATCHLIST, not a wishlist. Replaces public.customer_favorite entirely. ⚠ NOT to be confused with public.cart_saved_item, which is the cart''s set-aside (027): a different capability, a different affordance (bookmark, not heart), and one 027 deliberately refused to build on this table.';
COMMENT ON COLUMN public.customer_saved_item.saved_price_amount IS 'The product''s price when it was saved. The ONLY product fact copied here — everything else is read live (FR-045). Exists so a later drop is detectable (FR-043); without it the live price can never say that anything changed. ⚠ A price RISE is deliberately not surfaced (FR-044): the current price is always shown, so nothing is concealed, and a rise is not something the shopper can act on.';
COMMENT ON COLUMN public.customer_saved_item.saved_currency IS 'The currency at save time. Compared alongside the amount: a product whose currency changed since saving has no meaningful comparison and reports no drop.';
COMMENT ON COLUMN public.customer_saved_item.saved_at IS 'List position (FR-015, newest first) and WRITABLE on insert. Undo of a removal restores the original value; a fresh re-save writes now(). Those are different acts and the list must be able to say so (FR-018).';

-- ⚠ NOTHING ABOUT PURCHASABILITY IS STORED. The five-way verdict (purchasable / temporarily
-- unavailable / not delivered to your area / no longer sold / not yet determined) depends on the
-- shopper's CURRENT delivery location, which can change between two views of the same list. It is
-- derived per request in one statement, never persisted. A stored verdict would be stale the moment
-- someone changed their address, and a stale verdict is exactly the lie this feature exists to stop.

-- ⚠ NO SOFT DELETE. Un-saving is a delete. A saved item carries no history worth keeping, and a
-- deleted_at column would put a predicate on every read that someone will eventually forget.

-- The list read, already ordered — so the sort is not a separate step at the 200-item cap.
CREATE INDEX customer_saved_item_customer_idx ON public.customer_saved_item (customer_id, saved_at DESC);
-- The FK, per house style.
CREATE INDEX customer_saved_item_product_idx ON public.customer_saved_item (product_id);

-- ⚠ The membership read ("give me this shopper's whole set of product ids") is served by the PRIMARY
-- KEY index alone, since customer_id leads it. That read is what makes the heart tell the truth
-- without one request per product (FR-019/FR-020), and it needs no index of its own.

-- ── Remove the predecessor (FR-001) ───────────────────────────────────────────────────────────────
--
-- ⚠ Everything in this table is lost. See the header. The operator is told before applying:
-- specs/033-customer-saved-items/quickstart.md §0 carries the row-count queries, including the check
-- that cart_saved_item is NOT the thing being dropped.
DROP TABLE IF EXISTS public.customer_favorite;

-- +goose Down
-- ⚠ IRREVERSIBLE IN SUBSTANCE. This drops every saved item, and it does NOT restore
-- public.customer_favorite or its rows — those were destroyed by the Up and no backup lives here.
-- Rolling back therefore leaves the platform with NO saved-items capability at all, which is a
-- different state from the one before this migration, not a return to it.
--
-- The platform is forward-only (003); db-down exists as a dev iteration convenience and is refused
-- outside ENV=dev. Fix forward.
DROP TABLE IF EXISTS public.customer_saved_item;
