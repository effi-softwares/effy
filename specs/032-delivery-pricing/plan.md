# Implementation Plan: Delivery Pricing & Same-Day Coverage

**Branch**: `032-delivery-pricing` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/032-delivery-pricing/spec.md`

---

## Summary

Replace the rate-grid's per-zone-pair fee with **rules the platform evaluates** — a fee derived from
straight-line distance and package weight, banded and rounded upward — and replace zone-membership
same-day with a **shop declaration that an admin approves**, shown the actual distance.

Three surfaces gain work (`back-office`, `shop-web`, `core-api`) and one gains nothing by design
(customer). The customer-visible change is that a quote becomes *correct*, not that it looks different.

⚠ **Two prerequisites are not delivery work and must be sequenced first** (see § Prerequisites). The
slice cannot be fed without them, and neither is discovered late without stalling.

---

## ⚠ Prerequisites — build these before any pricing code

The requirements checklist called these out; the plan states them as **Phase 2 (Foundational)**, not as
incidental work inside a user story.

### P1 — Every place gets a coordinate (FR-035)

`LOCALITY_POINT_psv.psv` in the G-NAF download 030 already used ships `LATITUDE`/`LONGITUDE` per
locality; 030's derivation read three columns and discarded the rest. Work: extend
`db/reference/derive-localities.mjs`, add two columns to `public.locality`, extend
`localityload` + `cmd/load-localities`, and **compute a per-postcode centroid** (R1b).

Cost: one migration, one derivation change, one loader change. ⚠ **It requires the 1.7 GB dataset to be
re-downloaded and the loader re-run** — an operator step, not a code step.

### P2 — Every product gets a weight (FR-036/FR-037)

⚠ **The largest hidden cost in the slice, and it is catalog work.** `net_weight` is an
`attribute_definition` (unit 'g') required only for `packaged_grocery`; **14 of 38 live products have
one**. Work: a `weight_grams` column on `public.product` with a **non-zero default** and a
**`weight_is_assumed` flag** (R2a), a backfill from the existing attribute where present, and the
shop-console product form exposing it.

⚠ **The flag is what makes the gap visible.** Without it "500 g" means both *"we weighed it"* and
*"nobody has said"*, and the 24 unweighed products vanish into the data.

---

## Technical Context

**Language/Version**: Go 1.25 (hot path — the constitution's locked version, matching
`apis/core-api/go.mod`), Node 22 + TypeScript 5 (cold path), React 19 + TS (back-office, shop-web). No
Kotlin — mobile is not touched.

**Primary Dependencies**: existing only — Gin + pgx/v5; Serverless Framework v3 + `@effy/edge-shared`;
TanStack Query/Router + `@effy/design-system/ui` + `@effy/web-kit/console`. ⚠ **No new dependency in
any package.** Great-circle distance is ~15 lines of `math`; a routing provider is rejected (R1).

**Storage**: PostgreSQL 16, raw SQL, Goose forward-only. One migration.

**Testing**: `go test` (the pricing core is pure — R6), Vitest (both cold-path services + both consoles),
Playwright not required (no customer-web change).

**Target Platform**: Fargate ARM64 (hot), Lambda (cold), Amplify Hosting (consoles).

**Project Type**: full-stack vertical slice across two backends and two web consoles.

**Performance Goals**: quoting adds **no additional serial latency** — the four new read shapes
(centroids, rules, bands, approvals) are issued in the **same wave** as the reads already made, not
after them. ⚠ Not "zero additional round trips": there are four more, and claiming otherwise would hide
the thing that has to be got right. 029 measured **135 ms** per Sydney RDS round trip and 8 serial
queries at 1.08 s — enough to 503 the storefront. A naive "one query per package" here would be worse,
because this is the money path.

**Constraints**:
- ⚠ **Hidden fulfilment (FR-033/FR-034)** — no distance, at any granularity, in any customer response.
- ⚠ **A quoted order keeps its fee (FR-010)** — already true via `order_package_delivery.delivery_fee_amount`; must be **proved**, not assumed (R8).
- **No new hue, no new token** — the consoles use existing primitives (Principle V).
- Cold path has no metrics emission (R9, 031 carry-forward).

**Scale/Scope**: ~15,414 localities → ~2,600 distinct postcodes with centroids; 38 products; 2 shops;
3 delivery methods. Small data — the design is for correctness, not throughput.

---

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 — see § Post-Design Re-check.*

| Principle | Verdict | How |
|---|---|---|
| **I. Spec-Driven** | ✅ | Spec first, 43 FRs, checklist PASS (re-validated after `/speckit-analyze` added four). ⚠ Corrections found in build go **back to the spec**, as 028 did for FR-024 — and as FR-030a/033a/036a/037a did here. |
| **II. Shared Contracts** | ✅ | Distance/pricing types in `@effy/shared-types`; the locality search **reuses 031's** `edge-api/admin/src/delivery/localities.ts` rather than a second copy for shop-web — see § Structure. |
| **III. Dual-Path** | ✅ | Admin + shop CRUD → cold. Quoting → hot. Exactly the split `promo_code` and `delivery_offering` already have (R6). |
| **IV. Auth Isolation** | ✅ | Shop routes on the shop pool + `shop_manager` gate; admin routes on the admin pool + `admin`/`manager`. ⚠ **FR-021 (no self-approval) is structural** — the approve route exists only on the admin service, so a shop token cannot reach it. |
| **V. Design** | ✅ | Sectioned pages, tables, detail rows. ⚠ **No cards** — the approval queue is a **table**, not a stack of cards, and that is the shape it wants anyway. |
| **VI. Layered** | ✅ | Pure `platform/delivery` for arithmetic; service → repo in both cold services; no DI framework. |
| **VII. Observability** | ⚠ **exception** | Hot-path metrics + alerts yes. ⚠ **Cold path emits none** — an inherited platform gap. **Recorded in § Complexity Tracking**, because an undocumented deviation is a defect by the Quality Gates. |

**Alerts** (Principle VII requires a plan adding a user-facing flow to name them, not only metrics):

- **Quote failure rate** on `core-api` — ⚠ this is the money path; a pricing bug that refuses to quote
  is indistinguishable from an outage to a shopper mid-checkout.
- **Cap-hit rate** above a threshold — the signal that the bands are wrong rather than that one order
  was unusual. ⚠ It has no natural alarm value yet; it is set after the first week of real quotes
  rather than guessed now.
- **No alert on same-day offer volume.** It legitimately drops to zero when no approval is in force,
  which is the feature working, and an alarm that fires on correct behaviour gets muted.

**One exception, recorded below.**

---

## Project Structure

### Documentation (this feature)

```text
specs/032-delivery-pricing/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R9
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
├── checklists/
│   └── requirements.md  # from /speckit-specify — PASS
└── tasks.md             # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
db/
├── migrations/
│   └── <ts>_delivery_pricing.sql        # NEW — one migration, everything below
└── reference/
    └── derive-localities.mjs            # P1: emit LATITUDE/LONGITUDE

apis/core-api/                            # HOT — quoting only
├── internal/platform/delivery/
│   ├── distance.go        [NEW]          # great-circle; pure
│   ├── pricing.go         [NEW]          # bands → fee → round up → cap; pure
│   ├── pricing_test.go    [NEW]          # ⚠ the band-gap cases (FR-011) live here
│   └── delivery.go        [EDIT]         # Options() consults approvals, not zone rows
├── internal/features/checkout/
│   ├── delivery_store.go  [EDIT]         # + coordinates, + rules, + approvals, + weights
│   ├── quote.go           [EDIT]         # ⚠ where Service.Quote assembles a quote — the real seam
│   └── service.go         [EDIT]         # package weight sum; intent-time capture unchanged
└── internal/platform/localityload/       # P1: parse the two new columns

apis/edge-api/admin/src/delivery/
├── pricing.ts             [NEW]          # rules CRUD (FR-001..FR-007, FR-013)
├── approvals.ts           [NEW]          # queue · approve · decline · revoke (FR-022..FR-027)
└── localities.ts          [EDIT]         # 031's search, reused

apis/edge-api/shop/src/delivery/
└── declarations.ts        [NEW]          # a shop's own declaration (FR-014..FR-020)
                                          # ⚠ NO pricing route exists here — FR-008 structurally

apps/back-office/src/features/delivery/
├── PricingRulesScreen.tsx [NEW]          # bands as a table
└── ApprovalQueueScreen.tsx[NEW]          # ⚠ distance per requested area (FR-023)

apps/shop-web/src/features/delivery/      # NEW feature dir on this surface
└── SameDayScreen.tsx      [NEW]          # declare · status · decline reason

packages/web-kit/src/console/
└── PostcodeCoverageNotice.tsx [MOVED]    # ⚠ promoted from back-office; BOTH consoles consume it

packages/shared-types/src/
└── delivery-pricing.ts    [NEW]          # rule + declaration DTOs
```

**Structure Decision**: the existing slice shape, unchanged. The only structural novelty is
`apps/shop-web/src/features/delivery/` — the shop console's fifth feature (auth, catalog, fulfillment,
shop-identity are the four).

⚠ **The locality picker is a duplication risk on BOTH layers, and Principle II forbids copying either.**
031 built operator locality search in `edge-api/admin` and a `PostcodeCoverageNotice` disclosure
component in `back-office`; shop-web needs both.

- **The query** → promoted to `@effy/edge-shared`, called by both services. Copying it would create two
  definitions of "a real place".
- **The disclosure component** → promoted to `@effy/web-kit/console`, consumed by both consoles. ⚠ An
  earlier draft of this plan promoted the query and left the component to be re-created under
  `apps/shop-web/`, which is precisely the copy-paste Principle II names. It is also the *worse* of the
  two to duplicate: the disclosure is a **correctness** surface — it is what stops an operator
  committing to twenty localities believing they chose one — so two copies means two places for that
  warning to silently diverge or go stale.

Both extractions are proved the way 028 proved the presign move: **the origin surface's existing tests
must pass unmodified** afterwards.

---

## Key design decisions carried from research

| # | Decision | Why it matters here |
|---|---|---|
| R1 | Coordinates from G-NAF, great-circle distance | ⚠ 031's R6 claimed no distance capability was available. It was on disk. |
| R1b | A postcode's distance is its localities' **centroid** | ⚠ Wrong for 0872 (three states). FR-039 requires the basis be stated, not hidden. |
| R2 | Weight is a **product column**, not an attribute | 63% coverage today; an EAV read would silently price 24 products as weightless. |
| R3 | Eligibility per **shop**; price per **platform** | ⚠ `delivery_offering` is keyed on origin *zone* and structurally cannot hold a per-shop decision. |
| R4 | Approved and proposed are **separate rows** | ⚠ Overwriting on edit silently revokes a live approval (FR-018). |
| R5 | `base + distanceBand + weightBand`, round **up**, then cap | Every input has a defined answer; a gap is never free delivery. |
| R6 | Arithmetic lives in pure `platform/delivery` | The hot path is the risk in this slice; keep the risky part testable without a DB. |
| R3a | The rules price **all three** methods; `delivery_offering.price_amount` is **dropped** | ⚠ Keeping it would leave standard delivery with two live fee sources — the defect class this feature removes, reintroduced by the feature removing it. |
| R8 | Existing checkout/storefront suites are the regression guard, ⚠ **minus a named delta** | The same-day *eligibility* assertions encode the rule FR-029 deletes and must change. A guard stated as "nothing may change" is unsatisfiable, and unsatisfiable guards get ignored wholesale. |

---

## What this feature deliberately does not do

- **No customer-web or mobile change.** The quote's *shape* is unchanged; only its values are correct.
  ⚠ This is what keeps the slice finishable.
- **No new delivery method.** Same-day / scheduled / standard remain the set.
- **No change to zone composition.** 031 owns it and it stands.
- **`delivery_offering` is not deleted** — it still holds the window, the lead time and whether a leg is
  offered at all. ⚠ But its **same-day rows** and its **`price_amount` / `same_day_cutoff` columns are
  removed**: all three methods are priced by the rules now (R3a), and leaving the fee column would give
  standard delivery two live sources with nothing choosing between them. That in turn means 031's
  read-only rate grid must be **relabelled to service windows or removed** — a screen called "Rates"
  that shows none is worse than no screen.

---

## Risks carried into implementation

1. ⚠ **P2 (product weight) can eat the slice.** It touches the catalog schema, the shop product form,
   and 24 rows of live data. If it slips, US1 cannot be verified. **Mitigation**: it is Phase 2, before
   any pricing code, and its acceptance is SC-012.
2. ⚠ **The hot path gains real logic.** Checkout is the money path. **Mitigation**: all arithmetic in a
   pure package with exhaustive band-boundary tests; existing suites pass unmodified **outside R8's
   named delta**.
3. ⚠ **The approval workflow is the platform's first.** No prior art to copy. **Mitigation**: two rows
   (in-force + proposed) rather than a status column — the failure mode is otherwise silent.
4. ⚠ **P1 needs a 1.7 GB re-download and a loader run** — an operator step. **Mitigation**: sequence it
   first and state it in quickstart as a gate, not a step.
5. ⚠ **SC-009 is an observer test** (5 admins state a distance correctly). Like 031's, it must be
   recorded as an operator walk and never marked complete on reasoning. **Mitigation**: how the five
   observers are sourced is recorded *before* the walk — 031 left that open and the walk stalled.
6. ⚠ **The cutover has an ordering trap.** Deleting the old same-day rows is a one-line change that
   looks like it belongs with the rest of the schema work — and doing it there withdraws same-day from
   **every shopper** for three phases while every test still passes. **Mitigation**: it is a **second
   migration** in Phase 6, after the replacement predicate exists, and both the migration comment and
   the task say why.

---

## Post-Design Re-check (after Phase 1)

Re-evaluated against the constitution once `data-model.md` and `contracts/` existed:

- **II** — ✅ improved, then ⚠ **corrected**: the locality *query* goes to `@effy/edge-shared` **and**
  the disclosure *component* to `@effy/web-kit/console`. The first draft promoted only the query and
  would have shipped a second `PostcodeCoverageNotice` — a copy of the exact surface whose job is to
  stop an operator misunderstanding what they chose.
- **III** — ✅ holds: no admin/shop CRUD leaked onto the hot path; no quoting leaked onto the cold path.
- **IV** — ✅ **strengthened**: FR-021 is enforced by route topology, not by a check that could be
  forgotten.
- **V** — ✅ the approval queue is a table; no card, no new colour.
- **VII** — ⚠ **exception recorded** in § Complexity Tracking, with alerts named for the hot path.

**No new violations. One recorded exception.**

---

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Principle VII — the cold-path halves of this feature (pricing CRUD, declarations, approvals) emit no metrics** | ⚠ **No cold-path service on this platform emits one.** There is no Lambda→Prometheus path, no CloudWatch→Grafana wiring for these functions, and no existing counter to add to. Building that path is infrastructure work of its own size, and doing it inside a pricing slice would mean an unrelated, unreviewed change to how every one of 59 Lambda functions reports. | **"Just add a counter"** — there is nothing to add it *to*. **"Log and scrape"** — that is the missing path, built badly and per-feature. The gap is **inherited from 031 and re-recorded here rather than quietly dropped**; the compensating control is that both cold-path halves are admin/operator surfaces where the reads themselves answer "what is configured", and every decision is in `admin.audit_log`. ⚠ It is a **carry-forward with an owner**, not an accepted permanent state. |

⚠ **This table was empty in an earlier draft while the Constitution Check said "⚠ partial"** — which is
itself the defect the Quality Gates describe: *"an undocumented deviation is a defect."* A principle is
either met or excepted in writing; "partial" is not a third option.
