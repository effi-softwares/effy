# Implementation Plan: Promotional Banner Templates & Home Carousel

**Branch**: `029-promotional-banner-carousel` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/029-promotional-banner-carousel/spec.md`

---

## Summary

Give promotional banners a **canonical shape** (1200 × 600, 2:1), a way for operators to hit it, a
**dedicated offers carousel** on Home, **exclusive placement** per promotion — and finally **walk the
loop 028 shipped and never ran**.

The approach in one line: **lock the aspect ratio at both ends and the hard requirement dissolves.**
FR-013 asks for "fill without stretching, crop only outside the safe area", which sounds like clever
crop arithmetic. If stored artwork is exactly 2:1 and the render box is exactly 2:1, the scale is
uniform and **nothing is ever cropped**. That converts the rendering problem into a validation problem
— which is why the enforcement design (R3) carries more weight here than the drawing code.

Almost everything else is extension rather than invention: `composeHome` is already a tested pure
function, the presigned upload and banner component already exist, and `tokens:gen` already generates
one definition into two surfaces.

---

## Technical Context

**Language/Version**: Kotlin 2.4.0 (KMP `commonMain`) · TypeScript / Node 22 (cold path) · React 19 +
TypeScript (back-office) · Go 1.25 (hot path read) · SQL (PostgreSQL 16, Goose)

**Primary Dependencies**: Compose Multiplatform 1.11.1 · Coil 3 · Material 3
(`LazyColumn`/`LazyRow`/`HorizontalPager`) · Serverless Framework v3 · `@aws-sdk/client-s3` (ranged
GET) · TanStack Query (console) · Gin + pgx/v5

**Storage**: PostgreSQL 16. One forward-only Goose migration adding `banner_placement` to
`public.promo_code`. Artwork stays in the existing media bucket under `promotions/`.

**Testing**: Kotlin `commonTest` (Android + iOS) · Vitest (edge-api admin, back-office) · Go `go test`
· `assembleDebug` + iOS Kotlin/Native compile · the standing guards `cm-guard`, `cm-contract-check`,
`tokens:check`, `mobile-assets:check`, `check-no-emerald`, `check-no-jade`

**Target Platform**: Android (minSdk 24 / target 36) + iOS from one `commonMain`; back-office console

**Project Type**: Two-surface slice — operator tooling (console + cold path) and shopper rendering
(mobile + hot path), over one migration

**Performance Goals**: Banner artwork **< 150 KB** after normalisation · **zero** layout shift when it
loads (SC-005) · Home read stays inside the existing 3 s `readTimeout`

**Constraints**: **One** canonical ratio, no per-campaign sizes · artwork **never** stretched (FR-013) ·
message stays **live text** (FR-031, upholding 028's FR-033) · **monochrome** — no hue available to
separate text from image · placement is **exclusive** (FR-027) · advertising stays **opt-in** (FR-030)

**Scale/Scope**: 1 new DB column · 1 hot-path read extended · ~2 cold-path routes extended + 1 verifier
· 1 console tool · 1 new Home block · 1 generated template asset

---

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Constitution v1.11.0.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I — Spec-Driven** | ✅ PASS | spec → plan → tasks. The one narrowing of the original request (a template to design *from*, not a generator) is recorded in the spec at FR-011, not applied silently. |
| **II — Monorepo / Shared Contracts** | ✅ PASS | The canonical canvas is defined **once** in `packages/design-system` and generated into Compose by the existing `tokens:gen`, with `tokens:check` as the drift guard (R4). The template SVG is generated from those same constants (R5). The dimension verifier goes in `@effy/edge-shared` beside the presign helper 028 promoted there — not copied into a service. |
| **III — Dual-Path** | ✅ PASS | Placement is read on the **hot path** (`core-api/storefront`, a customer read); authored on the **cold path** (`edge-api/admin/promotions`, operator CRUD). Identical to 027/028; no boundary moves. |
| **IV — Auth Isolation** | ✅ PASS | Home stays public and unauthenticated. The console work sits behind the existing admin authorizer and the `admin`/`manager` mutate gate. No pool boundary touched, no new permission. |
| **V — Design / Native Feel** | ⚠️ **PASS WITH RECORDED DEVIATION** | Monochrome throughout — ⚠ with **no hue available**, the scrim alone carries text legibility, so its opacity is chosen against the worst-case photograph (R6). Touch targets, reduced motion and dark mode all inherit 028's handling. **No-card doctrine**: the banner remains the justified exception 028 recorded; the offers section adds a heading, not a container. |
| **VI — Layered Architecture** | ✅ PASS | Placement composition extends the **pure** `composeHome`, keeping merchandising rules out of the layout code (R8). Go stays handler → service → repository with raw SQL. Console keeps server state in TanStack Query. |
| **VII — Observability** | ⚠️ **PASS WITH RECORDED DEVIATION** | Three events specified (R11). **Emission deferred** — the ninth consecutive slice. Flagged in Complexity Tracking as a compounding cost, because this is the feature whose central question (does a hueless banner get tapped?) is *behavioural* and unanswerable without it. |

**Gate result: PASS.** Two deviations, both recorded below.

**Re-evaluation after Phase 1**: unchanged. No new table, no new auth surface, no path moved. ⚠ One
difference from 028 worth stating: **`tokens:check` output changes** in this slice, because a real token
is added (R4). That is legitimate but must be regenerated and committed deliberately.

---

## Project Structure

### Documentation (this feature)

```text
specs/029-promotional-banner-carousel/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── banner-canvas.contract.md      # the canonical shape, and who enforces it
│   └── admin-promotions.contract.md   # placement + dimension verification
├── checklists/requirements.md
└── tasks.md                            # Phase 2 — /speckit-tasks, NOT this command
```

### Source Code (repository root)

```text
packages/design-system/
├── src/banner-canvas.json               # THE canonical canvas — one definition (R4)
├── src/banner.ts                        # typed re-export for the console; adds no values
├── scripts/gen-banner-template.mjs      # emits the committed template SVG (R5)
└── compose/EffyLayoutTokens.kt          # GENERATED into the EXISTING guarded target
                                         # ⚠ tokens:check OUTPUT changes; its target list does not

packages/shared-types/src/promotion.ts   # PromoCodeDTO += bannerPlacement
packages/shared-types/src/storefront.ts  # BannerDTO += placement

apis/
├── edge-api/shared/src/lib/
│   └── image-dimensions.ts              # header parse over a ranged GET — NO image library (R3)
├── edge-api/admin/src/promotions/       # placement field + verify-on-save
└── core-api/internal/features/storefront/
    ├── repository.go                    # AdvertisedPromotions returns placement
    └── service.go                       # placement onto the Banner domain

apps/back-office/src/features/promotions/components/
├── AdvertisingSection.tsx               # + placement control, template download, live preview
└── BannerCanvas.tsx                     # canvas + text-zone guide + normalise-before-upload

apps/customer-mobile/shared/src/commonMain/kotlin/.../
├── core/presentation/StorefrontKit.kt   # EffyPromoBanner → fixed 2:1 + gradient scrim
└── features/catalog/presentation/
    ├── HomeBlocks.kt                    # + HomeBlock.Offers; composeHome splits by placement
    └── HomeScreen.kt                    # renders the offers section

db/migrations/<timestamp>_promo_banner_placement.sql
```

**Structure Decision**: Extends the slices that already own each concern — `design-system` for the
canonical constants, `edge-shared` for the shared verifier, `admin/promotions` for authoring,
`core-api/storefront` for the customer read, and the existing Home composition for rendering. **No new
service, package or module is created.**

---

## Implementation Approach by Story

### US1 — Producing a banner (P1) · console + edge-shared + design-system

The canonical canvas is defined once (R4) and emitted three ways: TypeScript for the console, Compose
for the app, and a **generated SVG template** an operator downloads (R5). The console shows the canvas
at 2:1 with the text zone marked, **normalises any accepted image to exactly 1200 × 600 before
upload**, and previews the result with the live text over it.

Conformance is then **verified server-side on save** by reading the image's header over a ranged GET
(R3) — because artwork reaches S3 through a presigned PUT that Lambda never sees, so a client-side
check is a convention rather than the guarantee FR-004 demands.

### US2 — Rendering (P1) · mobile

`EffyPromoBanner` gains a **fixed 2:1 box** and a **gradient scrim** behind the text. Because both the
artwork and the box are 2:1, the scale is uniform and nothing crops (R2). The box is laid out before
the image resolves, so nothing shifts (R10). On wide windows the banner is bounded and centred rather
than stretched.

### US3 — The offers section (P2) · mobile

`composeHome` gains `HomeBlock.Offers`, placed after the category row and before the first
merchandising section. One banner renders plain; several render in a pager with a position indicator
and **no auto-advance**; none renders nothing at all.

### US4 — Placement (P2) · migration + cold path + console

`banner_placement` (`'carousel' | 'inline'`, defaulting to `'carousel'`) travels from the console
through the admin service to the hot-path read and into `composeHome`'s split.

### US5 — Walking the loop (P3) · operator

Create → produce banner → advertise → **see it on a device** → end it → see it go. The first time a
promotional banner has ever rendered on this platform.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Principle V — the promotional banner remains a card-shaped panel** | Inherited from 028's recorded exception: a promotion is a discrete, tappable offer, and with no hue in the palette a bounded panel is the only available separator. 029 does not widen the exception — it *constrains* it, by fixing the shape. | Same alternatives 028 rejected (a plain text row is indistinguishable from a heading; colour is forbidden outright). |
| **Principle VII — telemetry specified, not emitted** | The principle requires a plan to *state* its telemetry, which R11 does. Emission needs the mobile PostHog path that no mobile slice has built. | **Emit ad hoc** — a second, untyped analytics path, which Principle VII explicitly forbids. **Block on the telemetry slice** — gates a banner feature on unrelated foundation work. ⚠ **But this is the ninth consecutive deferral**, and it is the slice that most needs it: SC-012 and R6's contrast question are behavioural and no review answers them. Recorded as a compounding cost, not a formality. |

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **The scrim washes out the artwork** (R6) | Operators produce banners whose pictures barely show; the template becomes pointless | A **gradient**, not 028's flat 72% fill — opaque where the type is, clear elsewhere. Tuned against a light, high-detail photograph, which is the worst case, and checked on device in the quickstart. |
| **Server-side verification is bypassable if it only runs client-side** | FR-004 becomes decorative and a wrong-shaped image reaches shoppers | Verify on save via a ranged GET + header parse (R3). Proved by attempting a direct PUT of a non-conformant image. |
| **`tokens:check` output changes** | Looks like drift; could be committed wrong or "fixed" by reverting | Called out in the Constitution Check and given its own task: regenerate deliberately, commit the output, then confirm the guard is green. |
| **The offers section pushes products below the fold** | Breaks 028's SC-002, which that feature fought for | At 2:1 the banner is ~21% of viewport (R1). Measured on device, not assumed. |
| **Existing 028 artwork does not conform** | Any banner uploaded before this slice is the wrong shape | There is none — 028's loop was never walked, so **zero banners exist**. This slice starts from an empty set, which is a rare and useful position. |
| **The loop still is not walked** | 029 repeats 028's mistake and ships another unproven banner path | US5 is its own story with its own tasks, not a step appended to a polish phase (R12). |

---

## Phase Status

- [x] **Phase 0** — research complete → [research.md](./research.md) (R1–R12; all unknowns resolved)
- [x] **Phase 1** — design complete → [data-model.md](./data-model.md), [contracts/](./contracts/),
      [quickstart.md](./quickstart.md)
- [x] Constitution Check evaluated pre-Phase-0 and re-evaluated post-Phase-1 — **PASS**, two recorded
      deviations
- [ ] **Phase 2** — `tasks.md` (created by `/speckit-tasks`, not by this command)
