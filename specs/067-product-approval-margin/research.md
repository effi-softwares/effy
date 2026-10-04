# Research: Product Approval & Effy Margin

Every finding was read from the code on `dev` at 2026-10-04.

## R1. Which column is "the price"

**Finding**: `product.price_amount` is read in **33 places** on the hot path — `cart/repository.go`
(8), `saveditems/repository.go` (9), `storefront/search.go` (7), `storefront/repository.go` (4),
`checkout/store.go` (3), `storefront/product_detail.go` (2) — plus `platform/delivery/plan.go` and
five cold-path services (receipts, back-office orders, refund proposals, shop orders, shop
products). Every one means "what the customer pays".

**Decision**: `price_amount` **keeps that meaning**. New columns hold the rest:

| Column | Meaning |
|---|---|
| `price_amount` (existing) | CUSTOMER price. Written only by approval and margin changes |
| `shop_price_amount` (new) | What the shop wants to be paid. Written by the shop's submission, applied on approval |
| `compare_at_amount` (existing) | Customer-facing "was" price |
| `shop_compare_at_amount` (new) | The shop's "was" price |
| `margin_kind`, `margin_value` (new) | Effy's margin; both NULL = not set |

**Rationale**: 054 found one rule written in 14 places and spent a slice consolidating it. Changing
what `price_amount` means would be the reverse mistake: 33 reads silently wrong until each is
found. Keeping the meaning makes this slice additive for every customer surface, and SC-012
("prices the same as the day before") is true by construction: the backfill copies
`price_amount` into `shop_price_amount` and touches nothing else.

**Alternative rejected**: rename to `customer_price_amount` and add a view. Every reader changes for
no behavioural gain.

## R2. Keeping an unapproved product away from customers

**Finding**: the one availability rule (`platform/availability`) permits a sale only for
`status = 'active'`; search, product detail and rails all go through it or project from it. A new
product is created `draft`.

**Decision**: a new product in review **stays `draft`**. Three additions:

- `approved_at timestamptz` — NULL until first approval.
- `review_state` — `none` | `in_review` | `sent_back` (for never-approved products).
- `CHECK (status <> 'active' OR approved_at IS NOT NULL)` — "on sale without an approval" is
  unrepresentable (FR-001), whatever a service does.

**Rationale**: FR-003 then needs no hot-path change at all, and the guarantee is the database's.
The shop's "publish" action is replaced by "submit"; `changeStatus → active` is allowed only for a
product with `approved_at` (which is what makes "back on sale" immediate, FR-025).

**Check to make in implementation**: confirm product detail and saved-item reads refuse a `draft`
by direct id (FR-003 "including a direct link"). 033 and 054 indicate they do; a container test
pins it.

## R3. Where a pending change lives

**Decision**: two new tables.

- `product_change` — one row per product with an open proposal (`UNIQUE (product_id)`):
  `proposed jsonb` (the proposed scalar details and attribute values), `state`
  (`in_review` | `sent_back`), `reason`, `submitted_at`, `base_version`, `updated_at`.
- `product_change_media` — the proposed image set: `storage_key`, `alt_text`, `display_order`,
  `is_primary`, and `source_media_id` when it is an existing live image being kept.

The live `product`, `product_attribute_value` and `product_media` rows are never touched by a shop
edit to an approved product. Approval applies the proposal to them in one transaction and deletes
the change rows.

**Rationale**: every existing read keeps returning the approved version with no predicate added
anywhere (FR-016, FR-021). `UNIQUE (product_id)` makes "at most one pending change" a database fact
(FR-017). A proposal equal to the live product is deleted, not stored (FR-022).

**Alternatives rejected**:
- *A `pending` flag on `product_media` and shadow columns on `product`.* Every media and product
  read on the hot path would need `AND NOT pending`; missing one shows an unapproved image, with no
  failing test.
- *A second `product` row as the draft version.* Doubles every `shop_id` scoped count and list
  (catalogue totals, Insights, low-stock) unless each learns to exclude it.

`jsonb` for the proposal is deliberate: it is never queried by field, only shown as a diff and
applied whole, and the set of proposable details will grow.

## R4. What the shop's existing write paths become

`apis/edge-api/shop/src/products/` exposes create, update, status, delete, sections, and media
(presign, register, patch, delete).

| Action | Never-approved product | Approved product |
|---|---|---|
| update details / attributes | writes the product (draft), as today | writes `product_change` |
| media register / patch / delete | writes `product_media`, as today | writes `product_change_media` |
| status → `active` | **refused** — use submit | allowed (no detail change involved) |
| status → `unavailable` / `archived` | allowed | allowed, immediate (FR-024) |
| delete | as today (drafts only) | as today (refused) |
| **submit** (new) | runs the publish checks → `in_review` | submits the open change |
| **withdraw** (new) | → `none` | deletes the change |
| sections | unchanged — shop-internal organisation, not a customer-facing detail | unchanged |

Stock routes live in `edge-api/inventory` and are not touched (FR-023). `weight_grams` is a detail
(it prices delivery) and goes through the change.

When a product in review or with a submitted change is edited again, it stays submitted and its
version moves, which is what makes a reviewer's stale decision fail (R10).

## R5. Where the back-office routes live

**Finding**: `edge-admin` declares 72 handlers at 434/500 CloudFormation resources with
`versionFunctions: false` already spent (its own header says so). `edge-shop` declares 48;
`edge-inventory` 16, carrying both authorizers.

**Decision**: a new service `apis/edge-api/catalog` on the shared gateway with the existing
back-office authorizer: queue list, margin-not-set list, item detail, approve, send back, set
margin, plus one scheduled function measuring the oldest waiting item.

Shop-side routes (submit, withdraw, and the changed update/media behaviour) stay in `edge-shop`.
**First implementation task: measure `edge-shop`'s packaged resource count.** If four new routes do
not fit, they move to `edge-catalog` behind the shop authorizer.

## R6. The two prices on an order

**Decision**: additive columns, backfilled to the existing values (FR-047):

- `order_item.shop_unit_price_amount`, `order_item.shop_line_subtotal_amount`
- `shop_fulfillment.shop_subtotal_amount`

Written by the hot path where the line and the fan-out are already written
(`checkout/store.go`: the line read gains `p.shop_price_amount`; the INSERT and the fan-out
`SUM` gain the shop columns). `unit_price_amount`, `line_subtotal_amount` and
`shop_fulfillment.subtotal_amount` keep meaning customer money — the customer's own order page
reads the per-portion subtotal, and 019's "Σ portion subtotals = order subtotal" still holds.

**Readers that switch to shop prices** (FR-044): `shop/src/orders/repository.ts`,
`shop/src/insights/rollup.ts`, `shop/src/insights/reconcile.ts`. Insights refund attribution uses
`refund_line` → order line, so the shop's share of an item refund becomes
`quantity × shop_unit_price_amount`; a goodwill refund is attributed to no shop today and stays so.

**Readers that do not change**: customer orders and receipts, the receipt email, back-office
orders, refund amounts (the customer is refunded what they paid).

**Why history does not move**: backfilled shop prices equal customer prices, and rollups recompute
from source, so a recomputed pre-067 day yields the same figures.

## R7. One margin calculation

**Decision**: `apis/edge-api/shared/src/lib/margin.ts`:

- `percent`: `customer = roundHalfUp(shop × (1 + value / 100), 2)`
- `amount`: `customer = shop + value`
- value ≥ 0; an absent margin is "not set" and yields `customer = shop`
- the same function applies to the "was" price (FR-035)

Integer cents throughout. Called by approve, by set-margin, and by the item detail to show the
resulting price before the reviewer confirms (FR-030). The hot path never calls it: it reads
`price_amount`. No Go mirror is needed.

A percentage is stored as entered and re-applied when an approved change alters the shop price; the
reviewer confirms the result either way (FR-031).

## R8. What the shop is told about prices

**Decision**: the shop `ProductDetail` / list DTO gains `shopPriceAmount`, `customerPriceAmount`,
`reviewState`, `reviewReason`, and `pendingChange` (proposed values + state). It never carries
`marginKind` or `marginValue`.

A shop can subtract. FR-039 says the margin is not shown **as a figure**, and the operator chose
that the shop sees the customer price; this plan does not pretend the difference is secret. What is
guarded is that no shop query selects the margin columns, so a percentage, a kind, or a future
margin note cannot reach a shop by accident.

## R9. Notifications and the enum widening

**Decision**: two new `notification_request` types, `product_approved` and `product_sent_back`,
addressed to the shop's active staff as `shop_new_order` is, written in the decision transaction
with a dedupe key of (decision id, staff).

**Reader audit** (to complete as a task before the migration is final): every place that
enumerates notification types — the table's CHECK, `edge-notifications` copy map and worker,
`shared-types/src/device.ts`, shop-web's service worker routing, shop-mobile's handler. 059
recorded that an unknown type once threw in the worker and stopped every audience's drain.

**Deploy order**: `notifications` before `catalog`, so the consumer knows the types before a
producer writes them.

## R10. Deciding on what was seen

**Decision**: the item detail returns a `version`; approve and send-back must echo it. The version
is `product_change.updated_at` (or `product.updated_at` for a new product) **selected as text**
(`::text`) and compared as text in SQL.

**Rationale**: 056 compared a JS `Date` round-tripped through `toISOString()` (milliseconds)
against a `timestamptz` (microseconds) and every edit failed. A text round-trip is exact.

The decision UPDATE carries the version in its `WHERE`; zero rows means "changed or already
decided" (FR-014), reported as a conflict.

## R11. Products already on sale

**Decision**: the migration backfills, in this order, before adding the CHECK:

1. `shop_price_amount = price_amount`, `shop_compare_at_amount = compare_at_amount` for all rows.
2. `approved_at = created_at` for every product whose status is not `draft`.
3. `review_state = 'none'` everywhere.

Margin columns stay NULL: "margin not set". The margin-not-set list is
`approved_at IS NOT NULL AND margin_kind IS NULL`.

Drafts stay drafts and must be submitted. A shop that was mid-way through a draft on deploy day
sees "Submit for review" where "Publish" was.

## R12. The record

Each decision writes one `admin.audit_log` row in the decision transaction: actor (staff sub),
action (`product.approved`, `product.sent_back`, `product.change_approved`,
`product.change_sent_back`, `product.margin_set`), product id, shop id, reason, and margin
before/after. The reason shown to the shop comes from `product.review_reason` /
`product_change.reason`, which carry no staff identity (FR-049).

## R13. Deploy order

`make db-up` → `edge-deploy SERVICE=notifications` → `SERVICE=shop` (immediately: until it deploys,
an old "publish" on a draft is refused by the CHECK with a 5xx) → `SERVICE=catalog` (new; needs
`make apply` first if it adds an alarm or SSM key) → `core-deploy` → push consoles → release
shop-mobile.

core-api can deploy any time after the migration: until it does, new order lines have NULL shop
prices, which readers treat as "equal to the customer price" (the same rule as the backfill).

## As built — what the measurements and the build changed

- **R1** — `shop_price_amount` is **nullable**, not `NOT NULL`. Every existing writer that inserts a
  product without it (seeds, fixtures, an older shop service during the deploy window) would have
  failed. `NULL` means "the same as `price_amount`", and every reader takes
  `COALESCE(shop_price_amount, price_amount)`. The backfill still fills every existing row.
- **R5 (T002)** — `edge-shop` packaged to **320 / 500** CloudFormation resources (package of
  2026-09-28), so the two new shop routes (submit, withdraw) stay in `edge-shop`. The back-office
  routes are a new service, `edge-catalog`, under `/catalog/v1/…`.
- **R9 (T003)** — the readers of `notification_request.type`: the table CHECK (widened by this
  migration); `edge-shared/lib/notification-types.ts` (the catalogue — two types added, group
  `attention`); `edge-notifications/worker/copy.ts` (copy added; `repository.ts` and `drain.ts`
  go through `isKnownNotificationType` and needed no change); three catalogue guard tests in
  `edge-shop` (expectations moved from 5 to 7 types); shop-web's service worker (routes on the
  server-set `webPath`, no type table of its own); `shared-types/device.ts` (platforms, not types);
  core-api producers (write only their own types). shop-mobile has no tap-routing yet (050 T047).
  The types are named `shop_product_approved` / `shop_product_sent_back` — every shop-audience type
  carries the `shop_` prefix, and the plan's `product_*` would have been the only two that did not.
- **R6** — the shop order console keeps ORDER-level money as the customer paid it (057 A3, operator
  decision); its LINES and the shop's own subtotal are at the shop's price. Insights are entirely at
  the shop's price.
