# Implementation Plan: Suburb-Aware Delivery Location

**Branch**: `030-delivery-location-suburb` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/030-delivery-location-suburb/spec.md`

## Summary

A shopper can name where they live by **suburb** instead of by postcode, on both customer surfaces; a
signed-in shopper is not asked at all; and the answer is displayed as a place rather than four digits.

Three pieces of work, in dependency order:

1. **One new reference table and one new public read.** `public.locality` holds every Australian
   `(locality, state, postcode)` triple; `GET /v1/storefront/localities?q=` on the **hot path** returns
   up to eight matches for either a name prefix or a postcode. Nothing about delivery zones changes,
   and `ServiceabilityDTO` is **not** touched — see research R4.
2. **Wiring 025's account half, three features late.** `seedFromAccount` exists on both surfaces and
   has never had a caller. It gets one on each, plus the sign-out clearing rule its
   already-present `source` field turns out to be exactly the right discriminator for.
3. **Presentation.** Mobile's centre-screen dialog becomes a **bottom sheet**; both surfaces display
   the place rather than the postcode, by one shared rule (research R11).

The interesting constraint is not any of the above. It is that the web affordance renders in the
storefront chrome on **every** public route, against a **174 KB** budget with very little headroom.
That makes "add a typeahead" a byte-budget problem before it is a UI problem, and it is why the panel
body is lazily loaded and the measurement task is sequenced early (research R7).

⚠ **How little headroom — MEASURED 2026-08-01 on this slice's actual base (`02512f2`), all six routes
green:**

```
/  172.2   /browse  170.1   /search  173.5   /product/[id]  172.3   /cart  173.8   /promotions/[id]  171.0     (KB / 174 KB)
```

**`/cart` has 0.2 KB of headroom. `/search` has 0.5 KB.** The 2.1–5.5 KB figure these artifacts were
first drafted against came from feature 026 and was ~4–10× too generous; 027 and 029 spent it, and 029
added the sixth route.

**This is not a caveat, it is the design constraint**: every byte this feature adds to the
*always-loaded* storefront chrome must fit in **0.2 KB gzipped**, which is effectively zero. Two
consequences, both already folded into the tasks:

1. The lazy panel split must be **byte-neutral or negative** — moving today's panel body behind
   `next/dynamic` should *free* bytes, not merely avoid adding them.
2. ⚠ **The seed island's design changes.** A separate always-loaded `DeliverySeedClient` module
   cannot fit; the seed becomes a **prop passed into the `DeliveryAffordance` client component that
   already ships** (T027b supersedes research R8's two-file design).

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (mobile) ·
TypeScript + React 19 / Next.js 16.2.6 (customer-web) · PostgreSQL 16 (Goose, forward-only)

**Primary Dependencies**: **none added, on any surface.** Gin + pgx/v5 already present; Material 3
`ModalBottomSheet` ships in the already-declared `material3:1.11.0-alpha07`; the web list is a
hand-rolled ARIA listbox because the guest path is contractually barred from a combobox library.

**Storage**: one new table `public.locality`; one new index pair; **no change to any existing table.**
Row data (~16–18k) loaded by an idempotent operator-run command, not by the migration (research R2).

**Testing**: `go test` (service + handler + repo shape + wire contract) · Vitest (customer-web pure
logic + display rule) · Kotlin `commonTest` (store, display rule, wire contract) · Playwright
(customer-web keyboard + refusal paths) · `pnpm size` (bundle gate) · `depcruise` (guest-path
quarantine) · a testcontainers coverage test for SC-002 (⚠ `-short`-gated, the repo's real convention)

**Target Platform**: iOS + Android (customer-mobile) · modern browsers, SSR/PPR (customer-web) ·
Fargate ARM64 in principle, **local Docker in practice** — `core-api` has no cloud deploy (research R3)

**Project Type**: mobile + web clients over an existing Go hot-path service

**Performance Goals**: suggestions within **1 s p95** on a typical mobile connection (SC-007); lookup
debounced at **200 ms** so a five-character suburb costs one request, not five; the locality query
index-served, not a sequential scan over 18k rows (research R5)

**Constraints**: customer-web guest budget **174 KB on every public route** (FR-044) — ⚠ real headroom
is an open number until T027a re-measures; **no new dependency on the guest path** (FR-045, machine-guarded); **the locality
dataset must never be shipped to a client** (FR-046); **no place data in telemetry** (FR-047); no new
design token (the palette is monochrome and closed)

**Scale/Scope**: ~18 000 reference rows; 1 new endpoint; 1 new table; 2 client surfaces; 0 new
dependencies; 0 changes to delivery zones, pricing, or checkout

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Result: **PASS**, no exceptions.*

| Principle | How this plan complies |
|---|---|
| **I — Spec-Driven** | spec → plan → tasks → implement. The one scope question (surface scope) was settled by the operator and recorded **in the spec**, not decided here. Where the plan discovered that FR-034 could be usefully *extended* (naming a locality when a postcode has exactly one), the **spec was amended** — **FR-034a/FR-034b** and US3 scenario 2a, added 2026-08-01. ⚠ An earlier draft of this row claimed the extension had been "reflected back" when it had only been written into research; the analysis pass caught it and the amendment was then actually made. Fixing the earliest affected artifact is the principle; claiming to have done so is not. |
| **II — Monorepo & Shared Contracts** | `LocalityDTO` is declared **once** in `@effy/shared-types` and generated to Kotlin. ⚠ **Declaring it in `storefront.ts` is not sufficient** — it must also be imported into and referenced from the `CustomerCommerceContract` aggregator (`customer-commerce-contract.ts`), which is what the schema generator walks. Omit that and `cm-contract-check` passes *trivially* while the Kotlin client carries a hand-written type — a green guard reporting a safety it is not providing. T022a exists for exactly that, and T023 asserts the generated file actually gained the type. The display rule (research R11) is stated once in the contract and unit-tested against the same table on both surfaces. No cross-surface copy-paste. |
| **III — Dual-Path** | **Hot path** for the locality lookup: a public, guest-reachable, latency-sensitive read that fires while the shopper types, mounted beside the serviceability read it partners. **Cold path, no new endpoint**, for the account seed: the default address is account data (011's routing law) and is read once per session from the existing `GET /customer/v1/addresses`. Justified in research R3. |
| **IV — Auth Isolation** | The locality read is **public and unauthenticated**, like every other storefront read — it discloses nothing about the caller. The seeding read reuses the existing customer-pool-scoped address endpoint with its existing verifier. No new pool, no new client, no token crosses a boundary. |
| **V — Design System** | **No new token.** The palette is monochrome and closed; suggestions are plain list rows and the verdict reuses the existing three-state treatment. **No cards** — the place list is a list, which is the pattern the doctrine prefers anyway. Touch targets: every suggestion row is a full-width target meeting the platform minimum (FR-032). Mobile follows the platform's own sheet convention (Material 3 `ModalBottomSheet`), which is the "feel native" requirement, not a deviation from it. |
| **VI — Layered Architecture** | Go: `handler → service → repository`, raw SQL, DTO mapped explicitly at the edge. Mobile: `LocalityRepository` (domain) ← `HttpLocalityRepository` (data), a `SearchLocalities` use case, consumed by presentation; the seeding coordinator is wired **explicitly in `AppContainer`**, no DI framework. Web: `lib/` service function → client component, with the server-state read kept out of component state. |
| **VII — Observability** | **One** new server metric: locality lookups by outcome (`found`/`not_found`), low-cardinality, ⚠ never labelled with the query. **No new product-analytics event**, and FR-047 forbids attaching the place to the existing one. ⚠ **Mobile telemetry remains deferred — the eleventh consecutive slice.** Declared, not skipped silently. |

**No Complexity Tracking entries.** Nothing in this plan deviates from a principle.

Two things worth stating explicitly because they *look* like deviations and are not:

- **`ServiceabilityDTO` is not extended.** A frozen contract with a reflection test guarding it stays
  frozen, because the design turned out not to need the field (research R4). This is the gate working.
- **The web list is hand-rolled rather than built on the platform's locked UI standard.** Radix *is*
  the standard, and the guest path is explicitly carved out of it by an existing machine-enforced
  contract. Following that carve-out is compliance, not an exception.

## Project Structure

### Documentation (this feature)

```text
specs/030-delivery-location-suburb/
├── plan.md              # This file
├── spec.md              # WHAT / WHY
├── research.md          # Phase 0 — R1…R15
├── data-model.md        # Phase 1 — public.locality
├── quickstart.md        # Phase 1 — operator runbook + the walks
├── contracts/
│   └── locality.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
db/
├── migrations/
│   └── 202608XXXXXXXX_locality.sql            # NEW — schema only
└── reference/
    ├── au-localities.csv                       # NEW — the committed dataset
    └── README.md                               # NEW — provenance + licence

apis/core-api/
├── cmd/
│   ├── core-api/main.go                        # (no change — storefront already registered)
│   └── load-localities/main.go                 # NEW — idempotent operator-run loader
└── internal/
    ├── features/storefront/
    │   ├── localities.go                       # NEW — service: normalise, classify, search
    │   ├── localities_test.go                  # NEW
    │   ├── handler.go                          # + getLocalities
    │   ├── register.go                         # + GET /localities
    │   ├── repository.go                       # + SearchLocalities (raw SQL)
    │   └── wire_contract_test.go               # + the LocalityDTO literal
    ├── platform/localityload/                  # NEW — CSV → rows, unit-testable, no DB
    └── platform/metrics/metrics.go             # + locality lookup counter

packages/shared-types/src/
└── storefront.ts                               # + LocalityDTO  (SSOT, Principle II)

apps/customer-web/
├── app/(shop)/
│   ├── layout.tsx                              # + <Suspense><DeliverySeed/></Suspense>
│   └── _components/
│       ├── DeliveryAffordance.tsx              # shell only — button + <dialog>
│       ├── DeliveryPanel.tsx                   # NEW — lazily loaded body (input + listbox)
│       ├── DeliverySeed.tsx                    # NEW — server island, reads default address
│       └── DeliverySeedClient.tsx              # NEW — renders nothing, seeds on mount
├── lib/
│   ├── delivery-store.ts                       # + locality/state on the context; source rule
│   ├── delivery-display.ts                     # NEW — the R11 rule, pure + unit-tested
│   └── localities.ts                           # NEW — the fetch
└── e2e/delivery.spec.ts                        # NEW — keyboard, refusal paths

apps/customer-mobile/shared/src/commonMain/kotlin/.../features/
├── delivery/
│   ├── DeliveryContextStore.kt                 # + locality/state; seedFromAccount WIDENS (see R10)
│   ├── DeliveryDisplay.kt                      # NEW — the R11 rule, pure + unit-tested
│   ├── DeliveryBar.kt                          # display only (dialog removed)
│   └── DeliverySheet.kt                        # NEW — ModalBottomSheet + listbox
├── localities/
│   ├── domain/Locality.kt                      # entity + repository interface + use case
│   └── data/HttpLocalityRepository.kt          # NEW
└── ../app/AppContainer.kt                      # + locality wiring + seeding/sign-out observer
```

**Structure Decision**: no new package, no new service, no new app. The work lands in the **existing**
`storefront` feature slice on the hot path (it is a storefront read, and it partners a read already
there), in a **new mobile feature package** `features/localities/` mirroring the shape every other
mobile feature uses, and in the **existing** `(shop)/_components` for web. The only genuinely new
top-level artifacts are the reference dataset and its loader — which are data plumbing, not a surface.

The one deliberate split worth calling out: `DeliveryAffordance.tsx` is **divided** into an
always-loaded shell and a lazily-loaded body. That is not organisational tidiness; it is the mechanism
by which FR-043 ("a shopper who never opens it pays nothing") is true rather than merely intended.

## Work stages

⚠ **These are engineering stages, not `tasks.md` phases** — the two documents partition the work
differently and both use ordinal numbers. `tasks.md` is organised **by user story** (its Phase 3 = US1,
Phase 4 = US2, Phase 5 = US3); the table below is the technical build order. When a document says
"Phase N", read it as belonging to whichever file it appears in.

Ordered so the genuine risk is hit early, while there is still room to react.

| Stage | Work | Why here |
|---|---|---|
| **1** | Dataset + `db/reference/` + migration + loader + coverage test (SC-002) | Everything downstream is fiction without real rows. ⚠ Licence verification is in this phase. |
| **2** | Hot-path endpoint: repo SQL + service + handler + metric + contract test | The single dependency of both clients. |
| **3** | `LocalityDTO` in shared-types + Kotlin generation + drift check | Principle II gate before either client consumes it. |
| **4** | **The byte gate**: re-measure the guest budget on the real base (T027a), then `pnpm size` with the split web panel stubbed in (T027) | ⚠ R7 is where this plan can be wrong, and the headroom figure it was drafted against is stale. R9's iOS spike was **removed** — `ModalBottomSheet` already ships in three customer-mobile screens (see R9). |
| **5** | Mobile: store fields, display rule, sheet, list, use case, repository | |
| **6** | Web: store fields, display rule, panel split, listbox, seed island | |
| **7** | Seeding + sign-out rule on both surfaces (025's FR-013, finally) | Depends only on the stores. ⚠ An earlier draft sequenced this *after* the display work "so a seeded location has something legible to render" — that rationale is dropped: the display rule is a small pure function landing with the client work in stages 5–6, and `tasks.md` orders by user-story priority (US2 before US3). |
| **8** | Full sweep: typecheck, all suites, both mobile builds, `size`, `depcruise`, guards | |
| **9** | Operator walks — the observer tests, both platforms, live | ⚠ Five SCs cannot be machine-checked; see below. |

## What this plan does NOT let itself assume

Recorded here because the last three slices each lost time to one of these.

- **A compile is not a run.** R9's bottom sheet is `@ExperimentalMaterial3Api` on a platform whose iOS
  dialog hosting has been the last thing to stabilise. 024 shipped a drawable that compiled, packaged,
  and could not be inflated. Phase 4 exists to catch that class of failure on a device.
- **A green test is not a correct test.** 028 and 029 both shipped tests whose fixtures agreed with the
  code rather than with the world — 029's banner test literally asserted the defect. The display rule
  (R11) is therefore specified as a **table in research**, and both surfaces' unit tests are written
  against that table rather than against whatever the implementation happens to do.
- **`pnpm -r test` does not run `tsc`.** 029 found `test` green while `typecheck` failed. The sweep in
  Phase 8 runs both, and counts reporting packages.
- **Android has never been looked at** across 028 and 029, in both cases after 028 asked that it not be
  repeated. SC-014 is in the spec for that reason and is not optional.
- **Verification tasks must be verified, not reasoned about.** 028 marked six complete on reasoning;
  three defects fell out of re-auditing them.

## Risks

| Risk | Impact | Response |
|---|---|---|
| ⚠ **The web split does not fit the budget** | FR-044 breached on one or more routes | Measured in Phase 4, before the polish. FR-045 fixes the response in advance: **reduce the web presentation**, never add a dependency or raise the limit. |
| **A scrolling result list misbehaves under the iOS soft keyboard** | The sheet's list is unusable on one platform | ⚠ Downgraded from a blocking spike: `ModalBottomSheet` already ships in `CheckoutScreen`, `AddressBookScreen` and `AddressFormSheet` (a keyboard-bearing form sheet). Only the scrolling list is new — confirmed at T035, fallback per R9. |
| ⚠ **The dataset is not redistributable** | Phase 1 blocks | Licence verified *before* commit; fallback is ABS SAL joined to postcodes (R1), same three columns, more work. |
| **The locality index does not serve the query** | 18k-row sequential scan per keystroke; nothing fails | `lower(name) text_pattern_ops` specified in the data model; an `EXPLAIN` check is a task, not a hope (R5). |
| **Seeding resurrects on mobile restart** | A shopper's deliberate choice is replaced by their account default | ⚠ Cannot be fixed inside this scope (R12). Recorded in the spec's Assumptions and surfaced again at sign-off — this feature makes an existing gap *worse*, which is the operator's call to prioritise. |
| **`core-api` has no cloud deployment** | SC-015 provable locally, not in dev-cloud | Pre-existing and unchanged by this slice; 025's serviceability read lives under the same constraint. |

## Telemetry (Principle VII, declared)

- **Metric (new)**: `storefront_locality_lookups_total{outcome="found"|"not_found"}` — answers "are
  shoppers failing to find their suburb?", which is the signal that the dataset is wrong. ⚠ Outcome
  only; the query string is never a label.
- **Metric (existing, unchanged)**: `storefront_serviceability_checks_total{serviced}`.
- **Product analytics**: **no new event, no new property.** FR-047 forbids attaching locality, state
  or postcode to the existing `delivery_location_set { serviced }`.
- **Alerts**: none added. A sustained `not_found` rate is a data-quality question, not a page.
- ⚠ **Mobile telemetry: still deferred.** Eleventh consecutive slice.

## Complexity Tracking

*No entries — the Constitution Check passes with no violations and no justified exceptions.*
