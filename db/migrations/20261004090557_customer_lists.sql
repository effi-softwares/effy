-- +goose Up
-- 068-customer-lists: lists a shopper names for themselves ("Weekly Items", "Daily Items").
--
-- ⚠ public.customer_saved_item KEEPS EVERY COLUMN AND CHANGES MEANING. It was the shopper's one
-- saved list. It is now the set of products the shopper has saved IN ANY LIST: one row per
-- (customer, product), carrying the price remembered from the first save. Which lists hold the
-- product is public.customer_list_entry's business. Three statements keep working untouched because
-- of that choice — the membership read that fills the hearts, the 200 cap, and the price baseline —
-- see specs/068-customer-lists/research.md R1.
--
-- ⚠ THE INVARIANT: a customer_saved_item row exists IF AND ONLY IF the product is in at least one of
-- that customer's lists. The foreign key below enforces "entry ⇒ saved row". The other direction has
-- no trigger (house style); it is one sweep statement run inside every transaction that removes an
-- entry or a list (saveditems.sweepOrphansSQL), under the per-customer advisory lock.
--
-- ⚠⚠ public.cart_saved_item IS A DIFFERENT TABLE AND IS NOT TOUCHED HERE. It is the cart's set-aside
-- (027). 033's migration carries the same warning for the same reason.
--
-- This retires 033 FR-066 ("exactly one saved list per shopper").

CREATE TABLE public.customer_list (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid        NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    is_default  boolean     NOT NULL DEFAULT false,
    -- ⚠ NULL FOR THE DEFAULT LIST. "Saved" is display text and belongs to each client's strings.
    name        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- The length is the service's rule (saveditems.ListNameMax); this is the backstop for a writer
    -- that is not the service. char_length counts code points, as the service does.
    CONSTRAINT customer_list_name_ck CHECK (
        (is_default AND name IS NULL)
        OR (NOT is_default AND name IS NOT NULL AND char_length(name) BETWEEN 1 AND 40 AND name = btrim(name))
    ),
    -- Target of customer_list_entry's composite foreign key.
    CONSTRAINT customer_list_owner_uq UNIQUE (id, customer_id)
);

-- Exactly one default list per customer. Also what makes "ensure the default exists" an idempotent
-- INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX customer_list_default_uq ON public.customer_list (customer_id) WHERE is_default;

-- ⚠ THE ONLY MECHANISM FOR NAME UNIQUENESS. The service does not check before inserting: a check
-- then an insert admits a race (two devices, one name, one moment), and a second case-folding rule
-- in Go would eventually disagree with this one. The service inserts and maps this constraint's
-- violation to "name taken". customer_id leads, so this also serves "all my lists" and the FK.
CREATE UNIQUE INDEX customer_list_name_uq ON public.customer_list (customer_id, lower(name)) WHERE NOT is_default;

COMMENT ON TABLE public.customer_list IS 'A list of saved products belonging to one shopper (068). Every shopper has at most one default list ("Saved" to the shopper, is_default, name NULL), created the first time something is saved; the rest are named by the shopper. ⚠ NOT a product category, and NOT the cart''s set-aside (public.cart_saved_item).';
COMMENT ON COLUMN public.customer_list.is_default IS 'The shopper''s "Saved" list: where a one-tap save lands and where a guest''s device saves join. Cannot be renamed or deleted (the service refuses; there is no name to rename).';
COMMENT ON COLUMN public.customer_list.name IS 'The shopper''s own text, 1 to 40 characters, unique per shopper ignoring letter case (customer_list_name_uq). NULL for the default list. ⚠ Free text that may say anything about the shopper: it must never reach a log line, a URL or an analytics event (068 FR-040).';
COMMENT ON COLUMN public.customer_list.created_at IS 'Orders the lists: the default first, then oldest first. There is no manual order.';

CREATE TABLE public.customer_list_entry (
    list_id     uuid        NOT NULL,
    product_id  uuid        NOT NULL,
    -- ⚠ DENORMALISED ON PURPOSE. It is what lets both foreign keys below be composite, which makes
    -- two bad states unrepresentable rather than merely refused.
    customer_id uuid        NOT NULL,
    -- ⚠ WRITABLE, NOT ALWAYS now(), for the reason 033 made saved_at writable: undo of a removal
    -- restores the entry to the position it held; a fresh add lands at the top.
    added_at    timestamptz NOT NULL DEFAULT now(),
    -- A product is in a list at most once, so adding is ON CONFLICT DO NOTHING and idempotent.
    PRIMARY KEY (list_id, product_id),
    -- An entry cannot sit in another shopper's list.
    CONSTRAINT customer_list_entry_list_fk FOREIGN KEY (list_id, customer_id)
        REFERENCES public.customer_list (id, customer_id) ON DELETE CASCADE,
    -- An entry cannot exist for a product the shopper has not saved. Deleting the saved row (the
    -- heart's un-save, a hard-deleted product) removes the product from every list.
    CONSTRAINT customer_list_entry_saved_fk FOREIGN KEY (customer_id, product_id)
        REFERENCES public.customer_saved_item (customer_id, product_id) ON DELETE CASCADE
);

-- The list read, already ordered.
CREATE INDEX customer_list_entry_list_idx ON public.customer_list_entry (list_id, added_at DESC);
-- The second FK; also "which of my lists hold this product" and the named-products read.
CREATE INDEX customer_list_entry_saved_idx ON public.customer_list_entry (customer_id, product_id);

COMMENT ON TABLE public.customer_list_entry IS 'One product in one list (068). A product may be in several of a shopper''s lists. ⚠ Holds no price: the remembered price is one per product, on public.customer_saved_item, so two lists can never show two different "was" prices.';
COMMENT ON COLUMN public.customer_list_entry.customer_id IS 'The list''s owner, repeated here so the two composite foreign keys can exist. Never read from a request; always the resolved customer.';
COMMENT ON COLUMN public.customer_list_entry.added_at IS 'Position in THIS list, newest first. Writable on insert so undo restores the original position.';

COMMENT ON TABLE public.customer_saved_item IS 'The products a shopper has saved, IN ANY LIST (068 changed the meaning; 033 created it as the one saved list). One row per (customer, product): what the heart reports, what the 200 cap counts, and where the remembered price lives. ⚠ INVARIANT: a row exists if and only if the product has at least one public.customer_list_entry. ⚠ NOT public.cart_saved_item, which is the cart''s set-aside (027).';
COMMENT ON COLUMN public.customer_saved_item.saved_at IS 'When the shopper FIRST saved the product to any list. ⚠ No longer a list position since 068: position is public.customer_list_entry.added_at, per list.';
COMMENT ON COLUMN public.customer_saved_item.saved_price_amount IS 'The product''s price when it was first saved to any list. The ONLY product fact copied here. One value per product, shared by every list that holds it (068 FR-031). Exists so a later drop is detectable; a rise is deliberately not surfaced.';

-- ── Carry every existing saved item into its shopper's default list (FR-035) ──────────────────────
--
-- ⚠ BOTH STATEMENTS ARE IDEMPOTENT AND ARE MEANT TO BE RUN AGAIN. Between this migration and the
-- core-api deploy, the old core-api keeps writing customer_saved_item rows with no entry. Running
-- these two again after the deploy repairs that window; specs/068-customer-lists/quickstart.md §2
-- carries them with a zero-orphans check.
INSERT INTO public.customer_list (customer_id, is_default)
SELECT DISTINCT s.customer_id, true
FROM public.customer_saved_item s
ON CONFLICT DO NOTHING;

-- added_at = saved_at, so the default list keeps the order the saved list had.
INSERT INTO public.customer_list_entry (list_id, product_id, customer_id, added_at)
SELECT l.id, s.product_id, s.customer_id, s.saved_at
FROM public.customer_saved_item s
JOIN public.customer_list l ON l.customer_id = s.customer_id AND l.is_default
WHERE NOT EXISTS (
    SELECT 1 FROM public.customer_list_entry e
    WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id
);

-- +goose Down
-- ⚠ LOSSY FOR NAMED LISTS, NOT FOR SAVED PRODUCTS. Every list and every entry is dropped; every
-- public.customer_saved_item row and its remembered price survives. A product that was only in a
-- named list therefore reappears in the single saved list the pre-068 code reads, which is the
-- least surprising thing that state can mean. The table comments are left as they are.
--
-- The platform is forward-only (003); db-down exists as a dev iteration convenience. Fix forward.
DROP TABLE IF EXISTS public.customer_list_entry;
DROP TABLE IF EXISTS public.customer_list;
