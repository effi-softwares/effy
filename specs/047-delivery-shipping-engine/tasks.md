---
description: "Task list for Delivery Zones & Shipping-Fee Engine (047)"
---

# Tasks: Delivery Zones & Shipping-Fee Engine

**Input**: Design documents from `/specs/047-delivery-shipping-engine/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the plan's Testing section and the platform's Quality Gates require them (the engine
is money + legal + serviceability; the risk warrants the pure-engine table test, container-backed repo
tests, a Go↔Kotlin wire-contract test, per-service config-contract tests, and a Playwright path).

**Organization**: by user story (US1–US5 from spec.md). ⚠ This feature consolidates four withdrawn slices
and is large; **US1 is the shippable MVP** (serviceability + standard fee, no same-day). Operator-run
steps (migrations, deploys, live AWS) are the operator's, per the platform's mode of work, and are flagged.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5; Setup/Foundational/Polish carry no story label
- The **one** forward-only migration lives in Foundational (a single file cannot be split across phases)

## Path conventions

- Migration: `db/migrations/<ts>_delivery_shipping_engine.sql` (create with `make db-new`)
- Reference data: `db/reference/`
- Hot path: `apis/core-api/internal/{platform/delivery,features/{storefront,checkout}}`, `apis/core-api/cmd/load-localities`
- Cold path: `apis/edge-api/admin/src/delivery`, `apis/edge-api/shop/src/products`
- Shared contracts: `packages/shared-types/src`
- Clients: `apps/customer-web`, `apps/back-office/src/features/delivery`, `apps/customer-mobile`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: scaffolding and the committed dataset — no behaviour yet.

- [X] T001 [P] Commit the G-NAF-derived place dataset to `db/reference/au-localities.csv` (columns:
  postcode, locality name, state, latitude, longitude, address_count) and write `db/reference/README.md`
  with provenance + the required attribution *"Incorporates or developed using G-NAF © Geoscape Australia"*
  and the Open-G-NAF / CC BY 4.0 terms (research R1)
- [X] T002 [P] Create `packages/shared-types/src/delivery.ts` with customer-facing DTOs + enums:
  `ServiceabilityDTO`, `LocalityDTO`, `DeliveryQuoteDTO` (full shape: `{postcode, serviced,
  sameDayAvailableUntil, packages:[{shopRef, options:[{method, feeCents: WireInt, promisedFrom,
  promisedTo}]}], expiresAt}` — contracts §3), `DeliveryMethod = 'same_day' | 'standard'`
  (contracts/delivery-customer-api)
- [X] T003 [P] Create `packages/shared-types/src/delivery-admin.ts` with back-office DTOs + enums: zone,
  ring, fee-plan (+ring-price, weight-band), same-day exception, collection-run, settings, health-flag
  (contracts/delivery-admin-api)
- [X] T004 [P] Export the two new modules from `packages/shared-types/src/index.ts`
- [X] T005 [P] Scaffold the hot-path package dir `apis/core-api/internal/platform/delivery/` (empty
  `engine.go`, `zone.go`, `plan.go` with package decl + doc comments)
- [X] T006 [P] Scaffold the cold-path domain dir `apis/edge-api/admin/src/delivery/` and the back-office
  feature dir `apps/back-office/src/features/delivery/` (index stubs only)

**Checkpoint**: dataset committed, contracts declared, dirs exist. No DB, no routes yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the one migration, the reference loader, and the cross-language contract wiring that every
story depends on.

**⚠️ CRITICAL**: no user-story work begins until this phase is complete.

- [X] T007 Author the single forward-only migration `db/migrations/20260822001858_delivery_shipping_engine.sql`
  creating **all** delivery tables + alters exactly per [data-model.md](data-model.md): `locality`,
  `delivery_ring`, `delivery_zone`, `delivery_zone_postcode`, `delivery_settings`,
  `delivery_collection_run`, `delivery_fee_plan`, `delivery_ring_price`, `delivery_weight_band`,
  `shop_sameday_exception`, `order_package_delivery`; alters to `product` (+weight_grams/weight_is_assumed
  + net_weight backfill), `"order"` (+delivery capture), `shop_fulfillment` (+delivery columns). Include
  every CHECK, partial-unique (one active plan; one open-ended ring), index, and `COMMENT ON`
- [X] T008 Add the loader `apis/core-api/cmd/load-localities/main.go` + `internal/platform/delivery/localityload.go`
  — idempotent upsert on the `(name,state,postcode)` triple from `db/reference/au-localities.csv` (the
  `create-first-admin` pattern); wire `make load-localities ENV=…` in the Makefile
- [X] T009 [P] Generate the Kotlin customer DTOs from `@effy/shared-types` into
  `apps/customer-mobile/.../contract/DeliveryDto.kt` via the existing generator; confirm `cm-contract-check`
  covers them
- [X] T010 [P] Write the Go↔Kotlin wire-contract test skeletons — `apis/core-api/internal/features/checkout/wire_contract_test.go`
  and `apps/customer-mobile/.../DeliveryWireContractTest.kt` — sharing one byte-identical JSON literal for
  `ServiceabilityDTO`/`LocalityDTO`/`DeliveryQuoteDTO` (research R14; the 027 R13 `WireInt` guard)
- [X] T011 [P] Add a config-contract test in `apis/edge-api/admin/src/delivery/config.contract.test.ts`
  reading the real `serverless.yml` (the 035/038 guard) — routes + any new env keys the delivery domain declares
- [X] T012 ⚠ **OPERATOR**: `make db-up ENV=dev` (after committing T007 — 003 commit-guard), then
  `make load-localities ENV=dev`; re-run the loader to prove idempotence (0 inserted / N updated) and
  assert the `net_weight` backfill count is **neither 0 nor all** products (research R10; quickstart §7-1)

**Checkpoint**: schema live, places loaded, contracts pinned. User stories can begin.

---

## Phase 3: User Story 1 — Effy delivers to real places, at a fee that never loses money (Priority: P1) 🎯 MVP

**Goal**: a shopper learns whether Effy delivers to their address, and at checkout gets a single,
GST-inclusive, snapped-up **standard** fee that rises with the destination ring and the package weight.
No same-day yet.

**Independent Test**: compose one served zone + one unserved area, one active fee plan with rings + weight
bands; confirm a served shopper is quoted a sensible rounded fee that rises with ring and with weight, and
an unserved shopper is told plainly Effy doesn't deliver there.

### US1a — Serviceability & zones

- [X] T013 [P] [US1] Serviceability + locality read tests in
  `apis/core-api/internal/features/storefront/serviceability_test.go` and `localities_test.go`
  (container-backed, `-short`-gated): serviced/unserviced/absent postcode; `400` on malformed; typeahead
  prefix + postcode, `LIMIT 8`, alphabetical, never serviceability-ordered (research R9; contracts §1–2)
- [X] T014 [US1] Implement `postcode → active zone` predicate as a shared SQL const/func in
  `apis/core-api/internal/platform/delivery/zone.go` (`ServiceableForPostcode`), reused by both the read
  and the quote (FR-004 — one predicate)
- [X] T015 [US1] Implement `GET /v1/storefront/serviceability` + `GET /v1/storefront/localities` in
  `apis/core-api/internal/features/storefront/{serviceability.go,localities.go,handler.go}` and mount in
  `register.go` (public, cacheable; frozen two-field serviceability shape; typeahead ≤8)
- [X] T016 [P] [US1] Admin zone repo + service tests in `apis/edge-api/admin/src/delivery/service.test.ts`
  and `repository.container.test.ts`: create/rename zone, add-postcode-by-place with the "also serves N
  other places" disclosure, reject postcode already in another zone (409), warn+confirm on unknown
  postcode, **removal states which places stop being serviceable before it commits** (FR-011), health
  flags (contracts §Zones; FR-008/009/010/011)
- [X] T017 [US1] Implement the admin zone slice — `apis/edge-api/admin/src/delivery/{authz.ts,repository.ts,service.ts,types.ts}`
  (RBAC: read=any active staff, mutate=admin/manager; audit every mutation) + handlers
  `apis/edge-api/admin/src/functions/zones-*.ts` and routes in `serverless.yml`; the postcode-remove
  handler returns the impacted places so the console can confirm before commit (FR-011)
- [X] T018 [P] [US1] Back-office zones console in `apps/back-office/src/features/delivery/zones/` — list +
  compose-by-place (search localities, show the multi-place disclosure before commit), health flags. Tables/
  sectioned pages only, no cards (contracts §Zones)

### US1b — Rings, fee plan, the engine & the standard quote

- [X] T019 [P] [US1] Pure engine table test in `apis/core-api/internal/platform/delivery/engine_test.go`
  covering every invariant + the worked fixtures in [contracts/fee-engine.contract.md](contracts/fee-engine.contract.md)
  (multiples of step incl. capped; floor/cap clamp; monotonic; top-band-for-heavier; a≥b; deterministic)
- [X] T020 [US1] Implement the pure fee engine `apis/core-api/internal/platform/delivery/engine.go`
  (`fee(method, ringPrice, packageGrams, weightBands, factor, step, floor, cap)` — integer-cents `roundUpToStep`,
  clamp, top-band rule). No I/O, no clock
- [X] T021 [US1] Implement active-plan load + coverage validation in
  `apis/core-api/internal/platform/delivery/plan.go` (load active plan + ring prices + weight bands; the
  `PlanIsComplete` check every ring priced + ≥1 weight band — FR-051)
- [X] T022 [P] [US1] Admin ring + fee-plan repo/service tests in the admin `service.test.ts`/`repository.container.test.ts`:
  ring CRUD (one open-ended), plan create/edit with the CHECKs surfaced as field errors, **activation
  refused with the gap named** for an unpriced ring / no weight band (FR-051; SC-016)
- [X] T023 [US1] Implement the admin ring + fee-plan slice (`repository.ts`/`service.ts` extensions) +
  handlers `apis/edge-api/admin/src/functions/{rings-*,plans-*,plan-activate}.ts` + routes; activation is
  one transaction that flips exactly one `is_active` (FR-049/050); audit every create/edit/activate (FR-052)
- [X] T024 [P] [US1] Haversine ring **suggestion** in `apis/edge-api/admin/src/delivery/suggest.ts`
  (+ unit test): mean of a zone's postcodes' locality coords → distance from `delivery_settings` hub → ring;
  `no_coordinate` when none; advisory, admin override wins (research R4; contracts §Rings)
- [X] T025 [P] [US1] Back-office rings + fee-plan editor in `apps/back-office/src/features/delivery/{rings,plans}/`
  — sectioned plan editor (ring-price rows, weight-slab rows, factor/rounding/floor/cap fields), the
  activate action with the gap-refusal surfaced. No cards. ⚠ FR-019 (rings wide enough that a fee never
  resolves to one shop) is operator config-discipline — the editor may surface a hint, but does not enforce
- [X] T026 [P] [US1] Product weight entry in `apis/edge-api/shop/src/products/` (+ test): `PATCH` accepts
  `weightGrams` and sets `weightIsAssumed=false`; list filter `assumedWeight:true` (FR-054/055)
- [X] T027 [US1] Implement the **standard** delivery quote in `apis/core-api/internal/features/checkout/`
  — wave-parallel read block (plan+prices+bands, postcode→zone→ring, cart line weights), engine per package,
  build `DeliveryQuoteDTO` with only `standard` options; **serviced:false ⇒ no packages, one reason** (R13;
  contracts §3; FR-029)
- [X] T028 [US1] Capture + honour the quote in checkout intent/finalize: write `order.delivery_quote`
  (+`_expires_at`), validate the client selection against it (client never sends a fee), sum into
  `order.delivery_fee_amount`, copy per-package into `order_package_delivery` + `shop_fulfillment` inside
  the 019 finalize transaction (FR-036; data-model §8)
- [X] T029 [US1] Fill the wire-contract literal (T010) with a real `DeliveryQuoteDTO` and make both sides green
- [X] T030 [P] [US1] customer-web: show serviceability in the delivery affordance and the standard fee in
  the checkout summary (reuse existing islands; GST-inclusive total before pay; no distance/shop shown).
  Keep the guest bundle within **174 KB** (`apps/customer-web`). Emit the `delivery_serviceability_checked`
  product event ⚠ (no-op until PostHog inits on customer-web, 039 — wired + recorded, not hidden)
- [X] T031 [P] [US1] customer-mobile: serviceability + standard fee in the checkout flow, Clean-Arch/MVVM
  `features/delivery/` (ViewModel → immutable state); no fee sent from the client. Product events
  (`delivery_serviceability_checked`, `delivery_method_selected`) ⚠ deferred with mobile telemetry (recorded)
- [X] T032 [US1] Hot-path metrics: a serviceability counter labelled `serviced` only, and a quote counter by
  outcome/method — **no postcode/coordinate label** (Principle VII; research R12) in
  `apis/core-api/internal/features/{storefront,checkout}`

**Checkpoint**: US1 MVP — Effy delivers where it chooses, priced soundly, snapped up, GST-inclusive,
quote captured. **STOP and validate** (quickstart §1–§3) before US2.

---

## Phase 4: User Story 2 — Same-day, gated by the collection schedule (Priority: P1)

**Goal**: a shopper in a same-day-eligible zone, ordering before the derived cutoff, is offered same-day at
its higher fee; everyone else gets standard only, with no dead-end.

**Independent Test**: mark one zone same-day-eligible, configure a collection schedule; confirm before-cutoff
→ same-day+standard, after-cutoff → standard only, non-eligible zone → standard only.

- [X] T033 [P] [US2] Same-day timing tests in `apis/core-api/internal/platform/delivery/zone_test.go`:
  the derived cutoff from `delivery_collection_run` + `sameday_prep_buffer_min`, evaluated in
  **Australia/Melbourne** (one run = single cutoff; several = extends run-by-run); ⚠ a UTC-clock test that
  fails if the timezone is dropped (research R6; FR-041)
- [X] T034 [US2] Implement collection-schedule + settings admin in the admin delivery slice + handlers
  `apis/edge-api/admin/src/functions/{collection-run-*,settings-*}.ts` + routes (hub coords, prep buffer,
  1..n runs) with audit (contracts §Collection schedule)
- [X] T035 [US2] Implement zone `sameday_eligible` toggle via `PATCH .../zones/:id` in the admin slice
  (FR-037) + audit
- [X] T036 [US2] Implement same-day eligibility + derived-cutoff resolution in
  `apis/core-api/internal/platform/delivery/zone.go` (`SameDayOfferedForZone(now, runs, buffer, eligible)`)
- [X] T037 [US2] Extend the checkout quote to add the `same_day` option per package when eligible + before
  cutoff, set `sameDayAvailableUntil`, and derive the promised window (same-day: today; standard: +N working
  days) — `apis/core-api/internal/features/checkout/` (FR-038/042; contracts §3); ⚠ assert **standard
  remains available whenever same-day is not** (SC-012 — losing same-day never costs a shopper standard)
- [X] T038 [P] [US2] Back-office collection-schedule + settings + zone same-day-eligible controls in
  `apps/back-office/src/features/delivery/{schedule,zones}/`
- [X] T039 [P] [US2] customer-web + customer-mobile: present same-day vs standard choice with fees and the
  cutoff/windows; standard-only shows no refusal (`apps/customer-web`, `apps/customer-mobile`). Emit the
  `delivery_method_selected` event on web (⚠ no-op until PostHog inits, 039); mobile deferred (recorded)
- [X] T040 [US2] Quote metric: same_day/standard/unserviced outcome + chosen method (extend T032; no PII)

**Checkpoint**: US1 + US2 both work independently (quickstart §4).

---

## Phase 5: User Story 3 — Back-office tailors same-day per shop (Priority: P2)

**Goal**: back-office switches a specific shop off (or on) for a specific zone; a shopper's same-day offer
reflects whether the **fulfilling** shop does same-day in **their** zone; per-package in multi-shop baskets.

**Independent Test**: switch one shop off in a same-day-eligible zone; a shopper fulfilled by that shop gets
standard only while another shop's shopper gets same-day; verify no shop-facing route exists.

- [X] T041 [P] [US3] Exception-resolution + per-package tests: admin `service.test.ts` (upsert on/off per
  (shop,zone), attribution) and `apis/core-api/internal/features/checkout/service_test.go` (two-shop basket:
  same-day on exactly one package — SC-011; effective rule `exception ? on : eligible` — research R5;
  ⚠ also assert the **fee is identical regardless of which shop fulfils** — SC-017, destination-ring based)
- [X] T042 [US3] Implement `shop_sameday_exception` admin CRUD in the admin delivery slice + handlers
  `apis/edge-api/admin/src/functions/sameday-exception-*.ts` + routes (mutate=admin/manager; audit)
- [X] T043 [US3] Resolve same-day **per fulfilling shop** in the quote — extend `zone.go`/checkout to apply
  the shop's exception over the zone default (FR-044)
- [X] T044 [P] [US3] Back-office same-day exceptions surface in `apps/back-office/src/features/delivery/sameday/`
  (per shop×zone list; no cards)
- [X] T045 [US3] ⚠ Prove the **shop** service exposes no delivery-config route at all — neither same-day
  eligibility/exceptions (SC-009) **nor any fee/factor/ring-price/slab/floor/cap** (SC-008) — a guard
  test/assertion in `apis/edge-api/shop` (attempt directly, not via UI). Fees + same-day are back-office only

**Checkpoint**: US1–US3 independently functional (quickstart §5).

---

## Phase 6: User Story 4 — Multiple fee plans, one active (Priority: P2)

**Goal**: back-office keeps several plans and activates one in a single action; the switch changes only new
quotes and touches neither zones nor same-day eligibility; already-quoted orders keep their fee.

**Independent Test**: create two plans, activate each, quote the same basket; fee changes, zones/eligibility
unchanged, a basket quoted under the first plan retains its fee.

- [X] T046 [P] [US4] Plan-register + immutability tests: admin `service.test.ts` (list shows one active;
  activate is atomic; FR-050 zones/eligibility untouched) and checkout `service_test.go` (an order captured
  under plan A is finalised at plan-A fee after plan B activates — SC-013)
- [X] T047 [US4] Back-office fee-plan **register** in `apps/back-office/src/features/delivery/plans/` — list
  with the single active marker, prepare-then-activate, the gap-refusal message (built in US1; this is the
  register + activation UX)
- [X] T048 [US4] Confirm quoted-fee immutability end to end against a live plan switch (the capture from T028
  is the mechanism; add the regression assertion)

**Checkpoint**: US1–US4 functional (quickstart §6).

---

## Phase 7: User Story 5 — Product weight, measured or assumed (Priority: P3)

**Goal**: shop operators record real weights (marked measured); every product has at least an assumed weight
so nothing is priced weightless; the two are distinguishable.

**Independent Test**: an un-weighed product still quotes (assumed) and is flagged; recording a real weight
marks it measured and the quote reflects it.

- [X] T049 [P] [US5] shop-web product weight UI in `apps/shop-web/src/features/catalog/` — weight field
  (measured on save), an "assumed weight" filter/report to surface products still needing a real weight
- [X] T050 [US5] shop-web/mobile test: assumed→measured flips `weightIsAssumed` and the quote weight-slab
  changes (SC-014); a product with no weight still quotes on the assumed default (never free)

**Checkpoint**: all user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T051 [P] Wire the **invariant alarm**: a served zone that fails to produce a standard fee (must never
  fire) — metric + Grafana alert (Principle VII; research R12)
- [X] T052 [P] ⚠ No-PII sweep: assert no postcode/suburb/coordinate appears in logs, metric labels, or
  telemetry, and no distance/ring-name/shop-id in any customer DTO (SC-007; quickstart §8)
- [X] T053 [P] Update the parity register
  `docs/audiences/customer-capabilities.md` (§047) and `docs/audiences/shop-capabilities.md` (product
  weight) + a short delivery ops note
- [X] T054 [P] customer-web bundle check within **174 KB** across all guest routes (`pnpm size`); mobile
  `cm-guard`/`cm-tokens-check`; `tokens:check` unchanged (no token added)
- [X] T055 [P] Playwright storefront path in `apps/customer-web/e2e/delivery.spec.ts` — serviceability
  answer, standard + same-day quote display, GST-inclusive total before pay (needs live `core-api` + seed)
- [X] T056 Full machine sweep: `go test ./...` (engine + container-backed, `-short` split) · `pnpm -r
  typecheck` · `pnpm -r test` (admin delivery + config-contract) · the Go↔Kotlin wire contract · mobile
  `commonTest` Android **and** iOS compile · `terraform validate`/`fmt` if any infra touched
- [ ] T057 ⚠ **OPERATOR**: deploy + live SC walk — `make edge-deploy SERVICE=admin ENV=dev` and
  `SERVICE=shop ENV=dev`, `make core-run`/dev Fargate, then quickstart §2–§7 (SC-001…SC-017), the no-leak
  sweep, and the same-day wall-clock proof; then sign-off + parity update

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **BLOCKS all stories** (the migration + loader + contracts).
- **US1 (P3)** → after Foundational. The MVP.
- **US2 (P4)** → after Foundational; independently testable, but naturally follows US1 (shares the quote).
- **US3 (P5)** → after US2 (extends same-day resolution).
- **US4 (P6)** → after US1 (the plan register + activation; capture already built in US1/T028).
- **US5 (P7)** → after Foundational (weight column exists from T007); UI-only, independent.
- **Polish (P8)** → after the desired stories.

### Within US1 (the critical path)

T013→T014→T015 (serviceability) · T016→T017→T018 (zones) · T019→T020→T021 (engine) ·
T022→T023 (plans) · T024/T025 (suggest/console) · T026 (weight) · **T027→T028→T029** (quote+capture+wire)
→ T030/T031 (clients) → T032 (metrics). Engine + plan (T019–T023) gate the quote (T027).

### Parallel opportunities

- Setup: T001–T006 all [P].
- Foundational: T009/T010/T011 [P] after T007/T008.
- US1: the read slice (T013–T015), the zone slice (T016–T018), and the engine slice (T019–T021) are three
  independent tracks; T024/T025/T026 [P]; clients T030/T031 [P] after the quote.
- US2: T038/T039 [P]; US3: T044 [P]; Polish: T051–T055 [P].

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup → 2. Foundational (migration + loader + contracts) → 3. **US1** (serviceability + standard fee).
4. **STOP & validate** quickstart §1–§3 (SC-001…SC-006, SC-015, SC-016, SC-017). 5. Demo: Effy delivers,
priced, GST-inclusive, snapped up — with no same-day.

### Incremental delivery

US1 (MVP) → US2 (same-day) → US3 (per-shop exceptions) → US4 (multiple plans) → US5 (weight polish). Each
adds value without breaking the customer contract, because the serviceability rule (FR-001) and the data
model are fixed once in Foundational.

---

## Notes

- [P] = different files, no incomplete-task dependency. [Story] maps a task to its user story.
- ⚠ Tests before implementation within a story (write, see fail, implement) — the platform convention.
- ⚠ The fee engine has **one home** (Go, pure); the admin console validates but never recomputes a fee.
- ⚠ No delivery table is reachable from any customer read except via the serviceability boolean and the
  captured quote; distance/ring/shop identity never enter a shopper DTO.
- Commit after each task or logical group. Operator steps (T012, T057) are the operator's and gate live SC
  sign-off.
- ⚠ **Deferred parity**: product-weight *entry* is built for shop-web only (T049); **shop-mobile** weight
  entry is a deferred parity item (shop-web ↔ shop-mobile parity, 014) — recorded here, not built in this
  slice. The quote consumes weight regardless of which surface set it.
