# Implementation Plan: Driver Item Manifest & Temperature Classes

**Branch**: `065-driver-item-manifest` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/065-driver-item-manifest/spec.md`

## Summary

Drivers get the full item list for every package, each line marked Frozen, Chilled or Normal, at
shop pickup and at the customer drop, with a class summary visible before a package is opened.

The class is **snapshotted onto the order line at placement** (one nullable column on
`public.order_item`, written by the hot path where the line is written today), read by the driver
service on the cold path together with the shop's pick outcome, carried on the existing driver
contract, and rendered by the driver app. No new table, no new route, no new service.

Research found one **live defect** this slice must fix rather than build on: the pickup manifest
attaches *every item at the stop to every package at the stop* (research R2), so a per-package
summary computed from it would be wrong for any shop stop with more than one package.

## Technical Context

**Language/Version**: Go 1.x (`apis/core-api`), TypeScript on Node 22 (`apis/edge-api/driver`,
`packages/shared-types`), Kotlin 2.4 / Compose Multiplatform (`apps/driver-mobile`)

**Primary Dependencies**: Gin + pgx/v5 (hot path); Serverless v3 Lambdas + `@effy/edge-shared`
(cold path); Ktor client + generated contract DTOs (mobile). No new dependency.

**Storage**: PostgreSQL 16, raw SQL, one forward-only Goose migration (additive, one column).

**Testing**: `go test` (unit + container), Vitest (unit + container against the real migrations),
Kotlin `commonTest` on Android host and iOS simulator, `driver-contract:check` drift guard.

**Target Platform**: Android + iOS driver app; AWS Lambda (edge-driver); Fargate (core-api).

**Project Type**: Mobile app + two backend paths in a monorepo.

**Performance Goals**: A 30-item package opens in under 2 s on a mobile connection (SC-009). The
stop and drop reads stay at a fixed number of queries regardless of package count.

**Constraints**: No price and no shop identity on a customer drop (FR-020, FR-021). Class conveyed
by word + icon, never colour alone (FR-011). Current-round items readable with no connection
(FR-024).

**Scale/Scope**: 1 migration, 1 hot-path write change, 2 cold-path reads reshaped, 1 contract file,
4 driver screens touched (collection stop, drop list, en-route/arrived drop detail).

### Unknowns

All resolved in [research.md](research.md): where the class is snapshotted (R1), the per-package
defect (R2), how pick outcome maps to "in the bag" (R3), how a drop's packages are presented without
naming shops (R4), pre-065 orders (R5), offline readability (R6), deploy order and old app builds
(R7).

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | Spec has zero tech; R2's defect and R4's package grouping send nothing back to the spec — FR-003 and FR-013 already require per-package truth. |
| II. Shared contracts | PASS | One contract change in `packages/shared-types/src/driver.ts`; Kotlin is generated, never hand-edited. The class vocabulary is declared once and mapped once (R1). |
| III. Dual-path discipline | PASS | The order line is written by the hot path, so the snapshot is written there. The driver read is cold path and stays there. No path gains a new responsibility. |
| IV. Auth isolation | PASS | No new route or authorizer. Existing `ownsRound` / driver-scoped predicates gate both reads (FR-022). |
| V. Design | PASS | No new colour token. Class is a word + icon on the neutral ramp; `--accent2`-style attention colour is not used for class. List rows, not cards. |
| VI. Layered architecture | PASS | handler → service → repository on the cold path; ViewModel → use case → repository on mobile. DTO rows are mapped, not leaked. |
| VII. Observability | PASS | One analytics event declared below; no PII, no item names in telemetry. |

**Gate result**: no violations. Complexity Tracking is empty.

### Telemetry declared (Principle VII)

| Event | Surface | Properties | Purpose |
|---|---|---|---|
| `driver_manifest_opened` | driver-mobile | `surface` (`pickup` \| `drop`), `hasCold` (bool), `lineCount` (int) | Whether drivers actually open the list, and how often cold goods are involved. No item names, no order reference. |

## Project Structure

### Documentation (this feature)

```text
specs/065-driver-item-manifest/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── driver-manifest.md
└── checklists/requirements.md
```

### Source code

```text
db/migrations/
└── <ts>_order_item_storage_class.sql          # NEW — one nullable column + CHECK

apis/core-api/internal/features/checkout/
├── store.go                                    # line read gains the storage attribute; insert writes it
└── store_container_test.go                     # snapshot written; later product edit does not move it

packages/shared-types/
├── src/driver.ts                               # TemperatureClass, ClassSummary, ManifestLine, drop packages
└── contract-driver/                            # REGENERATED (driver-contract:gen)

apis/edge-api/driver/src/work/
├── sql.ts                                      # PACKAGE_ITEMS keyed by package, with class + pick outcome
├── manifest.ts                                 # NEW — pure: rows → lines, ordering, summary
├── manifest.test.ts                            # NEW
├── manifest.container.test.ts                  # NEW — against the real migrations
├── repository.ts                               # ItemRow widened
├── service.ts                                  # collectionStop: per-package items (fixes R2); deliveryRun: summary
└── delivery.ts                                 # deliveryDrop: one entry per package, with items

apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/
├── features/manifest/                          # NEW — shared by collection and delivery
│   ├── domain/Manifest.kt                      # TemperatureClass, ManifestLine, ClassSummary
│   └── presentation/ManifestViews.kt           # ClassChip, ClassSummaryRow, ManifestList
├── features/collection/{domain,data,presentation}/   # map + render per-package manifest
├── features/delivery/{domain,data,presentation}/     # map + render drop manifest and summaries
└── core/observability/AnalyticsEvent.kt        # driver_manifest_opened
```

**Structure decision**: the manifest view lives in one `features/manifest` slice consumed by both
collection and delivery, so the class label, icon and ordering cannot diverge between the two
screens (the 058 lesson: one renderer, two callers).

## Phase plan

1. **Foundation** — migration; contract types; regenerate Kotlin; pure `manifest.ts` with its unit
   tests. Nothing user-visible.
2. **Snapshot (US4)** — hot path writes the class at placement; container test proves a later
   product edit does not move it.
3. **Pickup (US1)** — fix R2 (items keyed by package), add class + summary to the stop read, render
   on the collection stop screen.
4. **Drop (US2)** — per-package items on the drop read, summary on the run list, render on drop
   screens. Guard test: no price, no shop identity in either payload.
5. **Matches the bag (US3)** — pick outcome joined in; not-included and part-supplied lines.
6. **Polish** — offline retention (R6), telemetry, accessibility (greyscale, large text), parity
   register `docs/audiences/driver-capabilities.md` §065, quickstart walk.

## Risks

| Risk | Mitigation |
|---|---|
| The storage value is an attribute row, not a column (063 recorded this as a typecheck-clean runtime failure) | Container tests run the real query against the real migrations; no mocked repository proves the join. |
| Widening `ItemRow`/contract and missing a reader (053, 056, 057, 059 each shipped a defect this way) | Reader audit in research R2: `packageItems` has exactly one caller; `ManifestLine` has one mobile mapper. Listed there by file and line. |
| A summary computed in two places disagrees | Computed once, server-side, in `manifest.ts`; the app renders it and never recounts. |
| Old app builds meet the new payload | Fields are additive; verify the app's JSON config ignores unknown keys before deploying edge-driver (R7). |
| A pre-065 frozen line shown as Normal | NULL maps to `not_recorded`, never `normal`; pinned by a test that breaks if the mapping defaults (SC-008). |
| Driver service deployed before the migration | The read names the new column and would 500 every stop. `make db-up` first; stated in quickstart. |

## Complexity Tracking

No constitution violations to justify.
