# Phase 0 Research — 054 Product Inventory

**Date**: 2026-08-29 · **Spec**: [spec.md](./spec.md)

Every decision below was taken against the code at `053-order-lifecycle-completion`, not against the
specs. Where a finding contradicts something stated in the spec or in the clarification session, it is
recorded as a correction rather than quietly absorbed.

---

## R1 — Where the single availability rule lives (FR-012, SC-012)

**Decision**: one exported Go SQL fragment in `apis/core-api/internal/platform/availability`, consumed
by every hot-path query that asks whether a product can be bought. **No database view, no generated
column, no second implementation in TypeScript.**

**Rationale**: the rule is asked ~15 times today, all of them in Go —
`storefront/repository.go` (12 sites: home rails, category listings, search, detail, related, facet
counts), `cart/service.go:869`, and `saveditems/repository.go:118`. **A sweep of every cold-path
service found no TypeScript that decides customer purchasability at all**: `edge-api/customer` and
`edge-api/orders` never read `public.product`, and the only `status = 'active'` predicates in
`edge-api/shop` are about attribute definitions, product types and categories — operator-facing
catalogue reads, not availability. So the rule does not cross a language boundary, and a shared SQL
const is sufficient. This is the mechanism 029 already used for the promotion visibility predicate,
for the same reason.

**Alternatives considered**:
- **A database view** (`public.product_purchasable`). The only construct that would genuinely be one
  definition across languages — but there is **no view and no generated column anywhere in the
  platform's migration history**, so it introduces a first-of-its-kind mechanism to solve a
  cross-language problem that does not exist. Rejected.
- **A SQL function.** Per-row evaluation would defeat the index on `(shop_id, status)` and land on the
  storefront read path, which 029 already had to rescue from a 3-second timeout. Rejected.
- **A const in Go plus a parallel one in TypeScript.** Two implementations of one rule — precisely what
  FR-012 forbids and what `summarizeFulfillment` (052) and `TrackStage` (G4) are cautionary tales for.
  Rejected.

**Proof obligation**: SC-012 is demonstrated by changing the const once and observing every surface
change together; a test asserts no hot-path query spells the predicate out by hand.

---

## R2 — Freshness tiering is already satisfied, and the premise behind the question was wrong

**Decision**: FR-015a needs **no caching or revalidation work at all**. It ships as a *guard*, not a
build.

**Finding**: the clarification question for Q1 was posed on the premise that the storefront reads
catalogue data through a cache. **It does not.** Every storefront read on `customer-web` already passes
`uncached()`:

| Read | Call site |
|---|---|
| Home (rails, banners) | `app/(shop)/home-data.ts:29` |
| Categories | `app/(shop)/page.tsx:136` |
| Product detail | `app/(shop)/product/[id]/page.tsx:22` |
| Related products | `app/(shop)/_components/RelatedProducts.tsx:31` |
| Promotion detail | `app/(shop)/promotions/[id]/page.tsx:27` |

The `cached()` helper in `lib/api/core.ts` is documented, exported — and has **zero call sites** on any
storefront route. The static shell is a **PPR** property (the shell prerenders; the data is fetched
live inside `<Suspense>`), not a data-caching one. `customer-mobile` reads `core-api` directly with no
cache layer at all.

So all three tiers of FR-015a hold today for free: browse is live (well inside its 60-second
allowance), detail is live, cart and checkout re-read on every action.

**Consequence**: the answer to Q1 stands unchanged in effect, but its *reason* differs from what was
put to the operator. Recording that rather than letting the plan inherit a false premise.

**What ships instead**: a guard test asserting that no storefront read acquires `cached()` without an
accompanying stock-freshness decision. The risk this feature introduces is not stale caches today — it
is that a future performance pass adds caching to a listing read and silently makes sold-out products
look buyable for an hour.

---

## R3 — Where the stock reduction goes, and why it needs no idempotency key of its own

**Decision**: inside `checkout/store.go` `FinalizeSucceeded`, in the existing transaction, immediately
after the fan-out.

**Rationale**: that function opens with a **status-guarded** transition —
`UPDATE public."order" SET status='paid' … WHERE id=$1 AND status='pending_payment'` — and returns
early when it affects zero rows. Everything after that line therefore executes **exactly once per
order**, however many times the webhook is redelivered. The fan-out, the outbox append and the receipt
enqueue all rely on this already. A reduction placed after the guard inherits it; adding a dedupe key
would be a second guarantee for a fact already guaranteed once, and would imply the guard is
untrustworthy when the whole transaction depends on it.

**Constraint honoured**: FR-021 requires the reduction not to weaken this transaction. It adds one
statement, touches only the database, calls nothing external, and cannot fail on a product that is
untracked (the `WHERE` clause simply matches no rows).

**Alternatives considered**: reducing at order creation (rejected — A12: `pending_payment` orders linger
with nothing to sweep them, so abandoned checkouts would consume stock permanently); reducing in an
outbox consumer (rejected — makes stock eventually consistent with payment, so two shoppers can both be
told yes before either reduction lands, which is the exact defect being fixed).

---

## R4 — The payment-time shortfall costs the shop service no change at all

**Decision**: at payment, seed `public.fulfillment_item` rows for the affected lines with
`unavailable_quantity` already set to the deficit.

**Finding**: `apis/edge-api/shop/src/fulfillments/repository.ts:296` seeds those rows on entry to
`picking` with **`ON CONFLICT (shop_fulfillment_id, order_item_id) DO NOTHING`**, and the queue and
detail reads join them with a **`LEFT JOIN`** (lines 85, 153). Rows that already exist are therefore
absorbed silently by the existing code — the seed becomes a partial no-op and the progress aggregate
picks the pre-set values up. **No change is needed in the shop fulfilment service for FR-022a.**

The in-row `CHECK (gathered_quantity + unavailable_quantity <= ordered_quantity)` is satisfied, since
the deficit can never exceed the ordered quantity.

**Correctability (FR-022a)**: the picker's existing absolute-quantity `PATCH` overwrites both counts, so
gathering a line that was pre-flagged clears the flag with no special case.

**⚠ One thing to verify during implementation**: the comment at `repository.ts:71` says "progress counts
are a LEFT JOIN aggregate because `fulfillment_item` rows do not exist until" picking begins. That
assumption is now false for shortfall lines. The aggregate itself is unaffected, but any *presentation*
that infers "picking has started" from the presence of rows would be wrong. A test pins that a portion
in `pending` with pre-seeded rows still reads as `pending`.

---

## R5 — Concurrency: one guarded statement, no application-level locking

**Decision**: a single `UPDATE … SET stock_on_hand = GREATEST(0, stock_on_hand - $qty) … RETURNING`
per line, inside the finalize transaction, returning the before and after values so the deficit is
computed from what the database actually did.

**Rationale**: PostgreSQL takes a row lock on `UPDATE`, so two concurrent finalize transactions for the
last unit serialise on the product row. The second sees the count the first left behind. `GREATEST(0,…)`
makes FR-022's floor a property of the statement rather than of a read-then-write the second
transaction could interleave with. `RETURNING` the prior value is what makes the deficit knowable
without a separate read — a read-then-subtract would reintroduce exactly the race being closed.

Operator-initiated adjustments (FR-006) use the same shape: relative changes are a guarded `UPDATE`,
absolute sets are an `UPDATE … RETURNING` of the prior value so the movement can record both sides.

**SC-003 proof**: a container-backed test firing two finalizes at one unit concurrently, asserting the
count never reads below zero, both orders exist, and exactly one carries a shortfall.

---

## R6 — ⚠ A new cold-path service, because `edge-api/admin` has no room

**Decision**: a new **`apis/edge-api/inventory`** service carrying **both** audiences' stock routes —
shop routes behind the shop authorizer, back-office routes behind the back-office authorizer — attached
to the existing shared HTTP gateway.

**The measured constraint**: `apis/edge-api/admin/serverless.yml` declares **77 functions** and already
carries **`versionFunctions: false`**. 053 measured that stack at **434 of CloudFormation's 500
resources** and concluded ~6 more routes would leave roughly one feature of runway in the domain where
refunds, cancellation and returns are queued next. US4 needs ~4 back-office routes; adding them would
spend most of what is left, in the exact domain the gap register says comes after this one. 053 created
`edge-api/orders` rather than tip that stack; this follows the same precedent for the same reason.

**Why one service for both audiences rather than two**: API Gateway authorizers are **per route**, so a
single service can expose shop-authorized and admin-authorized routes without any token crossing
between pools — Principle IV holds structurally, not by convention. 046 established this exact pattern
(an authed and a public submit route in one service, "two routes, one service"). The alternative — shop
routes in `edge-api/shop` and admin routes in a new service — would put the stock service and repository
logic in two places, or force a third extraction into `@effy/edge-shared` to avoid that. One domain,
one service is both simpler and closer to Principle II.

**Cost accepted**: the shop console now calls two base paths for one screen (product basics from
`/shop/v1/products/…`, stock from `/inventory/v1/…`). The consoles already call several services
through the one gateway, so this is a path prefix, not an architectural seam.

**Alternatives considered**: adding to `edge-api/shop` only and giving back-office no write path
(rejected — contradicts the operator's explicit request); adding to `edge-api/admin` (rejected on the
measured resource ceiling above).

---

## R7 — Path split (Principle III)

| Work | Path | Why |
|---|---|---|
| Availability in listings, search, detail, cart, saved items | **Hot** (`core-api`) | Latency-sensitive customer reads that already live there; the rule is one const in the same package as its callers. |
| The stock reduction and the payment-time shortfall | **Hot** (`core-api`) | It belongs inside the paid transaction, which is on the hot path. Moving it off would make it a separate transaction and lose exactly-once. |
| Shop stock management, thresholds, low-stock list | **Cold** (`edge-api/inventory`) | Low-frequency operator CRUD on an internal console — the doctrine's canonical cold-path case. |
| Back-office stock management on a shop's behalf | **Cold** (`edge-api/inventory`) | Same, back-office authorizer. |
| The picker's shortfall correcting stock | **Cold** (`edge-api/shop`) | The write already lives there; this extends the existing statement rather than moving the action. |

No exception to Principle III is required.

---

## R8 — Storage shape: columns on `public.product`, not a separate stock table

**Decision**: `stock_tracked`, `stock_on_hand` and `low_stock_threshold` as columns on
`public.product`; a separate append-only `public.stock_movement`; a separate
`public.shop_stock_settings` for the shop-wide default.

**Rationale**: the availability predicate is evaluated in ~15 hot-path queries, several of them the
storefront home read that 029 had to rescue from a 3-second timeout caused by serial round trips to
Sydney RDS. Columns on `product` keep the predicate a **single-table expression with no join added
anywhere**. A separate `product_stock` table would add a `LEFT JOIN` to every one of those queries to
learn one integer.

This does not violate the platform's "a shop-floor action must never mutate a financial record" rule
(020, research R4) — that rule protects `order_item`, an immutable receipt line. `public.product` is
mutable catalogue data by design; its price and status already change.

**⚠ Deliberate detail**: stock writes MUST NOT touch `product.updated_at`. That column means "someone
edited the catalogue entry", and a paid order is not a catalogue edit; conflating them would make the
shop console's "recently changed" reading useless. Movements carry their own timestamps.

**Alternatives considered**: a `public.product_stock` table keyed on product (rejected on the join cost
above, having weighed it against the cleaner separation); nullable `stock_on_hand` alone with NULL
meaning untracked (rejected — it makes "tracked with an unknown count" unrepresentable *and*
indistinguishable from untracked, and every predicate would need a `IS NOT NULL` no reader can forget).

---

## R9 — Telemetry (Principle VII, and the item left Outstanding by `/speckit-clarify`)

**Decision**: three metrics on the hot path and one alert.

- `effy_stock_deducted_total{outcome="full"|"partial"}` — a counter incremented in the finalize path.
  `partial` is the oversell: an order paid for more than existed.
- `effy_stock_blocked_total{stage="add"|"checkout"}` — how often stock stopped a purchase. This is the
  feature working, and it is the number that tells the operator whether shops are maintaining counts.
⚠ A third metric — a gauge of tracked products at zero — was in this decision's first draft and is
**dropped**: nothing on the hot path is positioned to compute it, and a declared metric no code writes
is worse than no metric, because it reads as coverage.

Labels are low-cardinality (no product id, no shop id) per Principle VII.

**⚠ The alert is specified, not live, and that must be said plainly.** An oversell is a customer charged
for something that does not exist and should not be found in a support ticket — but
`infra/observability/README.md` records that the Prometheus/Grafana stack ARCHITECTURE.md describes
**does not exist**: no module, no scrape config, and nothing reads `core-api`'s `/metrics`. So the rule
is written as `infra/observability/alerts/054-product-inventory.yml` and registered in that README's
table — the home 032 created for exactly this, so that "a future feature that adds a counter and then
looks for somewhere to alert on it" finds an answer instead of the gap.

A CloudWatch alarm in `infra/envs/dev/` was the obvious alternative and is **wrong here**: all 14
existing alarms sit on SES or CloudWatch-native data, there is **no log metric filter anywhere in the
repository** (038 deferred its own), and inventing one would put this slice's alert on a different
mechanism from every other hot-path metric it sits beside.

The pattern follows `internal/platform/metrics/metrics.go`, which already exposes typed helpers of
exactly this shape (`ServiceabilityChecked`, `DeliveryQuoted`). Cold-path stock edits are covered by the
movement record, which is a better audit trail than a metric.

**Product analytics**: none. No customer-facing event is added — the shopper's experience of this
feature is a refusal, and refusals are already counted server-side above. ⚠ PostHog still is not
initialised on `customer-web` (039), so a client event would be a no-op regardless.

---

## R10 — Contracts and the mobile surface

**Decision**: stock DTOs go in `packages/shared-types`, and the shop mobile app consumes them through
the existing generator (`shop-contract:gen` → `packages/shared-types/contract-shop/`), with
`shop-contract:check` as the drift guard.

`packages/shared-types` already runs four separate generators (`contract/`, `contract-shop/`,
`contract-driver/`, plus the commerce contract) and each has a `:check` script that fails on drift. This
adds types to the shop contract only — **no customer DTO changes at all**, since the customer-facing
change is entirely in the *value* of the existing `available` flag, not its shape. That is the same
return 052 got from deleting `summarizeFulfillment`: one server-side rule correction reaching both
customer surfaces with no contract change.

---

## R11 — Design (Principle V)

The two shop surfaces both already reserve the space: `apps/shop-web/src/features/catalog/
ProductDetailScreen.tsx:170` renders an **"Inventory — coming soon"** panel inside a tab that already
exists, and `apps/shop-mobile/.../CatalogScreen.kt:385` declares the same fourth tab. This slice fills
them; it adds no new navigation to either surface.

**No cards.** Stock is presented as detail rows inside the existing `<dl>` pattern the Overview tab uses,
the movement history as a table (web) / list of rows (mobile), and the low-stock view as a table with a
status column — never metric cards, and never a summary card at the top of the page. Monochrome
throughout: "out of stock" and "low" are carried by weight and label, not by a hue. ⚠ 041 specifically
removed an amber "warning" colour from shop-web's fulfilment and catalog screens; reintroducing one here
would undo that.

---

## R12 — Two contradictions found in the surrounding system, recorded not fixed

1. **⚠ The published Food Safety notice promises a substitution choice that does not exist.**
   `packages/legal-content` ships, live, to both customer surfaces: *"If you allow substitutions and an
   item is out of stock, a substitute we select may not meet the same dietary or allergen
   requirements… You can decline substitutions at checkout."* A repo-wide search finds **no substitution
   capability anywhere** — no preference at checkout, no column, no picker action. This slice does not
   create the contradiction and does not resolve it. It does make it more visible, because
   out-of-stock becomes a routine, correctly-labelled state for the first time.
2. **The `product.status = 'unavailable'` state is currently doing duty as a manual out-of-stock flag** —
   `saveditems/repository.go:118` maps it to `temporarily_unavailable`, whose own comment reads "sold,
   not in stock — wait". After this slice, real stock produces that verdict and the manual switch keeps
   its own meaning (A3). The verdict mapping must be widened to cover both causes, or a product at zero
   stock would read as `purchasable` in the saved list while being unbuyable everywhere else.
