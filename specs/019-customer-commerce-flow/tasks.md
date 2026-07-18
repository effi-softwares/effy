---

description: "Task list for 019-customer-commerce-flow"
---

# Tasks: Customer Commerce Flow (Browse → Cart → Checkout → Order)

**Input**: Design documents from `specs/019-customer-commerce-flow/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the platform's Quality Gates require verification against acceptance criteria, and
every prior slice ships tests. Test tasks are scoped to the established gates per surface (Go
service/handler + testcontainers repo tests; customer-web Vitest + Playwright; customer-mobile
`commonTest`). They are proportionate, not exhaustive.

**Organization**: By user story (US1–US6 from spec.md), in priority order. Each story is an independently
demoable increment across both customer surfaces + the hot-path backend.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6; Setup/Foundational/Polish carry no story label
- Paths follow plan.md § Project Structure

## Path roots (abbreviations used below)

- `CORE = apis/core-api` · `MIG = db/migrations` · `ST = packages/shared-types/src`
- `WEB = apps/customer-web` · `MOB = apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `MOB-A = apps/customer-mobile/androidApp` · `MOB-I = apps/customer-mobile/iosApp/iosApp`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies, config, and empty scaffolding every surface needs. No behavior yet.

- [ ] T001 [P] Add Go deps to `CORE/go.mod`: `github.com/stripe/stripe-go/v82`, `aws-sdk-go-v2/service/s3`, `aws-sdk-go-v2/feature/s3/s3-request-presigner` (`go get` + `go mod tidy`).
- [ ] T002 [P] Add web deps to `WEB/package.json`: `@stripe/stripe-js`, `@stripe/react-stripe-js` (pnpm install); add the S3 media host to `WEB/next.config.ts` `images.remotePatterns`.
- [ ] T003 [P] Add mobile Stripe deps: `com.stripe:stripe-android` (paymentsheet) in `apps/customer-mobile/shared/build.gradle.kts` androidMain; add `StripePaymentSheet` (SPM/CocoaPods) to the `iosApp` Xcode project.
- [ ] T004 [P] Extend core-api config in `CORE/internal/platform/config/config.go`: add `Stripe{SecretKey,WebhookSecret}` (`envPrefix:"STRIPE_"`, `required,notEmpty`) and `AWS.MediaBucket` (`env:"AWS_MEDIA_BUCKET,required"`).
- [ ] T005 [P] Wire secret injection in `Makefile` `core-run`: fetch `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` from Secrets Manager and `AWS_MEDIA_BUCKET` from SSM `/effy/<env>/media/bucket`; inject as process env (never a file). Update `CORE/.env.example` (names only).
- [ ] T006 [P] Add `STRIPE_PUBLISHABLE_KEY` to `apps/customer-mobile/build.gradle.kts` `REQUIRED_KEYS` → `BuildKonfig`; expose `AppConfig.stripePublishableKey` in `MOB/core/config/AppConfig.kt`; update `apps/customer-mobile/secrets.properties.example`.
- [ ] T007 [P] Add `stripeConfig()` to `WEB/lib/config.ts` reading `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (browser-safe); update `WEB/.env.example`.
- [ ] T008 [P] Create empty DTO source files in `ST/`: `storefront.ts`, `cart.ts`, `order.ts`, `checkout.ts`, `address.ts`, `favorite.ts`; add barrel exports to `ST/index.ts`; create `ST/customer-commerce-contract.ts` KMP codegen entry and register its Kotlin generation target alongside `customer-contract.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + cross-cutting backend/client plumbing every user story depends on.

**⚠️ CRITICAL**: No user-story work starts until this phase is complete.

### Database

- [ ] T009 Author the forward-only migration `MIG/<ts>_customer_commerce.sql` creating `public.{customer_address, cart, cart_item, order, order_item, shop_fulfillment, payment, stripe_event, customer_favorite, event_outbox}` with all CHECK enums, FKs, indexes, and `COMMENT ON` per data-model.md §2. (Operator applies via `make db-up` after commit — do not run.)

### Shared contract (SSOT — blocks web + mobile + Go DTOs)

- [ ] T010 Author all commerce DTOs + enum unions + tolerant-reader helpers in the `ST/*.ts` files per contracts/shared-dtos.md (money as string+currency, ISO timestamps, keyset `nextCursor`, presigned `imageUrl`). Run `pnpm -r typecheck` green.
- [ ] T011 Regenerate the KMP Kotlin DTOs from `ST/customer-commerce-contract.ts`; confirm the diff-guard is clean and the generated file compiles in `apps/customer-mobile`.

### core-api platform layer

- [ ] T012 [P] Implement the S3 presigned-GET helper (asset URL resolver) in `CORE/internal/platform/media/` — mints 15-min GET URLs from a `product_media.storage_key`; construct the `s3.Client` in `CORE/cmd/core-api/main.go` from the existing `awsCfg`; unit-test the key→URL mapping.
- [ ] T013 [P] Implement the transactional outbox writer in `CORE/internal/platform/events/` — appends an envelope row (`event_type,event_id,dedup_key,aggregate_*,payload,occurred_at`) to `public.event_outbox` on a caller-supplied `pgx.Tx`; unit-test envelope shape + dedup_key.
- [ ] T014 [P] Implement the customer-identity resolver in `CORE/internal/platform/customeridentity/` — `cognito_sub → (customer.id, status)`; a helper that 401/403s a barred or missing customer; unit-test with a repo fake.
- [ ] T015 Define the `PaymentGateway` port interface + a `stripegateway` adapter skeleton in `CORE/internal/features/checkout/` (CreatePaymentIntent w/ deterministic idempotency key, RetrievePaymentIntent, ConstructWebhookEvent); no handler yet — just the port + adapter so services are testable with a fake.
- [ ] T016 Extend `CORE/cmd/core-api/main.go` wiring: build the S3 client, outbox writer, identity resolver, and Stripe gateway once; add a `registerFeatures` scaffold that mounts a public `storefront` group and a customer-scoped commerce group (reusing the existing customer `PoolVerifier`) — routes added per story.

### Client scaffolding

- [ ] T017 [P] Add a Ktor `coreClient` (targeting `AppConfig.coreApiBaseUrl`, two-token auth, JSON) to `MOB/app/AppContainer.kt`; adopt `packages/mobile-kit` `TabBackStacks` + `AppNavKey` for the Home/Search tabs and register new commerce `AppNavKey` routes in `MOB/core/nav/` per research R10.
- [ ] T018 [P] Add the commerce hot-path helpers to `WEB/lib/api/core.ts` usage sites (confirm `cached({tags})` for catalog reads and `uncached()` for cart/orders) and create `WEB/lib/stripe.ts` (`loadStripe(publishableKey)` singleton, client-only).

**Checkpoint**: Schema, shared DTOs, backend platform plumbing, and client scaffolding ready.

---

## Phase 3: User Story 1 — Discover products on a merchandised Home (Priority: P1) 🎯 MVP

**Goal**: A guest opens Home on either surface and sees a banner/carousel, search entry, category chips,
and horizontally scrolling rails of real product cards (image, price, badges); tapping a card opens the product.

**Independent Test**: With catalog data present, open Home as a guest on web and mobile; confirm the
banner/carousel, category chips, and Featured/category/On-sale rails render with correct cards + badges;
unavailable products are absent; a card opens the product.

### Backend (storefront reads)

- [ ] T019 [P] [US1] `CORE/internal/features/storefront/repository.go` — SQL for home rails (Featured=newest active, On-sale=`compare_at_amount IS NOT NULL`, category rails) and a product-card row mapper; only `status='active'`; join primary media.
- [ ] T020 [US1] `CORE/internal/features/storefront/service.go` — compose the home payload + a categories reader; map rows→domain; attach presigned image URLs via the media helper.
- [ ] T021 [US1] `CORE/internal/features/storefront/handler.go` — `GET /v1/storefront/home` + `GET /v1/storefront/categories` returning `StorefrontHomeDTO`/`CategoryDTO[]`; register on the public group in `register.go`.
- [ ] T022 [P] [US1] Go tests: `storefront` service_test (rail composition, badge derivation, unavailable exclusion) + handler_test (httptest, JSON shape) + testcontainers repository_test (`-short` gated).

### Web

- [ ] T023 [P] [US1] `WEB/app/(shop)/_components/ProductCard.tsx` + `ProductRail.tsx` (horizontal scroll) + `PromoCarousel.tsx` using `@effy/design-system/ui`; card shows image (presigned via `next/image` unoptimized), name, price, struck-through compare-at + sale badge.
- [ ] T024 [US1] `WEB/app/(shop)/page.tsx` — replace the placeholder Home: server-fetch `GET /v1/storefront/home` via `coreApi()` `cached({tags:['home']})`, render carousel + category chips + rails; keep it PPR/static-shell friendly.
- [ ] T025 [P] [US1] `WEB/lib/recently-viewed.ts` — device-local recently-viewed store (localStorage, ids most-recent-first) + a Home "Recently viewed" rail hydrated via `GET /v1/storefront/products?ids=…`.
- [ ] T026 [P] [US1] Vitest for the card/badge/price-format logic + recently-viewed store in `WEB/**/*.test.ts`.

### Mobile

- [ ] T027 [P] [US1] `MOB/features/catalog/data/` — `HttpCatalogRepository` (storefront home + categories via `coreClient`) + `@Serializable` DTO→domain mappers.
- [ ] T028 [US1] `MOB/features/catalog/domain/` use cases (`GetHome`, `GetCategories`) + `MOB/features/catalog/presentation/HomeViewModel.kt` (MVVM `StateFlow<HomeUiState>`); wire in `AppContainer`.
- [ ] T029 [US1] `MOB/features/catalog/presentation/HomeScreen.kt` — real Home replacing the placeholder: carousel, chips, rails, product cards using design tokens + `AdaptiveContent`; device-local recently-viewed store; wire into `CustomerShell` HOME tab.
- [ ] T030 [P] [US1] `commonTest` for catalog mappers + badge/price logic.

**Checkpoint**: Home is shoppable on both surfaces; the store is browsable end-to-end (no purchase yet).

---

## Phase 4: User Story 2 — Product detail + add-to-cart + save favorite (Priority: P1)

**Goal**: Open a product page (gallery, price, description, sectioned attributes), pick a quantity, add to
cart (badge updates), and save as favorite (guest → sign-in). Introduces the server cart.

**Independent Test**: Open a product from Home on both surfaces; verify gallery/price/sale/attribute detail
rows (no cards); change qty and add to cart → badge + cart contents update; save favorite (guest is prompted
to sign in, then saved).

### Backend (product detail + cart + favorite-save)

- [ ] T031 [P] [US2] `CORE/internal/features/storefront/` — add `GET /v1/storefront/products/{id}` (detail: gallery presigned, grouped attributes from `product_attribute_value`, category path); 404 if not active. Extend repo/service/handler + tests.
- [ ] T032 [P] [US2] `CORE/internal/features/cart/{repository,service,handler,register}.go` — server cart on the customer group: `GET /v1/cart`, `POST /v1/cart/items`, `PATCH /v1/cart/items/{productId}`, `DELETE /v1/cart/items/{productId}`, `POST /v1/cart/merge`; re-price against `product`, emit availability/price-change notices, clamp qty ≤ 99; scope `WHERE customer_id`. Uses the identity resolver (T014).
- [ ] T033 [P] [US2] `CORE/internal/features/favorites/` — `PUT /v1/favorites/{productId}` (idempotent save) + `DELETE …` on the customer group (list endpoint deferred to US6). Repo/service/handler.
- [ ] T034 [US2] Register the `cart` + `favorites` + product-detail routes in `main.go`; increment `cart_writes_total{op}` business counters on `/metrics`.
- [ ] T035 [P] [US2] Go tests: cart service (add merges qty, re-price, unavailable exclusion, merge sums), favorites idempotency, product-detail mapping — service/handler + testcontainers repo tests.

### Web

- [ ] T036 [P] [US2] `WEB/lib/cart-store.ts` — hybrid cart: TanStack Store guest slice persisted to localStorage (line snapshots per ARCHITECTURE.md) + TanStack Query server-cart hooks once signed-in + a `mergeCart` on sign-in; a shared cart-badge selector.
- [ ] T037 [US2] `WEB/app/(shop)/product/[id]/page.tsx` — product detail: swipeable gallery, price/sale, description, **attributes as sectioned detail rows/tabs (no cards)**; quantity stepper + Add-to-cart (writes to cart-store); record recently-viewed.
- [ ] T038 [P] [US2] `WEB/app/(shop)/_components/FavoriteButton.tsx` — save/un-save; as a guest, trigger the existing deferred sign-in (`requireCustomer`/`next`) and return to the product; show saved state.
- [ ] T039 [P] [US2] Vitest for cart-store math (add/merge/qty clamp/snapshot) + Playwright: add-to-cart badge, guest save-favorite → sign-in → return (`WEB/e2e/`).

### Mobile

- [ ] T040 [P] [US2] `MOB/features/catalog/` — product-detail repo/usecase/`ProductDetailViewModel` + `ProductDetailScreen.kt` (gallery pager, sectioned attribute rows, qty stepper, add-to-cart).
- [ ] T041 [P] [US2] `MOB/features/cart/` — `HttpCartRepository` + local guest-cart store (snapshotting lines) + merge-on-sign-in; cart-badge state; use cases + wiring in `AppContainer`.
- [ ] T042 [US2] `MOB/features/favorites/` save/un-save use case + a favorite affordance on the product screen using the existing deferred-sign-in (return-to-intent).
- [ ] T043 [P] [US2] `commonTest` for cart totals/merge/qty-clamp + price-change detection.

**Checkpoint**: A shopper can evaluate a product and build a cart on both surfaces; favorites can be saved.

---

## Phase 5: User Story 3 — Cart review, checkout, pay, receipt, fan-out (Priority: P1)

**Goal**: Review the cart (grouped by fulfillment, flat delivery fee), check out (sign-in if guest,
delivery address), pay with Stripe (test), get a receipt; the order fans out to per-shop fulfillment records
+ an `order.placed` outbox event. **The revenue path.**

**Independent Test**: With a cart spanning two shops, review it, checkout, sign in if guest, enter address,
pay with `4242…`; verify one order + receipt with correct totals, and exactly two `shop_fulfillment` rows
each with only its shop's items; a declined card places no order; a double-submit places exactly one.

### Backend (addresses + checkout + payment + placement/fan-out)

- [ ] T044 [P] [US3] `CORE/internal/features/addresses/` — `GET/POST/PATCH/DELETE /v1/addresses` on the customer group (first address = default; partial-unique default); repo/service/handler + tests.
- [ ] T045 [US3] `CORE/internal/features/checkout/service.go` — `CreateCheckoutIntent`: locate/create the single active `pending_payment` order from the cart + `addressId`, snapshot the address, compute `item_subtotal + flat delivery fee = grand_total` server-side, create the PaymentIntent (automatic capture, deterministic idempotency key T015), persist `payment` + `stripe_payment_intent_id`; return `client_secret`.
- [ ] T046 [US3] `CORE/internal/features/checkout/service.go` — the **idempotent finalizer**: `UPDATE order … WHERE status='pending_payment'`; on success snapshot `order_item` (incl. `shop_id` from product), insert one `shop_fulfillment` per distinct shop, append the `order.placed` outbox event (per-shop breakdown), set `payment.succeeded`, empty the cart — all in **one tx**. Shared by webhook + confirm.
- [ ] T047 [US3] `CORE/internal/features/checkout/handler.go` — `POST /v1/checkout/intent`, `POST /v1/checkout/confirm` (customer group), and `POST /v1/stripe/webhook` (**raw body, signature-verified, mounted outside JSON middleware**, no pool auth); dedup on `stripe_event`; register in `main.go`; add `orders_placed_total` + `payments_total{outcome}` counters.
- [ ] T048 [P] [US3] Go tests with a `PaymentGateway` fake: amount computed server-side, deterministic idempotency (retry → same intent), fan-out produces exactly-N `shop_fulfillment` summing to subtotal (SC-005), webhook+confirm converge without double-apply (SC-006), failed payment leaves no fan-out/outbox (SC-007); testcontainers for the placement tx.

### Web

- [ ] T049 [US3] `WEB/app/(shop)/cart/page.tsx` — cart review: lines (image/unit price/qty/subtotal), qty edit + remove, order summary (items + flat delivery fee + grand total), fulfillment grouping **without shop names**, empty state; Checkout button (guest → sign-in, cart preserved).
- [ ] T050 [P] [US3] `WEB/app/(account)/addresses/` — address list/create/select UI (server-state cache).
- [ ] T051 [US3] `WEB/app/(shop)/checkout/page.tsx` — server component: `requireCustomer('/checkout')`, re-validate cart, fetch `client_secret` from `POST /v1/checkout/intent`; hand to a `"use client"` `<PaymentForm>` island (`<Elements>`/`<PaymentElement>`, `confirmPayment({redirect:'if_required'})`) — placed under `(shop)`, NOT the Amplify quarantine.
- [ ] T052 [US3] `WEB/app/(shop)/checkout/complete/page.tsx` — receipt: read order state from `GET /v1/orders/{id}` (webhook authority), show reference/items/address/amount/paid status; empty the cart-store on success.
- [ ] T053 [P] [US3] Playwright E2E in `WEB/e2e/checkout.spec.ts`: full pay with `4242…`, 3DS with `4000 0027 6000 3184`, decline `4000…9995` (no order), guest→sign-in cart-intact (SC-009), double-submit idempotency (SC-006).

### Mobile

- [ ] T054 [US3] `MOB/core/payment/PaymentDriver.kt` — `commonMain` interface (`presentPaymentSheet(clientSecret): PaymentResult`); `MOB-A` `AndroidPaymentDriver` (stripe-android PaymentSheet); `MOB-I/SwiftPaymentBridge.swift` (StripePaymentSheet) + `IosPaymentDriver` mirroring `IosAuthBridge`; inject at each entry point.
- [ ] T055 [US3] `MOB/features/cart/presentation/CartScreen.kt` — cart review (lines, qty edit/remove, summary with flat delivery fee, fulfillment grouping, checkout button with deferred sign-in).
- [ ] T056 [US3] `MOB/features/checkout/` — `CheckoutViewModel → PayUseCase → PaymentDriver`; address select/create; call `POST /v1/checkout/intent`, present PaymentSheet, then poll `GET /v1/orders/{id}` (webhook authority); `ReceiptScreen.kt`; wire into the Home-tab back stack.
- [ ] T057 [P] [US3] `commonTest` for checkout total assembly + receipt mapping; both apps build (Android + iOS frameworks link).

**Checkpoint**: The complete purchase flow works end-to-end on both surfaces; multi-shop fan-out verified. **This is the full MVP the user asked for.**

---

## Phase 6: User Story 4 — Search with filters + infinite scroll (Priority: P2)

**Goal**: Search products (name/brand/description) with keyset infinite scroll and filters (category, price
range, sale-only, an attribute facet) shown as removable chips; only available products.

**Independent Test**: Search a query on both surfaces → relevant cards; scroll to end → more append; apply
category+price+sale filters → results narrow, chips removable; no-match empty state.

- [ ] T058 [P] [US4] `CORE/internal/features/storefront/` — `GET /v1/storefront/products` search/browse: `pg_trgm` `q`, filters (category/min/max/saleOnly/`attr.*`), keyset pagination (`created_at,id` cursor); extend repo/service/handler + `ids=` hydration path (recently-viewed) + tests (relevance, filter combos, cursor stability, <1s on seed).
- [ ] T059 [US4] `WEB/app/(shop)/search/page.tsx` — search UI: query input, results grid, **infinite scroll** (TanStack Query `useInfiniteQuery` or Virtual), filter chips (facets as **query params**, Disallowed in `WEB/app/robots.ts`), empty state.
- [ ] T060 [P] [US4] Playwright: search results, infinite-scroll append, filter narrow/clear, empty state (`WEB/e2e/search.spec.ts`).
- [ ] T061 [US4] `MOB/features/catalog/` — `SearchViewModel` + `SearchScreen.kt` with paged infinite scroll + filter chips; wire into `CustomerShell` SEARCH tab (replace placeholder).
- [ ] T062 [P] [US4] `commonTest` for search paging/cursor + filter-state logic.

**Checkpoint**: Intent-driven discovery works on both surfaces.

---

## Phase 7: User Story 5 — Order history & receipts (Priority: P2)

**Goal**: A signed-in shopper lists past orders (most-recent-first: reference/date/total/status) and re-opens
any order's full receipt.

**Independent Test**: As a shopper with ≥1 order, open Orders on both surfaces → list renders; open one →
full receipt; a guest is prompted to sign in.

- [ ] T063 [P] [US5] `CORE/internal/features/orders/` — `GET /v1/orders` (owner-scoped, most-recent-first) + `GET /v1/orders/{id}` (full receipt incl. anonymous per-shop fulfillment status/count/subtotal, no shop identity); repo/service/handler + tests (ownership scoping, totals reconcile SC-008).
- [ ] T064 [US5] `WEB/app/(account)/orders/` — orders list + detail (receipt) pages behind `requireCustomer`; add `/orders` to the `proxy.ts` protected matcher.
- [ ] T065 [P] [US5] `MOB/features/orders/` — `OrdersViewModel` + list/detail screens; wire into `CustomerShell` ORDERS tab (gated, replace placeholder).
- [ ] T066 [P] [US5] Tests: Playwright orders list/detail (`WEB/e2e/orders.spec.ts`); `commonTest` order mappers.

**Checkpoint**: Post-purchase visibility on both surfaces.

---

## Phase 8: User Story 6 — Favorites & recently-viewed management (Priority: P3)

**Goal**: List/manage favorites (persist for signed-in, cross-device) and recently-viewed; open or add-to-cart
from either; remove a favorite.

**Independent Test**: Save two favorites + view products; open favorites + recently-viewed on both surfaces;
favorites persist across sign-out/in; remove reflects on the product page.

- [ ] T067 [P] [US6] `CORE/internal/features/favorites/` — add `GET /v1/favorites` (owner-scoped, most-recent-first, product-card projection); extend service/handler + tests.
- [ ] T068 [US6] `WEB/app/(account)/favorites/` — favorites page (open / add-to-cart / remove) + a recently-viewed section reading `WEB/lib/recently-viewed.ts`.
- [ ] T069 [P] [US6] `MOB/features/favorites/` — favorites list screen + recently-viewed list; open/add-to-cart/remove; wire into the Account tab.
- [ ] T070 [P] [US6] Tests: favorites persistence across sessions (Playwright) + `commonTest` favorites/recently-viewed logic.

**Checkpoint**: All six user stories independently functional on both surfaces.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Telemetry, parity, guards, docs, and full validation.

- [ ] T071 [P] Web telemetry: PostHog catalog→cart→checkout funnel events (shared taxonomy names) + route runtime errors to PostHog in `WEB/lib/telemetry.ts`; assert **no PII / no card data / no `client_secret`**.
- [ ] T072 [P] Define the shared analytics **event taxonomy** names in a doc so customer-mobile can adopt them later (mobile PostHog/Crashlytics remain deferred per 013/014 — record the deferral).
- [ ] T073 [P] Add the Go DTO **drift-guard** test (handler JSON tags == contracts/shared-dtos.md) in `CORE/...` and confirm the KMP DTO diff-guard runs in CI.
- [ ] T074 [P] Update the customer parity register `docs/audiences/customer-capabilities.md` (web ↔ mobile) with the commerce capabilities.
- [ ] T075 [P] Secret/PII sweep across new code + logs (`grep` for `sk_`/`whsec_`/`client_secret`/card patterns → none); confirm `mobile-guard.sh` passes (publishable key only).
- [ ] T076 Run the full gate set: `pnpm -r typecheck` + `pnpm -r test` + `WEB` Playwright + `make core-test` (+`FULL=1`) + both mobile apps build; then execute `quickstart.md` (incl. the multi-shop fan-out SQL checks) end-to-end.
- [ ] T077 Update `CLAUDE.md` § Current status / Active feature with the 019 outcome and any operator-run steps (migration apply, Stripe secrets, ngrok webhook, `s3:GetObject` grant).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all user stories** (schema T009, DTO SSOT T010–T011, platform plumbing T012–T016, client scaffolding T017–T018).
- **US1 (P3)** → after Foundational. MVP entry.
- **US2 (P4)** → after Foundational; product-detail extends US1's storefront slice; introduces the cart.
- **US3 (P5)** → after **US2** (needs the cart) — the revenue path; the full MVP completes here.
- **US4 (P6)** → after Foundational (independent; extends the storefront slice — coordinate on `storefront` files with US1/US2).
- **US5 (P7)** → after **US3** (needs placed orders).
- **US6 (P8)** → after **US2** (needs favorite-save + recently-viewed).
- **Polish (P9)** → after all desired stories.

### Story independence notes

- US1, US2, US3 form the P1 spine and are sequential (each builds the next).
- US4 is independent of US2/US3 but shares the `storefront` Go package with US1/US2 — treat those files as a coordination point (not [P] across stories).
- US5 depends on US3; US6 depends on US2.

### Within a story

- Backend repo → service → handler → register; models/DTOs before services; tests alongside.
- Web/mobile screens after their backend endpoint exists (or stub against the contract).

---

## Parallel Opportunities

- **Setup**: T001–T008 nearly all [P] (distinct files/surfaces).
- **Foundational**: T012/T013/T014 [P]; T017/T018 [P] (mobile vs web).
- **Within each story**: the three surfaces run in parallel — Backend vs Web vs Mobile tasks are [P] once the story's contract is fixed (e.g. US1: T022 ∥ T023–T026 ∥ T027–T030 after T019–T021 land the endpoints).
- **Cross-story**: with capacity, US4 can proceed alongside the US2→US3 spine (mind the shared `storefront` files).

## Parallel Example — User Story 1

```bash
# After the storefront endpoints (T019–T021) exist, run the three surfaces' tests/UIs in parallel:
Task: "T022 Go storefront service/handler/repo tests"
Task: "T023 Web ProductCard/ProductRail/PromoCarousel components"
Task: "T027 Mobile HttpCatalogRepository + DTO mappers"
```

---

## Implementation Strategy

### MVP (the user's explicit ask: full flow to a placed order)

1. Phase 1 Setup → Phase 2 Foundational.
2. **US1 → US2 → US3** (the P1 spine): browse → product/cart → checkout/pay/receipt/fan-out.
3. **STOP & VALIDATE** at the US3 checkpoint against SC-001/003/005/006/007/008/009 on both surfaces + the fan-out SQL. This is a demoable, complete purchase flow.

### Incremental delivery

4. US4 (search) → US5 (orders) → US6 (favorites/recently-viewed), each independently testable and demoable.
5. Phase 9 polish + full quickstart validation; operator runs the cloud/secret steps.

### Notes

- `[P]` = different files, no incomplete dependency. `[Story]` maps to spec.md US1–US6.
- Commerce stays on the **hot path**; the Stripe secret never leaves core-api; the webhook is authoritative.
- Commit per task or logical group; the operator runs migration apply, Stripe secret provisioning, the ngrok webhook, and the `s3:GetObject` grant (see quickstart.md).
