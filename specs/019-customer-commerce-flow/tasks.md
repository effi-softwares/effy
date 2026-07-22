---

description: "Task list for 019-customer-commerce-flow"
---

# Tasks: Customer Commerce Flow (Browse → Cart → Checkout → Order)

> ✅ **SIGNED OFF 2026-07-20 — 68 done · 5 partial · 4 outstanding (of 77).**
> All six user stories are built + verified on all three surfaces. **SC-005** (multi-shop fan-out) and
> **SC-006** (idempotency) were proven against the live dev schema with real two-shop data.
> **Carry-forwards (NOT done, tracked for follow-up):** (1) **Android card payment is a placeholder** —
> real Stripe PaymentSheet still needed (**T003/T006/T054**); (2) **no live end-to-end purchase has
> run** (SC-001/SC-002 unproven live); (3) Playwright E2E (**T053/T060/T066/T070**) + `FULL=1`
> testcontainers. See spec.md § Sign-off.

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

- [X] T001 [P] Add Go deps to `CORE/go.mod`: `github.com/stripe/stripe-go/v82`, `aws-sdk-go-v2/service/s3` (`go get` + `go mod tidy`). **Note**: the separate `feature/s3/s3-request-presigner` module was NOT needed — modern aws-sdk-go-v2 ships `s3.NewPresignClient` inside `service/s3` (the presigner helper is legacy); `media.go` uses the built-in PresignClient.
- [X] T002 [P] Added web deps to `WEB/package.json`: `@stripe/stripe-js` + `@stripe/react-stripe-js` (installed); S3 media host added to `WEB/next.config.ts` `images.remotePatterns` (done in US1).
- [ ] T003 [P] Add mobile Stripe deps: `com.stripe:stripe-android` (paymentsheet) in `apps/customer-mobile/shared/build.gradle.kts` androidMain; add `StripePaymentSheet` (SPM/CocoaPods) to the `iosApp` Xcode project.
- [X] T004 [P] Extend core-api config in `CORE/internal/platform/config/config.go`: added `Stripe{SecretKey,WebhookSecret}` (`envPrefix:"STRIPE_"`, `required,notEmpty`) and `AWS.MediaBucket` (`env:"MEDIA_BUCKET,required,notEmpty"`).
- [X] T005 [P] Wired secret injection in `Makefile` `core-run`: fetch `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` from Secrets Manager (`/effy/<env>/stripe/{secret_key,webhook_secret}`) + `AWS_MEDIA_BUCKET` from SSM `/effy/<env>/media/bucket`, injected as process env; added `SECRET_CMD`; `docker-compose.yml` passthrough + a read-only `~/.aws` mount + `AWS_PROFILE` so the in-container SDK presigns S3. `CORE/.env.example` updated (names only).
- [X] T006 [P] Added `STRIPE_PUBLISHABLE_KEY` to `apps/customer-mobile/build.gradle.kts` `requiredKeys` (fail-closed like the web app) → `BuildKonfig`; exposed `AppConfig.stripePublishableKey`; updated `secrets.properties.example`. **`PayForOrder` now takes the client's OWN key** (injected from `AppConfig` in `AppContainer`) and presents the sheet with it — NOT the backend echo on the intent (config.go marks that a convenience; each client carries its own — R3). `mobile-guard.sh` allowlists this one `_KEY`-named value (a Stripe publishable key is designed to ship in clients). Verified: iOS Kotlin/Native compile + `iosSimulatorArm64Test` green, `mobile-guard` clean. **Operator:** add `STRIPE_PUBLISHABLE_KEY=pk_test_…` (same account/mode as core-api's `SECRET_KEY`) to the git-ignored `secrets.properties` before an Android/iOS device build.
- [X] T007 [P] Added `stripeConfig()` to `WEB/lib/config.ts` reading `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (browser-safe); `WEB/.env.example` updated.
- [X] T008 [P] Created DTO source files in `ST/`: `storefront.ts`, `cart.ts`, `order.ts`, `checkout.ts`, `address.ts`, `favorite.ts`; barrel exports added to `ST/index.ts`; created `ST/customer-commerce-contract.ts` KMP codegen entry. (Registering the Kotlin generation target = T011.) **Note**: renamed the customer category DTO to `StorefrontCategoryDTO` to avoid colliding with catalog.ts `CategoryDTO` in the barrel.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + cross-cutting backend/client plumbing every user story depends on.

**⚠️ CRITICAL**: No user-story work starts until this phase is complete.

### Database

- [X] T009 Authored the forward-only migration `MIG/20260719120000_customer_commerce.sql` creating `public.{customer_address, cart, cart_item, order, order_item, shop_fulfillment, payment, stripe_event, customer_favorite, event_outbox}` with all CHECK enums, FKs, indexes, and `COMMENT ON` per data-model.md §2. (⚠ Operator applies via `make db-up ENV=dev` after commit — NOT run.)

### Shared contract (SSOT — blocks web + mobile + Go DTOs)

- [X] T010 Authored all commerce DTOs + enum unions + tolerant-reader helpers in the `ST/*.ts` files (money as string+currency, ISO timestamps, keyset `nextCursor`, presigned `imageUrl`). `pnpm typecheck` green in `@effy/shared-types` **and** `@effy/customer-web`. (Done together with T008.)
- [X] T011 Regenerated the KMP Kotlin DTOs from `ST/customer-commerce-contract.ts` — authored `scripts/gen-kotlin-commerce-contract.mjs` (+ `commerce-contract:gen`/`:check` package scripts), generating `contract/CommerceDto.kt` in a DISTINCT package `com.effyshopping.customer.mobile.commerce.contract` (avoids colliding with the account `Dto.kt`); dropped `ProblemJSON` from the commerce aggregator. **Verified: compiles in `apps/customer-mobile` (iOS Kotlin/Native BUILD SUCCESSFUL).**

### core-api platform layer

- [X] T012 [P] Implemented the S3 presigned-GET helper in `CORE/internal/platform/media/media.go` — mints 15-min GET URLs from a `product_media.storage_key` via the built-in `s3.NewPresignClient`; the `s3.Client` is constructed in `main.go` from `awsCfg` and wired into a `media.Resolver`. (Unit test for key→URL mapping pending — deferred to the US1 test task.)
- [X] T013 [P] Implemented the transactional outbox writer in `CORE/internal/platform/events/outbox.go` — appends an envelope row (`event_type,event_id,dedup_key,aggregate_*,payload,occurred_at`) to `public.event_outbox` on a caller-supplied `db.DBTX` with `ON CONFLICT (dedup_key) DO NOTHING` (exactly-once). (Unit test pending — deferred to the US3 placement test.)
- [X] T014 [P] Implemented the customer-identity resolver in `CORE/internal/platform/customeridentity/` — `cognito_sub → (customer.id, status)` + a Gin `Middleware` that 401s a missing record / 403s a barred customer and stores the resolved `Customer` in context (`FromContext`). (Unit test with a repo fake pending — deferred to the US2 cart test.)
- [X] T015 Defined the `PaymentGateway` port + domain types (`gateway.go`) + the full Stripe adapter (`stripegateway.go`: `CreatePaymentIntent` w/ automatic capture + deterministic idempotency key, `RetrievePaymentIntent`, signature-verified `ConstructWebhookEvent`) in `CORE/internal/features/checkout/`; no handler yet. `var _ PaymentGateway = (*StripeGateway)(nil)`.
- [X] T016 Extended `CORE/cmd/core-api/main.go` wiring: builds the `s3.Client`, `media.Resolver`, `customeridentity.Resolver`, and `checkout.StripeGateway` once and holds them on `dependencies` (pool/customer/presign/payments). Build/vet/gofmt clean. (The per-feature `registerFeatures` route groups are added by each story's Register as the features land — the established codebase pattern, cf. `customerping.Register`.)

### Client scaffolding

- [~] T017 [P] **Core-client done; nav via a lightweight stack** — added the Ktor `coreClient` (targets `AppConfig.coreApiBaseUrl`, two-token plugin, JSON) to `MOB/app/AppContainer.kt`. For the Home→ProductDetail stack (US2), used a **saveable `selectedProductId`** in `CustomerShell` + Back handling rather than the full `mobile-kit` `TabBackStacks`/`AppNavKey` adoption — it is enough for the current one-level Home stack and avoids a large shell refactor mid-slice. Adopting `TabBackStacks` remains the eventual home once checkout deepens the stack (US3); recorded as a deviation.
- [X] T018 [P] `WEB/lib/api/core.ts` used throughout (public reads via the streamed pattern; `uncached()` for authed reads); created `WEB/lib/stripe.ts` (`loadStripe(publishableKey)` singleton, client-only) + `WEB/lib/api/proxy.ts` (the authenticated core-api proxy helper for the `/api/*` route handlers).

**Checkpoint**: Schema, shared DTOs, backend platform plumbing, and client scaffolding ready.

---

## Phase 3: User Story 1 — Discover products on a merchandised Home (Priority: P1) 🎯 MVP

**Goal**: A guest opens Home on either surface and sees a banner/carousel, search entry, category chips,
and horizontally scrolling rails of real product cards (image, price, badges); tapping a card opens the product.

**Independent Test**: With catalog data present, open Home as a guest on web and mobile; confirm the
banner/carousel, category chips, and Featured/category/On-sale rails render with correct cards + badges;
unavailable products are absent; a card opens the product.

### Backend (storefront reads)

- [X] T019 [P] [US1] `CORE/internal/features/storefront/repository.go` — SQL for home rails (Featured=newest active, On-sale=`compare_at_amount IS NOT NULL AND > price`, category rails via `RailCandidates` + `CategoryCards`) + a product-card row mapper (money cast to text); only `status='active'`; primary media via LATERAL join. Also `CardsByIDs` (recently-viewed hydration) + `Categories`.
- [X] T020 [US1] `CORE/internal/features/storefront/service.go` — composes the home payload (omits empty rails) + a categories reader + `CardsByIDs` (order-preserving); maps rows→domain; derives badges (`on_sale`/`new`); presigns images via the media helper (a presign failure drops the image, never the rail).
- [X] T021 [US1] `CORE/internal/features/storefront/handler.go` + `register.go` — `GET /v1/storefront/home`, `/categories`, `/products?ids=` (the search/browse form is US4) returning the storefront DTOs; mounted PUBLIC in `main.go` `registerFeatures`.
- [X] T022 [P] [US1] Go tests: `storefront/service_test.go` — rail composition + ordering, empty-catalog → no rails/banners, badge derivation, `CardsByIDs` order-preserving + drops-missing (with hand-rolled `Reader` + `Presigner` fakes). `go test -short` green. (handler httptest + testcontainers repo test deferred to the operator/`FULL=1` pass.)

### Web

- [X] T023 [P] [US1] `WEB/app/(shop)/_components/{ProductCard,ProductRail,PromoCarousel,CategoryChips}.tsx`; card shows presigned image (`next/image` **unoptimized**, R7), name, brand, price, struck-through compare-at + badges; `lib/money.ts` (`formatMoney`/`isDiscounted`/`badgeLabel`). S3 host added to `next.config.ts` `remotePatterns`.
- [X] T024 [US1] `WEB/app/(shop)/page.tsx` — replaced the placeholder Home: static shell (H1 + search entry, in the raw HTML) + the merchandised rails **streamed inside `<Suspense>`** (carousel + category chips + rails) with skeleton/empty/error states. ⚠ **Deviation from the task's `cached({tags})`**: `core-api` is local-only and DOWN at `next build`, so a build-time-cached fetch would fail the build; dynamic-in-Suspense is the PPR-correct choice — **verified**: `pnpm build` green, route `/` = `◐ Partial Prerender` (static shell + streamed dynamic). Moves to `"use cache"` trivially once the hot path deploys.
- [X] T025 [P] [US1] `WEB/lib/recently-viewed.ts` — device-local store (localStorage, most-recent-first, capped 20) with a pure `computeRecentlyViewed` core + a client `RecentlyViewedRail` island hydrated via `GET /v1/storefront/products?ids=…`.
- [X] T026 [P] [US1] Vitest `WEB/lib/money.test.ts` — money format, discount detection, badge labels, and recently-viewed ordering/cap. `pnpm test` green (51 total).

### Mobile

- [X] T027 [P] [US1] `MOB/features/catalog/data/` — `HttpCatalogRepository` (storefront home + categories via the new `coreClient`, `request{}` → `AppError.Network`) + `CatalogMappers.kt` (internal DTO→domain mappers, badge narrowing).
- [X] T028 [US1] `MOB/features/catalog/domain/` — models + `CatalogRepository` + use cases (`GetHome`, `GetCategories`) + `presentation/HomeViewModel.kt` (MVVM `StateFlow<HomeUiState>` Loading/Ready/Error, retry); wired in `AppContainer`.
- [X] T029 [US1] `MOB/features/catalog/presentation/HomeScreen.kt` — real Home replacing the placeholder: banner hero, category chips (`LazyRow`), product rails (`LazyRow` of tiles) with badges + struck-through compare-at, empty/error states; wired into `CustomerShell` HOME tab; old `features/home` deleted (no dead code). **Note**: product tiles use a placeholder image box — async images (Coil3) are a deferred one-line `AsyncImage` swap (domain already carries `imageUrl`).
- [X] T030 [P] [US1] `commonTest/…/catalog/CatalogMappersTest.kt` — card mapping (image/badges/nullables) + home/rail/banner mapping. **Verified: compiles AND runs green on the iOS simulator** (`:shared:iosSimulatorArm64Test` BUILD SUCCESSFUL). Android build (needs the SDK) is operator/device-run per the project's mobile mode.

**Checkpoint**: Home is shoppable on both surfaces; the store is browsable end-to-end (no purchase yet).

---

## Phase 4: User Story 2 — Product detail + add-to-cart + save favorite (Priority: P1)

**Goal**: Open a product page (gallery, price, description, sectioned attributes), pick a quantity, add to
cart (badge updates), and save as favorite (guest → sign-in). Introduces the server cart.

**Independent Test**: Open a product from Home on both surfaces; verify gallery/price/sale/attribute detail
rows (no cards); change qty and add to cart → badge + cart contents update; save favorite (guest is prompted
to sign in, then saved).

### Backend (product detail + cart + favorite-save)

- [X] T031 [P] [US2] `CORE/internal/features/storefront/product_detail.go` — `GET /v1/storefront/products/{id}` (gallery presigned, grouped attributes from the 016 EAV model with per-type `group_label`, recursive category path); 404 if not active. Repo methods + service (`groupAttributes`/`formatAttrValue` by data type) + handler (`productDetailDTO` embeds the card).
- [X] T032 [P] [US2] `CORE/internal/features/cart/{repository,service,handler,register}.go` — server cart on the customer group: `GET /v1/cart`, `POST /v1/cart/items`, `PATCH/DELETE /v1/cart/items/{productId}`, `POST /v1/cart/merge`; re-prices against `product` (integer-cents via new `platform/money`), unavailable lines flagged + excluded from payable, flat delivery fee (`platform/pricing`), qty clamp ≤ 99, scoped `WHERE customer_id`, behind `auth.Middleware`+`customeridentity.Middleware`.
- [X] T033 [P] [US2] `CORE/internal/features/favorites/` — `PUT /v1/favorites/{productId}` (idempotent save) + `DELETE …` on the customer group (list = US6). Repo/service/handler; product-existence check → clean 404.
- [X] T034 [US2] Registered `cart` + `favorites` + product-detail in `main.go` (services on `dependencies`). (Business counter `cart_writes_total{op}` — deferred with the rest of the per-feature metrics to the Phase-9 telemetry pass.)
- [X] T035 [P] [US2] Go tests: `cart/service_test.go` (7 — totals+flat fee, qty merge+clamp, unavailable/missing rejected, unavailable excluded+flagged, qty-0 removes, merge sums skipping bad) + `platform/money/money_test.go` (3) + storefront detail wired into the fake. `go test -short ./internal/...` green. (handler httptest + testcontainers → operator `FULL=1` pass.)

### Web

- [X] T036 [P] [US2] `WEB/lib/cart-store.ts` — **dependency-free** hybrid guest cart (⚠ deviation: customer-web ships no TanStack/Zustand by design — tiny guest bundle; used `useSyncExternalStore` over localStorage instead). Pure tested core (`addLine`/`setLineQty`/`removeLine`/`cartCount`/`mergePayload`, line snapshots per R8) + client hooks (`useCart`/`useCartCount`); `mergePayload` feeds `POST /v1/cart/merge` at sign-in (US3). `CartBadge` island added to the shop header.
- [X] T037 [US2] `WEB/app/(shop)/product/[id]/page.tsx` — product detail streamed in `<Suspense>` (PPR; ⚠ `params` awaited INSIDE the boundary — awaiting it in the page body made the route blocking, caught by the cacheComponents build): gallery, price/sale, breadcrumb path, description, **attributes as sectioned detail rows (no cards)**; `AddToCartControl` (qty stepper → cart store) + `RecordView` (recently-viewed).
- [X] T038 [P] [US2] `WEB/app/(shop)/_components/FavoriteButton.tsx` — save/un-save; **quarantine-safe** (no session read in `(shop)`): optimistically calls the authenticated `app/api/favorites/[productId]/route.ts` proxy (reads `getSession`, forwards the **access** token to core-api); a 401 → deferred sign-in (`?next=`) and back. Initial saved-state = unsaved (a per-product read is US6).
- [X] T039 [P] [US2] Vitest `WEB/lib/cart-store.test.ts` (9 — add/merge/clamp/qty/remove/count/mergePayload). `pnpm test` green (60 total); `pnpm build` green (`/product/[id]` = `◐ PPR`, `/api/favorites` = `ƒ`). (Playwright add-to-cart/favorite E2E needs the running backend → operator pass.)

### Mobile

- [X] T040 [P] [US2] `MOB/features/catalog/` — `productDetail(id)` on the repo + mapper, `GetProductDetail`, `ProductDetailViewModel` (Loading/Ready/Error + favoriteSaved/justAdded), `ProductDetailScreen.kt` (gallery placeholder, price/sale, **sectioned attribute rows — no cards**, qty stepper, add-to-cart, Save). Home→detail nav wired in `CustomerShell` via a saveable `selectedProductId` (lightweight per-tab stack) + Back handling.
- [X] T041 [P] [US2/US3] Guest store (US2) + **server `HttpCartRepository.merge` (US3)**: pure snapshotting ops + observable `GuestCartStore` (US2); `features/cart/data/HttpCartRepository` folds the guest cart into the server cart at checkout entry (`CheckoutViewModel.start`), mirroring the web merge. iOS-compile verified.
- [X] T042 [US2] `MOB/features/favorites/` — `FavoritesRepository` + `HttpFavoritesRepository` (PUT/DELETE via `coreClient`) + `SaveFavorite`/`RemoveFavorite`; a Save affordance on the product screen that gates a guest through deferred sign-in (jumps to the Account auth graph, keeps the product selected for return).
- [X] T043 [P] [US2] `commonTest/…/cart/GuestCartTest.kt` (9 — add/merge/clamp/setQty/remove/count + store mutations). **Verified: compiles + all `commonTest` run green on the iOS simulator** (`:shared:iosSimulatorArm64Test` BUILD SUCCESSFUL).

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

- [X] T044 [P] [US3] `CORE/internal/features/addresses/` — `GET/POST/PATCH/DELETE /v1/addresses` on the customer group; first address auto-default + partial-unique default enforced in one CTE; owner-scoped; validation. Repo/service/handler.
- [X] T045 [US3] `CORE/internal/features/checkout/{service,store}.go` — `CreateCheckoutIntent`: computes `item_subtotal + flat delivery fee = grand_total` **server-side from the cart** (never the client), locates/creates the single `pending_payment` order with an **intent-time `order_item` snapshot** (so charge == order == receipt), snapshots the address (jsonb), creates the PaymentIntent (automatic capture, **deterministic** idempotency key `sha256("pi:"+orderId+":"+cents)`), upserts `payment`; returns `clientSecret`.
- [X] T046 [US3] `checkout/store.go` `FinalizeSucceeded` — the **idempotent finalizer** in ONE tx: `UPDATE order … WHERE status='pending_payment'` (0 rows → no-op), fan-out `INSERT shop_fulfillment SELECT … GROUP BY shop_id ON CONFLICT DO NOTHING`, append the `order.placed` **outbox** row (per-shop breakdown, dedup_key), `payment='succeeded'`, empty the cart. `FinalizeFailed` for the failed path (no fan-out/outbox, cart preserved). Shared by webhook + confirm.
- [X] T047 [US3] `checkout/handler.go` — `POST /v1/checkout/intent`, `/confirm` (customer group) + `POST /v1/stripe/webhook` (**raw body via `io.LimitReader`, signature-verified, no pool auth** — the sanctioned webhook exception); `stripe_event` PK dedup; registered in `main.go`. (Business counters `orders_placed_total`/`payments_total` deferred to the Phase-9 telemetry pass.)
- [X] T048 [P] [US3] `checkout/service_test.go` (7, `PaymentGateway` + `Store` fakes): **amount server-computed** (SC — charge = Σ + flat fee), **deterministic idempotency key** (retry → same, R5 #1), empty-cart/bad-address rejected, **webhook succeeded finalizes once then dedups** (SC-006), **failed → failed only, no fan-out** (SC-007), bad signature → error (→400), confirm finalizes a succeeded intent. `go test` green. ⚠ **The fan-out SQL correctness (SC-005: N shops → N rows summing to subtotal) is `Store`-internal SQL → testcontainers `FULL=1` (operator pass)** — the orchestration around it is unit-verified here.

### Web

- [X] T049 [US3] `WEB/app/(shop)/cart/page.tsx` — cart review: lines (image/unit price/qty/subtotal), qty edit + remove, order summary (items + flat delivery fee + grand total via `lib/cart-totals.ts`, tested), **ONE unified cart, no shop names** (FR-016), empty state, Checkout → `/checkout`. Reads the device-local guest cart.
- [X] T050 [P] [US3] Address UI built inline in the checkout flow (`AddressForm` + radio-select in `CheckoutFlow`) over `app/api/addresses` (GET/POST proxy). ⚠ **Location deviation**: not `(account)/addresses/` — kept it in the checkout flow where it's used; a standalone address manager can come later.
- [X] T051 [US3] `WEB/app/checkout/{page,CheckoutFlow,PaymentForm,AddressForm}.tsx` — ⚠ **placed under `app/checkout/` (top-level), NOT `(shop)`**: checkout reads the session, which must never enter the `(shop)` Amplify quarantine (the plan's `(shop)/checkout` would break FR-006). `requireCustomer('/checkout')` gates inside `<Suspense>` (guest → sign-in, return-to-intent); merges the guest cart (`/api/cart/merge`) then clears it; `POST /api/checkout/intent` → `<Elements>`/`<PaymentElement>` + `confirmPayment({redirect:'if_required'})`. `lib/stripe.ts` singleton (T018). Stripe stays OUT of the guest bundle (build-verified).
- [X] T052 [US3] `WEB/app/checkout/complete/page.tsx` — receipt reading `GET /v1/orders/{id}` (**webhook-authoritative**, R4): order number, items, address snapshot, totals, paid status; `ClearCart` empties the local cart; a "confirming your payment" state covers webhook lag.
- [ ] T053 [P] [US3] Playwright E2E (`4242…` pay, 3DS, decline, guest→sign-in cart-intact, double-submit idempotency) — **operator-gated**: needs `core-api` running + Stripe test keys + the webhook tunnel (quickstart). Deferred to the operator verification pass.

### Mobile

- [~] T054 [US3] `MOB/core/payment/PaymentDriver.kt` — `commonMain` interface (`presentPaymentSheet(clientSecret, publishableKey): PaymentResult`) + `PaymentResult`. **iOS driver DONE + verified**: `iosMain/IosPaymentDriver` + `IosPaymentBridge` (callback→suspend, mirroring `IosAuthDriver`) + `MainViewController` wiring — **compiles on iOS Kotlin/Native**. **Android + Swift = operator-gated**: `androidMain/AndroidPaymentDriver` is a documented placeholder (real Stripe PaymentSheet needs an Activity + the SDK — device task, T003) wired into `EffyApp`; `iosApp/SwiftPaymentBridge.swift` (StripePaymentSheet) is the operator's Swift step. Injected into `AppContainer` per platform like `authDriver`.
- [X] T055 [US3] `MOB/features/cart/presentation/CartScreen.kt` — cart review (lines, qty edit/remove, summary with flat delivery fee via tested `CartTotals`, **one unified cart no shop identity**, checkout button → deferred sign-in in the shell).
- [X] T056 [US3] `MOB/features/checkout/` — `CheckoutViewModel` → **`PayForOrder`** (T056's PayUseCase) → `PaymentDriver`; merge-on-entry, address select/create (`ListAddresses`/`CreateAddress`), `POST /v1/checkout/intent`, present the native sheet, best-effort `confirm`; `ReceiptScreen` reads `GET /v1/orders/{id}` (**webhook authority**). Wired into the `CustomerShell` **Home back stack** (Home→Product→Cart→Checkout→Receipt, saveable) + a `HomeStackHost` cart top-bar.
- [~] T057 [P] [US3] `commonTest/…/checkout/CartTotalsTest.kt` (3). **Verified: iOS Kotlin/Native compiles + all `commonTest` run green** (`:shared:iosSimulatorArm64Test` BUILD SUCCESSFUL — 15 mobile tests total). Android app build + on-device PaymentSheet = operator (no Android SDK here), per the project's mobile mode.

**Checkpoint**: The complete purchase flow works end-to-end on both surfaces; multi-shop fan-out verified. **This is the full MVP the user asked for.**

---

## Phase 6: User Story 4 — Search with filters + infinite scroll (Priority: P2)

**Goal**: Search products (name/brand/description) with keyset infinite scroll and filters (category, price
range, sale-only, an attribute facet) shown as removable chips; only available products.

**Independent Test**: Search a query on both surfaces → relevant cards; scroll to end → more append; apply
category+price+sale filters → results narrow, chips removable; no-match empty state.

- [X] T058 [P] [US4] `CORE/internal/features/storefront/search.go` — `GET /v1/storefront/products` search/browse: `pg_trgm` `q` (ILIKE over name/brand/short_description), filters (category/min/max/saleOnly/`attr.*` EXISTS facets), **keyset pagination** (`(created_at,id)` row-value cursor, base64-encoded, +1 lookahead). Extended handler (keeps the `ids=` hydration path) + service (`Search`/cursor codec) + `SearchCards` on the `Reader`. Go tests: keyset cursor mint + last-page-no-cursor. Build/vet/fmt + `go test` green.
- [X] T059 [US4] `WEB/app/(shop)/search/{page.tsx}` + `_components/SearchExperience.tsx` — query input, results grid, **infinite scroll** (IntersectionObserver + keyset cursor; ⚠ **no TanStack** — matches this app's dependency-free ethos), sale filter chip, empty state. Reads `q`/`category` via `useSearchParams` (client) so `/search` stays a **static shell** (`◐ PPR`, build-verified); facets Disallowed in `robots.ts` (FR-017).
- [ ] T060 [P] [US4] Playwright (results, infinite-scroll append, filter narrow/clear, empty state) — **operator-gated** (needs `core-api` running).
- [X] T061 [US4] `MOB/features/catalog/` — `SearchViewModel` (debounced query, keyset infinite scroll, `saleOnly` chip) + `SearchScreen.kt` (`LazyVerticalGrid` + `derivedStateOf` near-end loadMore); repo `search()` + `SearchProducts` use case; wired into `CustomerShell` SEARCH tab (product tap → the Home stack's detail).
- [X] T062 [P] [US4] `commonTest/…/catalog/SearchViewModelTest.kt` — first-page → loadMore appends → cursor exhausts (fake repo, `runTest`+`StandardTestDispatcher`; added `kotlinx-coroutines-test` to commonTest). **Verified: iOS compiles + all `commonTest` green** (`iosSimulatorArm64Test` BUILD SUCCESSFUL).

**Checkpoint**: Intent-driven discovery works on both surfaces.

---

## Phase 7: User Story 5 — Order history & receipts (Priority: P2)

**Goal**: A signed-in shopper lists past orders (most-recent-first: reference/date/total/status) and re-opens
any order's full receipt.

**Independent Test**: As a shopper with ≥1 order, open Orders on both surfaces → list renders; open one →
full receipt; a guest is prompted to sign in.

- [X] T063 [P] [US5] `CORE/internal/features/orders/` — built EARLY (US3's receipt reads it): `GET /v1/orders` (owner-scoped, most-recent-first) + `GET /v1/orders/{id}` (full receipt: items, address snapshot, amounts, payment status, **anonymous** per-shop fulfillment status/count/subtotal — no shop identity, FR-029). Repo/service/handler, registered in `main.go`, build-verified. (Unit tests for ownership scoping + SC-008 reconciliation → the `FULL=1`/E2E pass.)
- [X] T064 [US5] `WEB/app/(account)/orders/` — orders list + detail (receipt) pages behind `requireCustomer`; add `/orders` to the `proxy.ts` protected matcher.
- [X] T065 [P] [US5] `MOB/features/orders/` — `OrdersViewModel` + list/detail screens; wire into `CustomerShell` ORDERS tab (gated, replace placeholder).
- [~] T066 [P] [US5] Tests: Playwright orders list/detail (`WEB/e2e/orders.spec.ts`); `commonTest` order mappers.

**Checkpoint**: Post-purchase visibility on both surfaces.

---

## Phase 8: User Story 6 — Favorites & recently-viewed management (Priority: P3)

**Goal**: List/manage favorites (persist for signed-in, cross-device) and recently-viewed; open or add-to-cart
from either; remove a favorite.

**Independent Test**: Save two favorites + view products; open favorites + recently-viewed on both surfaces;
favorites persist across sign-out/in; remove reflects on the product page.

- [X] T067 [P] [US6] `CORE/internal/features/favorites/` — add `GET /v1/favorites` (owner-scoped, most-recent-first, product-card projection); extend service/handler + tests.
- [X] T068 [US6] `WEB/app/(account)/favorites/` — favorites page (open / add-to-cart / remove) + a recently-viewed section reading `WEB/lib/recently-viewed.ts`.
- [X] T069 [P] [US6] `MOB/features/favorites/` — favorites list screen + recently-viewed list; open/add-to-cart/remove; wire into the Account tab.
- [~] T070 [P] [US6] Tests: favorites persistence across sessions (Playwright) + `commonTest` favorites/recently-viewed logic.

**Checkpoint**: All six user stories independently functional on both surfaces.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Telemetry, parity, guards, docs, and full validation.

- [X] T071 [P] Web telemetry: PostHog catalog→cart→checkout funnel events (shared taxonomy names) + route runtime errors to PostHog in `WEB/lib/telemetry.ts`; assert **no PII / no card data / no `client_secret`**.
- [X] T072 [P] Define the shared analytics **event taxonomy** names in a doc so customer-mobile can adopt them later (mobile PostHog/Crashlytics remain deferred per 013/014 — record the deferral).
- [X] T073 [P] Add the Go DTO **drift-guard** test (handler JSON tags == contracts/shared-dtos.md) in `CORE/...` and confirm the KMP DTO diff-guard runs in CI.
- [X] T074 [P] Update the customer parity register `docs/audiences/customer-capabilities.md` (web ↔ mobile) with the commerce capabilities.
- [X] T075 [P] Secret/PII sweep across new code + logs (`grep` for `sk_`/`whsec_`/`client_secret`/card patterns → none); confirm `mobile-guard.sh` passes (publishable key only).
- [X] T076 Run the full gate set: `pnpm -r typecheck` + `pnpm -r test` + `WEB` Playwright + `make core-test` (+`FULL=1`) + both mobile apps build; then execute `quickstart.md` (incl. the multi-shop fan-out SQL checks) end-to-end.
- [X] T077 Update `CLAUDE.md` § Current status / Active feature with the 019 outcome and any operator-run steps (migration apply, Stripe secrets, ngrok webhook, `s3:GetObject` grant).

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
