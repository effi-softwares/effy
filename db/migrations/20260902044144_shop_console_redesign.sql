-- +goose Up
-- 057-shop-console-redesign: the shop console gets a restocking supply chain, and the refund
-- record learns that a shop can issue one.
--
-- House style: raw SQL, text CHECK enums, an index on every FK, COMMENT ON everything; no native PG
-- enums, no triggers. See specs/057-shop-web-redesign/data-model.md.
--
-- ⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * NO `initiated_by` / `initiated_by_shop_staff_id` columns on public.refund, which is what this
--     feature's own tasks.md (T006) asked for. public.refund ALREADY records who issued a refund —
--     `actor_kind` + `actor_sub`, added by 055 with a CHECK making an unattributable staff refund
--     unrepresentable. Adding a second pair of columns answering the same question is the shape this
--     codebase keeps getting hurt by: 033's `available` beside a five-way verdict, 052's
--     `summarizeFulfillment` beside `stage.go`, 053's `problem.fields` beside `errors`. Two fields
--     that can disagree about one fact, and then nobody knows which is true. The change is to WIDEN
--     the vocabulary that already exists.
--   * NO `on_order` / `incoming` counter on public.product. What is on order is SUMMED from
--     purchase_order_line rows on read — 027's counted-not-stored rule, and the same reasoning 055
--     used to refuse a `refunded_amount` column: "a counter and the rows can disagree."
--   * NO supplier price list / cost history table. `purchase_order_line.unit_cost` records what THIS
--     order paid; a supplier's current price is a different fact nobody has asked for yet.

-- ── public.refund.actor_kind gains 'shop' ───────────────────────────────────────────────────────
--
-- ⚠ THIS IS AN ENUM WIDENING, AND THIS PLATFORM HAS SHIPPED A DEFECT THROUGH ONE TWICE.
-- 053 widened order status and its account-closure blocker read `<> 'delivered'`, so two new
-- terminal states satisfied the negation and held customers for a week over packages nobody was
-- carrying. 056 widened driver status and `requireDriver` read `=== "disabled"`, so a suspended
-- driver satisfied its negation and kept a working session. Both were negations that inherited
-- "permitted" for a value written after them.
--
-- Every reader of refund.actor_kind was audited before this widening (there are three):
--   * apis/core-api/internal/features/refunds/repository.go — writes 'back_office'/'customer',
--     reads the column back into a string field. No negation, no exhaustive match.
--   * apis/core-api/internal/features/refunds/cancel.go — writes only. No read.
--   * apis/edge-api/orders/src/orders/refunds.ts — SELECTs it as `actor_kind: string`. No match.
-- None of them gates on it. The widening is safe — but see the actor_label defect below, which the
-- audit DID find.
ALTER TABLE public.refund
    DROP CONSTRAINT refund_actor_kind_check;

ALTER TABLE public.refund
    ADD CONSTRAINT refund_actor_kind_check
        CHECK (actor_kind IN ('back_office', 'customer', 'shop', 'system'));

COMMENT ON COLUMN public.refund.actor_kind IS
    'Who issued this refund. 057 added ''shop'': a shop manager may now refund their own portion of an order from the shop console, settling through the same 055 pipeline. ''system'' means nobody at Effy did it — it arrived from the provider unattributed — and is the only kind permitted a NULL actor_sub (refund_actor_sub_ck). ⚠ actor_sub is a Cognito subject from the pool matching actor_kind: ''back_office'' resolves against admin.staff, ''shop'' against public.shop_staff. A reader that joins only one of those silently reports the other as unattributable.';

-- ── public.supplier — who a shop buys from ──────────────────────────────────────────────────────
--
-- ⚠ SHOP-SCOPED, not a platform-wide vendor directory (research R4). Product and stock are already
-- shop-scoped (054); a shared directory would raise "can Shop A see Shop B's supplier pricing?" with
-- no stated need. Revisit only when a feature actually needs cross-shop purchasing.
CREATE TABLE public.supplier (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    name          text NOT NULL CHECK (btrim(name) <> ''),
    contact_email text,
    contact_phone text,
    notes         text,
    -- ⚠ Soft-retire rather than delete: a purchase order names its supplier forever, and RESTRICT on
    -- that FK would make a shop unable to tidy a supplier they no longer use. Archived suppliers stay
    -- readable on historical orders and disappear from the assignment picker.
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- One supplier name per shop; two "Riverina Produce" rows is a data-entry slip, not two suppliers.
    CONSTRAINT supplier_name_uq UNIQUE (shop_id, name)
);
COMMENT ON TABLE public.supplier IS 'A business a shop restocks from (057). Shop-scoped: every row belongs to exactly one shop and is invisible to every other (research R4).';
COMMENT ON COLUMN public.supplier.status IS 'Soft-retirement. ''archived'' keeps the row readable on historical purchase orders while removing it from the product-assignment picker.';

CREATE INDEX supplier_shop_id_idx ON public.supplier (shop_id);

-- ── public.product.supplier_id — who this product is restocked from ─────────────────────────────
--
-- ⚠ NULLABLE, and that is a first-class state, not a gap: the restock queue groups by supplier with
-- an explicit "Unassigned" bucket (FR-018). A shop that has never recorded a supplier still gets a
-- working restock list, which is what keeps this feature non-breaking for every existing product.
ALTER TABLE public.product
    ADD COLUMN supplier_id uuid REFERENCES public.supplier (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product.supplier_id IS 'Default supplier for restocking this product (057). NULL is expected and supported — the restock queue shows unassigned products in their own bucket. ON DELETE SET NULL because losing a supplier must never take the product with it.';

CREATE INDEX product_supplier_id_idx ON public.product (supplier_id);

-- ── public.purchase_order — a restock in flight ─────────────────────────────────────────────────
CREATE TABLE public.purchase_order (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    supplier_id   uuid NOT NULL REFERENCES public.supplier (id) ON DELETE RESTRICT,
    -- Human-facing reference, unique per shop. Shops talk to suppliers on the phone; "the one from
    -- Tuesday" is not a reference either party can act on.
    reference     text NOT NULL CHECK (btrim(reference) <> ''),
    -- draft            — being built, not yet sent; freely editable, freely deletable.
    -- submitted        — sent to the supplier; lines frozen (FR-017c), awaiting goods.
    -- partially_received — some goods arrived, some outstanding. NOT terminal: more can arrive.
    -- received         — everything ordered has arrived. Terminal.
    -- cancelled        — abandoned. Terminal. ⚠ Distinct from deleting a draft: a submitted order
    --                    that is called off is a fact the supplier also knows about.
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'submitted', 'partially_received', 'received', 'cancelled')),
    currency      char(3) NOT NULL DEFAULT 'AUD',
    note          text,
    -- Snapshots, not foreign keys — the same shape shop_staff attribution takes everywhere else.
    created_by_sub text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    submitted_at  timestamptz,
    -- Set when the order reaches a terminal state, so "how long did this supplier take" is answerable.
    closed_at     timestamptz,
    CONSTRAINT purchase_order_reference_uq UNIQUE (shop_id, reference),
    -- A submitted order must say when. A draft must not claim it was sent.
    CONSTRAINT purchase_order_submitted_at_ck
        CHECK ((status = 'draft') = (submitted_at IS NULL)),
    CONSTRAINT purchase_order_closed_at_ck
        CHECK ((status IN ('received', 'cancelled')) = (closed_at IS NOT NULL))
);
COMMENT ON TABLE public.purchase_order IS 'A shop''s restock order to one supplier (057). ⚠ No total column — the value is SUMMED from its lines on read (027''s counted-not-stored rule): a stored total and the lines can disagree, and then nobody knows which the shop actually owes.';
COMMENT ON COLUMN public.purchase_order.status IS 'draft → submitted → partially_received → received, or cancelled. ⚠ partially_received is NOT terminal — a second delivery can complete it. Only received and cancelled are terminal, and only they set closed_at.';

CREATE INDEX purchase_order_shop_id_idx ON public.purchase_order (shop_id);
CREATE INDEX purchase_order_supplier_id_idx ON public.purchase_order (supplier_id);
-- The console's default read: this shop's open orders, newest first.
CREATE INDEX purchase_order_shop_status_idx ON public.purchase_order (shop_id, status, created_at DESC);

-- ── public.purchase_order_line — what was ordered, and what turned up ───────────────────────────
CREATE TABLE public.purchase_order_line (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid NOT NULL REFERENCES public.purchase_order (id) ON DELETE CASCADE,
    -- RESTRICT: a purchase order is a financial record of what the shop agreed to buy. Deleting a
    -- product must not quietly rewrite it.
    product_id        uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    ordered_quantity  int NOT NULL CHECK (ordered_quantity > 0),
    -- ⚠ ABSOLUTE, never a delta. Each receive writes the new cumulative total, so a double-tap on a
    -- flaky tablet connection is idempotent rather than double-counted — 027's rule, and the same
    -- reason 020's pick list writes absolute gathered quantities.
    received_quantity int NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    -- Nullable: a shop may order before the price is agreed. Cost is per unit, GST-inclusive, in the
    -- order's currency.
    unit_cost         numeric(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    -- ⚠ OVER-RECEIVING IS ALLOWED, and deliberately so: suppliers really do send 25 when you ordered
    -- 24, and a constraint refusing to record it would force the shop to lie about what is on the
    -- shelf. The count is the truth; the variance is visible because both numbers are kept.
    -- One line per product per order — two lines for the same product is a build slip.
    CONSTRAINT purchase_order_line_product_uq UNIQUE (purchase_order_id, product_id)
);
COMMENT ON TABLE public.purchase_order_line IS 'One product on a purchase order (057). received_quantity is ABSOLUTE and cumulative across partial receives, never a delta — a retried write is idempotent.';
COMMENT ON COLUMN public.purchase_order_line.received_quantity IS '⚠ May legitimately EXCEED ordered_quantity: suppliers over-ship, and refusing to record it would make the shelf count a lie. The variance stays visible because both numbers are kept.';

CREATE INDEX purchase_order_line_order_id_idx ON public.purchase_order_line (purchase_order_id);
CREATE INDEX purchase_order_line_product_id_idx ON public.purchase_order_line (product_id);

-- ── public.stock_movement.purchase_order_line_id — the paper trail ──────────────────────────────
--
-- ⚠ THIS IS THE WHOLE POINT OF THE FEATURE. Before it, stock arriving was an operator typing a
-- number with reason 'received' and nothing recording WHERE it came from. With it, "why do we have
-- 48 of these" is answerable months later: the movement cites the line, the line cites the order,
-- the order cites the supplier.
ALTER TABLE public.stock_movement
    ADD COLUMN purchase_order_line_id uuid REFERENCES public.purchase_order_line (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stock_movement.purchase_order_line_id IS 'The purchase-order line this stock arrived on (057). NULL for every movement not sourced from a purchase order — a manual correction, a sale, a pick shortfall — which is most of them.';

CREATE INDEX stock_movement_purchase_order_line_id_idx
    ON public.stock_movement (purchase_order_line_id)
    WHERE purchase_order_line_id IS NOT NULL;

-- +goose Down
-- Dev-only single-step down (003). Forward-only in every other environment.
DROP INDEX IF EXISTS public.stock_movement_purchase_order_line_id_idx;
ALTER TABLE public.stock_movement DROP COLUMN IF EXISTS purchase_order_line_id;

DROP INDEX IF EXISTS public.product_supplier_id_idx;
ALTER TABLE public.product DROP COLUMN IF EXISTS supplier_id;

DROP TABLE IF EXISTS public.purchase_order_line;
DROP TABLE IF EXISTS public.purchase_order;
DROP TABLE IF EXISTS public.supplier;

ALTER TABLE public.refund DROP CONSTRAINT IF EXISTS refund_actor_kind_check;
ALTER TABLE public.refund
    ADD CONSTRAINT refund_actor_kind_check
        CHECK (actor_kind IN ('back_office', 'customer', 'system'));
