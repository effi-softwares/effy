---
description: "Task list for 032-delivery-pricing"
---

# Tasks: Delivery Pricing & Same-Day Coverage

**Input**: Design documents from `/specs/032-delivery-pricing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/delivery-pricing.contract.md),
[quickstart.md](quickstart.md)

**Tests**: Included. This slice changes the **money path** in `core-api`, so the pricing core is
built test-first — R6 put the arithmetic in a pure package precisely so it could be.

**Organization**: by user story, so each is independently shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: US1 · US2 · US3 · US4

---

## ⚠ Read this before starting

**Phase 2 is not setup — it is two prerequisites that are not delivery work**, and either can consume
the slice on its own. They are first because nothing downstream can be *verified* without them: US1
cannot be tested without weights, and US3 cannot be tested without coordinates.

**Four shapes must not be quietly simplified during implementation:**

1. ⚠ **Approved and pending are separate rows.** A status column on one row cannot hold both, and
   collapsing them means a shop editing its cutoff silently revokes its own live approval (FR-018).
2. ⚠ **A missing input is never zero.** No centroid → furthest band. No band match → last band. No real
   weight → the stated assumption. Every one of these is a test, not a comment (FR-011/FR-037/FR-038).
3. ⚠ **Distance never reaches a customer.** Computed, used, discarded (FR-034).
4. ⚠ **The old same-day rows are removed LAST, not first.** T094 is deliberately in Phase 6, after its
   replacement exists — see the note there.

---

## Phase 1: Setup

**Purpose**: the shared surfaces this feature writes into, before anything writes into them.

- [X] T001 [P] Add `DeliveryPricingRuleDTO`, `DeliveryPriceBandDTO`, `SamedayDeclarationDTO`, `SamedayAreaDTO`, `DeclarationDecisionDTO` to `packages/shared-types/src/delivery-pricing.ts`, money as decimal strings per contracts §E
- [X] T002 [P] Export the new module from `packages/shared-types/src/index.ts`, and add a one-line header comment to both `delivery.ts` (021) and `delivery-pricing.ts` (032) naming their owning spec — two `delivery*` modules otherwise invite guessing about which holds what
- [X] T003 ⚠ Confirm **no Kotlin generation is wired** for these DTOs and record why in a comment in `packages/shared-types/src/delivery-pricing.ts` — no mobile surface consumes this feature, so their absence from `CustomerCommerceContract` is **correct**, not the 030 defect. A later reader must not "fix" it
- [X] T004 [P] Create the feature directory `apps/shop-web/src/features/delivery/` with a `README.md` naming it the shop console's fifth feature and pointing at this spec

---

## Phase 2: Foundational — ⚠ the two prerequisites (BLOCKING)

**Purpose**: give the platform a coordinate for every postcode and a weight for every product. **No user
story can be verified until both are done.**

### P1 — every postcode gets a location (FR-035)

- [X] T005 Extend `db/reference/derive-localities.mjs` to read `{ST}_LOCALITY_POINT_psv.psv` and join `LATITUDE`/`LONGITUDE` onto each locality by `LOCALITY_PID`
- [X] T006 ⚠ Use an anchored file pattern `^[A-Z]{2,3}_LOCALITY_POINT_psv\.psv$` in `db/reference/derive-localities.mjs` — 030's loose pattern also matched `{ST}_STREET_LOCALITY_psv.psv` and would have loaded street names as suburbs. Add a unit test for the pattern
- [X] T007 [P] Extend the CSV header + row shape in `db/reference/derive-localities.mjs` to emit `locality,state,postcode,latitude,longitude` — ⚠ **keep `locality` as the first column name**; renaming it to `name` would silently break the `localityload` parser for a cosmetic gain
- [X] T008 Extend `apis/core-api/internal/platform/localityload/localityload.go` to parse the two new columns — ⚠ **reject a malformed coordinate, never coerce it to 0.0**; an out-of-range lat/long is a parse error
- [X] T009 [P] Add `localityload` unit tests in `apis/core-api/internal/platform/localityload/localityload_test.go` for: empty coordinate → nil, malformed → error, out-of-AU-range → error
- [X] T010 Extend `apis/core-api/cmd/load-localities/main.go` to write `latitude`/`longitude`, and to compute and upsert `public.postcode_centroid` (mean of that postcode's localities that have a point) **in the same transaction**
- [X] T011 ⚠ Add a refusal to `apis/core-api/cmd/load-localities/main.go`: do not commit if `postcode_centroid` would be empty, mirroring 030's `08%` guard. A loader that silently writes nothing is how the whole slice ships broken

### P2 — every product gets a weight (FR-036/FR-036a/FR-037a)

- [ ] T012 **OPERATOR** ⚠ Before writing the migration, run `SELECT count(*) FROM public.product_attribute_value v JOIN public.attribute_definition d ON d.id=v.attribute_definition_id WHERE d.key='net_weight' AND v.value_number > 0;` against dev and **record the number in the migration comment**. The expected backfill count must be a fact, not an estimate

### The migration

- [X] T013 Create `db/migrations/<ts>_delivery_pricing.sql` (via `make db-new NAME=delivery_pricing`) with `ALTER TABLE public.locality ADD latitude/longitude numeric(9,6)` and `CREATE TABLE public.postcode_centroid` per data-model.md §1, with `COMMENT ON` for every object
- [X] T014 In the same migration add `public.product.weight_grams int NOT NULL DEFAULT 500 CHECK (weight_grams > 0)` and `weight_is_assumed boolean NOT NULL DEFAULT true` — ⚠ `> 0`, not `>= 0`: a zero-weight product is free-delivery-by-arithmetic
- [X] T015 In the same migration, backfill real weights from `product_attribute_value.value_number` joined on `attribute_definition.key = 'net_weight'` — ⚠ **`value_number` and `key`**, not `value_numeric`/`code`; either wrong name produces a migration that runs clean and updates nothing
- [X] T016 In the same migration add `public.delivery_pricing_rule` and `public.delivery_price_band` per data-model.md §3, including `UNIQUE (method)`, the band `UNIQUE (rule_id, dimension, upper_bound)`, and the `delivery_pricing_rule_cap_rounded_ck` CHECK
- [X] T017 In the same migration add `public.shop_sameday_declaration` and `public.shop_sameday_area` per data-model.md §4, including **both partial unique indexes**, the `shop_sameday_decided_ck` and `shop_sameday_cutoff_ck` CHECKs, and `superseded` in the status CHECK
- [X] T018 ⚠ **Do NOT delete the `delivery_offering` same-day rows or drop `price_amount` here.** Add a comment in `db/migrations/<ts>_delivery_pricing.sql` recording that the removal is deliberately deferred to T094 (Phase 6), **after** the replacement predicate exists — removing it now would leave same-day offered to nobody for the whole of US1, US2 and US3

### Making a real weight recordable (FR-036a)

- [X] T019 Add `weightGrams` to the product write path in `apis/edge-api/shop/src/products/service.ts` and `repository.ts` — ⚠ supplying a weight MUST set `weight_is_assumed = false`; the flag is derived from the act of recording, never sent by the client
- [X] T020 [P] Add the weight field to the shop product form in `apps/shop-web/src/features/catalog/` (the create/edit path), showing ⚠ **"assumed" vs "measured"** so an operator can see which products still need attention (FR-037a)
- [X] T021 [P] Add tests in `apis/edge-api/shop/src/products/service.test.ts` covering: weight supplied → `weight_is_assumed=false`; weight omitted on create → default + assumed; ⚠ a client-sent `weightIsAssumed` is **ignored**

### Applying it

- [ ] T022 **OPERATOR**: `make db-up ENV=dev`, then verify quickstart §1 — `SELECT weight_is_assumed, count(*) FROM public.product GROUP BY 1` must match T012's recorded number. ⚠ `false | 0` means the backfill matched nothing; `false | 38` means it did not filter
- [ ] T023 **OPERATOR**: re-download G-NAF, run `make derive-localities GNAF=/path/to/G-NAF`, confirm the row count (⚠ `wc -l db/reference/au-localities.csv` reads **15,415** — 15,414 rows plus the header), then `make load-localities ENV=dev`; verify quickstart §0 — zero delivered-to postcodes without a centroid (SC-013)

**Checkpoint**: both gates green. User stories may now begin.

---

## Phase 3: US1 — the platform decides what delivery costs (P1) 🎯 MVP

**Goal**: an admin defines pricing as rules; quotes reflect distance and weight, rounded upward.

**Independent test**: define one rule set, then confirm two shoppers at different distances with
different basket weights are quoted different, sensible, rounded fees.

### The pure core — tests first (R6)

- [X] T024 [P] [US1] Write `apis/core-api/internal/platform/delivery/distance_test.go` — great-circle against known AU pairs, including ⚠ **Ballarat(3350)↔Bendigo(3550) ≈ 98 km** and Melbourne↔Ballarat ≈ 107 km, the numbers SC-008 turns on
- [X] T025 [US1] Implement `apis/core-api/internal/platform/delivery/distance.go` — haversine over `float64`, no dependency, returning `(km float64, known bool)`; ⚠ **`known=false` when either point is absent — never `0.0`**
- [X] T026 [P] [US1] Write `apis/core-api/internal/platform/delivery/pricing_test.go` covering every total-function case in contracts §D: distance past the last band, weight past the last band, **no centroid → furthest band**, assumed weight priced, disabled rule not offered, cap applied. ⚠ Include the **exact band-boundary values** (a value equal to an `upperBound` takes that band)
- [X] T027 [US1] Implement `apis/core-api/internal/platform/delivery/pricing.go` — `base + band(distance) + band(weight)`, `roundUp` to the step, then `min(cap, …)`; pure, no DB, no HTTP
- [X] T028 [US1] ⚠ Add a `pricing_test.go` case proving `roundUp` is **upward, never nearest** — `7.01 → 7.50` at a `0.50` step, and never `7.00` (FR-005)
- [X] T029 [US1] ⚠ Add a `pricing_test.go` case proving a **capped** fee is still a multiple of the step (SC-003) — the cap binds only on the most expensive orders, where an unrounded figure is least likely to be spotted

### Cold path — admin pricing CRUD

- [X] T030 [P] [US1] Add pricing types to `apis/edge-api/admin/src/delivery/types.ts`
- [X] T031 [US1] Implement `apis/edge-api/admin/src/delivery/pricing-repository.ts` — read all rules+bands; replace one rule's whole band set in **one transaction**
- [X] T032 [US1] Implement `apis/edge-api/admin/src/delivery/pricing.ts` service with the **six** distinguishable refusals from contracts §A: `bands_required`, `duplicate_band`, `invalid_rounding`, `cap_below_floor`, `cap_not_rounded`, unknown method → 404
- [X] T033 [US1] ⚠ Add `apis/edge-api/admin/src/delivery/pricing.test.ts` asserting `cap_below_floor` against the **corrected** predicate — `maxAmount < base + smallest distance band + smallest weight band`. Testing it against *largest* bands would refuse every cap that could ever bind, which is exactly what FR-012 exists to allow
- [X] T034 [P] [US1] Create `apis/edge-api/admin/src/functions/delivery-pricing-list-v1-get.ts`
- [X] T035 [P] [US1] Create `apis/edge-api/admin/src/functions/delivery-pricing-update-v1-put.ts`
- [X] T036 [US1] Register both routes in `apis/edge-api/admin/serverless.yml` under a `# ── 032-delivery-pricing ──` banner, on the admin authorizer, paths `/admin/v1/delivery-pricing` and `/admin/v1/delivery-pricing/{method}`
- [X] T037 [US1] Write every accepted pricing change to `admin.audit_log` with the actor in `apis/edge-api/admin/src/delivery/pricing.ts` (FR-013/SC-014)

### Hot path — quoting consumes the rules

- [X] T038 [US1] Extend `apis/core-api/internal/features/checkout/delivery_store.go` to read `postcode_centroid` for the destination and for every shop in the cart, plus all `delivery_pricing_rule` + `delivery_price_band` rows
- [X] T039 [US1] ⚠ Issue those reads **in the same wave** as the existing ones, not after them, in `apis/core-api/internal/features/checkout/delivery_store.go` — 029 measured 8 serial queries at 1.08 s against Sydney RDS and 503'd the storefront; the same mistake in checkout is worse. Run `go test -race`
- [X] T040 [US1] In `apis/core-api/internal/features/checkout/quote.go` (⚠ **where `Service.Quote` assembles the quote** — not `service.go`), sum each package's weight from its cart lines × `product.weight_grams` and pass it, with that package's own distance, into `delivery.Price` — **per package, not per order** (FR-009)
- [X] T041 [US1] ⚠ Add an `apis/core-api/internal/features/checkout/service_test.go` case pinning **FR-010**: an order quoted, the rules then changed, the order still fulfilled at `order_package_delivery.delivery_fee_amount`. This holds today with no new code — the test is the only thing that keeps it holding
- [X] T042 [US1] ⚠ Add a serialisation assertion in `apis/core-api/internal/features/checkout/service_test.go` that the quote's **marshalled JSON** contains no distance, shop id, postcode or weight (SC-005). Asserting on the struct is not the check — 021 shipped a defect in the mirror direction

### Back-office console

- [X] T043 [P] [US1] Add pricing queries/mutations to `apps/back-office/src/features/delivery/queries.ts` and repo calls to `apps/back-office/src/features/delivery/repo.ts`
- [X] T044 [US1] Build `apps/back-office/src/features/delivery/PricingRulesScreen.tsx` — bands as a **table**, one section per method. ⚠ No cards, no new colour (Principle V)
- [X] T045 [US1] Add refusal copy for the six pricing refusals to `apps/back-office/src/features/delivery/errorText.ts` — each must say what to change, not "invalid"
- [X] T046 [US1] ⚠ Warn in `PricingRulesScreen.tsx` when a distance band is narrow enough to resolve to a single shop — **band width is a privacy parameter, not only a pricing one** (FR-033a). An admin narrowing bands is weakening hidden fulfilment and will not know unless told
- [X] T047 [P] [US1] Add `apps/back-office/src/features/delivery/PricingRulesScreen.test.tsx` covering the cap refusals and the narrow-band warning
- [X] T048 [US1] Wire the screen into `apps/back-office/src/routes/delivery.tsx`

**Checkpoint**: US1 is independently shippable — better pricing on delivery the platform already
offers, with no shop involvement. ⚠ Same-day still runs on the old rows until Phase 6.

---

## Phase 4: US2 — a shop says where it can deliver today (P1)

**Goal**: a shop declares same-day coverage; ⚠ **it changes nothing for any shopper.**

**Independent test**: a shop declares coverage; confirm no shopper's options change.

### Principle II — two extractions, not two copies

- [X] T049 [US2] ⚠ Promote 031's locality search query from `apis/edge-api/admin/src/delivery/localities.ts` into `apis/edge-api/shared/src/lib/localities.ts` (the `@effy/edge-shared` package) so both services share one definition of "a real place" — the move 028 made with the S3 presign helper
- [X] T050 [US2] ⚠ Re-run `apis/edge-api/admin` tests **unmodified** after T049 — if they need changing, the extraction changed behaviour. That is 028's proof-of-no-behaviour-change
- [X] T051 [US2] ⚠ Promote `PostcodeCoverageNotice` from `apps/back-office/src/features/delivery/components/` into `packages/web-kit/src/console/`, and have back-office consume it from there. **Copying it into shop-web instead would be the Principle II violation Principle II names** — and it is the worse component to duplicate, because it is a *correctness* surface: it is what stops an operator committing to twenty localities believing they chose one
- [X] T052 [US2] ⚠ Re-run `apps/back-office` tests **unmodified** after T051 — same proof as T050

### Cold path — the declaration

- [X] T053 [P] [US2] Add declaration types to `apis/edge-api/shop/src/delivery/types.ts`
- [X] T054 [US2] Implement `apis/edge-api/shop/src/delivery/repository.ts` — read in-force + pending + last decision; insert a new pending version, replacing any existing pending row, ⚠ **leaving any approved row untouched** (FR-018)
- [X] T055 [US2] Implement `apis/edge-api/shop/src/delivery/declarations.ts` with the **six** refusals from contracts §C: `shop_location_required`, `shop_location_unmappable`, `unknown_postcode`, `areas_required`, `cutoff_required`, `areas_not_applicable`
- [X] T056 [US2] ⚠ `shop_location_unmappable` is its own refusal, not a variant of `shop_location_required` — a shop *with* a postcode that has **no centroid** passes the first check and then produces `straightLineKm: null` for every area, so FR-023's whole purpose evaporates silently at approval time. This is 031's live 3001 case reaching a second surface
- [X] T057 [US2] ⚠ In `apis/edge-api/shop/src/delivery/declarations.ts`, **ignore any client-supplied `status` field outright** — FR-021. A shop must not be able to approve itself even by sending the word
- [X] T058 [US2] Gate the write path on `shop_manager` at an **active** shop in `apis/edge-api/shop/src/delivery/authz.ts`, reusing 007's gate; `shop_staff` may read
- [X] T059 [P] [US2] Add `apis/edge-api/shop/src/delivery/declarations.test.ts` covering all six refusals **as distinguishable codes**, plus the FR-018 case: submitting a change leaves the approved row in force
- [X] T060 [P] [US2] Create `apis/edge-api/shop/src/functions/delivery-sameday-v1-get.ts`
- [X] T061 [P] [US2] Create `apis/edge-api/shop/src/functions/delivery-sameday-v1-put.ts`
- [X] T062 [P] [US2] Create `apis/edge-api/shop/src/functions/delivery-localities-v1-get.ts` calling the shared query from T049
- [X] T063 [US2] Register the three routes in `apis/edge-api/shop/serverless.yml` under a `# ── 032-delivery-pricing ──` banner. ⚠ **Add no pricing route** — FR-008/SC-004 are satisfied by the absence, and the banner comment must say so

### Shop console

- [X] T064 [P] [US2] Add queries/repo in `apps/shop-web/src/features/delivery/queries.ts` and `apps/shop-web/src/features/delivery/repo.ts`
- [X] T065 [US2] Build `apps/shop-web/src/features/delivery/SameDayScreen.tsx` — the toggle, the cutoff, the area picker, and **both** `inForce` and `pending` shown as distinct facts (FR-018/FR-019)
- [X] T066 [US2] Consume the **shared** `PostcodeCoverageNotice` from `@effy/web-kit/console` in the area picker — choosing "Alfredton" commits the shop to **all 20** Ballarat localities, and it must say so **before** confirming
- [X] T067 [US2] ⚠ Wire the disclosure to **real data**, not a placeholder — 031 shipped two disclosures hardcoded to `siblingCount={0}` and `shops={[]}` so neither would ever have rendered. Add a test that fails when the count is zero-by-construction
- [X] T068 [US2] Render **both** location refusal states with their reasons in `SameDayScreen.tsx` (no postcode; postcode with no centroid) so a shop is told **before** filling in a form (FR-020)
- [X] T069 [P] [US2] Add `apps/shop-web/src/features/delivery/SameDayScreen.test.tsx` covering: pending + in-force shown together, the disclosure rendering a non-zero count, and both no-location states
- [X] T070 [US2] Add the route `apps/shop-web/src/routes/delivery.tsx` and the nav entry in `apps/shop-web/src/components/layout/nav.ts`

**Checkpoint**: US2 is shippable alone — a proposal that changes nothing is safe by construction.

---

## Phase 5: US3 — an admin approves what a shop proposed (P2)

**Goal**: an admin decides, **shown the actual distance**.

**Independent test**: approve one declaration and decline another; the approved shop's shoppers gain
same-day and the declined shop's do not.

- [X] T071 [P] [US3] Add approval types to `apis/edge-api/admin/src/delivery/types.ts`
- [X] T072 [US3] Implement `apis/edge-api/admin/src/delivery/approvals-repository.ts` — the queue, and one declaration joined to `postcode_centroid` for **both** shop and each requested area
- [X] T073 [US3] Compute `straightLineKm` per requested area in `apis/edge-api/admin/src/delivery/approvals.ts` — ⚠ **`null` when either point is missing, never `0`**, and carry `localityCount` beside it so a 41-locality centroid (0872) is visible as nonsense
- [X] T074 [US3] ⚠ Implement approve as **two writes in one transaction** in `apis/edge-api/admin/src/delivery/approvals-repository.ts`: the in-force row → **`superseded`** (not `revoked`) **first**, then the pending row → `approved` with **`supersedes_id`** set. The partial unique index is non-deferrable — this is 022's `23505` lesson, and the order is load-bearing
- [X] T075 [US3] ⚠ Keep `revoked` and `superseded` distinct in `apis/edge-api/admin/src/delivery/approvals.ts` — an admin withdrawing service and a shop's own update going live both end an approval, but a shop reading its history must be able to tell them apart. `revoked` requires a note; `superseded` has no human to explain it
- [X] T076 [US3] Implement decline (reason required → `422 reason_required`) and revoke (`409 not_in_force`) in `apis/edge-api/admin/src/delivery/approvals.ts`
- [X] T077 [US3] Write every decision to `admin.audit_log` and set `decided_by`/`decided_at` in the same transaction (FR-026/SC-014)
- [X] T078 [P] [US3] Add `apis/edge-api/admin/src/delivery/approvals.test.ts`: `409 not_pending`, `422 reason_required`, `409 not_in_force`, ⚠ **the supersede ordering** (approving with one in force leaves exactly one approved row), and ⚠ **that the superseded row reads `superseded`, not `revoked`**
- [X] T079 [P] [US3] Create `apis/edge-api/admin/src/functions/delivery-declarations-list-v1-get.ts`
- [X] T080 [P] [US3] Create `apis/edge-api/admin/src/functions/delivery-declaration-get-v1-get.ts`
- [X] T081 [P] [US3] Create `apis/edge-api/admin/src/functions/delivery-declaration-approve-v1-post.ts`
- [X] T082 [P] [US3] Create `apis/edge-api/admin/src/functions/delivery-declaration-decline-v1-post.ts`
- [X] T083 [P] [US3] Create `apis/edge-api/admin/src/functions/delivery-declaration-revoke-v1-post.ts`
- [X] T084 [US3] Register the five routes in `apis/edge-api/admin/serverless.yml` at `/admin/v1/delivery-declarations…`
- [X] T085 [US3] Build `apps/back-office/src/features/delivery/ApprovalQueueScreen.tsx` — a **table**, columns shop · areas · furthest distance · submitted. ⚠ No cards
- [X] T086 [US3] Build the detail view showing **every requested area with its distance**, labelled ⚠ **"straight-line"** — calling it "distance" invites an admin to read it as road distance and decide on a number 7% optimistic (FR-023)
- [X] T087 [US3] ⚠ Render a `null` distance as **"no location on record"**, never as `0` and never as an empty cell that reads as "close" (FR-038)
- [X] T088 [P] [US3] Add `apps/back-office/src/features/delivery/ApprovalQueueScreen.test.tsx` asserting the ⚠ **98 km** Ballarat/Bendigo row renders with its unit and its "straight-line" label, and that a null distance renders its own text
- [X] T089 [US3] Add the approvals route/tab to `apps/back-office/src/routes/delivery.tsx`

**Checkpoint**: US3 makes US2 safe rather than merely recorded.

---

## Phase 6: US4 — a shopper is offered what can actually be delivered (P2)

**Goal**: same-day only where an approved shop holds the goods, priced correctly.

**Independent test**: two shoppers, one inside an approved area and one outside, identical baskets.

- [X] T090 [US4] Extend `apis/core-api/internal/features/checkout/delivery_store.go` to read approved declarations + their areas for the cart's shops, in the same wave as T039
- [X] T091 [US4] ⚠ Rewrite same-day eligibility in `apis/core-api/internal/platform/delivery/delivery.go` to the **four**-term test in contracts §D — approved declaration **and** destination in its areas **and** before cutoff **and** the destination still serviced at all. **Zone membership is a precondition, never evidence for** (FR-029/FR-030a)
- [X] T092 [US4] ⚠ Evaluate the cutoff in **`Australia/Melbourne`**, not UTC and not the device clock, in `apis/core-api/internal/platform/delivery/delivery.go` — `time.Now()` on a UTC container puts the cutoff 10 or 11 hours wrong depending on daylight saving, and the error appears only in the evening and only in summer
- [X] T093 [P] [US4] Update `apis/core-api/internal/platform/delivery/delivery_test.go`: approved+in-area+before-cutoff → offered; each of the four terms negated → not offered; ⚠ **a shop sharing a zone with no approval → NOT offered**; and ⚠ an approved area later removed from every zone → NOT offered (FR-030a)
- [X] T094 [US4] ⚠ **NOW** add a second migration removing the superseded storage: `DELETE FROM public.delivery_offering WHERE method = 'same_day'` and `ALTER TABLE public.delivery_offering DROP COLUMN price_amount, DROP COLUMN same_day_cutoff`. **This lands here, not in Phase 2**, because between the deletion and T091 the old predicate has nothing to read and the new one does not exist — same-day would be offered to **nobody**. Down comment must state it is irreversible
- [X] T095 [US4] Stop reading `price_amount` and `same_day_cutoff` from `delivery_offering` in `apis/core-api/internal/features/checkout/delivery_store.go` — ⚠ **all three methods are priced by the rules now** (R3a); the grid retains only the window, the lead time and whether a leg is offered
- [X] T096 [US4] Apply eligibility per package in `apis/core-api/internal/features/checkout/quote.go` so a two-shop basket offers same-day on only the approved shop's package (FR-031/SC-011)
- [X] T097 [P] [US4] Add a two-shop fan-out test in `apis/core-api/internal/features/checkout/service_test.go` asserting same-day on exactly one package
- [X] T098 [US4] Confirm standard delivery is unaffected by any same-day decision in `apis/core-api/internal/platform/delivery/delivery.go` and pin it with a test (FR-032/SC-015)
- [X] T099 [US4] ⚠ Re-run `go test ./...` in `apis/core-api` against **R8's narrowed guard**: the same-day *eligibility* assertions in `delivery_test.go` are a **named, expected delta**; **everything else** — standard/scheduled options, ordering, labels, all of `checkout/service_test.go` bar fee values, all of `storefront` — must pass **unmodified**. Anything outside the named delta needing a change is a signal to re-read the design

**Checkpoint**: the feature is visible to a shopper — as a correct quote, not a new screen.

---

## Phase 7: Polish & cross-cutting

- [X] T100 [P] Declare the counters in `apis/core-api/internal/platform/metrics/metrics.go` and call them from `apis/core-api/internal/features/checkout/` — quote outcomes by method (`offered`/`not_offered`) and a **cap-hit counter**. ⚠ Low cardinality: no postcode, no shop id, no distance (R9)
- [ ] T101 [P] ⚠ **BLOCKED — NOT DONE.** The two alert rules are WRITTEN at `infra/observability/alerts/032-delivery-pricing.yml`, but **there is no Prometheus and no Grafana anywhere in `infra/`** — nothing scrapes `/metrics` and there is nowhere to declare an alert. Found during implementation, not planning. Provisioning the metrics stack is its own slice; the rules are committed in the format it will consume, with a README stating plainly that nothing loads them. ⚠ The cap-hit threshold is an admitted guess. See plan.md § Complexity Tracking.
- [X] T102 ⚠ Record in this file and at sign-off that the **cold path emits no metric** — no service on this platform does. It is an exception in plan.md § Complexity Tracking, not a silent gap
- [X] T103 [P] Add §032 to `docs/audiences/admin-capabilities.md` — pricing rules and the approval queue, with the known limits stated (straight-line distance, postcode centroids, 0872, the coarse-distance leak in FR-033a)
- [X] T104 [P] Add §032 to `docs/audiences/shop-capabilities.md` — the same-day declaration and product weight, ⚠ noting the **mobile column is outstanding by design** (shop-mobile gets no delivery screen in this slice)
- [X] T105 ⚠ Relabel or remove `apps/back-office/src/features/delivery/RatesScreen.tsx` — with `price_amount` dropped it lists **no rates**. It shows service windows now, and a screen called "Rates" that shows none is how the next reader concludes the feature half-landed (031 deleted its rate *editor* on exactly this principle)
- [X] T106 ⚠ Update `specs/031-delivery-areas/research.md` and `CLAUDE.md` to record that 031's R6 premise ("the platform has no routing or distance capability") **was wrong** — the data was already on disk. A future reader will otherwise repeat the reasoning that permitted same-day across 98 km
- [X] T107 [P] Update `db/reference/README.md` to note the coordinate columns and keep the CC BY 4.0 attribution intact — ⚠ attribution is a licence condition, not a courtesy
- [X] T108 Run the full machine sweep from quickstart §7: `pnpm -r typecheck` (⚠ **count the reporting packages** — 029 had green tests over a failing typecheck), `pnpm -r test`, `turbo build`, `go build/vet/test/gofmt`, `make lint`
- [X] T109 ⚠ Run `scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh` and `pnpm --filter @effy/design-system tokens:check` (**not** a root `pnpm tokens:check` — no such script exists) — all must be **unchanged**; this slice adds no token and no colour

---

## Phase 8: Operator walks (⚠ none of these may be marked complete on reasoning)

- [ ] T110 **OPERATOR**: `make db-up ENV=dev` for T094's second migration, then `make edge-deploy SERVICE=admin ENV=dev`, `make edge-deploy SERVICE=shop ENV=dev`, then `make core-run`
- [ ] T111 **OPERATOR**: quickstart §3 — set the standard rule, then verify **SC-001** (further pays more), **SC-002** (heavier pays more), **SC-003** (every fee a multiple of the step, none below the rule)
- [ ] T112 **OPERATOR**: ⚠ **SC-010** — quote an order, change the rules, complete it; it must be fulfilled at the quoted fee. This is the one a pricing change could break invisibly
- [ ] T113 **OPERATOR**: both cap refusals by `curl`, not only through the console — `cap_below_floor` and `cap_not_rounded` (quickstart §3)
- [ ] T114 **OPERATOR**: quickstart §4 — declare coverage as a `shop_manager`; ⚠ **SC-006**: with it unapproved, a shopper in that area must **not** be offered same-day, verified through checkout rather than by reading the `status` column
- [ ] T115 **OPERATOR**: ⚠ **SC-004** — call `/admin/v1/delivery-pricing` with a **shop token** and confirm `401` at the gateway. "There is no button" is not the claim
- [ ] T116 **OPERATOR**: FR-020 — clear a shop's `postcode`, confirm `422 shop_location_required`; then set it to a postcode with **no centroid** and confirm `422 shop_location_unmappable`. ⚠ Two distinct refusals, walked separately
- [ ] T117 **OPERATOR**: ⚠ **SC-008 — the case that motivated this feature.** The Bendigo shop (3550) declaring Ballarat (3350) must show **≈98 km**, labelled straight-line. Decline it; confirm the shop reads the reason
- [ ] T118 **OPERATOR**: FR-018 — with an approval in force, submit a changed declaration; ⚠ the approved one must **keep working** while the new one is pending. Then approve it and confirm the old row reads **`superseded`**, not `revoked`
- [ ] T119 **OPERATOR**: FR-025 — revoke an approval; same-day stops and the shop is told, ⚠ with wording distinguishable from a supersession
- [ ] T120 **OPERATOR**: ⚠ **SC-007** — after approving, confirm **zero** same-day offers exist for any (shop, area) pair with no approval in force. Check by quoting, in both directions
- [ ] T121 **OPERATOR**: ⚠ **SC-009 observer test** — 5 of 5 admins shown a pending declaration correctly state the furthest requested area's distance. This measures whether a person *understood* what they were shown, which is the failure this feature exists to prevent. ⚠ Record **how the five observers will be sourced** before the walk; 031 left that open and the walk stalled
- [ ] T122 **OPERATOR**: quickstart §6 — **SC-011** (same-day on exactly one package of a two-shop basket), **SC-015** (standard still offered), **SC-005** (⚠ inspect the **raw JSON**), FR-030 (past cutoff → withdrawn, ⚠ in Melbourne time), FR-030a (an area removed from every zone → no same-day)
- [ ] T123 **OPERATOR**: ⚠ **SC-012's second half** — change a product's weight from assumed to measured in the shop console and confirm it is recorded as measured. Without this the criterion is satisfied by a database default and measures nothing
- [ ] T124 **OPERATOR**: sign-off record at `specs/032-delivery-pricing/SIGNOFF.md`, listing every unwalked criterion explicitly rather than implying completeness
- [ ] T125 **OPERATOR**: commit

---

## Dependencies

```
Phase 1 (Setup)
  ↓
Phase 2 (⚠ PREREQUISITES — blocks everything)
  ├─ P1 coordinates (T005–T011) ──┐
  ├─ P2 weights (T012)  ──────────┤
  ├─ migration (T013–T018) ───────┤
  ├─ weight editing (T019–T021) ──┤
  └─ operator apply (T022–T023) ──┘
  ↓
Phase 3 US1 (P1) ──────────────────┐   MVP — shippable alone
  ↓                                │
Phase 4 US2 (P1) ─── needs T049 ───┤   shippable alone (a proposal changes nothing)
  ↓                                │
Phase 5 US3 (P2) ─── needs US2 ────┤
  ↓                                │
Phase 6 US4 (P2) ─── needs US1+US3 ┘   ⚠ T094 (the removal) lands HERE
  ↓
Phase 7 Polish → Phase 8 Operator walks
```

**Story independence:**

- **US1** needs only Phase 2. No shop involvement at all.
- **US2** needs the migration (T017) but ⚠ **not** the coordinates — FR-020's premise is
  `public.shop.postcode`, which has existed since 021. Coordinates are needed for the *approval*
  distance, which is US3. US2 could in principle start before P1 completes.
- **US3** needs US2 to have something to approve, **and** coordinates to show a distance.
- **US4** consumes US1 (fees) and US3 (approvals). It is last because it is where the harm sits: an
  offer the platform cannot honour.

---

## Parallel opportunities

| Phase | Parallel set |
|---|---|
| 1 | T001, T002, T004 |
| 2 | T007, T009; T020 ∥ T021 |
| 3 | T024 ∥ T026 ∥ T030; T034 ∥ T035; T043 ∥ T047 |
| 4 | T053 ∥ T059; T060 ∥ T061 ∥ T062; T064 ∥ T069 |
| 5 | T071 ∥ T078; T079–T083 all parallel; T088 |
| 6 | T093 ∥ T097 |
| 7 | T100, T101, T103, T104, T107 |

⚠ **T013–T018 are one file** (`db/migrations/<ts>_delivery_pricing.sql`) and are strictly sequential.
⚠ **T094 is a second migration** and must not be folded back into the first.

---

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That delivers real distance-and-weight pricing on the
delivery the platform already offers, with no shop or approval machinery. It is independently valuable
and independently verifiable.

**Then US2 alone** — a shop can declare, and nothing changes for anyone. Safe to ship on its own by
construction.

**Then US3 + US4 together.** ⚠ Shipping US3 without US4 would create approvals that decide nothing;
shipping US4 without US3 would offer same-day on unapproved declarations. They are one increment.

### ⚠ Where this slice is most likely to go wrong

1. **P2 (product weight) eats the schedule.** It is catalog work wearing delivery clothes — a column, a
   backfill, a service write path and a console form. It is first for that reason, and its acceptance is
   SC-012 **including** T123's measured-weight walk.
2. **The migration's backfill silently matches nothing** (`value_number` vs `value_numeric`,
   `key` vs `code`). T012 records the expected count precisely so T022 can catch it.
3. **Someone collapses the two declaration rows into one status column.** It looks like a
   simplification and it silently revokes live approvals.
4. **A missing coordinate becomes `0.0` somewhere.** Then the most remote postcode on the continent
   prices as the cheapest. T025 returns `(km, known)` for exactly this reason.
5. ⚠ **Someone moves T094 back into the first migration** because it "belongs with the other schema
   changes". It does not: deleting the old same-day rows before T091 exists withdraws same-day from
   every shopper for three phases, and every test would still pass.
6. **A test gets "fixed" instead of the code.** R8's guard is now narrow enough to be satisfiable —
   which means a change outside the named delta really is a signal.
