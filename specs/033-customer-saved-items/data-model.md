# Data Model: 033 — Customer Saved Items

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

Phase 1 output. One forward migration, created by
`make db-new name=customer_saved_items` (Goose stamps the `YYYYMMDDHHMMSS_` prefix; it is never
hand-chosen and never renamed once committed).

House style, unchanged from 031/032: `text` CHECK enums (never native PG enums), **no triggers**, an
index on every foreign key, `COMMENT ON` everything, `uuid PRIMARY KEY DEFAULT gen_random_uuid()`
where a surrogate key is warranted, `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`,
named `…_uq` constraints and `…_idx` indexes. Deliberate omissions carry a `-- ⚠` comment saying what
was *not* done and why.

---

## Migration summary

| Direction | Statement |
|---|---|
| Up | `CREATE TABLE public.customer_saved_item` (+ comments, + indexes) |
| Up | `DROP TABLE IF EXISTS public.customer_favorite` |
| Up | `ALTER TABLE public.order_item` — no change. See "Order item" below. |
| Down | `DROP TABLE IF EXISTS public.customer_saved_item` — ⚠ honestly lossy; see below |

**⚠ The `DROP` is the point of the slice, not an accident.** FR-001 requires the previous capability
removed in its entirety including its stored data, and FR-005 requires the operator be told before it
is applied. `public.customer_favorite` carries no save-time price, so its rows cannot be carried
forward without fabricating a baseline that was never observed (R9).

**⚠ `public.cart_saved_item` is a DIFFERENT TABLE and is not touched.** It is the cart's set-aside
(027), keyed differently, priced differently (`unit_price_at_add`), well tested, and 027's research
explicitly rejected reusing the favourites store for it. The names are adjacent enough to be
dangerous; the migration comment must say so out loud. SC-015 requires proving the cart's behaviour is
unchanged.

**Down is honestly lossy.** Dropping the table destroys every saved item. Per `db/README.md`, the
platform is forward-only and `db-down` exists only as a dev iteration convenience; the Down section
performs the drop and the header states the loss rather than pretending it is a reversal.

---

## `public.customer_saved_item`

The shopper's deliberate record of interest in a product.

| Column | Type | Notes |
|---|---|---|
| `customer_id` | `uuid NOT NULL` | → `public.customer(id) ON DELETE CASCADE` |
| `product_id` | `uuid NOT NULL` | → `public.product(id) ON DELETE CASCADE` |
| `saved_price_amount` | `numeric(12,2) NOT NULL` | the product's price at the moment of saving |
| `saved_currency` | `text NOT NULL` | matches `product.currency` at save time |
| `saved_at` | `timestamptz NOT NULL DEFAULT now()` | list position, **and writable** — see FR-018 below |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Primary key**: `(customer_id, product_id)`.

### Why the composite PK carries the whole idempotency requirement

FR-009/FR-010/FR-011 demand that saving twice changes nothing and un-saving something absent is not an
error. The PK makes a duplicate **unrepresentable**, so `INSERT … ON CONFLICT (customer_id,
product_id) DO NOTHING` is idempotent by construction and `DELETE` is idempotent by nature. No
application-level guard is needed and none should be added — a second mechanism is how two answers to
one question start disagreeing.

### ⚠ `saved_at` is writable, and that is load-bearing

FR-018 draws a distinction the schema has to be able to express:

- **Undo** a removal → the row returns **with its original `saved_at`**, so it lands back in the
  position it held.
- **Re-save** after a completed removal → `now()`, so it lands at the top.

A column that were always `DEFAULT now()` on insert could not tell those apart, and undo would be
lossy in a direction the shopper did not ask for. The insert therefore takes `saved_at` as a
parameter, defaulting to `now()` when the caller does not supply one.

### ⚠ What is deliberately NOT stored

- **No product snapshot.** Name, brand, image and current price are read live (FR-045), so a renamed
  or re-imaged product shows its true current identity. Only the save-time price is remembered, and
  only so FR-043 can detect movement.
- **No purchasability.** The verdict depends on the shopper's *current* delivery location, which can
  change between two views of the same list. It is derived per request, never stored (R3).
- **No `id` surrogate key.** The natural key is the whole row's identity; a surrogate would admit two
  rows for one (customer, product) pair, which is the thing the PK exists to forbid.
- **No soft delete.** Un-saving is a delete. A saved item carries no history worth keeping, and a
  `deleted_at` would make every read carry a predicate that can be forgotten.
- **No guest rows.** A guest's list lives on their device (R6/R7); the platform has no anonymous
  identity to key it to and inventing one would create a second, unauthenticated write path.

### Indexes

| Index | Purpose |
|---|---|
| `customer_saved_item_customer_idx (customer_id, saved_at DESC)` | the list read, already ordered (FR-015) |
| `customer_saved_item_product_idx (product_id)` | the FK, per house style |

⚠ The PK's leading column is `customer_id`, so the membership read (R4) — "give me this shopper's
whole set of product ids" — is served by the PK index alone and needs nothing further. The
`(customer_id, saved_at DESC)` index exists for the *ordered* list read, where the sort would
otherwise be a separate step at the cap.

### Cascade behaviour

- `customer_id` → `ON DELETE CASCADE`. A deleted customer's saved items go with them.
- `product_id` → `ON DELETE CASCADE`. **⚠ A hard-deleted product vanishes from every list silently.**
  FR-041 requires a *withdrawn* product to remain visible and marked, which is satisfied by
  `product.status = 'archived'` — the platform's actual withdrawal mechanism, which is a status change
  and not a delete. A true hard delete is a catalogue-integrity operation that already cascades
  through `order_item` and `cart_item`, and treating it differently here would be inconsistent. This
  is stated so the difference between *archived* (visible, marked) and *deleted* (gone) is a recorded
  decision rather than an accident.

---

## Derived, never stored: the purchasability verdict

One value per (saved item, destination postcode), computed inside the list read (R3).

| Value | Condition | Shopper-facing meaning |
|---|---|---|
| `no_longer_sold` | `product.status = 'archived'` | withdrawn from sale entirely |
| `not_yet_determined` | no destination postcode on the request | we cannot say until you tell us where you live |
| `temporarily_unavailable` | `product.status IN ('draft','unavailable')` | sold here, not in stock right now |
| `not_delivered_to_your_area` | the R2 predicate fails for this product's shop | sold, but nothing reaches your address |
| `purchasable` | `status = 'active'` **and** the R2 predicate holds | can be added to the cart now |

**⚠ Evaluation order is part of the model.** `archived` is tested **before** the destination test, so a
withdrawn product reads `no_longer_sold` even for a shopper with no location — the more informative of
the two true statements. `not_yet_determined` is tested before the status distinctions that would
otherwise imply we had checked delivery.

**The R2 predicate**, in full, for one product and one destination zone:

```
∃ shop sh WHERE sh.id = product.shop_id
  ∧ sh.postcode ∈ delivery_zone_postcode              (origin zone exists)
  ∧ ∃ delivery_offering o                              (a leg is offered)
        WHERE o.origin_zone_id      = origin zone
          AND o.destination_zone_id = destination zone
          AND o.status = 'active'
  ∧ ∃ delivery_pricing_rule r                          (that method is priced)
        WHERE r.method = o.method AND r.status = 'active'
```

⚠ **`shop.status` is not a term**, deliberately. Nothing in the hot path reads it today — a
`suspended` shop's products are still sold by cart and checkout — so including it here would make
saved items *stricter* than checkout and create a new disagreement in place of the one being fixed.
Recorded as a carry-forward (R2).

⚠ **`shop_sameday_declaration` and `delivery_area_decision` are not terms.** A shop with no same-day
approval still delivers standard; and a `not_served` decision is written in the same transaction that
removes the postcode from its zone, so zone membership already reflects it. Joining either would
double-count.

---

## Derived, never stored: price movement

| Field | Derivation |
|---|---|
| `savedPriceAmount` | the stored `saved_price_amount` |
| `priceDropped` | `product.price_amount < saved_price_amount` |

**⚠ A price rise produces no field and no indicator** (FR-044). The current price is always shown, so
nothing is concealed; the actionable signal for a watchlist is the drop. A `priceRose` flag would add
noise a shopper cannot act on.

⚠ Currency is compared as well as amount. A product whose currency changed since saving has no
meaningful comparison and reports no drop.

---

## Device-held guest list (not a database entity)

| Surface | Storage | Key | Cap |
|---|---|---|---|
| `customer-web` | `localStorage` | `effy:saved:v1` | 50 |
| `customer-mobile` | `DevicePreferences` (SharedPreferences / NSUserDefaults) | a new `PreferenceKeys` entry | 50 |

Shape: a versioned envelope `{ version: 1, items: [{ productId, savedPriceAmount, savedCurrency,
savedAt }] }`.

**⚠ It carries the save-time price too.** A guest who saves a product and signs in a week later must
keep the baseline they actually saved at; taking the price at merge time would silently erase the
movement the watchlist exists to report.

**Version mismatch discards; it never migrates.** There is no legacy key to read — the predecessor
stored nothing client-side, because a guest was bounced to sign-in.

**⚠ Mobile requires a doctrine amendment in the same commit.**
`core/storage/DevicePreferences.kt:36` currently states that `CART_MIRROR` and `CART_QUEUE` are *"the
only entries admitted"* under 027's non-authoritative-mirror amendment. The guest saved list satisfies
all three admission criteria and must be added to that list explicitly: it is reconciled against the
platform on read and discarded when the platform disagrees; it is **never** an input to an
authorization or pricing decision; and it holds no more than the shopper could already see on screen.

---

## Order item — the FR-008 dependency

FR-008 (save from a line in order history) needs a product identity on the order line, and **the
contract does not carry one** (R12).

- Mobile `ReceiptItem` carries `productName · quantity · unitPriceAmount · lineSubtotalAmount`. No id.
- `OrderSummary` carries no line items at all, so the Orders *list* was never the target; the order
  **detail** surface is.

`public.order_item` **already stores `product_id`** — this is a *projection* gap, not a storage gap.
No migration is required. What is required is:

1. the Go order projection selecting and emitting it,
2. `packages/shared-types` order DTO gaining the field,
3. a regenerated contract (`make cm-contract-gen`) — both `commerce-schema.json` and `CommerceDto.kt`,
4. both surfaces' mappers,
5. a wire-contract test.

⚠ **A product on a past order may since have been archived or hard-deleted.** The order line keeps its
own snapshot (that is what makes a receipt stable), so the *line* still renders. The save control on
that line must therefore tolerate a product id that no longer resolves — saving it answers
`404 not found`, and the control reports that rather than appearing to succeed.

---

## Entity relationships

```
customer ──1───many──> customer_saved_item <──many───1── product
                                                          │
                                                          └──many──1──> shop
                                                                          │
                                                                    shop.postcode
                                                                          │
                                                          delivery_zone_postcode
                                                                          │
                                                              delivery_offering ──> delivery_pricing_rule
```

The right-hand chain is read-only for this feature. Nothing in the delivery model is written here.

---

## Validation rules

| Rule | Where enforced | Refusal |
|---|---|---|
| `product_id` must be a well-formed uuid | service, before any query | `404` (a malformed id names no product) |
| the product must exist | service, before insert | `404` |
| saved items per customer ≤ 200 | **inside the writing transaction**, under `FOR UPDATE` | `422` with a distinguishable reason |
| device-held list ≤ 50 | client store, before write | local refusal + message |
| a merge may not exceed the account cap | inside the merge transaction | `200` with the names of what did not fit (FR-048) |
| the shopper must be identified | `auth.Middleware` → `customeridentity.Middleware` | `401` / `403` barred |
| a barred customer may read but not add to cart | cart's existing gate | unchanged (FR-053) |

**⚠ The cap is checked inside the transaction, not in the service.** 027's `promo_redemption`
precedent applies directly: a concurrent save can land between a service-layer count and the insert,
and then the cap is not a cap.

**⚠ The customer is read from the resolved identity, never from the request.**
`customeridentity.FromContext(...)`, exactly as every other customer feature does. A client-supplied
customer id is an authorization bypass.
