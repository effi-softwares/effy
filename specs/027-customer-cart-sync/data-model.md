# Data Model: 027-customer-cart-sync

**Date**: 2026-07-30 · **Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md)

One forward-only Goose migration, created with `make db-new NAME=cart_sync_promotions` (so Goose owns
the timestamp) and referred to below as `<ts>_cart_sync_promotions.sql`. House style follows 019/021:
everything operational in `public`, raw SQL, text `CHECK` enums (no native PG enums, no triggers), an
index on every foreign key, `COMMENT ON` everything, audit reused from `admin.audit_log`.

Three tables are altered; five are new.

---

## 1. Altered — `public.cart`

```
ALTER TABLE public.cart
  ADD COLUMN revision      bigint      NOT NULL DEFAULT 0,
  ADD COLUMN promo_code_id uuid        NULL REFERENCES public.promo_code (id) ON DELETE SET NULL,
  ADD COLUMN promo_applied_at timestamptz NULL;
CREATE INDEX cart_promo_code_idx ON public.cart (promo_code_id);
```

- **`revision`** — monotonic per cart, bumped by **every** mutation (R1). Returned on every cart
  response; the client mirror adopts a response only when its revision exceeds what the mirror holds.
  `bigint` because it increments per tap and must never wrap in a shopper's lifetime; `DEFAULT 0` so
  existing carts start valid.
- **`promo_code_id` / `promo_applied_at`** — the *currently applied* code, at most one (FR-046). Nullable
  because most carts have none. `ON DELETE SET NULL` is safe precisely because a **used** code can never
  be deleted (FR-070) — only an unused one can, and an unused code cannot be sitting on a cart.
- The applied code is stored, **the discount amount is not**: it is recomputed on every read from the
  code's definition and the cart's current payable subtotal (FR-042, FR-047). A stored amount is a
  stale amount.

## 2. Altered — `public.cart_item`

```
ALTER TABLE public.cart_item
  ADD COLUMN unit_price_at_add numeric(12,2) NULL CHECK (unit_price_at_add >= 0);
```

- The price the line was added at, and the **only** reason FR-023's price-change notice is possible.
  `packages/shared-types/src/cart.ts` has declared `priceChangedFrom` since 019 and the backend has
  never populated it — there was nothing to compare against. This column is that missing half.
- **Nullable on purpose**: rows that predate this migration have no add-time price, and inventing one
  would fabricate a "price changed" notice. A null means "unknown, report no change".
- It is **never** what the shopper is charged. Every total comes from `public.product.price_amount` at
  read time (unchanged from 019). This column exists only to say *what it used to be*.
- The existing `CHECK (quantity > 0 AND quantity <= 99)` is **kept as the structural hard ceiling**;
  the configurable ceiling in `order_policy` is constrained to stay inside it (§7).

## 3. Altered — `public."order"`

```
ALTER TABLE public."order"
  ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN promo_code_id   uuid NULL REFERENCES public.promo_code (id) ON DELETE RESTRICT,
  ADD COLUMN promo_code      text NULL;
CREATE INDEX order_promo_code_idx ON public."order" (promo_code_id);
```

- **`discount_amount`** — the platform's computation at the moment of payment (FR-049), so a receipt can
  be explained years later without re-deriving it from a code that has since changed. `DEFAULT 0` keeps
  every existing order valid and every existing total arithmetic true.
- **`promo_code`** (the literal text) is denormalised beside the id **deliberately**: the receipt must
  still say `SPRING20` even if an operator later renames or the row is somehow lost. `ON DELETE RESTRICT`
  on the id, because an order's discount must always be explainable.
- **Invariant**: `grand_total_amount = item_subtotal_amount + delivery_fee_amount - discount_amount`.
  Enforced in the service (`checkout`), asserted in tests, and stated here because three separate call
  sites compute it.

---

## 4. New — `public.cart_saved_item`

```
CREATE TABLE public.cart_saved_item (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id           uuid NOT NULL REFERENCES public.cart (id) ON DELETE CASCADE,
    product_id        uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    quantity          int  NOT NULL CHECK (quantity > 0 AND quantity <= 99),
    unit_price_at_add numeric(12,2) NULL CHECK (unit_price_at_add >= 0),
    added_at          timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cart_id, product_id)
);
CREATE INDEX cart_saved_item_cart_idx    ON public.cart_saved_item (cart_id);
CREATE INDEX cart_saved_item_product_idx ON public.cart_saved_item (product_id);
```

Set-aside items (FR-028…FR-031). Deliberately **a separate table rather than a flag on `cart_item`** —
see [research.md](research.md) R5: `cart_item` is read by checkout's order-line build, by the delivery
quote and by the paid-order finalizer, and a forgotten `AND NOT saved` in any of them would charge a
shopper for an item they set aside and send a shop to pick it. A query that does not name this table
cannot see saved items.

**Invariants**
- A product is in `cart_item` **or** `cart_saved_item` for a given cart, never both. Enforced by the
  service's two-statement move inside one transaction (§8); not expressible as a table constraint.
- Saved items contribute to **no** total, are untouched by clearing the cart (FR-030), and are untouched
  by the paid-order finalizer.

## 5. New — `public.cart_change_log`

```
CREATE TABLE public.cart_change_log (
    cart_id    uuid NOT NULL REFERENCES public.cart (id) ON DELETE CASCADE,
    change_id  uuid NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cart_id, change_id)
);
CREATE INDEX cart_change_log_applied_idx ON public.cart_change_log (applied_at);
```

The exactly-once guard (FR-018, R2). The composite primary key **is** the uniqueness constraint — no
surrogate id, because nothing ever references a row here. Inserted **in the same transaction as the
mutation it guards**; a conflict means "already applied", and the handler returns the current cart
without mutating.

Retention **7 days**, pruned opportunistically by a bounded delete alongside the insert. The
`applied_at` index exists for that prune, not for reads.

## 6. New — `public.promo_code`

```
CREATE TABLE public.promo_code (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                   text NOT NULL,
    kind                   text NOT NULL CHECK (kind IN ('percentage', 'fixed')),
    percent_off            int  NULL CHECK (percent_off > 0 AND percent_off <= 100),
    amount_off             numeric(12,2) NULL CHECK (amount_off > 0),
    currency               char(3) NOT NULL DEFAULT 'AUD',
    minimum_subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal_amount >= 0),
    starts_at              timestamptz NULL,
    ends_at                timestamptz NULL,
    max_redemptions        int NULL CHECK (max_redemptions > 0),
    max_per_customer       int NULL CHECK (max_per_customer > 0),
    status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by             text NOT NULL,
    updated_by             text NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT promo_code_kind_value_chk CHECK (
        (kind = 'percentage' AND percent_off IS NOT NULL AND amount_off IS NULL) OR
        (kind = 'fixed'      AND amount_off  IS NOT NULL AND percent_off IS NULL)
    ),
    CONSTRAINT promo_code_window_chk CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX promo_code_code_uq ON public.promo_code (upper(code));
```

- **`upper(code)` unique** — shoppers type `spring20`, operators create `SPRING20`. Case-insensitive
  uniqueness makes "duplicate code" (FR-072) mean what an operator expects, and lookup normalises the
  same way.
- **`promo_code_kind_value_chk`** makes an ill-formed promotion *unrepresentable* rather than merely
  rejected by a service: a percentage code cannot carry an amount, and vice versa. FR-072's refusals are
  then backed by the database, not only by validation code that might be bypassed.
- **`starts_at` / `ends_at` nullable** — an open-ended promotion is legitimate; null means "no bound".
- **`max_redemptions` / `max_per_customer` nullable** — null means uncapped. Both are counted from
  `promo_redemption`, never from a mutable counter column, because a counter and a redemption row can
  disagree and then nobody knows which is true.
- **`status`**, not a `deleted_at` — disabling is the removal path (FR-070), so every paid order keeps a
  code that still explains it.
- `created_by` / `updated_by` are the operator's `cognito_sub` (FR-071), alongside an `admin.audit_log`
  row per change (009's pattern).

## 7. New — `public.promo_redemption`

```
CREATE TABLE public.promo_redemption (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id uuid NOT NULL REFERENCES public.promo_code (id) ON DELETE RESTRICT,
    customer_id   uuid NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    order_id      uuid NOT NULL UNIQUE REFERENCES public."order" (id) ON DELETE RESTRICT,
    amount        numeric(12,2) NOT NULL CHECK (amount >= 0),
    redeemed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemption_code_idx     ON public.promo_redemption (promo_code_id);
CREATE INDEX promo_redemption_customer_idx ON public.promo_redemption (promo_code_id, customer_id);
```

The sole source of truth for both usage caps, and the reason a code cannot be counted twice.

- **`order_id UNIQUE`** is the load-bearing constraint: it makes FR-048 ("counted once per paid order,
  even if payment is attempted repeatedly") a **database guarantee** rather than a code discipline. The
  row is inserted inside `FinalizeSucceeded`'s existing status-guarded transaction, which itself only
  proceeds when the `pending_payment → paid` update affected a row — so the insert is reached exactly
  once per order even under duplicated Stripe webhooks.
- `(promo_code_id, customer_id)` indexed for the per-customer cap check, which runs on the cart's
  promo-apply path.
- `ON DELETE RESTRICT` throughout: a redemption is financial history.

## 8. New — `public.order_policy`

```
CREATE TABLE public.order_policy (
    singleton               boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    minimum_subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal_amount >= 0),
    currency                char(3) NOT NULL DEFAULT 'AUD',
    max_line_quantity       int NOT NULL DEFAULT 99  CHECK (max_line_quantity BETWEEN 1 AND 99),
    max_distinct_items      int NOT NULL DEFAULT 100 CHECK (max_distinct_items BETWEEN 1 AND 500),
    updated_by              text NULL,
    updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.order_policy (singleton) VALUES (true);
```

- **`singleton boolean PRIMARY KEY CHECK (singleton)`** — a one-row table enforced by the schema: only
  `true` passes the check and only one `true` fits the primary key. No application code can create a
  second policy row to disagree with the first.
- **Seeded by the migration** with `minimum_subtotal_amount = 0.00` (no minimum in force — FR-057 means
  nothing is shown), `max_line_quantity = 99` (exactly today's hard-coded Go constant, so the migration
  changes no behaviour on its own) and `max_distinct_items = 100`.
- **`max_line_quantity BETWEEN 1 AND 99`** keeps the configurable ceiling inside `cart_item`'s existing
  structural `CHECK (quantity <= 99)`, so an operator cannot set a policy the table would reject. This
  is the deliberate reason the 019 check is left in place rather than dropped.
- `max_distinct_items` is capped at 500 (Shopify's line limit) as an absolute guard; the default 100 is
  chosen because Effy re-prices every line on every cart read and 100 keeps that inside the hot path's
  latency budget while sitting far above a real grocery basket.

---

## 9. The cart read

One read serves every cart response. It is two queries plus a policy read, not a join across all of it,
because saved items must be structurally invisible to anything that computes money (§4):

1. **Payable lines** — the existing `cart_item ⋈ product` query with the `LATERAL` primary-media pick
   (`repository.go:53`), extended to return `unit_price_at_add` so the handler can emit
   `priceChangedFrom`. Ordered by `added_at ASC` (stable order, FR-002).
2. **Saved lines** — the same shape against `cart_saved_item`.
3. **Policy** — the single `order_policy` row.
4. **Discount** — the cart's applied code, if any, re-evaluated against the payable subtotal.

Availability remains `product.status = 'active'`; a product row that has disappeared entirely yields a
`removed` notice and the line is deleted (FR-025). Totals stay integer-cents in the service (`money`),
and are formatted to decimal strings at the wire (019 R9).

## 10. Transaction boundaries

**As built**: *every* mutation runs in a transaction, and that transaction carries both the
`cart.revision` bump and the `cart_change_log` guard. The original plan here said "one statement" for the
simple line operations, with a data-modifying CTE doing the bump. That was rejected during
implementation for two reasons, and the reasons are worth keeping: the change guard **cannot** be a
check-then-write (that is a race, and it shows up exactly under the retry storm it exists to survive), and
022's live bug — two statements on one table inside a CTE colliding on a partial unique index — is a
standing argument against reaching for a clever CTE when an explicit transaction says the same thing
plainly. The cost is one `BEGIN`/`COMMIT` pair per cart mutation, which is the right price.

| Operation | Shape |
|---|---|
| Add / set quantity / remove a line | one transaction: the mutation + the revision bump (+ the guard when a `changeId` is present) |
| Set aside / restore | one transaction, two statements (insert into one table, delete from the other) — the invariant in §4 depends on this |
| Clear the cart | one transaction over `cart_item` only; `cart_saved_item` untouched, and the applied promo code dropped |
| Merge (sign-in) | one transaction, one statement — union-with-max via `unnest` + `ON CONFLICT DO UPDATE SET quantity = LEAST(GREATEST(…), max)`, with **no** delete-what-is-absent clause |
| Reorder | one transaction: read the order's items (ownership-checked), then the same union-with-max upsert |
| Apply / remove a promo code | one transaction: validate, then set `cart.promo_code_id` |
| Any write carrying a `changeId` | the `cart_change_log` insert joins **that same** transaction, before the mutation |
| Paid-order finalize | the **existing** `FinalizeSucceeded` transaction gains the `promo_redemption` insert; it already carries the paid transition, the fan-out, the outbox append, the payment update and the cart empty |

Every mutation bumps `cart.revision`, folded into the transaction by a single helper (`inTx`) so no code
path can forget it — a mutation the client cannot detect is a mutation the mirror will overwrite. The one
read that deliberately does **not** bump is `GetOrCreateCartID`'s conflict path: reading a cart is not a
change, and bumping there would make every read look like a mutation to every other device.

## 11. Retention and lifecycle

- **Carts do not expire** (FR-060). No TTL, no pruning job. They are re-priced on read.
- **`cart_change_log`**: 7 days (§5).
- **A paid order** empties `cart_item` for that customer (existing behaviour) and leaves
  `cart_saved_item` alone (FR-030). The `revision` bump on that empty is what tells every other device
  the cart is now empty.
- **Sign-out** touches nothing server-side (FR-013): the account cart is a row, and the device simply
  stops holding a session for it.

## 12. Migration ordering

The 003 commit-guard applies: **the migration file must be committed before `make db-up ENV=dev` is
run**. `public.promo_code` must exist before the `public.cart.promo_code_id` and
`public."order".promo_code_id` foreign keys are added, so within the single file the order is: new
tables (`promo_code` → `promo_redemption` → `order_policy` → `cart_saved_item` → `cart_change_log`),
then the three `ALTER TABLE`s, then the `order_policy` seed row.

The `-- +goose Down` half drops in reverse and drops the added columns; it exists for dev
single-stepping only (003: forward-only in every other environment).
