# Sign-off — 067 Product Approval & Effy Margin

**Date**: 2026-10-04 · **Status**: 🚧 **68/70 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.** The two open tasks are the operator's: the deploy (T069) and
the walks (T070). Client feedback R1 + R2
([docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md)).

## What this slice changed that was not true before

**A shop no longer publishes.** A new product reaches the storefront only when an Effy admin or
manager approves it, and the approval is where Effy's margin is set. **Every later change to an
approved product's details waits for approval too**, while customers keep seeing and buying the
approved version. Stock is the exception: counts, adjustments, the low-stock threshold and tracking
all apply at once.

Also now true, and not before:

- **A product has two prices.** `price_amount` is still what customers pay; `shop_price_amount` is
  what the shop asked for. The difference is Effy's margin, a percentage or a fixed amount.
- **An order line keeps both**, so what a shop is owed can be read from the order without the
  catalogue. Shop Insights and the shop's order lines are at the shop's price.
- **A product cannot be on sale without an approval, whatever a service does** — a CHECK on the
  table, not a rule in a handler.
- **Back-office has a Product review screen**: one queue, oldest first, new products and changes
  together; a before/after view; approve or send back with a reason; and a "Margin not set" list.
- **The shop is told the outcome** by push and in its console, with the reason when sent back.

## Built

| Layer | What |
|---|---|
| Migration | `20261004064247_product_approval_margin.sql` — 8 columns on `product` (backfilled) with their CHECKs — the last being "on sale needs an approval" — `product_change`, `product_change_media`, shop price on `order_item` and `shop_fulfillment`, two notification types |
| `edge-shared` | `lib/margin.ts` (the one margin calculation, whole cents); two notification types; guards: no shop code names the margin, no stock code names review |
| `shared-types` | `product-review.ts` (back-office contract); review state, both prices and the pending change on the shop product DTOs; shop Kotlin contract regenerated |
| `edge-shop` | edits to an approved product become a proposal; `POST …/submit`, `POST …/withdraw`; status rule; image edits routed to the proposed set; order lines and Insights at shop price |
| `edge-catalog` (new) | 6 back-office routes under `/catalog/v1/…`; every decision is one transaction under a row lock, checked against the version the reviewer saw; audit row and shop notification inside it; queue-age metric every 15 min |
| `edge-notifications` | copy and routing for the two types |
| `core-api` | checkout reads the shop price and writes both prices on the order line and the shop's subtotal on the fan-out |
| `back-office` | `features/product-review/` — queue (search, shop, kind, paging), item (details, before/after, images, margin with a live preview, approve, send back), margin-not-set list; nav entry |
| `shop-web` | Submit for review / Withdraw in place of Publish; review chip and filter; review panel with the reason and Now / Your change; both prices; editors open on the shop's latest version; the create wizard ends by submitting |
| `shop-mobile` | review state, reason, both prices, pending-change summary, Submit / Withdraw / Discard |
| Infra | `catalog-review.tf` — alarm on the oldest waiting item (default 24 h, missing data = breaching) |

## Verified

`pnpm -r typecheck` **21/21** (was 20; `edge-catalog` is new) · `pnpm -r test` all 21 packages done,
exit 0 · Go build / vet / gofmt clean, `go test -short ./...` clean, checkout container suite green
· shop Kotlin contract regenerates byte-stable; driver and customer contracts unchanged ·
`tokens:check` **unchanged** (no token added) · `check-no-emerald` / `check-no-jade` ·
`terraform validate` / `fmt` · shop-mobile Android host tests green and **iOS main and test targets
compile** · `mobile-guard` clean. Before/after counts are in
[quickstart.md](quickstart.md) § Baseline.

**Docker was up for the whole run**, so every container test executed against the real migrations:
edge-shared **159**, edge-catalog **43**, edge-shop **460** (+ the 2 already red), edge-inventory
**62**, and — unmodified apart from fixtures gaining `approved_at` — edge-fleet **196**, edge-driver
**132**, edge-orders **57**.

### Negative proofs, each executed by breaking the thing

| # | Break | Caught by |
|---|---|---|
| 1 | Drop the "active needs an approval" CHECK from the migration | `product-approval-migration.container.test.ts` — "refuses to put a never-approved product on sale" |
| 2 | Select `margin_value` in the shop product repository | `product-margin.guard.test.ts`, naming the file |
| 3 | Apply a change's first write outside the transaction | 4 `edge-catalog` container tests, incl. "a failure midway … leaves NOTHING changed" |
| 4 | Hand out the decision version as a JS `Date` | 4 tests incl. "accepts the version it handed out, to the microsecond" |
| 5 | Shop Insights reads the customer line total | "reports goods at what the shop is owed" and the refund attribution test |
| 6 | Write a proposed image straight into `product_media` | 3 `edge-shop` container tests incl. "leaves every live row byte-identical" |

All six were caught. None needed a guard to be fixed.

## Defects found while building

1. **My own — the notification insert named six columns and supplied five values.** Caught by the
   first container test to send a decision; a mocked repository would never have seen it.
2. **My own — the migration as first written would have broken every existing writer.**
   `shop_price_amount NOT NULL` fails any insert that predates it, including an older shop service
   between `db-up` and its own deploy. It is nullable, read through `COALESCE`.
3. **My own — the editors would have overwritten a pending change with the live values.** The
   attribute editor re-sends the complete set, so seeding it from the live product would have sent
   yesterday's proposal back as "unchanged". The editors now open on the live details with the
   proposal laid over them (`workingDetail`), and a test pins the attribute case.
4. **Existing guards did their job.** Three notification-catalogue tests failed the moment the type
   list grew, and were updated from the contract.
5. **shop-web's create wizard said "Publish" and created a draft.** It was already untrue before
   067. Its last button now creates, attaches the image and submits for review.

## Deviations from the plan and tasks

- **Routes are `/catalog/v1/…`**, not `/admin/v1/product-review/…`. They are a new service
  (`edge-admin` has no CloudFormation headroom) and take the platform's `/<service>/v1` prefix.
- **Notification types are `shop_product_approved` / `shop_product_sent_back`**, not `product_*`:
  every shop-audience type carries the `shop_` prefix.
- **`shop_price_amount` is nullable** (see defect 2).
- **The shop order console keeps order-level money as the customer paid it** (057 A3's operator
  decision). Its lines, the shop's own subtotal and all of Insights are at the shop's price.
- **A change that only clears a detail is not listed on shop-mobile.** The generated Kotlin cannot
  tell "absent" from "null". The web console lists it and the reviewer always sees it.
- **On shop-mobile, category and type changes read "A different category / type"**, not the name.
- **T063 needed no client change.** The server sets the web path (`/catalog/<productId>`) and the
  deep link (`effy://product/<productId>`); a test pins both.

## Not done, stated plainly

- **Nobody has looked at any screen** on any of the three surfaces.
- **shop-mobile cannot edit a product at all** (its Edit button has been a no-op since 016), so on
  mobile a sent-back product is read and resubmitted, and fixed on the web console.
- **shop-mobile emits no telemetry** for submit or withdraw, and has no notification tap-routing
  (050 T047). The deep link is set; nothing on that app consumes it yet.
- **No product has been approved, and no margin set, anywhere but a test database.**
- **The alarm threshold (24 h) is a default I chose.** `product_review_max_waiting_hours` is the
  variable; set it to whatever Effy promises shops.
- **Nothing tells Effy staff that a product was submitted.** The queue and the alarm are the only
  signals; there is no push or email to back-office.
- **Bulk approval, per-shop default margins, settlement and a change-history view** are out of scope
  by the spec.

## Pre-existing failures, NOT caused by this slice

- Two `edge-shop` container tests (attention recipients; order paging) — red at HEAD, recorded by
  065 and 066.
- `make storefront-locks` — red at HEAD; this slice touches no storefront file.

## Open (operator)

1. Commit.
2. `make db-up ENV=dev` — ⚠ **walk W1 straight after**: the catalogue must look identical. Every
   product that was on sale is approved with no margin and sells at the same price.
3. `make edge-deploy SERVICE=notifications ENV=dev` — learns the two types before anything writes them.
4. `make edge-deploy SERVICE=shop ENV=dev` — ⚠ **immediately after step 2.** Until it lands, the
   OLD shop service's Publish hits the new CHECK and answers 500.
5. `make edge-deploy SERVICE=catalog ENV=dev` — the new service. ⚠ **Before step 6**: the alarm
   treats missing data as breaching, so applying it first raises it at once.
6. `make apply ENV=dev` — one alarm.
7. `make core-image-push ENV=dev && make core-deploy ENV=dev` — until it lands, new order lines
   carry no shop price and read as their customer price (correct while no margin is set).
8. Push to `dev` (back-office, shop-web); release shop-mobile.
9. Walk W1–W18 in [quickstart.md](quickstart.md). ⚠ **W1** first. Then the three that matter most:
   a draft cannot be put on sale by any route; an approved product edited by the shop looks
   unchanged to a customer until approval; and an order placed with a margin set shows the customer
   price to the customer and the shop price in the shop's Insights.
