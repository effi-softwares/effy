# Tasks: Retire the Hot Path — One Serverless Backend

**Input**: Design documents from `specs/070-retire-core-api/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api-migration.md](contracts/api-migration.md),
[quickstart.md](quickstart.md), [migration-inventory.md](migration-inventory.md)

**Tests**: included. FR-035/036/037 require them: real-database tests for money and
simultaneous-request behaviour, re-pointed structural guards, unchanged wire-contract checks.
Browsing, cart and list behaviour gets ordinary unit tests written with the code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7 from spec.md; setup, foundational and polish tasks carry none
- **OPERATOR**: run by the operator, never by Claude — Claude authors, hands over exact commands
- `GO` = `apis/core-api/internal` (the reference being ported; read it, do not edit it)
- `EDGE` = `apis/edge-api`
- `SH` = `apis/edge-api/shared/src`
- `SF` = `apis/edge-api/storefront`
- `CO` = `apis/edge-api/commerce`
- `ST` = `packages/shared-types`
- `CW` = `apps/customer-web`
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `SW` = `apps/shop-web/src`
- `BO` = `apps/back-office/src`

**Porting rule for every task that says "port"**: SQL text is carried over verbatim; rows are
mapped to domain values explicitly; money is integer cents via `SH/lib/money.ts`; the response is
typed by the existing DTO in `ST/src`; status codes, problem `type` URIs and `code` values match the
Go handler exactly unless [contracts/api-migration.md §3](contracts/api-migration.md) says otherwise.
Function files are `src/functions/<resource>-v1-<verb>.ts`, begin with `preamble()`, and delegate to
a `service.ts` that delegates to a `repository.ts`.

---

## Phase 1: Setup

- [x] T001 Fill a "Baseline" table at the top of `specs/070-retire-core-api/quickstart.md`, measured before any change: `go test -short ./...` pass count in `apis/core-api`; `make edge-test` counts per service (with `CONTAINER_TESTS=1`); `pnpm --filter @effy/shared-types test` and the three `*contract:check` states; customer-web, shop-web, back-office test counts; customer-mobile `:shared:testAndroidHostTest`
- [x] T002 Amend the constitution to **3.0.0** with `/speckit-constitution` per research R14: replace Principle III with a single-backend principle (all server behaviour on serverless TypeScript; services split by audience and domain; a plan states which service it extends); delete the locked "Hot path: Go 1.25; Gin; pgx/v5" standard and the "move the hot path off Go" example; reword Principle VI's last bullet to one backend; restate Principle VII and the observability standard as structured logs + CloudWatch metrics and alarms (no Prometheus/Grafana); update the Quality Gates wording "path justification per Principle III" to "service placement per Principle III"; write the Sync Impact Report; re-check `.specify/templates/{plan,spec,tasks}-template.md` for dual-path wording. **No task below starts before this is done**
- [x] T003 [P] Rewrite `ARCHITECTURE.md` for one backend: remove the "Hot-path API (Go)" glance row (:19) and section (:148-211); change every "both backends" (:30, :41-43, :222, :253, :490) to the single backend; extend the sync-HTTP shape (:260-262) to include the customer and public audiences; replace the metrics section (:429, :438-443) with the EMF + alarms model from plan.md "Telemetry declared"; correct :472 (device tokens are registered on the customer edge service)
- [x] T004 [P] Correct `platform-brief.md` (:37, :49-50, :71, :73, :80), `docs/api/path-assignment.md` (rewrite as "which service"), `docs/api/error-envelope.md:3`, `docs/api/versioning-policy.md:3,35`, and the "Platform shape", "Architecture (the spine)", "Observability & telemetry" and "Current status" sections of `CLAUDE.md` to describe one backend and no Prometheus/Grafana

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared helpers, the two service shells, the shopper role, and the additive
infrastructure every story needs.

**⚠ No user story work starts until this phase is complete.**

- [x] T005 [P] Create `SH/lib/money.ts` porting `GO/platform/money/money.go`: `parseCents(text): number` (integer; truncates past 2 dp exactly as Go does), `formatCents(cents): string` (2 dp), `CURRENCY = "AUD"` (from `GO/platform/pricing/pricing.go`); no floating-point arithmetic anywhere. Add `SH/lib/money.test.ts` reproducing every case in `GO/platform/money/*_test.go`. Export from `SH/index.ts`
- [x] T006 [P] Create `SH/lib/availability.ts` porting `GO/platform/availability/availability.go`: `predicate(alias)`, `columns(alias)`, `purchasable(row)`, `outOfStock(row)`, `STATUS_ACTIVE`; add `SH/lib/availability.test.ts`. Export from `SH/index.ts`
- [x] T007 [P] Create `SH/lib/customer-identity.ts` porting `GO/platform/customeridentity/{customeridentity,middleware}.go`: `resolveCustomer(event)` runs the same `SELECT id,status,closure_state FROM public.customer WHERE cognito_sub=$1` on every call (no cache) and returns `{customerId}` or a ready problem response — no row → the uniform 401; barred or closing → the uniform 403. Add a container test `SH/lib/customer-identity.container.test.ts` covering the three outcomes. Export from `SH/index.ts`
- [x] T008 [P] Create `SH/lib/metrics.ts`: one `emitMetric(namespace, name, value, dimensions?)` writing CloudWatch EMF via the logger's stdout, with a unit test asserting the emitted JSON shape. Export from `SH/index.ts`. Do not migrate existing services' hand-rolled emitters in this feature
- [x] T009 Edit `SH/lib/db.ts`: catch Postgres `53300` (too_many_connections) on connect and rethrow a typed `ConnectionLimitError`; edit `SH/lib/http.ts`: `unavailable()` accepts an optional `retryAfterSeconds` and sets `Retry-After`; add `overloaded(log)` that emits `ShopperConnectionsRefused` and returns 503 `unavailable` with `Retry-After: 2`; create `SH/lib/shopper-handler.ts` exporting `shopperHandler(fn)`, which every `SF` and `CO` function exports through and which maps `ConnectionLimitError` to `overloaded()`. Unit-test in `SH/lib/http.test.ts`, and add `SH/lib/shopper-handler.container.test.ts` that creates a role with `CONNECTION LIMIT 1`, holds its one connection, and asserts a second request gets the 503 (FR-030)
- [x] T010 [P] Create `SH/delivery/` porting `GO/platform/delivery/`: `engine.ts` (fee engine, `engine.go`), `plan.ts` (`plan.go`), `zone.ts` (`zone.go`: `normalizePostcode`, `serviceableForPostcode`, `zoneForPostcode`, `sameDayForShops`), `sameday.ts` (re-export the schedule arithmetic from `SH/lib/collection-deadline.ts`; do not duplicate it), `slots.ts` (`slots.go`: `judgeSlot`, `openSlots`, `lockSlot`, `slotLoad`, `ownLiveHolds`, `loadSlotSettings`), `standard-days.ts` (`standarddays.go`), `locality.ts` (`locality.go`), `quote.ts` (`quote.go`). Melbourne wall-clock via `Intl` as `collection-deadline.ts` does. Port every table test in `GO/platform/delivery/*_test.go` (including DST fixtures) to `SH/delivery/*.test.ts`. Expose as `@effy/edge-shared/delivery` in `EDGE/shared/package.json` `exports`
- [x] T011 [P] Create `SH/cart-policy/policy.ts` porting `GO/platform/cartpolicy/policy.go` (`loadPolicy`, defaults 99 per line / 100 distinct, `hasMinimum`, `remaining`, `meets`) with unit tests; expose as `@effy/edge-shared/cart-policy`
- [x] T012 Create `SH/payments/gateway.ts` porting `GO/features/checkout/{gateway,stripegateway}.go`: add `stripe` to `EDGE/shared/package.json`; read the SDK API version targeted by `github.com/stripe/stripe-go/v82 v82.5.1` (`stripe.APIVersion` in the Go module cache) and pin it; the secret key and webhook secret are fetched with `getSecretString` from ARNs in `STRIPE_SECRET_KEY_ARN` / `STRIPE_WEBHOOK_SECRET_ARN`, memoised per container — **on a signature-verification failure the webhook secret memo is dropped, refetched once and verification retried**, so a secret swapped at cut-over is picked up by warm containers; expose payment intent create/retrieve, customer ensure, customer session, payment method list/detach, refund create/list, and `constructEvent(rawBody, signature)`. Define a `PaymentGateway` interface so services take a fake in tests. Expose as `@effy/edge-shared/payments` (own `exports` entry — **not** re-exported from `SH/index.ts`)
- [x] T013 Scaffold `SF/` as a new service copying the shape of `EDGE/orders/` (`package.json` name `@effy/edge-storefront`, `tsconfig.json`, `vitest.config.ts`, `serverless.yml` service `effy-edge-storefront`, 512 MB, 10 s, no authorizer): `healthz` and `readyz` functions under `/storefront/`, `DB_USER` from `${ssm:/effy/${sls:stage}/db/shopper_username}` and `DB_SECRET_ARN` from `${ssm:/effy/${sls:stage}/db/shopper_secret_arn}`, IAM `secretsmanager:GetSecretValue` on that ARN and `s3:GetObject` on the media bucket, `S3_MEDIA_BUCKET` env; add `SF/src/config.contract.test.ts` (every env key the code reads is declared in `serverless.yml`), copied from `EDGE/orders/src/config.contract.test.ts`
- [x] T014 Scaffold `CO/` the same way (`@effy/edge-commerce`, service `effy-edge-commerce`, 512 MB, 10 s default): shopper DB role env as T013; customer authorizer id from `${ssm:/effy/${sls:stage}/edge/authorizer/customer_id}`; env `STRIPE_SECRET_KEY_ARN`, `STRIPE_WEBHOOK_SECRET_ARN`, optional `STRIPE_PUBLISHABLE_KEY`, `S3_MEDIA_BUCKET`; IAM for the shopper secret, both payment secrets and media `GetObject`; `healthz`/`readyz` under `/commerce/`; `CO/src/config.contract.test.ts`
- [x] T015 Create migration A with `make db-new name=shopper_role` and write it per data-model.md: `CREATE ROLE effy_shopper NOLOGIN CONNECTION LIMIT 40`; `GRANT USAGE ON SCHEMA public`; `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public` and `USAGE, SELECT ON ALL SEQUENCES`; `ALTER DEFAULT PRIVILEGES IN SCHEMA public` for both; **no** grant on schema `admin`; a Down that reverses all of it. No password in the file
- [x] T016 Add a `db-shopper-role` target to `Makefile` backed by `infra/scripts/db-shopper-role.sh`: generates a random password, creates or updates the Secrets Manager secret `/effy/<env>/db/shopper` as JSON `{"username":"effy_shopper","password":"…"}`, then runs `ALTER ROLE effy_shopper LOGIN PASSWORD …` through `infra/scripts/db-dsn.sh`; confirm-gated like `db-up`; never echoes the password; uses `AWS_PROFILE=ef`
- [x] T017 [P] Create `infra/envs/dev/commerce.tf`: data source for the operator-created secret `/effy/${var.env}/db/shopper`; SSM parameters `/effy/${var.env}/db/shopper_username` (`effy_shopper`) and `/effy/${var.env}/db/shopper_secret_arn`; SSM parameters `/effy/${var.env}/stripe/secret_key_arn` and `/stripe/webhook_secret_arn` from the two existing Stripe secret data sources (move those data sources here from `core-api.tf`, leaving `core-api.tf` otherwise untouched so it still plans clean)
- [x] T018 [P] Edit `infra/envs/dev/edge-gateway.tf`: add the storefront's browser origins to `local.browser_origins` — read the real list from `core_api_cors_origins` in `infra/envs/dev/dev.tfvars:149-163` and express each from `module.dns.zone_name` / existing variables, never a literal
- [x] T019 Edit `Makefile`: add `storefront` and `commerce` to the `edge-deploy` usage string and guard (:310-311), to whatever list `edge-test` iterates (:303), and to `scripts/edge-health.sh`'s `SERVICES` (:526)
- [ ] T020 **OPERATOR** — quickstart Stage 1, pulled forward so the new services can be packaged and deployed during the build: `make db-up ENV=dev` (migration A) → `make db-shopper-role ENV=dev` → `make plan ENV=dev` / `make apply ENV=dev` with **only** T017 and T018 in the working tree's infra changes. The plan must be additive and touch nothing belonging to core-api. Record outputs in `specs/070-retire-core-api/SIGNOFF.md`
- [ ] T021 Run `npx serverless package --stage dev` in `SF/` and `CO/`, count `Resources` in each `.serverless/cloudformation-template-update-stack.json`, and record resources-per-route and the projected totals (SF ~12 functions, CO ~40) in `research.md` R2. If `CO` projects above 450, move saved items and lists to a third service `EDGE/saved/` and update plan.md and the contract paths before continuing (depends on T013, T014 and the operator task T020 — Serverless resolves the `${ssm:…}` parameters at package time)

**Checkpoint**: `make edge-test` green with two empty services; the shopper role exists and the additive apply is recorded; both services package.

---

## Phase 3: User Story 1 — A shopper browses and searches exactly as before (P1) 🎯 MVP

**Goal**: all public catalogue reads served by `storefront`, identical to core-api for the same data.

**Independent Test**: with `storefront` deployed, request each route on both backends for the same
query and compare ids, order, totals and facet counts; walk home → search → product on web and mobile.

- [x] T022 [P] [US1] Port `GO/features/storefront/cursor.go` to `SF/src/search/cursor.ts` (base64url `2|sort|key|id`; malformed → restart; wrong sort → `cursor_sort_mismatch`) with `cursor.test.ts` reproducing `GO/features/storefront/cursor_test.go`, including relevance float formatting
- [x] T023 [US1] Port `GO/features/storefront/search.go` and the card/listing parts of `repository.go` to `SF/src/search/{filters,repository}.ts`: one shared `filters()` builder used by page, count and facets; `trigramExpr` verbatim; `availability.predicate` for rails, status-only for listings. Add `SF/src/search/trigram-index.guard.test.ts` asserting `trigramExpr` equals the GIN index expression in `db/migrations/20260716092105_product_catalog.sql:125`
- [x] T024 [US1] Port the listing service (`GO/features/storefront/service.go:482-600`) to `SF/src/search/service.ts` and `SF/src/functions/products-v1-get.ts` (`GET /storefront/v1/products`): `ids=` form (caller order, missing dropped, `sort:"newest"`), four sorts with relevance→newest fallback reported in the response, limit default 24 and out-of-range→24, `limit+1` fetch, count alongside; **new**: malformed `minPrice`/`maxPrice` → 400 `invalid_price` (contract §3 row 6). Unit tests for each branch
- [x] T025 [P] [US1] Port `GO/features/storefront/facets.go` and `repository.go:397-493` to `SF/src/facets/{service,repository}.ts` and `SF/src/functions/facets-v1-get.ts`: each facet counted with its own selection cleared; fixed order category → brand → attributes by name; Yes/No for booleans; zero-count options dropped; `GROUP BY` on the expression not the alias. Port `GO/features/storefront/facets_repository_test.go` to `SF/src/facets/repository.container.test.ts`
- [x] T026 [P] [US1] Port home (`GO/features/storefront/service.go:222-277`, banners `repository.go:169-174`, `promoTerms` :708, `promoValidity` :769) to `SF/src/home/{service,repository}.ts` and `SF/src/functions/home-v1-get.ts`: two waves via `Promise.all`, rails `featured` / `on_sale` / `category:<key>` in that order, 12 each, empty rails omitted, `position` an integer, badges (`on_sale`, `new` within 14 days). Unit tests reproducing the wire-contract cases in `GO/features/storefront/wire_contract_test.go` (`[]` not null)
- [x] T027 [P] [US1] Port categories (`repository.go:321-350`), product detail (`product_detail.go`) and promotion detail (`service.go:733`, `handler.go:177-183`) to `SF/src/catalog/` and `SF/src/promotions/` with functions `categories-v1-get.ts`, `product-v1-get.ts`, `promotion-v1-get.ts`; **new**: a malformed product id → 404 not 503 (contract §3 row 5); promotion stays uncached. Unit tests for 404 and the detail shape
- [x] T028 [P] [US1] Port `GO/features/storefront/{serviceability,localities}.go` to `SF/src/serviceability/` with `serviceability-v1-get.ts` (`^[0-9]{4}$` after trim, `Cache-Control: public, max-age=86400`, emit `ServiceabilityChecks{serviced}`) and `localities-v1-get.ts` (<2 chars → empty, max 8, same cache header), using `@effy/edge-shared/delivery`
- [x] T029 [P] [US1] **Resolved without new code.** core-api's `GET /v1|v2/platform/status` are already served, publicly and with the same statement and wire shapes, by the `shop` service at `/shop/v1/status` and `/shop/v2/status` (`EDGE/shop/src/status/`, `platform-status-v1-get.ts`, `platform-status-v2-get.ts`, with their tests). They had no caller on core-api. Recorded in `contracts/api-migration.md` as "replaced by a route that already exists" rather than porting a third copy of one proving read
- [x] T030 [US1] Register the eight routes in `SF/serverless.yml` (no authorizer) and add `SF/src/availability.guard.test.ts` porting `GO/platform/availability/guard_test.go`: fails on a hand-written product `status = 'active'` in `SF/src` or `CO/src` unless the line carries an `availability-exempt:` comment (depends on T024–T029)
- [x] T031 [US1] Re-point customer-web browsing: in `CW/app/(shop)/home-data.ts`, `page.tsx`, `product/[id]/page.tsx`, `promotions/[id]/page.tsx`, `_components/RelatedProducts.tsx` use `edgeApiPublic()` with the `/storefront/v1/...` paths; in `_components/SearchExperience.tsx` (:172, :178) and `RecentlyViewedRail.tsx` (:24) use `NEXT_PUBLIC_EDGE_API_BASE_URL`; fix the literal in `CW/e2e/home.spec.ts:155`; update the affected tests
- [x] T032 [P] [US1] Re-point customer-mobile browsing: `CM/features/catalog/data/HttpCatalogRepository.kt` uses the edge client (unauthenticated calls) with `storefront/v1/...` paths; `BannerWireContractTest.kt` must pass unchanged
- [ ] T033 [US1] **OPERATOR** — early proof before any payment code is written: `make edge-deploy SERVICE=storefront ENV=dev`; compare `GET /storefront/v1/products?q=…`, `/facets` and `/home` against core-api for the same queries (ids, order, totals, counts); measure SC-004 (search and filter, warm) and SC-007 (first page after idle) and record them in `SIGNOFF.md`. **If either target is missed, stop and report to the operator** — this is the last point at which nothing irreversible has happened

**Checkpoint**: US1 independently testable against a deployed `storefront`.

---

## Phase 4: User Story 2 — Saved lists and cart behave as before, and promo codes work (P1)

**Goal**: saved items, lists, cart and promo served by `commerce`.

**Independent Test**: build a cart across two devices, apply and remove a code, move a list to the
cart with a retried request; totals correct, nothing doubled.

- [ ] T034 [US2] Port `GO/features/cart/{promo,packagekey}.go` to `CO/src/promo/promo.ts` and `CO/src/cart/package-key.ts` (pure): percentage rounds down and is capped at the subtotal; port `GO/features/cart/promo_test.go` case-for-case to `CO/src/promo/promo.test.ts`
- [ ] T035 [US2] Port `GO/features/cart/repository.go` to `CO/src/cart/repository.ts`: `inTx` (:476) — insert `cart_change_log` `ON CONFLICT DO NOTHING`, mutate, bump `cart.revision`, one transaction, duplicate change id returns the current cart; upserts with `LEAST` on add (:541) and `GREATEST` on merge/reorder (:625); set-aside and restore moves (:643, :666)
- [ ] T036 [US2] Port `GO/features/cart/service.go` to `CO/src/cart/service.ts`: re-price from `product.price_amount` on every read; cap presented quantity at stock (:926); delete archived lines while building (:852); notices; `checkout{allowed,blockedReason,minimumSubtotalAmount,remainingAmount}` from `@effy/edge-shared/cart-policy`; promo re-evaluated on every read; emit `StockBlocked{stage=add}`. Port `service_test.go` (43) and `stock_test.go` (11) to `CO/src/cart/service.test.ts` against a fake repository
- [ ] T037 [US2] Create the ten authenticated cart functions in `CO/src/functions/` — `cart-v1-get`, `cart-v1-delete`, `cart-merge-v1-post`, `cart-items-v1-post` (changeId required), `cart-item-v1-patch`, `cart-item-v1-delete`, `cart-reorder-v1-post`, `cart-item-set-aside-v1-post`, `cart-saved-restore-v1-post`, `cart-saved-v1-delete` — each calling `resolveCustomer` first; error mapping per `GO/features/cart/handler.go:273-304` (404 never 403; `insufficient-stock` with `availableQuantity`); port `handler_binding_test.go` to `CO/src/cart/handlers.test.ts`
- [ ] T038 [P] [US2] Create the two public cart functions `cart-preview-v1-post.ts` and `cart-policy-v1-get.ts` (no authorizer) per `GO/features/cart/handler.go:243,255`
- [ ] T039 [US2] **Repair (FR-022)** — add `cart-promo-v1-post.ts` and `cart-promo-v1-delete.ts` (`/commerce/v1/cart/promo`) wired to a port of `ApplyPromo` / `RemovePromo` (`GO/features/cart/service.go:641,682`): body `{code}`; returns the re-priced `CartDTO`; an invalid, expired or exhausted code is refused with its reason as the problem `type` slug; idempotent by change id like every other cart write. Unit tests for apply, remove, and each refusal. Confirm the request/response types in `ST/src/cart.ts` match what `CW/app/api/cart/promo/route.ts` and `HttpCartRepository.kt:123-128` already send
- [ ] T040 [US2] Port `GO/features/saveditems/{repository,service}.go` to `CO/src/saved/{repository,service}.ts`: every writer's transaction begins with `pg_advisory_xact_lock(hashtext(customer_id))` (:232); cap 200 checked inside the transaction; `insertSavedSQL` price snapshot; `ensureDefaultSQL`; `sweepOrphansSQL` after every entry or list delete; merge sorted newest-first with per-item `not_found` / `cap_reached`; the list read's verdict `CASE`. Port `service_test.go` (28) to `CO/src/saved/service.test.ts`
- [ ] T041 [US2] Port `GO/features/saveditems/{lists_repository,lists_service}.go` to `CO/src/lists/{repository,service}.ts`: limit 20; name max 40 code points; `normaliseListName`; "Saved" reserved case-insensitively; uniqueness by the `customer_list_name_uq` 23505 match; default list id `"default"`, `name:null`, synthesised on read and never written by a read. Port `lists_service_test.go` (11)
- [ ] T042 [US2] Port bulk add-to-cart (`GO/features/saveditems/service.go:317-338`) to `CO/src/saved/add-to-cart.ts`, calling `CO/src/cart/service.ts` directly: per-item change id = UUIDv5 in namespace `9c0a2f31-6e58-4a0e-9b3f-3f6a1c7f2d54` over `changeId + ":" + productId`; cart errors mapped to `cart_full` / `temporarily_unavailable` / `not_found` / `unavailable`. Add a test with a fixed input asserting the exact derived UUID that Go produces (take the expected value from `GO/features/saveditems/service_test.go`)
- [ ] T043 [US2] Create the fourteen saved and list functions in `CO/src/functions/` per contract §1 (`saved-ids-v1-get`, `saved-v1-get`, `saved-item-v1-put`, `saved-item-v1-delete`, `saved-merge-v1-post`, `saved-add-to-cart-v1-post`, `lists-v1-get`, `lists-v1-post`, `list-v1-patch`, `list-v1-delete`, `list-items-v1-get`, `list-entry-v1-put`, `list-entry-v1-delete`, `list-add-to-cart-v1-post`): refusal reasons in the problem `type` with `_`→`-` (`GO/features/saveditems/handler.go:163-191`, `lists_handler.go:57`); 204s and idempotent deletes as Go; **list names never logged** (FR-034). Port `wire_contract_test.go` (12) to `CO/src/saved/wire.contract.test.ts`, including the limits read from `ST/src/saved-item.ts`
- [ ] T044 [US2] Port the real-database suites `GO/features/saveditems/repository_test.go` (22) and `lists_container_test.go` (23) to `CO/src/saved/repository.container.test.ts` and `CO/src/lists/repository.container.test.ts`: cap race from two connections, idempotency, merge semantics, cross-shopper isolation, orphan sweep (FR-021, FR-035)
- [ ] T045 [US2] Register all cart, promo, saved and list routes in `CO/serverless.yml` (customer authorizer; preview and policy without one)
- [ ] T046 [US2] Re-point customer-web: every route handler under `CW/app/api/cart/**`, `CW/app/api/saved/**`, `CW/app/api/lists/**` and `CW/app/(account)/saved/read-list.ts` switches from `proxyToCore` to `proxyToEdge` with `/commerce/v1/...` paths; `CW/lib/cart-api.ts` and `CW/lib/cart-totals.ts` likewise; keep the `order-policy` cache tag on the policy read; update tests
- [ ] T047 [P] [US2] Re-point customer-mobile: `CM/features/cart/data/HttpCartRepository.kt` and `CM/features/saved/data/HttpSavedRepository.kt` use `edgeClient` with `commerce/v1/...` paths; `SavedWireContractTest.kt` passes unchanged

**Checkpoint**: US1 + US2 testable together; promo codes work on both clients.

---

## Phase 5: User Story 3 — A shopper pays once, the right amount, and the order always arrives (P1)

**Goal**: quote, intent, confirm, saved cards, payment finalisation, the webhook, and order reads.

**Independent Test**: complete a same-day and a standard order in the provider's test mode, with
repeated and interrupted attempts; exactly one of each consequence exists.

- [ ] T048 [US3] Port `GO/features/checkout/store.go` reads and the pending-order and capture writes to `CO/src/checkout/store.ts`: `cartLines` (:202, stock-capped, shop price, storage class), address snapshot, `discountForCustomer`, `upsertPendingOrder` (:361, `FOR UPDATE` on the newest `pending_payment` order), `captureDelivery` (:463 — delete the order's booking, `lockSlot`, re-judge via `delivery_slot_load`, insert `held` with `held_until = now() + slot_hold_min`, replace `order_package_delivery`), billing and instruction updates guarded by `status='pending_payment'`, `upsertPayment`
- [ ] T049 [US3] Create `SH/payments/finalize.ts` porting `FinalizeSucceeded` and `FinalizeFailed` (`GO/features/checkout/store.go:706-961`, `confirmSlotBookingTx` :559) as **one transaction taking an already-open client**, in the exact Go order: guard `UPDATE "order" SET status='paid' WHERE status='pending_payment'` (0 rows → return) → shop fulfilments → confirm slot booking under lock (lapsed hold on a full slot → `over_capacity`) → pre-flag oversold lines → stock deduction (`FOR UPDATE OF p ORDER BY p.id`, floor at 0, `stock_movement`) → `shop_new_order` notification requests → `order.placed` into `event_outbox` (port `GO/platform/events/outbox.go` as `SH/payments/outbox.ts`; written, not delivered — FR-026) → `order_paid` notification (port `GO/features/notifications/producer.go`) → `receipt_dispatch` → `payment.status='succeeded'` → `promo_redemption` → clear `cart_item`. Emit `SlotBookings`, `StockDeducted`, `StockBlocked{stage=checkout}`. Post-commit best-effort payment-method enrichment (`service.go:738`) stays outside the transaction
- [ ] T050 [US3] Port the real-database suites that pin finalisation to `SH/payments/*.container.test.ts`: `GO/features/checkout/delivery_slot_container_test.go` (16), `stock_container_test.go` (5), `shop_price_container_test.go` (5), `storage_class_container_test.go` (4), `receipt_dispatch_container_test.go` (3), `delivery_instructions_container_test.go` (5), plus `stock_finalize_test.go` (6). Add two new cases: finalising the same order from two connections at once yields exactly one of every consequence (SC-008); two intents racing for a slot's last place leave one `held` and one refused (FR-017)
- [ ] T051 [US3] Port `GO/features/checkout/service.go` quote and delivery-choice logic to `CO/src/checkout/quote.ts` and `CO/src/functions/checkout-quote-v1-post.ts`: `deliveryQuoteDTO` (:122) with opaque `pkg-N` refs, `sameDaySlots`, `sameDayUnavailableReason`, `standardDays`, `expiresAt = now + 30 min`, Melbourne-offset RFC 3339; emit `DeliveryQuotes` / `DeliveryQuoteFailures`. Port `delivery_choice_test.go` (13) and the quote wire-contract cases
- [ ] T052 [US3] Port intent (`GO/features/checkout/service.go:302-558`, `resolveDeliveryChoice` :1028, `mayReusePendingOrder` :827, idempotency key :885) to `CO/src/checkout/intent.ts` and `CO/src/functions/checkout-intent-v1-post.ts` (**timeout 25 s**): the twelve steps in the same order, each its own statement or transaction as today; no client amount accepted (FR-014); customer session and payment intent created concurrently; key `sha256("pi:{order}:{amountCents}:{providerCustomer}")`; 409 with `code` `slot_required` / `slot_unavailable` / `date_unavailable` plus a best-effort fresh `quote`; emit `StandardDateRefused` and `SlotBookings{outcome}` for `held` and each `refused_*` (finalisation emits only `confirmed` / `over_capacity`). Port `service_test.go` (23) against the fake `PaymentGateway`, including "abandon and restart → one order, one intent" (FR-015)
- [ ] T053 [P] [US3] Port confirm to `CO/src/functions/checkout-confirm-v1-post.ts` (25 s): 404 when the order is not the caller's; retrieve the payment intent and run the T049 finalisers; returns `{orderId, paid}`
- [ ] T054 [P] [US3] Port saved cards (`GO/features/checkout/handler.go:244-283` and the service methods behind them) to `CO/src/checkout/payment-methods.ts` with `payment-methods-v1-get.ts` and `payment-method-v1-delete.ts` (25 s): filtered to `allow_redisplay=always`; a provider failure is 500, never an empty list; delete re-lists to prove ownership then detaches (204 / 404). Port `payment_methods_test.go` (22)
- [ ] T055 [US3] **Repair (FR-023)** — create `CO/src/webhook/handler.ts` and `CO/src/functions/stripe-webhook-v1-post.ts` (`POST /commerce/v1/stripe/webhook`, no authorizer, 25 s): take the raw body from `event.body`, base64-decoding when `isBase64Encoded`, reject above 1 MiB; `constructEvent` with the `Stripe-Signature` header → invalid → 400; open one transaction, `INSERT INTO stripe_event … ON CONFLICT DO NOTHING` **inside it** — 0 rows → 200 (duplicate); route `payment_intent.succeeded` / `payment_intent.payment_failed` to T049 on the same client and `refund.created` / `refund.updated` / `refund.failed` to T061's settle; unknown type → 200; any handling error → rollback and **500**. Emit `WebhookEvents{type,outcome}`. Port `webhook_routing_test.go` (6)
- [ ] T056 [US3] Add `CO/src/webhook/handler.container.test.ts` (SC-009): the same event twice → one effect; a handler that throws leaves **no** `stripe_event` row and the redelivery succeeds; a bad signature writes nothing; `succeeded` arriving after `/confirm` already finalised is a no-op
- [ ] T057 [US3] Port `GO/features/orders/{orders,stage}.go` to `CO/src/orders/{repository,service,stage}.ts` with `orders-v1-get.ts` and `order-v1-get.ts`: the eight reads; `stage` = least-advanced portion (`stage.go:56`); `cancellable` (:99); refund roll-up excluding `submitting` and problem states; the `omitempty` fields in contract terms (`refunds`, `refundedTotal`, `amountPaidAfterRefunds`, `fullyRefunded`, `billingAddress`, `unavailableItems` absent, not null); money through `SH/lib/money.ts` (replaces Go's float `cents()`); 404 for a non-UUID or another shopper's order. Port the 26 unit tests
- [ ] T058 [US3] Collapse the stage mirror: make `EDGE/orders/src/orders/service.ts` (`stageFor` :47, `COUNTED_REFUND_STATUSES` :27) and `CO/src/orders/stage.ts` share one implementation in `SH/lib/order-completion.ts`; rewrite `EDGE/orders/src/orders/service.test.ts:28,103` so it no longer reads `stage.go` or `refunds/repository.go`
- [ ] T059 [US3] Register the quote, intent, confirm, payment-method, webhook and order routes in `CO/serverless.yml` with their timeouts; port the source guards `GO/features/checkout/{customer_dto_guard,delivery_instructions_guard,source}_test.go` to `CO/src/checkout/*.guard.test.ts`; add `CO/src/functions.guard.test.ts` asserting that **every** function file in `CO/src/functions` and `SF/src/functions` exports through `shopperHandler`, and that every `CO` function whose route has the customer authorizer in `CO/serverless.yml` calls `resolveCustomer` (FR-011)
- [ ] T060 [US3] Re-point clients: `CW/app/api/checkout/{quote,intent,confirm}/route.ts`, `CW/app/api/payment-methods/**`, `CW/app/checkout/complete/page.tsx`, `CW/app/(account)/orders/page.tsx`, `orders/[id]/page.tsx`, `account/page.tsx` → edge with `/commerce/v1/...`; `CM/features/checkout/data/HttpCheckoutRepository.kt` and `CM/features/paymentmethods/data/HttpPaymentMethodsRepository.kt` → `edgeClient`; `DeliveryWireContractTest.kt` and `PaymentWireContractTest.kt` pass unchanged; update `scripts/stripe-listen.sh` to forward to the offline `commerce` webhook path

**Checkpoint**: a full purchase works against `commerce` alone.

---

## Phase 6: User Story 4 — Orders can be cancelled and refunded by everyone who could before (P2)

**Goal**: six refund and cancellation operations across three audiences, on one shared implementation.

**Independent Test**: place an order, then run each of the six actions from its proper audience and
from an improper one.

- [ ] T061 [US4] Create `SH/payments/refunds/` porting `GO/features/refunds/{repository,service,state,stock,webhook,customerview}.go`: `priceLines` (outside the lock, as today); `record` under `FOR UPDATE OF payment` (:74-79) with the ceiling over `submitted|succeeded|failed` and `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` plus `refund_line`; provider submit with the same key and metadata `effy_refund_id`, ≤2 attempts; `markSubmitted` / `markRefused`; best-effort `returnStock` and `closeOpenRequestForOrder`; `settleByProviderId` guarded by `status IN ('submitting','submitted')`; an unknown provider refund recorded as `external` / `system`. Validation: `amount` rejected on an item refund, note required for goodwill, goodwill ≤2 dp, >0, ≤ $100,000. Emit `RefundsIssued`, `RefundOutcomes`, `RefundSubmitFailures`
- [ ] T062 [US4] Create `SH/payments/cancel.ts` porting `GO/features/refunds/cancel.go:124`: `FOR UPDATE OF o` with the ownership term in the predicate; a customer refused if any portion is not `pending`; anyone refused after `collected` / `delivered`; order → `canceled`, portions → `withdrawn` with `fulfillment_event`, booking → `released`; refund of the remaining amount with key `cancel:{orderId}`; already cancelled → 200. Emit `OrdersCancelled{actor}`
- [ ] T063 [US4] Port the real-database suites to `SH/payments/refunds/*.container.test.ts` and `SH/payments/cancel.container.test.ts`: `GO/features/refunds/repository_container_test.go` (11 — keep the `beforeLock` seam so two refunds truly race), `webhook_container_test.go` (11), `request_container_test.go` (11), `cancel_container_test.go` (9), `cancel_slot_container_test.go` (3), `stock_container_test.go` (4); plus unit `service_test.go` (12), `state_test.go` (4), `customer_view_test.go` (4) (FR-019, SC-010)
- [ ] T064 [US4] Customer routes in `CO/src/functions/`: `order-cancel-v1-post.ts` (25 s; not cancellable → 400 `not-cancellable`) and `order-refund-request-v1-post.ts` (message ≤2000; 201 `{requestId}`; 409 when one is open, via the partial unique index 23505; 404 otherwise) porting `GO/features/refunds/{handler.go:173,242,request.go}`; register in `CO/serverless.yml`
- [ ] T065 [US4] Back-office routes in `EDGE/orders/src/functions/`: `order-refund-v1-post.ts`, `order-cancel-v1-post.ts`, `refund-request-decline-v1-post.ts` (paths per contract §1) porting `GO/features/refunds/handler.go:86,191,293`, each gated by `hasStaffRole` with `OUTWARD_ACTION_ROLES` from `SH/lib/back-office-authz.ts` (gate error → 503, not allowed → 403); add `STRIPE_SECRET_KEY_ARN` env and IAM for the **secret key only** (not the webhook secret) to `EDGE/orders/serverless.yml` (25 s on the two that call the provider); update `EDGE/orders/src/config.contract.test.ts`; port `staffgate_container_test.go` (3) if not already covered there
- [ ] T066 [US4] Shop route: port `GO/platform/auth/shopgate.go:55-73` (`canRefundOrder`: active `shop_manager`, active shop, shop has a portion of the order) into the shop service's existing staff/authz module under `EDGE/shop/src/staff/`, and add `EDGE/shop/src/functions/order-refund-v1-post.ts` porting `GO/features/refunds/shop.go:83` (lines scoped to this shop; always kind `item`; `restock`; emit `ShopRefundDenied{reason}`; gate could-not-check → 503, checked-and-refused → 403); `STRIPE_SECRET_KEY_ARN` env and IAM for the secret key only in `EDGE/shop/serverless.yml`; port `shop_container_test.go` (4)
- [ ] T067 [US4] **Repair (FR-024)** — create `CO/src/reconcile/refunds.ts` and `CO/src/functions/refund-reconcile-scheduled.ts` (`rate(5 minutes)`, 60 s): for each `refund` with `status='submitting'` and `created_at < now() - interval '2 minutes'`, list the provider's refunds for the order's payment and match metadata `effy_refund_id` → record that outcome; none → resubmit with the stored `idempotency_key`; emit `RefundsReconciled{outcome}` and `RefundsStuck` (count older than 15 min). Container test: a row left `submitting` is resolved to `submitted` when the provider has it and to a fresh submit when it does not, and is never submitted twice
- [ ] T068 [US4] Re-point the append-only guard: rewrite `EDGE/orders/src/orders/refund-append-only.guard.test.ts` (:29, :121-125) to scan `SH/payments/`, `CO/src`, `EDGE/orders/src` and `EDGE/shop/src` instead of `apis/core-api/internal`, keeping the rule (only `status`, `provider_refund_id`, `failure_reason`, `settled_at` may be updated) and a file-count floor that matches the new roots
- [ ] T069 [US4] Re-point clients: `CW/app/api/orders/[id]/cancel/route.ts`, `CW/app/api/orders/[id]/refund-requests/route.ts` and `CW/app/(account)/orders/[id]/CancelOrder.tsx` → `/commerce/v1/...`; `CM/features/checkout/data/{HttpCancelOrderRepository,HttpRefundRequestRepository}.kt` → `edgeClient`; `BO/features/orders/refundRepo.ts` (:31, :65) → the existing edge client with `/orders/v1/...`; `SW/features/fulfillment/repo.ts:66` and `RefundSheet.tsx` → the existing edge client with `/shop/v1/orders/{orderId}/refunds`

**Checkpoint**: every money-moving operation runs without core-api.

---

## Phase 7: User Story 5 — A shop still sees new orders without the stream (P2)

**Goal**: the stream and everything that fed it are gone; Today refreshes every 30 s.

**Independent Test**: Today open in one browser, pay in another; the order appears at the next
refresh with no error and no "live" indicator.

- [ ] T070 [US5] Remove the stream client: delete `SW/features/today/useShopLive.ts` and `SW/features/today/__tests__/live.test.tsx`; in `SW/features/today/queries.ts` drop the `live` parameter and `LIVE_SAFETY_INTERVAL_MS` so `refetchInterval` is always `FALLBACK_INTERVAL_MS` (keep `refetchIntervalInBackground: false`); remove the hook's use and any live/reconnecting indicator from `SW/features/today/TodayScreen.tsx`; update `SW/features/today/__tests__/today.test.tsx`. No new mechanism replaces the stream's 15-minute re-authorisation: each refresh is an ordinary authorised request. Confirm the Today snapshot route in `EDGE/shop/src/today/` checks the caller's active shop-staff record on every request (as `ActiveShopFor` did for the stream); if it does not, add that check, so withdrawn access stops being served at the next refresh (US5 scenario 3)
- [ ] T071 [P] [US5] Delete `packages/web-kit/src/runtime/live.ts`, `live.test.ts` and their export from `packages/web-kit/src/index.ts`
- [ ] T072 [US5] Create migration B with `make db-new name=drop_shop_ops_poke` per data-model.md: `CREATE OR REPLACE` every function in `db/migrations/20260914165403_shop_insights.sql` and `20260915171139_insights_mark_on_order_item.sql` that calls `shop_ops_poke`, identical but without that call; then `DROP FUNCTION public.shop_ops_poke(uuid)`; `shop_ops_mark_dirty` and all triggers untouched; a Down restoring the function and calls. Update `EDGE/shop/src/db/triggers.container.test.ts` to assert a change still marks its insights bucket and that no `shop_ops` notification is sent
- [ ] T073 [P] [US5] Record the withdrawn promise: in `specs/058-shop-today-insights/SIGNOFF.md` (or, if absent, the 058 entry of `FEATURE-HISTORY.md`) add a dated note that the ≤10 s live target is withdrawn by 070 and Today refreshes every 30 s

---

## Phase 8: User Story 6 — The operator can still mint the first administrator and load reference data (P2)

**Goal**: the three tools run from TypeScript with unchanged commands.

**Independent Test**: on a database with no administrators and no localities, run each make target.

- [ ] T074 [US6] Scaffold `EDGE/ops/` (`package.json` name `@effy/edge-ops`, private, `tsx` as a dev dependency, `@aws-sdk/client-cognito-identity-provider` and `pg` as dependencies, **no** `serverless.yml`); a small `src/db.ts` that connects with `DB_DSN`
- [ ] T075 [US6] Port `GO/adminbootstrap/{service,cognito,repo}.go` and `apis/core-api/cmd/create-first-admin` to `EDGE/ops/src/create-first-admin.ts`: `--email --name`; `AdminCreateUser` (suppressed invite, `email_verified`), reconcile an existing user (`AdminGetUser` / `AdminEnableUser`), `AdminAddUserToGroup admin`, then upsert `admin.staff` + `staff_role('admin')` in one transaction; idempotent. Reads `BACK_OFFICE_POOL_ID`, `DB_DSN`, `AWS_REGION`, `EFFY_ENV`. Unit tests with a fake Cognito client porting the Go tests. **The email is always an argument — never defaulted from the environment or git**
- [ ] T076 [P] [US6] Port `apis/core-api/cmd/delete-admin` to `EDGE/ops/src/delete-admin.ts`: `--email [--force]`; last-active-admin guard; `AdminDeleteUser`; delete `admin.staff` by sub or email; tests for the guard
- [ ] T077 [P] [US6] Port `apis/core-api/cmd/load-localities` and `GO/platform/delivery/localityload.go` to `EDGE/ops/src/load-localities.ts`: `--csv` (default `db/reference/au-localities.csv`); idempotent upsert on (name, state, postcode); a container test loading the same file twice
- [ ] T078 [US6] Re-point the Make targets `create-first-admin`, `delete-admin`, `load-localities` (`Makefile:276-298`) to `pnpm --filter @effy/edge-ops exec tsx src/<tool>.ts …`, keeping names, arguments and confirm gates; update `apis/core-api/cmd/create-first-admin/README.md`'s content into `EDGE/ops/README.md` and fix the references in `specs/006-first-admin-bootstrap` only by adding a dated pointer, not by rewriting history

---

## Phase 9: User Story 7 — The always-on backend is removed and the bill drops (P1)

**Goal**: remaining proof in place, every client free of core-api, alarms live, teardown authored
and run.

**Independent Test**: after teardown the environment has no container service, load balancer or
registry; the repository search for the retired name is clean outside history.

### Proof and telemetry

- [ ] T079 [P] [US7] Re-point `EDGE/admin/src/shops/hidden-fulfilment.guard.test.ts` (:27-36, :90) to scan `SF/src` and `CO/src` in place of the core-api features, adjusting the file-count floor
- [ ] T080 [P] [US7] Re-point `EDGE/inventory/src/stock/append-only.guard.test.ts:28` to include `SH/payments/` and `CO/src` in place of `apis/core-api/internal`; update `scripts/check-no-telemetry-pii.sh:19` to name the TypeScript notification producer
- [ ] T081 [P] [US7] Port `GO/platform/db/schema_drift_test.go` to `SH/lib/schema-drift.guard.test.ts`: no `.ts` under `EDGE/*/src` references a column dropped in `db/migrations`
- [ ] T082 [P] [US7] Rewrite `SH/lib/collection-deadline.contract.test.ts` as a plain fixture test (keep every DST row; drop the "Go counterpart" framing) and remove "mirrors Go / must not diverge" comments from `SH/lib/{collection-deadline,order-completion,http}.ts` and `ST/src/*.ts`
- [ ] T083 [US7] Create `infra/envs/dev/commerce-alarms.tf` with the seven alarms in plan.md "Telemetry declared", each on `Effy/Commerce` or `Effy/Storefront` metrics with `alarm_actions = [aws_sns_topic.alerts.arn]`; delete `infra/observability/alerts/{032-delivery-pricing,054-product-inventory,055-refunds-cancellation,069-delivery-slots}.yml`; rewrite `infra/observability/README.md` to say alarms live in Terraform and no metrics stack exists

### Clients, final sweep

- [ ] T084 [US7] customer-web: delete `CW/lib/api/core.ts`, `proxyToCore` from `CW/lib/api/proxy.ts`, the core base-URL read in `CW/lib/config.ts:31-36`, and `CW/app/(account)/account/hot-path/` with any link to it; rewrite the routing-law comment in `CW/lib/api/edge.ts`; remove `NEXT_PUBLIC_CORE_API_BASE_URL` from `CW/.env.example`; `grep -ri "core" CW/lib CW/app` shows no backend reference; `CW/lib/storefront-freshness.guard.test.ts` updated; the bundle `size` gate unchanged
- [ ] T085 [P] [US7] customer-mobile: remove `coreClient` and `BearerToken.Core` (`CM/app/AppContainer.kt:162-168`, `CM/core/.../EffyHttpClient.kt`), `CORE_API_BASE_URL` from `apps/customer-mobile/build.gradle.kts:38`, `CM/core/config/AppConfig.kt:24` and `secrets.properties.example:19`; update `AuthHeadersTest.kt`; `scripts/mobile-guard.sh:54` updated; `:shared:testAndroidHostTest` green
- [ ] T086 [P] [US7] shop-web and back-office: remove `VITE_CORE_API_BASE_URL` from `SW/lib/env.ts` (:14, :52) and `BO/lib/env.ts` (:14, :40), the second client from `SW/lib/api.ts:72` and `BO/lib/api.ts:24`, the key from each `.env.example`, `apps/back-office/.env.test:12` and `apps/shop-web/.env.local.example:21`; update `SW/lib/__tests__/env.test.ts`; neither app fails to start with the key absent (FR-040)
- [ ] T087 [P] [US7] Remove the routing-law comment from `EDGE/customer/serverless.yml:6-9` and `EDGE/customer/package.json`; fix `EDGE/admin/serverless.yml:326`; sweep the ~28 comment-only mentions of core-api under `EDGE/*/src` listed in migration-inventory.md §12 so each describes the current owner

### Cut-over, run

- [ ] T088 [US7] **OPERATOR** — `make plan ENV=dev` / `make apply ENV=dev` for the alarms (T083) only; the plan must be additive and touch nothing belonging to core-api. Then prove delivery once: `aws cloudwatch set-alarm-state` on one new alarm and confirm the notification arrives at the operational mailbox (FR-033). Record in `specs/070-retire-core-api/SIGNOFF.md`
- [ ] T089 [US7] **OPERATOR** — quickstart Stage 2: `make edge-deploy SERVICE=storefront ENV=dev` (redeploy), then `commerce`, `orders`, `shop`; run the smoke checks, including a shop-pool token against a `commerce` route → 401 (FR-008); record
- [ ] T090 [US7] **OPERATOR** — quickstart Stage 3: add the new webhook endpoint at the provider with the five event types, store its signing secret in `/effy/dev/stripe/webhook_secret`; release customer-web, shop-web, back-office and rebuild customer-mobile; one paid test order; then disable the old endpoint; record

### Teardown, authored after the switch, then run

- [ ] T091 [US7] **Do not start before the switch (T090) is recorded — until then the working tree must contain no teardown change, or an additive `make apply` would destroy core-api.** Author the teardown change (not applied here): delete `infra/envs/dev/core-api.tf` and `infra/modules/ecs-fargate-web-service/`; remove the eight `core_api_*` variables (`variables.tf:224-274`, description at :213) and `core_api_cors_origins` (`dev.tfvars:149-163`, comment :139); remove `NEXT_PUBLIC_CORE_API_BASE_URL` from `amplify-customer-web.tf:46,52` and `VITE_CORE_API_BASE_URL` from `amplify-consoles.tf:19-24,84,110-119`; fix comments at `edge-domain.tf:81` and `insights.tf:9-10`; rewrite `infra/envs/README.md:41-59,145`. All of this is **one change applied in one pass**, because the module, its SSM parameter, the outputs, the variables and the Amplify env vars reference each other (FR-045). `terraform validate` and `make plan ENV=dev` must show destroys **only** for the resources in migration-inventory.md §7 — hand the plan output to the operator
- [ ] T092 [P] [US7] (after the switch) Fix `start-db.sh` and `stop-db.sh`: remove the `aws ecs update-service` calls so each only starts/stops RDS (FR-046)
- [ ] T093 [P] [US7] (after the switch) Edit `Makefile`: remove `core-run`, `core-test`, `core-lint`, `core-build`, `core-ecr-login`, `core-image-push`, `core-deploy` (:183-273) and `cm-ngrok-core` (:476-495) and their `.PHONY` entries (:28-35); fix the stale comment at :542; remove `NEXT_PUBLIC_CORE_API_BASE_URL` from `.github/workflows/web.yml:83,116`
- [ ] T094 [US7] **OPERATOR** — quickstart Stage 4: empty the image registry; `make plan ENV=dev` on T091 and confirm against migration-inventory.md §7; `make apply ENV=dev`; `make db-up ENV=dev` (migration B); run the three post-teardown checks including `./stop-db.sh` and `./start-db.sh`; record

---

## Phase 10: Polish & Cross-Cutting

- [ ] T095 Run the verification walk in quickstart Stage 5 (15 journeys) with the operator; log each defect in `specs/070-retire-core-api/SIGNOFF.md`, fix it on the single backend, re-walk until all pass (FR-042, SC-016)
- [ ] T096 Author the measurement harness in `scripts/verify-070/` (run by the operator against dev in provider test mode): `checkouts.ts` (200 checkouts with repeated, interrupted and simultaneous attempts; asserts SC-008 from the database), `webhooks.ts` (100 signed deliveries with injected faults, duplicates and reordering; SC-009), `refund-race.ts` (simultaneous refunds on one order and one deliberately stalled refund; SC-010), `overload.ts` (drives shopper routes past the connection limit while issuing back-office and shop requests; SC-013 passes when 100% of the staff requests succeed)
- [ ] T097 Measure SC-004..SC-010 and SC-013 per the quickstart table (scripted checkout and webhook runs in provider test mode; overload run for the connection limit) and record the figures in `SIGNOFF.md`. If SC-004, SC-006 or SC-007 is missed, stop and report to the operator before changing any target
- [ ] T098 Re-measure the T001 baseline and add an "After" column; confirm no protected behaviour named in FR-035/036 lacks a passing check (SC-014)
- [ ] T099 Account for every row of `migration-inventory.md` in `SIGNOFF.md`: each route, platform package, operator tool, metric, guard and cloud resource marked relocated (with its new home), retired (with the reason) or destroyed; none blank (FR-004, SC-002)
- [ ] T100 Delete `apis/core-api/` (FR-049) once T095 passes and T098 confirms SC-014; tell the operator to rotate the test payment keys if `apis/core-api/.env` was ever shared; remove Go from any tool-version file and `.gitignore` entries that existed only for it
- [ ] T101 [P] Final document sweep: `README.md`, `ORDER-FLOW-GAPS.md`, `docs/audiences/*`, `docs/insights-architecture.md`, `docs/logistics-engine-architecture.md`, `docs/api/*`; then run the one sweep command from quickstart Stage 6 and confirm every hit is on its allow-list: `FEATURE-HISTORY.md`, applied `db/migrations`, `specs/`, the `040` and `070` lines of the feature index in `CLAUDE.md`, and the constitution's Sync Impact Report (SC-015, FR-050)
- [ ] T102 Write the 070 entry at the top of `FEATURE-HISTORY.md` and add it to the list in `CLAUDE.md`: what moved, the four repairs, the two deferred gaps (undelivered order-placed record; unswept abandoned orders), the withdrawn 10-second promise, the corrected 135 ms premise, the shopper role, and the bill before and after (SC-001); finish `SIGNOFF.md`

---

## Dependencies & Execution Order

```text
Phase 1 (T002 blocks everything)
  └─ Phase 2 Foundational (ends with the operator's Stage 1, T020)
       ├─ US1 (Phase 3, ends with the early storefront proof T033) ─┐
       ├─ US2 (Phase 4) ─ US3 (Phase 5) ─ US4 (Phase 6) ───────────┤
       ├─ US5 (Phase 7) ───────────────────────────────────────────┤
       └─ US6 (Phase 8) ───────────────────────────────────────────┤
                                                                   └─ US7 (Phase 9) ─ Phase 10
```

- **US3 needs US2**: intent reads the cart and the promo discount.
- **US4 needs US3**: refunds need payments; the webhook (T055) routes refund events to T061 — until
  US4 lands, T055 acknowledges refund events without handling them, and T061 completes the routing.
- **US1, US5, US6** depend only on Phase 2.
- **Client re-pointing is interleaved per story on purpose**; nothing is released to the deployed
  apps until the Stage 3 task (T090), so the working tree may point at routes not yet deployed.
- **US7's proof and client sweep (T079 through T087)** need US1–US6 complete. The operator tasks
  T088, T089, T090 are strictly sequential.
- **Teardown is authored only after T090** (T091, T092, T093) and then run (T094). Before T090 the
  working tree holds no teardown change, so every earlier `make apply` is additive.
- **T100 (delete Go)** is last on purpose: until the walk passes and T098 confirms the proof, the Go
  source is the reference.

## Parallel Opportunities

- Phase 2: T005, T006, T007, T008, T010 and T011 together; T017 and T018 together.
- After Phase 2, three independent tracks: **US1** · **US2→US3→US4** · **US5 + US6**.
- Within US1: T022 and T025 through T029 touch separate folders; T031 and T032 are separate apps.
- Within US7: T079, T080, T081, T082 together; T085, T086, T087 together; T092 and T093 together.

```text
# Example — US1 after T023 and T024 are in:
T025 facets · T026 home · T027 catalog + promotion · T028 serviceability · T029 status
```

## Implementation Strategy

**There is no shippable MVP short of the whole feature** — the saving arrives only at T094, and the
cut-over is single (Clarifications). "MVP" here means the first slice that proves the approach:

1. **Phases 1–2, then US1, ending at T033.** `storefront` is deployed alone alongside core-api and
   compared and measured. This proves in-region latency (R1), the shopper role (R4) and the
   packaging estimate (T021) before any money code is written, and it is the stop point if the
   speed targets cannot be met.
2. **US2 → US3 → US4** in order; this is where the risk is. US5 and US6 fit in beside them.
3. **US7**: proof, sweep, the operator's additive apply, deploy and switch; then teardown is
   authored and run.
4. **Phase 10**: walk, measure, fix forward, account for the inventory, delete the Go source.

Per the repo's working agreement Claude writes every file above and runs local tests; the operator
runs every task marked **OPERATOR** and every `make apply`, `make db-up` and `make edge-deploy`.
Nothing is committed by Claude.
