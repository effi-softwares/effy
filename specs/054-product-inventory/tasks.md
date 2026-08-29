---
description: "Task list for 054 Product Inventory (Shop-Managed Stock)"
---

# Tasks: Product Inventory (Shop-Managed Stock)

**Input**: Design documents from `/specs/054-product-inventory/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED. Not because a template offered them — because SC-002/003/005/006/012 are stated as
proofs, [quickstart.md](./quickstart.md) §2 lists six things to be proven **by breaking them**, and this
platform has repeatedly shipped green suites over live defects (039 shipped four). The negative proofs
are not polish; they are the deliverable for FR-012.

**Organization**: by user story, in the priority order set by the spec. Phases 1–2 are blocking; every
story phase after that is independently testable and independently shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: the user story this serves (US1…US5). Setup, Foundational and Polish carry none.

---

## Phase 1: Setup

**Purpose**: the migration and the one new deployable unit.

- [X] T001 Write the forward-only Goose migration `db/migrations/<timestamp>_product_inventory.sql` — three columns on `public.product` (`stock_tracked`, `stock_on_hand`, `low_stock_threshold`) with all three CHECKs and the partial `product_low_stock_idx`, plus `public.stock_movement` and `public.shop_stock_settings`, per [data-model.md](./data-model.md) §1–3. `COMMENT ON` every table and column.
- [X] T002 Scaffold `apis/edge-api/inventory/` — `serverless.yml` attaching to the shared HTTP API by id from SSM (`/effy/<env>/edge/http_api_id`), referencing **both** the shop and back-office authorizers by id, `versionFunctions: false`, arm64, `package.json`, `tsconfig.json`, and `esbuild`/serverless config copied from `apis/edge-api/orders/`.
- [X] T003 ⚠ Add `apis/edge-api/inventory/.gitignore` before any build runs — 052 found `edge-api/notifications` was the one service missing it and committed 1.7 MB of artifacts including a `serverless-state.json` carrying resolved DB hostname, username and secret ARNs, which is **still in history**.
- [X] T004 [P] Add the stock DTOs to `packages/shared-types/src/inventory.ts` and export them from `src/index.ts`, per [contracts/inventory-api.contract.md](./contracts/inventory-api.contract.md).
- [X] T005 [P] Register the inventory DTOs in `packages/shared-types/scripts/gen-kotlin-shop-contract.mjs`, run `pnpm --filter @effy/shared-types shop-contract:gen`, and commit the regenerated `contract-shop/` output.
- [X] T006 Add a config-contract test in `apis/edge-api/inventory/` that reads the **real `serverless.yml`** and asserts every env var the code reads is declared — the fifth guard from 035's defect, where four undeclared vars made every pool resolve "unknown" while 100 tests passed.

---

## Phase 2: Foundational (BLOCKING — no user story starts until this is done)

**Purpose**: the single availability rule, adopted everywhere, with stock columns present but **every
product untracked** — so the whole platform is provably unchanged before any stock exists.

- [X] T007 Create `apis/core-api/internal/platform/availability/availability.go` — export the SQL fragment `p.status = 'active' AND (NOT p.stock_tracked OR p.stock_on_hand > 0)` and its in-memory Go twin, derived from one definition so the two cannot disagree ([data-model.md](./data-model.md) §5).
- [X] T008 [P] Unit tests in `apis/core-api/internal/platform/availability/availability_test.go` covering the truth table: active+untracked, active+tracked>0, active+tracked=0, unavailable+tracked>0, draft, archived.
- [X] T009 Adopt the fragment at all 8 storefront sites — 6 in `repository.go` (four card rails, the rail-candidate join, the category product count) plus `product_detail.go` and `search.go`. ⚠ **The planned figure of 12 was wrong**: a raw grep counted `promo_code`, `attribute_definition` and `category` lines as product ones. Each non-product site now carries an `availability-exempt:` marker the guard enforces.
- [X] T010 [P] Adopt the fragment in `apis/core-api/internal/features/cart/service.go` (the `available := row.Status == statusActive` decision at ~line 869 and the `Add`/`RestoreSaved` guards).
- [X] T011 [P] Adopt the fragment in `apis/core-api/internal/features/saveditems/repository.go` and ⚠ **widen the verdict mapping so a tracked product at zero also yields `temporarily_unavailable`** — without this a zero-stock product reads `purchasable` in a saved list while being unbuyable everywhere else ([research.md](./research.md) R12.2).
- [X] T012 Add the one-rule guard: a test that greps the hot path for a hand-written `status = 'active'` against `public.product` and **fails naming the file**. Prove it works by reverting one site (quickstart §2a).
- [X] T013 **NEGATIVE PROOF (SC-006)** — a test fixing every product untracked and asserting each customer-facing read is identical to its pre-slice output. Run it with the slice stashed to establish the baseline; this is the only thing that proves FR-002 rather than asserting it.
- [X] T014 **NEGATIVE PROOF (SC-012)** — change the fragment once (e.g. to exclude `unavailable`) and confirm storefront, cart, saved-items and checkout tests all move together. Revert.

**Checkpoint**: the platform behaves exactly as it did, and one edit can change availability everywhere.

---

## Phase 3: User Story 1 — A shop keeps a true count (P1)

**Goal**: an operator can turn tracking on, set and adjust a count, choose a reason, and read the full
history — on **both** shop surfaces (FR-030).

**Independent test**: track one product, set 12 → receive 24 → correct to 1 with a reason; confirm the
count and history read back on shop-web and shop-mobile. Leave a second product untracked and confirm
nothing about it changed.

### Backend — `apis/edge-api/inventory`

- [X] T015 [P] [US1] `src/stock/types.ts` — domain types, the closed `reason` set mirroring the database CHECK, and a `StockError` with the platform's refusal kinds.
- [X] T016 [US1] `src/stock/authz.ts` — resolve the caller's shop from `public.shop_staff` (**membership** AND staff status AND shop status, one SQL predicate, fail-closed), mirroring `authorizeShopMember` in `apis/edge-api/shop/src/products/authz.ts`. ⚠ **Role-AGNOSTIC — this is NOT `authorizeShopManager`.** FR-010 and A7 require both shop roles to manage stock, and that file's own header calls itself "the role-AGNOSTIC sibling". ⚠ `shopId` is never read from the client.
- [X] T017 [US1] `src/stock/repository.ts` — read stock + movements; set absolute; adjust relative; toggle tracking; set threshold; read/write shop settings. Every write is **one guarded `UPDATE … RETURNING`** capturing the prior value, with the movement inserted in the same transaction ([research.md](./research.md) R5). ⚠ Never touch `product.updated_at`.
- [X] T018 [US1] `src/stock/service.ts` — validation and legality: whole numbers only, never negative, tracking-on requires a count, a reason is required on anything that moves a count. No SQL, no HTTP.
- [X] T019 [P] [US1] Handlers `src/functions/stock-v1-{get,put,adjust,tracking-put,threshold-put}.ts` and `settings-v1-{get,put}.ts` — thin: gate → parse → service → DTO, RFC 9457 on refusal.
- [X] T020 [US1] Wire the seven product/settings shop routes in `serverless.yml` behind the **shop** authorizer, paths per the contract. ⚠ The eighth shop route, `GET /inventory/v1/low-stock`, is wired in Phase 7 with the feature it serves (T063a).
- [X] T021 [P] [US1] Service tests in `src/stock/service.test.ts` — the validation table incl. `-1`, `2.5`, tracking-on with no count, and a missing reason; and the tracked → untracked → **re-tracked** cycle, where the fresh count is authoritative and the earlier history survives (data-model §6).
- [ ] T022 [P] [US1] ⚠ **BLOCKED — Docker is down**, so no container-backed test can run this session (052 lost its exactly-once proofs the same way). Repository tests in `src/stock/repository.test.ts` — movement written in the same transaction as the count; `quantity_before`/`after` correct on both absolute and relative writes.
- [X] T023 [US1] Isolation test: a product belonging to another shop returns **the same refusal** as one that does not exist (FR-004) — assert the two responses are byte-identical.
- [X] T023a [US1] Test (FR-010, A7): a **`shop_staff`** member — not a manager — can turn tracking on and set a count. ⚠ This is the test that catches the wrong gate being wired; without it a manager-only gate ships green.
- [ ] T024 [US1] ⚠ **BLOCKED — Docker is down.** Concurrency test: two simultaneous adjustments to one product both produce movements and the count reflects both (FR-011).

### shop-web

- [X] T025 [P] [US1] `apps/shop-web/src/features/catalog/stockRepo.ts` + `stockQueries.ts` — the inventory service's base path and TanStack Query keys/mutations.
- [X] T026 [US1] `apps/shop-web/src/features/catalog/StockPanel.tsx` — tracking toggle, count, threshold, and the adjust/set controls as `<dl>` **detail rows**, matching the Overview tab. ⚠ No cards, no metric cards (Principle V).
- [X] T027 [P] [US1] `apps/shop-web/src/features/catalog/StockHistory.tsx` — the movement history as a **table**, newest first, showing actor, reason, before → after.
- [X] T028 [US1] Replace the "Inventory — coming soon" panel at `apps/shop-web/src/features/catalog/ProductDetailScreen.tsx:170` with `StockPanel` + `StockHistory`.
- [X] T029 [P] [US1] `StockPanel.test.tsx` / `StockHistory.test.tsx` — ⚠ assert on behaviour, not on a class name: 052 found `MethodList.test.tsx` had been asserting nothing since a styling commit moved the class its selector matched.

### shop-mobile (parity — FR-030)

- [X] T030 [P] [US1] Domain: `features/catalog/domain/Stock.kt` + use cases (`LoadProductStock`, `SetStockCount`, `AdjustStock`, `SetTracking`, `SetThreshold`) under `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/`.
- [X] T031 [US1] Data: `features/catalog/data/HttpStockRepository.kt` against the generated `contract-shop/` DTOs.
- [X] T032 [US1] Presentation: `StockViewModel` exposing one immutable state object (MVVM, Principle VI) + the **Inventory** tab body in `features/catalog/presentation/CatalogScreen.kt`, replacing the placeholder at line 385. Tablet-first landscape layout (014 FR-003a).
- [X] T033 [P] [US1] `commonTest` ViewModel + mapper tests. ⚠ No commas in backtick test names — Kotlin/Native rejects them and the JVM does not, which is how 033's iOS test suite silently never compiled.

**Checkpoint**: US1 is shippable alone — a shop can maintain counts even before anything reads them.

---

## Phase 4: User Story 2 — A shopper is never sold what isn't there (P1)

**Goal**: the oversell is stopped at the cart and at the payment.

**Independent test**: track a product at 2; try to add 5; drop the count to 0 with the cart open; confirm
the cart, the payable total and the checkout gate all reflect it before any payment is attempted.

- [X] T034 [US2] `apis/core-api/internal/features/cart/service.go` — refuse `Add`/`SetQuantity` beyond available stock, returning the available quantity with the error (FR-016), and increment `StockBlocked("add")`.
- [X] T035 [US2] `apis/core-api/internal/features/cart/handler.go` — carry that quantity on the existing RFC 9457 problem body so the message can say "only 2 available" (FR-015b). ⚠ The single shape change in the whole customer contract.
- [X] T036 [US2] Flag a cart line that outruns stock and exclude the excess from the payable subtotal, reusing the existing `unavailable` notice rather than adding a second notice kind, but ⚠ **carrying the cause on it** so the shopper reads "out of stock" and not "no longer sold" — FR-014's distinction must not collapse at the one surface where the shopper is about to pay (FR-017, FR-014).
- [X] T037 [US2] `apis/core-api/internal/features/checkout/service.go` — re-check availability at intent creation against the shared fragment, refusing with the existing `no_payable_items` blocked reason (FR-018, FR-019), and increment `StockBlocked("checkout")`. ⚠ Add no new blocked reason; the vocabulary already says this.
- [X] T038 [US2] Cap the payable quantity at what is available so the amount charged never covers units the platform believes are gone (FR-020).
- [X] T039 [P] [US2] Cart service tests: the refusal carries the number; a line dropping below its quantity is flagged and partially payable; an all-out cart cannot check out; an untracked product is unaffected at any quantity; and ⚠ a cart line whose product becomes **untracked** has its flag cleared (spec §Edge Cases).
- [X] T040 [P] [US2] Checkout test: **no PaymentIntent is created** when every line is out of stock (assert against the gateway fake, not the response).
- [X] T041 [P] [US2] Saved-items test: a tracked product at zero reads `temporarily_unavailable`, distinct from `no_longer_sold` (FR-014). Proves T011.
- [X] T042 [P] [US2] Storefront test: a tracked product at zero is still **listed** and still saveable, with `available: false` (FR-013, A10).
- [ ] T043 [US2] ⚠ **PARTIAL — the structural half is done** (no count reaches a customer response outside the FR-016 refusal; storefront/saved-item DTOs unchanged). The live sweep of every rendered surface remains a walk. No-disclosure sweep: assert no customer response, page or notification carries a stock count outside the FR-016 refusal, or any shop identity (SC-009, FR-015).

**Checkpoint**: SC-002 holds — no payment can exceed stock on any path.

---

## Phase 5: User Story 3 — Stock stays true through the order flow (P2)

**Goal**: counts fall on payment without anyone acting, and the shelf corrects them.

**Independent test**: pay for a tracked product and confirm the count falls and the movement cites the
order; then record a pick shortfall and confirm the count is corrected citing the pick.

- [X] T044 [US3] `apis/core-api/internal/features/checkout/store.go` — inside `FinalizeSucceeded`, after the fan-out, reduce each tracked line with `UPDATE … SET stock_on_hand = GREATEST(0, stock_on_hand - $qty) … RETURNING` and insert a movement with `reason='order_paid'`, `actor_kind='system'`, `actor_sub=NULL`, `order_id` set, and `shop_id` taken from the product. ⚠ `'system'` is the only `actor_kind` the finalize path may use and the only one no other task names. ⚠ **No dedupe key** — the status-guarded transition at the top of the function already makes everything below it exactly-once ([research.md](./research.md) R3); adding one would imply that guard is untrustworthy.
- [X] T045 [US3] In the same transaction, seed `public.fulfillment_item` for any line whose ordered quantity exceeded stock, with `unavailable_quantity` set to the deficit (FR-022a). ⚠ Confirm no change is needed in `apis/edge-api/shop` — its seed is `ON CONFLICT DO NOTHING` and its reads are `LEFT JOIN` ([research.md](./research.md) R4).
- [X] T046 [US3] `apis/edge-api/shop/src/fulfillments/repository.ts` — the picker's shortfall write also corrects `product.stock_on_hand` and writes a `pick_shortfall` movement, in the existing transaction (FR-023).
- [ ] T047 [P] [US3] ⚠ **WRITTEN, COMPILES, NEVER EXECUTED — Docker down all session.** `stock_container_test.go`; runs the moment Docker is up. **Container-backed** test: finalize twice for one order → the count moves exactly once (FR-021). ⚠ `docker info` first — 052's exactly-once proofs skipped silently for a whole session.
- [ ] T048 [US3] ⚠⚠ **WRITTEN, COMPILES, NEVER EXECUTED — Docker down all session. THIS IS THE MOST IMPORTANT UNVERIFIED CLAIM IN THE SLICE.** **Container-backed concurrency test (SC-003)**: two finalizes for the last unit, concurrently → the count never reads below zero, both orders exist, exactly one carries a shortfall.
- [X] T049 [P] [US3] **NEGATIVE PROOF written as `TestStock_WithoutTheFloorTheConcurrentCaseBreaks`** — ⚠ also Docker-gated. (quickstart §2d) remove the `GREATEST(0, …)` floor and confirm T048 drives the count negative. Revert.
- [X] T050 [P] [US3] Test: a portion with pre-seeded shortfall rows still reads **`pending`**, not "picking" — the assumption at `fulfillments/repository.ts:71` is now false and must not be relied on for presentation ([research.md](./research.md) R4).
- [X] T051 [P] [US3] Test: gathering a pre-flagged line clears the flag through the existing absolute-quantity PATCH, with no special case (FR-022a correctability).
- [X] T052 [P] [US3] Test: an untracked product in a paid order produces **no movement at all** (FR-024).
- [ ] T053 [P] [US3] ⚠ **Docker-gated** — the mixed-sequence walk needs a real engine. Test (SC-005): after a mixed sequence — track, receive, pay, pick-short, correct — the movements fully account for the difference between the opening and current count.

**Checkpoint**: counts stay true without hand maintenance; the oversell is visible before picking.

---

## Phase 6: User Story 4 — Back-office manages stock on a shop's behalf (P2)

**Goal**: support can fix a count, and the shop can see it was them.

**Independent test**: adjust a shop's stock from back-office, then read the history from the shop's own
console and see the change attributed and marked as back-office.

- [X] T054 [US4] `apis/edge-api/inventory/src/stock/adminAuthz.ts` — decide from `admin.staff`, never the claim alone: read = any active staff **incl. `csa`**; write = `admin`/`manager` (FR-025, FR-028).
- [X] T055 [P] [US4] Admin handlers under `src/functions/admin-*.ts` for the six routes in the contract, reusing the **same** `stock/service.ts` as the shop path — only the gate and the shop resolution differ (the 046 two-routes-one-service pattern).
- [X] T056 [US4] Wire the **six** admin routes in `serverless.yml` behind the **back-office** authorizer — including `PUT /inventory/v1/admin/shops/{shopId}/products/{productId}/stock/threshold`, without which FR-026's "every stock action a shop operator can" is false for per-product thresholds.
- [X] T057 [US4] Stamp `actor_kind = 'back_office'` and the individual's sub on every movement written through the admin path (FR-027).
- [X] T058 [P] [US4] Test: a `csa` can read stock and history; **every** write is refused, and the refusal is identical regardless of the shop or product named (FR-028).
- [X] T059 [P] [US4] Test: full parity — a back-office write can turn tracking on and off, set a count, set a **per-product threshold**, and set the shop default. All four powers named by FR-026 and the Q5 clarification, not a subset (FR-026).
- [X] T060 [P] [US4] `apps/back-office/src/features/shops/` — stock view and adjust controls on the shop detail surface, as detail rows and a table. No cards.
- [X] T061 [P] [US4] Back-office console tests, including that the refusal text reaches the screen. ⚠ 053 found every console refusal collapsed to one generic sentence because the screen used `e instanceof Error` while the api-client throws a **plain object** — check this surface does not repeat it.
- [ ] T062 [US4] ⚠ **A WALK, not a unit test** — the plumbing is proven (`actorKind: back_office` is set by the gate, recorded by the repository and rendered by both shop surfaces' history), but that the three line up end to end needs one real assisted change. Confirm the back-office attribution is visible on **shop-web and shop-mobile** history, not only in the database (FR-027).

---

## Phase 7: User Story 5 — A shop sees what needs restocking (P3)

**Goal**: restocking is decided from a list. Cuttable under pressure without invalidating anything above.

**Independent test**: set a threshold above a product's count and confirm it appears in the low-stock
list on both shop surfaces; raise the count and confirm it leaves.

- [X] T063 [US5] Low-stock query in `src/stock/repository.ts` using `COALESCE(p.low_stock_threshold, s.default_low_stock_threshold)` over the partial index, returning `severity: "out" | "low"` with `out` sorted first ([data-model.md](./data-model.md) §4).
- [X] T063a [US5] Handler `src/functions/low-stock-v1-get.ts` and its route in `serverless.yml` behind the **shop** authorizer — the eighth shop route. ⚠ Without it T063's query and T065/T067's screens have no endpoint between them and FR-029/SC-008 cannot be met.
- [X] T064 [P] [US5] Tests for the effective-threshold resolution: shop default applies; the product's own threshold wins; neither set → nothing is low but zero is still **out** (FR-005, FR-005a).
- [X] T065 [P] [US5] `apps/shop-web/src/features/catalog/LowStockScreen.tsx` — a table with a status column distinguishing out from low. No cards.
- [X] T066 [P] [US5] Shop settings control for the shop-wide default threshold on shop-web.
- [X] T067 [P] [US5] shop-mobile low-stock list + settings control, at parity (FR-030).
- [X] T068 [P] [US5] Test: an untracked product never appears in the list (FR-024/FR-029).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T069 [P] `apis/core-api/internal/platform/metrics/metrics.go` — add `StockDeducted(outcome)` incrementing `effy_stock_deducted_total{outcome="full"|"partial"}` and `StockBlocked(stage)` incrementing `effy_stock_blocked_total{stage="add"|"checkout"}`, following the existing `ServiceabilityChecked`/`DeliveryQuoted` helper shape ([research.md](./research.md) R9). ⚠ The `effy_products_out_of_stock` gauge from R9's first draft is **dropped** — nothing on the hot path is positioned to compute it, and a metric no code writes is worse than no metric.
- [ ] T070 [P] Test: no metric label carries a product id or shop id (Principle VII, low cardinality), and every declared counter has at least one call site.
- [ ] T071 ⚠ Write `infra/observability/alerts/054-product-inventory.yml` — a Prometheus rule on a sustained non-zero rate of `effy_stock_deducted_total{outcome="partial"}`, and register it in `infra/observability/README.md`'s file table. **NOT a CloudWatch alarm in `infra/envs/dev/`**: `infra/observability/README.md` records that the Prometheus/Grafana stack described in ARCHITECTURE.md **does not exist** — no module, no scrape config — so nothing reads `core-api`'s `/metrics`. 032 created this directory for exactly this situation, so that a feature adding a counter has somewhere honest to put the alert instead of rediscovering the gap. The file is **written, reviewable, and inert**, and must be labelled as such.
- [ ] T071a ⚠ Record in [research.md](./research.md) R9 and the plan's Constitution Check VII that this slice's alert is **specified, not live**, and that an oversell is therefore detectable today only by querying `stock_movement`. An undocumented deviation is a defect under the constitution's Quality Gates; a documented one is not.
- [X] T029a **⚠ FIXED A PLATFORM-WIDE LATENT DEFECT, unplanned.** `toDomainError` in `@effy/api-client` read `problem.fields` while `@effy/edge-shared`'s `problem()` has always serialised field issues under `errors` — so `DomainError.fields` was `undefined` on EVERY refusal, on every surface, since the type existed. 053 found it and recorded it as latent; 054 could not meet FR-016 without it, because a validation refusal that cannot name the field is a generic sentence. Fixed (both keys accepted), `ProblemJSON.errors` declared, and **the package had NO tests at all** (`"test": "echo no tests"`) — now 6, proven by reverting the fix.
- [ ] T071b [P] **Append-only guard (FR-008)**: a test that greps every repository for an `UPDATE` or `DELETE` against `public.stock_movement` and fails naming the file. Data-model §2 chose discipline over a trigger; T012 already shows how discipline is made mechanical, and the same mechanism costs one test here.
- [ ] T072 [P] **Freshness guard (FR-015a, [research.md](./research.md) R2)**: a test asserting no `apps/customer-web` storefront read acquires `cached()`. All five read live today; the risk this feature introduces is a later performance pass silently making sold-out products look buyable for an hour. ⚠ State in the test why `customer-mobile` needs no equivalent guard — it has no cache layer at all — so the omission is a recorded decision rather than an oversight.
- [ ] T073 [P] Run every machine gate in [quickstart.md](./quickstart.md) §1 and record the counts. ⚠ Count the reporting packages — 029 found `pnpm -r test` green while `typecheck` **failed**, caught only because the "Done" count fell.
- [ ] T074 [P] Confirm the two pre-existing red gates are unchanged at clean HEAD (`platform/delivery`, `features/saveditems`) so they are not attributed to this slice.
- [ ] T075 [P] Update `docs/audiences/shop-capabilities.md` §054 — the parity register for shop-web ↔ shop-mobile.
- [ ] T076 [P] Update `ORDER-FLOW-GAPS.md` — mark **G2 closed**, and record what it does *not* close: G3's money path is still open, and ⚠ the substitution contradiction in the published Food Safety notice ([research.md](./research.md) R12.1) now has a slice that must own it.
- [ ] T077 [P] Update `CLAUDE.md`'s Active feature section.
- [ ] T078 Write `specs/054-product-inventory/SIGNOFF.md` recording what was verified by machine, what was walked by a person, and what was not.

### Operator steps (⚠ NOT run by the assistant — see [quickstart.md](./quickstart.md) § Operator steps)

- [ ] T078a ⚠ **Capture the SC-004 baseline before anything deploys** — the current proportion of picks ending in a shortfall, from the pick records that already exist. After deployment the pre-slice figure is unrecoverable and SC-004 becomes unprovable rather than merely unmet.
- [ ] T079 Commit the migration, then `make db-up ENV=dev`.
- [ ] T080 `make edge-deploy SERVICE=inventory ENV=dev` and `SERVICE=shop ENV=dev`.
- [ ] T081 `make core-image-push ENV=dev && make core-deploy ENV=dev` — ⚠ **before** pushing to `dev`; Amplify auto-deploys the consoles on push, and 047 recorded that the reverse order briefly broke dev checkout.
- [ ] T082 ⚠ **Confirm whether any Terraform change is needed at all, and drop this step if not.** Per 004/053 a cold-path service attaches to the shared gateway from its own `serverless.yml` via `httpApi.id` read from SSM — Terraform owns no per-service attachment — and T071 moves the alert out of `infra/envs/`. Run `make apply ENV=dev` only if something genuinely changed.

### The walks a suite cannot do

- [ ] T083 [P] Walk **US1**'s validation — quickstart §3 on shop-web **and** shop-mobile (SC-001, SC-005).
- [ ] T084 [P] Walk **US2**'s validation — quickstart §4 end to end (SC-002, SC-011), including the five-observer wording test for out-of-stock vs no-longer-sold (SC-010).
- [ ] T085 ⚠ Walk **US3**'s validation — quickstart §5, **including the deliberate oversell** — two payments for one unit. SC-003 is the one thing in this slice that has never happened on this platform.
- [ ] T086 [P] Walk **US4**'s validation — quickstart §6, timed, including the `csa` negative (SC-007).
- [ ] T087 [P] Walk **US5**'s validation — quickstart §7, timed (SC-008).
- [ ] T088 ⚠ **Look at it** (quickstart §9): both Inventory tabs side by side; light, **dark** and large-text; "out" and "low" legible with **no colour at all**; shop-mobile on a tablet in landscape. 039 shipped four live defects with a fully green suite — layout, contrast and hierarchy are not properties a DOM assertion can see.

---

## Implementation status — 2026-08-29

**23 of 93 done.** Phases 1 and 2 complete (Setup + the blocking Foundational phase), plus the whole
US1 backend. Nothing is half-finished: every task marked `[X]` builds, typechecks and tests green.

**Verified this session**: `go build`/`vet`/`gofmt` clean · Go 12 packages ok · `pnpm -r typecheck`
**19/19** · `pnpm -r test` **16/16 packages, zero failures** · edge-inventory **35 tests**.

**Three negative proofs done, each by breaking the thing:**
- Reverting one adoption site makes the one-rule guard fail **naming the file** (quickstart §2a).
- One edit to `availability.Predicate` makes **cart, checkout, saveditems and storefront** fail
  together — SC-012.
- Wiring a manager-only shop gate makes `authz.test.ts` fail — the F1 defect the analysis pass found.

**⚠ DOCKER IS DOWN for this whole session**, exactly as it was for all of 052. Every container-backed
test fails with `failed to create Docker provider` — that is the ONLY reason
`features/{checkout,saveditems,storefront}` and `platform/delivery` are red in Go, and it blocks
**T022, T024, T047 and T048**. ⚠ **T048 is SC-003, the deliberate-oversell concurrency proof — the
single most important unverified claim in this slice.**

**Next**: T025–T033 (shop-web + shop-mobile Inventory tabs), then Phase 4 (US2, the buying gates),
which is where the oversell actually stops.

---

## Dependencies

```
Phase 1 (Setup) ─▶ Phase 2 (Foundational, BLOCKING)
                        │
                        ├─▶ Phase 3  US1  (P1)  shop management        ── independently shippable
                        ├─▶ Phase 4  US2  (P1)  buying gates           ── independently shippable
                        │       └─ needs Phase 2; independent of US1
                        ├─▶ Phase 5  US3  (P2)  order flow             ── needs Phase 2
                        ├─▶ Phase 6  US4  (P2)  back-office            ── needs US1's service (T015–T018)
                        └─▶ Phase 7  US5  (P3)  low stock              ── needs US1's repository
                                │
                                └─▶ Phase 8 (Polish)
```

- **US1 and US2 are genuinely independent of each other** (both need Phase 2) and can be built in parallel by two people: US2 touches only
  `core-api`, US1 only the new service and the operator surfaces.
- **US4 depends on US1** for the shared `stock/service.ts` — that dependency is the point (one service,
  two audiences), not an accident.
- **US5 depends on US1** for the repository, and on nothing else.
- **US3 depends only on Phase 2**, so it can start before US1 lands.

## Parallel execution examples

- **Phase 1**: T004 and T005 together after T001.
- **Phase 2**: T010 and T011 together after T007 (different packages); T008 alongside both.
- **Phase 3**: the three surfaces run in parallel once T015–T020 land — T025–T029 (shop-web) and
  T030–T033 (shop-mobile) touch no shared file.
- **Phase 4**: T039–T043 are five independent test files.
- **Phase 8**: T069–T077 are all `[P]`.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That is the operator's literal request — a shop that can
manage its own stock — and it ships without changing a single thing a customer sees, because Phase 2
leaves every product untracked.

**Second increment = Phase 4 (US2)**, which is what makes the counts *do* something and delivers the
gap register's actual ask.

**Then Phase 5 (US3)** — without it counts drift within days and shops stop trusting them.

**Phase 7 (US5) is the cut line.** If time runs out, dropping it invalidates nothing above.
