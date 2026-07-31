# Implementation Plan: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Branch**: `028-mobile-home-merchandising` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/028-mobile-home-merchandising/spec.md`

---

## Summary

Replace the customer mobile Home tab's flat two-column "Discover" grid with a **sequence of named,
horizontally scrolling merchandising sections**, a **category shortcut row**, **promotional banners
between sections**, and a **one-tap search handoff** that lands on the Search screen with the keyboard
already raised.

The approach in one line: **the presentation layer is rebuilt; the layers beneath it are reused
almost entirely.** `storefront.Service.Home` already composes Featured, On sale and up to four
category rails and returns them as `rails`, and `SearchViewModel` already accepts the exact entry
refinements ("see all" on a rail, a category tap) that 025 built and 026 orphaned. The only genuinely
new capability in the slice is the **advertising facet on `promo_code`** — five columns, one hot-path
read, and a back-office control — which turns the current hard-coded "welcome" banner into a real,
operator-controlled, self-expiring promotion.

**⚠ This reverses feature 026's FR-025a for the Home tab, on operator direction.** That is bound by
FR-003 and carried through SC-002 and SC-006, which exist specifically to hold the new structure to
the bar 026's decision was protecting.

---

## Technical Context

**Language/Version**: Kotlin 2.4.0 (KMP, `commonMain`) · Go 1.25 (hot path) · TypeScript / Node 22
(cold path) · React 19 + TypeScript (back-office) · SQL (PostgreSQL 16, Goose)

**Primary Dependencies**: Compose Multiplatform 1.11.1 · Jetpack **Navigation 3** (stable; migrated by
026) · Material 3 (`LazyColumn` / `LazyRow` / `HorizontalPager`) · `androidx.lifecycle` ViewModel ·
Ktor client · Gin + pgx/v5 (raw SQL, no ORM) · Serverless Framework v3 · TanStack Query/Router
(back-office)

**Storage**: PostgreSQL 16, `public` schema. One forward-only Goose migration extending
`public.promo_code`. **No new table.**

**Testing**: Kotlin `commonTest` (kotlin.test) on Android + iOS targets · Go `go test` · Vitest
(edge-api admin, back-office) · `assembleDebug` + the iOS Kotlin/Native compile · the standing guards
`cm-guard`, `cm-contract-check`, `tokens:check`, `mobile-assets:check`, `check-no-emerald.sh`,
`check-no-jade.sh`

**Target Platform**: Android (minSdk 24 / target 36) and iOS, from one `commonMain` source set; plus
the existing back-office console (web)

**Project Type**: Mobile-led vertical slice — mobile presentation + hot-path read + cold-path CRUD +
one migration + shared packages

**Performance Goals**: Home first meaningful content **< 2 s** on a typical connection (SC-008);
section images within **1 s** of the section becoming visible; 60 fps while scrolling a rail; the Home
read stays inside the existing **3 s** `readTimeout` in `storefront/service.go`

**Constraints**: No section may exceed **50% of the vertical viewport** at rest (FR-017 / SC-005) ·
**monochrome only** — no hue may be introduced for banners or icons (Principle V) · **at least one real
product visible without scrolling** (SC-002) · **≤ 4 vertical swipes** to the last section (SC-006) ·
Home is **public** — every section renders signed-out (FR-047)

**Scale/Scope**: 1 mobile surface × 2 platforms; ~1 screen rebuilt + 1 screen extended + 1 new nav
route; 5 new DB columns; 1 hot-path read extended; ~2 cold-path routes extended; 1 back-office screen
extended; ~10–14 new icon assets

---

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Constitution v1.11.0.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I — Spec-Driven** | ✅ PASS | spec → plan → tasks pipeline followed. The 026 reversal is recorded in the spec's Context and bound by FR-003 rather than made silently in code. |
| **II — Monorepo / Shared Contracts** | ✅ PASS | `BannerDTO` is edited in `packages/shared-types` **first**; the Kotlin is **regenerated** (`make cm-contract-gen`) and drift-guarded (`make cm-contract-check`). Category icons go into the existing `packages/design-system/mobile-assets` SSOT and ride its STALE / MISSING / ORPHANED checker. Nothing is hand-redefined per surface. |
| **III — Dual-Path** | ✅ PASS | **Hot path** for the Home read — a latency-sensitive customer read that already lives in `core-api/storefront`; this only extends it. **Cold path** for advertising a promotion — low-frequency operator CRUD, already in `edge-api/admin/promotions`. This is exactly the split `promo_code` was built with in 027 (written cold, read and redeemed hot). No boundary moves. |
| **IV — Auth Isolation** | ✅ PASS | Home is public and unauthenticated; no token is introduced or crossed. The back-office half uses the existing admin authorizer and the existing `admin` / `manager` mutate gate from 027's promotions slice. No pool boundary is touched. |
| **V — Design / Native Feel** | ⚠️ **PASS WITH RECORDED DEVIATION** | Monochrome ramp, General Sans, `EffySpacing` / `EffyRadius` — all consumed from the design-system SSOT; no hue introduced (R9). Touch targets via `EffyMinTouchTarget`; reduced motion via the existing `rememberMotionSpec`. Reference platforms honoured (Uber Eats section structure, eBay ordering). **No-card doctrine**: three elements assessed in R10 — the product tile is pre-existing, the category shortcut conforms (icon + label, no container), and **the promotional banner is a justified exception**, carried in Complexity Tracking below. |
| **VI — Layered Architecture** | ✅ PASS | Presentation-only on mobile apart from the nav key. `HomeViewModel` keeps its `GetHome` / `GetCategories` use cases and its single immutable `HomeUiState` (MVVM). Go stays handler → service → repository with raw SQL. No DI framework; wiring stays explicit in `AppContainer`. |
| **VII — Observability** | ⚠️ **PASS WITH RECORDED DEVIATION** | The telemetry taxonomy is **specified** (R13), as the principle requires. **Emission is deferred** to the mobile-telemetry slice, consistent with 013 / 014 / 015. No new backend route → no new metric or alert; Home read latency against the 3 s timeout is the one thing to watch. Carried in Complexity Tracking. |

**Gate result: PASS.** Two deviations, both recorded and justified below. No unjustified violation.

**Re-evaluation after Phase 1 design**: unchanged. The data model adds no table, no new auth surface
and no new path; the contract change is additive and optional-only, so no existing consumer breaks.

---

## Project Structure

### Documentation (this feature)

```text
specs/028-mobile-home-merchandising/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — R1…R14
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — the live validation walk
├── contracts/           # Phase 1
│   ├── storefront-home.contract.md
│   └── admin-promotions.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created by this command
```

### Source Code (repository root)

```text
apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
├── core/
│   ├── nav/
│   │   ├── CustomerNavKey.kt          # + Results route — register in BOTH the polymorphic module
│   │   │                              #   AND ALL_CUSTOMER_ROUTES (an omission fails on iOS ONLY)
│   │   └── CustomerNavState.kt        # + one-shot search-focus request (R1)
│   └── presentation/
│       └── StorefrontKit.kt           # + EffyRailTile · EffyCategoryShortcut · EffyPromoBanner
│                                      #   + EffyHomeSkeleton
├── features/catalog/
│   ├── domain/Catalog.kt              # Banner gains promo fields; HomeContent gains placement
│   ├── data/CatalogMappers.kt         # map the new wire fields
│   └── presentation/
│       ├── HomeScreen.kt              # REBUILT — LazyColumn of sections; the grid is deleted
│       ├── HomeViewModel.kt           # wiring unchanged; state carries the composed section list
│       └── SearchScreen.kt            # + focus-on-request, + entry scope
└── app/CustomerShell.kt               # wire the Results route and the focus request

packages/
├── shared-types/src/storefront.ts     # BannerDTO += optional advertising fields
├── shared-types/src/promotion.ts      # PromoCodeDTO += the advertising facet (operator side)
└── design-system/mobile-assets/drawable/   # + category icons + fallback glyph (SSOT, drift-guarded)

apis/
├── core-api/internal/features/storefront/
│   ├── service.go                     # banners() returns advertised promos (replaces the stub)
│   └── repository.go                  # + AdvertisedPromotions — one query, count-never-store
└── edge-api/
    ├── admin/src/promotions/          # the advertising facet on create / update
    │   └── types.ts · service.ts · repository.ts + a banner-image presign route
    └── shop/src/products/media.ts     # PROMOTED to packages/edge-shared, then repointed (Principle II)

packages/edge-shared/                  # + the media presign helper, key prefix parameterised

apps/back-office/src/features/promotions/
└── PromotionDetailScreen.tsx          # + the advertising controls

db/migrations/
└── <timestamp>_promo_advertising.sql  # 5 columns + CHECK + partial index. Forward-only.
```

**Structure Decision**: The feature is **mobile-led** and follows the platform's existing
vertical-slice shape. The mobile app keeps its three-layer split (`domain` / `data` / `presentation`)
with the change concentrated in `presentation`; the single exception is the nav key, which lives in
`core/nav` because navigation is app-wide. The backend halves land in the slices that already own
their data — `core-api/storefront` for the customer read, `edge-api/admin/promotions` for the operator
write — so **no new service or module is created anywhere**.

---

## Implementation Approach by Story

### US1 — Search entry (P1) · mobile only

Home's search affordance calls `navState.requestSearchFocus()` and then `selectTab(Search)`.
`SearchScreen` consumes the one-shot flag on composition and drives a `FocusRequester` on its existing
`OutlinedTextField`, with `ImeAction.Search`. Submitting dismisses the keyboard (FR-010); a blank
submit does nothing (FR-011).

**Also corrected here**: the current screen's dark square button is labelled *Filters* and opens Search
without applying any filter — an affordance that lies about what it does. It goes; the field is the
affordance.

### US2 — Sections (P2) · mobile only

`HomeScreen` becomes a `LazyColumn`. Each `Rail` renders as `EffySectionHeader(title, onSeeAll)` plus a
`LazyRow` of `EffyRailTile`. The server already drops empty rails; the client skips them defensively
too (FR-020). `DiscoverGrid` and `CategoryChips` are **deleted** — the chips were 026's substitute for
rails, and keeping both would leave two competing groupings on one screen.

The section gap is a single `EffySpacing` value on the `LazyColumn`'s `verticalArrangement`, which
makes SC-007 true **by construction** rather than by inspection.

### US3 — Category shortcuts (P3) · mobile + design-system

A `LazyRow` of icon-above-label shortcuts fed by the existing `GetCategories` use case, filtered to
top-level (`parentKey == null`) with `productCount > 0`. Icons resolve through a pure
`categoryIcon(key): DrawableResource` with a fallback glyph — a pure function, so it is unit-tested
directly, including the fallback path.

### US4 — Banners, shopper side (P4) · mobile + shared-types + hot path

`storefront.Service.banners()` stops returning the hard-coded welcome stub and returns advertised
promotions instead, ordered by `banner_position`. The client interleaves them by position, clamping an
out-of-range value to the end (R8) — a mistyped position must never make a live promotion invisible.
One banner renders as a panel; several render in a `HorizontalPager` with a position indicator and
**no auto-advance** (FR-032).

### US5 — Banners, operator side (P5) · migration + cold path + back-office

The migration adds the advertising facet with the CHECK that makes an advertised-but-uncopy'd promotion
**unrepresentable**. `edge-api/admin/promotions` accepts the new fields on create and update under the
existing `admin` / `manager` gate. The back-office promotion detail screen gains the controls.

**Banner artwork gets a real write path**, added after the `/speckit-analyze` pass found the column had a
reader and no writer — the Go read presigned it, the DTO carried it, and nothing could ever set it. The
existing product-media pattern (`apis/edge-api/shop/src/products/media.ts`: validated content type, size
ceiling, presigned PUT so bytes never pass through Lambda, presigned GET on read) is **promoted into
`@effy/edge-shared`** and consumed by both services. Copying it into `admin` would be the cross-cutting
copy-paste Principle II exists to prevent; `shop`'s existing media tests must stay green unmodified.

---

## Complexity Tracking

> Deviations from the constitution, recorded per Principle I and the Quality Gates.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Principle V — "no card layouts": the promotional banner is a bordered panel** | A promotion is a discrete, self-contained, tappable offer that must be visually separable from the merchandising around it. Constitution v1.11.0 removed every hue from the palette, so **colour is not available as the separator** — a bounded panel is what remains. The doctrine's own escape clause ("unless a card is demonstrably the right pattern and no better layout exists") is met, and this is the record it requires. | **A plain text row between sections** — indistinguishable from a section header, so a promotion reads as a heading and never gets tapped. **A full-bleed image** — FR-033 forbids text baked into artwork, and an image with no bounded text area cannot guarantee contrast. **Colour instead of a boundary** — forbidden outright by Principle V and caught by `check-no-emerald.sh`. |
| **Principle VII — mobile telemetry is specified but not emitted** | The principle requires a plan that adds a user-facing flow to **state** its telemetry, which R13 does in full (seven events with properties and rationale). Emission needs the mobile PostHog path, which no mobile slice has built — 013, 014 and 015 each deferred it identically. Building it here would make a Home redesign the owner of the platform's mobile telemetry foundation. | **Emit ad hoc from this feature** — creates a second, untyped analytics path on mobile, which Principle VII explicitly forbids ("through a shared, typed event taxonomy"). **Block the feature on the telemetry slice** — leaves a Home redesign gated on unrelated foundation work. |
| **Governance: this feature reverses 026's FR-025a for the Home tab** | Operator direction, recorded in the spec's Context and bound by FR-003 (scoped to Home; every other 026 screen untouched). | Not a constitution violation — no principle governs which layout a screen uses. Recorded because a *silent* reversal of a documented decision is the defect, not the reversal itself. SC-002 and SC-006 are retained as the guard rails 026's decision was protecting. |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **A monochrome banner does not draw the eye** (R9) | US4 + US5 deliver a banner nobody taps | Design on scale, weight and negative space rather than decoration. SC-009's tester walk and the `home_banner_tapped` event (once telemetry lands) are the checks. **The wrong fix is a new colour** — that is a constitution violation, not a design choice. |
| **A wire-shape mismatch every unit test passes** | 027 lost days to exactly this (`1.0` refused into a Go `int`) | Fix at the contract — the new integer goes through the `WireInt` / `@asType integer` treatment, and the quickstart's live walk is the only thing that actually proves it (R12). |
| **Home read latency** once the banner query lands | SC-008's 2 s, against a 3 s server timeout | One added query, bounded by the number of *advertised* promotions and indexed on `promo_code_id`. Measured in the quickstart, not assumed. |
| **The new `Results` route unregistered for iOS saved state** | Restores fine on Android, throws on iOS — passes every Android test | Register in the polymorphic module **and** `ALL_CUSTOMER_ROUTES` in the same commit; extend `CustomerNavKeySerializationTest`. |
| **Section heights push product below the fold** | SC-002 and SC-005 both fail | Tile height is derived and capped (R4); both criteria are measured on a real device in the quickstart, not eyeballed in a preview. |
| **Slice size** — five surfaces (R14) | Partial delivery | US1–US3 are independently shippable; the clean cut line is **after US3**. |

---

## Phase Status

- [x] **Phase 0** — research complete → [research.md](./research.md) (R1–R14; all unknowns resolved)
- [x] **Phase 1** — design complete → [data-model.md](./data-model.md), [contracts/](./contracts/),
      [quickstart.md](./quickstart.md)
- [x] Constitution Check evaluated pre-Phase-0 and re-evaluated post-Phase-1 — **PASS**, two recorded
      deviations
- [ ] **Phase 2** — `tasks.md` (created by `/speckit-tasks`, not by this command)
