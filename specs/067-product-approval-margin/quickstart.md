# Quickstart: validating 067

Contracts: [review-admin](contracts/review-admin.md) · [shop-products](contracts/shop-products.md) ·
[order-money](contracts/order-money.md) · Data: [data-model.md](data-model.md)

## Prerequisites

- Docker running.
- Dev: a shop with a manager account, a back-office admin and a `csa`, a customer.
- Note the count and prices of live products BEFORE `db-up` (for W1).

## 1. Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types shop-contract:check
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shared test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-catalog test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test
pnpm --filter @effy/edge-notifications test
(cd apis/core-api && go test ./internal/features/checkout/... ./internal/features/storefront/... ./internal/platform/availability/...)
pnpm --filter @effy/back-office test && pnpm --filter @effy/shop-web test
(cd apps/shop-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64)
```

## 2. Deploy (operator; order matters)

```sh
make db-up ENV=dev                               # columns, backfill, then the CHECK
make edge-deploy SERVICE=notifications ENV=dev   # learns the two new types first
make edge-deploy SERVICE=shop ENV=dev            # ⚠ straight after db-up
make edge-deploy SERVICE=catalog ENV=dev         # new service — BEFORE the alarm exists
make apply ENV=dev                               # the queue-age alarm (missing data = breaching)
make core-image-push ENV=dev && make core-deploy ENV=dev
# push consoles to dev; release shop-mobile
```

## 3. Walks

| # | Do | Expect | Proves |
|---|---|---|---|
| W1 | After `db-up`, compare live product count and prices with the note taken before | Identical; every one listed under "margin not set" | SC-012, FR-046 |
| W2 | Shop: create a product, submit | State "In review"; no "Publish" action exists | US1 |
| W3 | Customer: search for it, browse its category, open its direct link | Not found by any route | SC-002 |
| W4 | Admin: open it in the queue; approve with no margin | Refused | FR-028 |
| W5 | Admin: approve with 20%, on a shop price of 10.00 | Customer price 12.00 shown before confirming; product on sale at 12.00 | US1, US5 |
| W6 | `csa`: open the queue and an item | Can read; no approve or send-back action; a direct call is refused | SC-010 |
| W7 | Admin: send a different submission back with a reason | Shop sees the reason, not the admin's name; product not on sale; push arrives | US2 |
| W8 | Shop: edit a live product's name, a photo and its price | Storefront, search, cart and saved items still show the old ones; shop sees "change pending" with both versions | US3, SC-003 |
| W9 | Admin: open that change | Only the three changed things, before and after; margin must be confirmed | FR-010, FR-031 |
| W10 | Admin: send it back | Live product identical to before W8 | SC-004 |
| W11 | Shop edits again; admin approves | Customers see all new values together | FR-019 |
| W12 | With a change pending: shop adjusts stock, then marks unavailable, then active | Each immediate; nothing new in the queue; pending change still there | US4, SC-005 |
| W13 | Admin: change the margin on a live product | Customer price changes at once; a cart holding it shows the new price | FR-032 |
| W14 | Customer buys 1 of the W5 product | Charged 12.00; receipt 12.00; shop's order line 10.00; shop Insights revenue 10.00 | US7 |
| W15 | Admin changes that margin again | The W14 order shows the same figures everywhere | SC-008 |
| W16 | Shop: look everywhere on shop-web and shop-mobile for a margin figure | None; shop price and customer price both shown | SC-009, SC-013 |
| W17 | Shop edits a pending change while the admin has it open; admin approves | Refused; admin shown the newer proposal | FR-014 |
| W18 | Back-office audit view | One row per decision with staff, product, margin before/after | US8 |

## 4. Negative proofs (break it, see it caught)

- Drop the status CHECK → the "shop sets a draft active" container test fails.
- Select `margin_value` in a shop repository → the guard fails naming the file.
- Apply a change outside a transaction and fail midway → the atomicity test fails.
- Compare the decision version as a JS `Date` → the stale-decision test fails (every decision 409s).
- Read `unit_price_amount` in shop Insights → the two-prices test fails.
- Write a proposed image into `product_media` on upload → the "customers do not see a pending
  image" test fails.

## Baseline

Measured at HEAD `59de834`, before any 067 change, with Docker up.

| Check | Before | After |
|---|---|---|
| `pnpm -r typecheck` (reporting packages) | 20 | 21 (+ `edge-catalog`) |
| edge-shared (with containers) | 137 | 159 |
| edge-shop (default / with containers) | 358 / 417 + 2 red | 379 / 460 + the same 2 red |
| edge-catalog (default / with containers) | — | 14 / 43 |
| edge-notifications | 43 | 45 |
| edge-inventory (default / with containers) | 59 / 59 | 59 / 62 |
| shop-web | 440 | 456 |
| back-office | 233 | 245 |
| shop-mobile `:shared:testAndroidHostTest` | 105 | 115 |
| `go test -short ./...` (core-api) | clean | clean; checkout container suite +5 |

Already red at HEAD and not caused by 067: two `edge-shop` container tests (attention recipients;
order paging) and `make storefront-locks`. `shop-contract:check` compares against the last commit, so
it reads as drift until 067 is committed; regenerating the contract reproduces the working tree
byte for byte.
