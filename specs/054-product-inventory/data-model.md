# Data Model — 054 Product Inventory

**Migration**: one forward-only Goose file, `<timestamp>_product_inventory.sql`. Raw SQL, text CHECK
enums (no native PG enums, no triggers), an index on every FK, `COMMENT ON` everything — the platform's
standing shape.

---

## 1. `public.product` — three new columns

Stock lives on the product rather than in its own table. The reasoning is in
[research.md](./research.md) R8: the availability predicate is evaluated in ~15 hot-path queries
including the storefront home read that 029 had to rescue from a 3-second timeout, and columns keep it
a **single-table expression with no join added anywhere**.

| Column | Type | Null | Default | Meaning |
|---|---|---|---|---|
| `stock_tracked` | `boolean` | NOT NULL | `false` | Whether this product's units are counted. `false` is unlimited and is the pre-slice behaviour exactly (FR-002). |
| `stock_on_hand` | `int` | NULL | `NULL` | Units the shop has. Meaningful only while `stock_tracked`. |
| `low_stock_threshold` | `int` | NULL | `NULL` | This product's own threshold; overrides the shop default (FR-005). |

**Constraints**

```
CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0)              -- FR-001: never negative
CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0)
CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL)           -- FR-003: tracking implies a count
```

⚠ The third constraint is what makes **"tracked with no count" unrepresentable**, so FR-003 is enforced
by the database rather than by a service everyone must remember to call.

**Index**

```
CREATE INDEX product_low_stock_idx ON public.product (shop_id, stock_on_hand)
    WHERE stock_tracked;                                          -- US5's list, partial
```

**⚠ Deliberate omission**: no `updated_at` touch on stock writes. That column means "someone edited the
catalogue entry"; a paid order is not a catalogue edit, and conflating them would make the console's
recently-changed reading useless (R8).

---

## 2. `public.stock_movement` — append-only history

```
id             uuid PK
product_id     uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE
shop_id        uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT
quantity_delta int  NOT NULL              -- signed; 0 permitted only for a tracking toggle
quantity_before int NOT NULL CHECK (>= 0)
quantity_after  int NOT NULL CHECK (>= 0)
reason         text NOT NULL CHECK (reason IN (
                   'received','correction','damage','expiry',
                   'order_paid','pick_shortfall',
                   'tracking_enabled','tracking_disabled'))
actor_kind     text NOT NULL CHECK (actor_kind IN ('shop','back_office','system'))
actor_sub      text                        -- NULL when actor_kind = 'system'
order_id       uuid REFERENCES public."order"(id) ON DELETE SET NULL
note           text
created_at     timestamptz NOT NULL DEFAULT now()
```

- **Append-only by discipline, not by trigger** — the platform's existing convention for
  `fulfillment_event` and `admin.audit_log`. No `UPDATE` or `DELETE` statement against this table exists
  in any repository (FR-008).
- `quantity_before` / `quantity_after` are stored rather than derived, so SC-005 ("the history accounts
  for the difference with no unexplained gap") is a single scan, not a fold over every row since
  creation. It also survives the one case a delta cannot explain: a count set to an absolute value.
- `actor_kind` is what makes FR-027 possible — a shop reading its own history sees plainly that
  back-office made a change.
- `actor_sub` is a **snapshot of the Cognito subject**, not an FK. Staff records live in the `admin`
  schema and shop staff in `public`; a cross-schema FK from one audit table to two identity tables is
  not representable, and 046 settled this pattern already.
- `order_id` is nullable and `ON DELETE SET NULL` — the movement is a fact about stock and must outlive
  any order housekeeping.
- ⚠ **`reason` deliberately has no `cancellation` or `refund` member.** Neither capability exists
  (Tier 2 of the gap register). Adding the value now would create a state nothing can produce and imply
  a capability the platform does not have. The `CHECK` grows when the slice that needs it lands.

**Indexes**: `(product_id, created_at DESC)` for the history read; `(shop_id, created_at DESC)` for a
shop-wide audit.

---

## 3. `public.shop_stock_settings` — the shop-wide default

```
shop_id                    uuid PRIMARY KEY REFERENCES public.shop(id) ON DELETE CASCADE
default_low_stock_threshold int NULL CHECK (>= 0)
updated_at                 timestamptz NOT NULL DEFAULT now()
updated_by                 text NOT NULL
```

One row per shop, created on first use. A **row's absence, or a NULL threshold, means no default** — and
per FR-005a that means nothing counts as "running low", while a product at zero is still reported as out
of stock. Its own table rather than a column on `public.shop` because `shop` is deliberately minimal
(its migration comment says so explicitly) and this is the first of what will be several shop-level
operational settings.

---

## 4. The effective threshold

```
COALESCE(p.low_stock_threshold, s.default_low_stock_threshold)
```

Product wins; shop default fills in; NULL means nothing is low (FR-005, FR-005a). Evaluated only in the
cold-path low-stock read — it never touches a customer query.

---

## 5. The availability rule (FR-012)

**One fragment, in `apis/core-api/internal/platform/availability`.** Every hot-path query that asks
whether a product can be bought interpolates this and nothing else:

```
p.status = 'active' AND (NOT p.stock_tracked OR p.stock_on_hand > 0)
```

Its Go twin (for rows already in memory) is derived from the same package so the two cannot disagree.

**Consumers** — 12 sites in `storefront/repository.go`, `cart/service.go:869`,
`saveditems/repository.go:118`, and the checkout re-check. A test greps the hot path for a hand-written
`status = 'active'` against `product` and fails naming the file.

⚠ **Two causes, one verdict.** A product at zero stock and a product manually set `unavailable` are both
"temporarily out" to a shopper — the saved-items verdict must map both, or a zero-stock product reads
`purchasable` in a saved list while being unbuyable everywhere else (R12.2).

---

## 6. State transitions

**Tracking** is the only lifecycle here, and it is two-state:

```
untracked ──(enable, count required)──▶ tracked ──(disable)──▶ untracked
```

Both edges write a movement (`tracking_enabled` / `tracking_disabled`). Disabling retains history and
leaves `stock_on_hand` as it was — re-enabling requires a fresh count, which overwrites it, because a
count from before a period of not counting is not evidence of anything.

**Stock itself has no state machine** — it is a number with an audit trail. That is the whole of the
"moderate" scope decision.

---

## 7. What changes in existing tables

**`public.fulfillment_item` — no schema change.** Rows are pre-seeded at payment with
`unavailable_quantity` set to the deficit (FR-022a). The existing seed at
`edge-api/shop/src/fulfillments/repository.ts:296` is `ON CONFLICT DO NOTHING` and the reads are
`LEFT JOIN`, so the shop service absorbs them with no edit (R4). The in-row
`CHECK (gathered + unavailable <= ordered)` holds, since a deficit cannot exceed what was ordered.

**Nothing else changes.** `order_item` is untouched — it is a receipt line, and stock is not a financial
record. `shop_fulfillment` is untouched — no new status; a portion whose lines were pre-flagged is still
`pending` until a human opens it.
