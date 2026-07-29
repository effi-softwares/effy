# Implementation Plan: Monochrome Design Language & Customer Mobile Rebuild

**Branch**: `026-monochrome-design-language` | **Date**: 2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/026-monochrome-design-language/spec.md`

## Summary

Replace the platform's visual identity on all six surfaces — retiring **Effy Emerald `#065f46`** and
**terracotta `#d0735a`** for a **ten-step neutral ramp** in which near-black carries every accent role,
plus **exactly two semantic hues** (error, success) that the source design declares — swap the platform
typeface from **Nunito Sans to General Sans**, regenerate all committed brand assets under a new
**polarity-based** distinguishing axis, and rebuild the customer mobile app's screens against the
chosen design language, including six screens it has never had.

The identity flows from the one token SSOT (`packages/design-system/src/tokens.css`) into three
generated Compose themes and three web surfaces, so this is a **shared-package change that lands
everywhere at once**, followed by a **mobile-only** screen rebuild. No backend, no schema, no contract.

**Three things make this larger than it reads.** (1) **General Sans is not on Google Fonts**, so every
font mechanism in the repo — `next/font/google`, `@fontsource`, and the Compose resource fonts — is
replaced, not re-pointed (research [R3](research.md#r3)). (2) The 024 brand marks distinguished
customer from shop **by hue**; with hue gone they must be re-separated by **ground polarity**
(research [R2](research.md#r2)). (3) A neutral accent **cannot hold its value across appearances** the
way emerald could, so the accent inverts polarity in dark mode (research [R4](research.md#r4)).

## Technical Context

**Language/Version**: TypeScript 5.9 (web + shared packages, Node 22), Kotlin 2.4.0 (KMP mobile),
Node stdlib ESM (token/brand generators — deliberately zero-dependency)

**Primary Dependencies**: Tailwind v4 + shadcn/ui primitives (`@effy/design-system`), React 19,
Next.js 16.2.6 (customer-web), Vite SPA (shop-web, back-office), Compose Multiplatform 1.11.1 +
Material 3, `@effy/mobile-kit`, `@effy/brand` (`@resvg/resvg-js`, `sharp`), `next/font/local`,
**General Sans (Fontshare, ITF Free Font License — licence confirmation is a blocking operator task)**

**Storage**: N/A — no schema change, no migration, no stored-data change (FR-001)

**Testing**: `node --test` (brand, 101 tests), Vitest (web surfaces + web-kit), Kotlin `commonTest`
(mobile), plus the zero-dep guards `check-tokens.mjs`, `check-compose-theme.mjs`,
`check-mobile-assets.mjs`, `check-brand-assets.mjs`, `check-no-jade.sh`, and a **new
`check-no-emerald.sh`**

**Target Platform**: iOS + Android (3 KMP apps), modern browsers (3 web surfaces)

**Project Type**: Monorepo — shared design-system/brand packages + six client surfaces. No backend.

**Performance Goals**: no regression. customer-web guest bundle must not grow (see Constraints);
mobile must hold 60 fps on the rebuilt screens.

**Constraints**:
- customer-web guest budget is **174 KB** (raised from 160 during 025 — the framework floor grew
  ~7.5 KB; routes sat at 160–168, i.e. **within** budget). Measure before and after; stay under
  174 (FR-044). Measured headroom is only 2.1–5.5 KB — see research R15a.
- WCAG 2.1 AA is **machine-enforced with zero exemptions** across 12 token pairs × 2 appearances.
- Radii stay pinned at sm 8 / md 16 so web px == mobile dp.
- No fulfilment location may be named or made inferable (FR-006, FR-037).

**Scale/Scope**: 6 surfaces · ~15 colour tokens × 2 appearances · 14 type styles · 57 committed brand
assets regenerated · ~4,900 lines of customer-mobile presentation code covering **33 source-screen
states across ~15 Kotlin screen files** · **6 new screens** (from 9 source screens) · **2 screens
designed in the source's idiom** with no counterpart · 6 source screens excluded.

Source total: **48 screens** (the export folder's 49th file is a banner frame).

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Verdict | Basis |
|---|---|---|
| **I. Spec-Driven Development** | ✅ PASS | spec → plan → research committed together; the semantic-colour question was resolved by evidence and folded back into the spec (FR-009a) rather than patched in code. |
| **II. Monorepo with Shared Contracts** | ✅ PASS | The identity ships from the single token SSOT into all six surfaces; no surface gets a private palette or typeface (FR-013). The font pipeline stays in `design-system/mobile-assets` for all three mobile apps. |
| **III. Dual-Path Backend Discipline** | ✅ PASS (declared: **no path**) | This feature adds no server capability (FR-002) and touches neither `core-api` nor `edge-api`. Order tracking renders order state the customer surface already receives. Research [R9](research.md#r9). |
| **IV. Auth Isolation** | ✅ PASS | No auth change. The source kit's Facebook sign-in is **dropped** (FR-030a) because it is not an Effy credential route; the customer pool's three existing routes are unchanged. |
| **V. Native-Feel, Consistent Design** | ⚠️ **AMENDMENT REQUIRED** | The brand-colour bullet pins Effy Emerald. It must be amended exactly as Jade was in v1.10.0 → **v1.11.0**. See below. |
| **VI. Layered Architecture & Explicit Wiring** | ✅ PASS | Presentation-layer only. ViewModels, use-cases, repositories and the `AuthDriver`/`PaymentDriver` seams are untouched; screens keep consuming immutable observable state (MVVM). |
| **VII. Observability & Telemetry** | ✅ PASS (unchanged) | No new telemetry. Mobile telemetry remains deferred per the 013/014/015 pattern; this feature neither adds nor removes it. |

### Principle V — the required amendment (v1.10.0 → v1.11.0)

The constitution currently reads: *"Brand color is Effy Emerald — accent `#065f46` (emerald-800) with a
white label in both modes, over neutral-scale surfaces (no brand tint), with a terracotta accent
`#d0735a`. … (Superseded Jade `#0FB57E` / fill `#047857` as of v1.10.0.)"*

It must become a **monochrome** statement: a ten-step neutral ramp where near-black is the accent in
light appearance and **near-white in dark** (the accent inverts — emerald did not have to), the two
semantic hues named and bounded, the typeface changed to General Sans, and **Effy Emerald recorded as
retired alongside Jade**. Everything else in Principle V — design-system SSOT, dark mode required and
user-selectable, native feel, touch targets, reference platforms, **no card layouts** — is unchanged
and still binding.

This is a **MINOR** bump by the same reasoning v1.10.0 used: a brand constant is replaced, no principle
is added or removed.

### Post-Phase-1 re-evaluation

Re-checked after Phase 1 artifacts. **No new violations.** Two points worth recording:

- **No-card doctrine holds without an exception.** The source's bordered cart line was the one
  conflict; the source's own **borderless row variant** is adopted instead (research
  [R8](research.md#r8)), so Complexity Tracking stays empty. Product tiles remain the single
  pre-existing recorded exception.
- **Rule C4 in `packages/brand` holds.** Splash grounds and mark colours remain **asset-local** and are
  still not design tokens; the package still does not depend on `design-system`. What changes is the
  meaning of a colourway (hue → polarity), and its header invariant **C2** is restated accordingly
  (research [R2](research.md#r2)).

## Project Structure

### Documentation (this feature)

```text
specs/026-monochrome-design-language/
├── plan.md                      # This file
├── spec.md                      # WHAT/WHY
├── research.md                  # Phase 0 — R1..R15 decisions
├── figma-source-findings.md     # Source-design facts (palette, type, 49-screen mapping)
├── data-model.md                # Phase 1 — token set, type scale, screen inventory
├── quickstart.md                # Phase 1 — validation runbook
├── contracts/
│   ├── design-tokens.contract.md
│   ├── brand-assets.contract.md
│   └── screen-inventory.contract.md
├── checklists/requirements.md
└── tasks.md                     # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
.specify/memory/constitution.md          # AMEND → v1.11.0 (Principle V brand constant)

packages/design-system/
├── src/tokens.css                       # THE SSOT — neutral ramp + 2 semantic hues, both appearances
├── scripts/check-tokens.mjs             # unchanged mechanism, new values, zero exemptions
├── scripts/gen-compose-theme.mjs        # SemiBold-led type scale; General Sans font accessors
├── scripts/sync-mobile-assets.mjs       # syncs the new .ttf set
├── scripts/check-mobile-assets.mjs      # drift guard over fonts + drawables
├── mobile-assets/font/                  # general_sans_{regular,medium,semibold}.ttf + ITF licence
└── compose/ compose-shop/ compose-driver/   # REGENERATED (3 themes, committed)

packages/brand/
├── src/logo.svg                         # recoloured master (neutral ramp)
├── src/colourways.mjs                   # colourway axis: hue → POLARITY; + RETIRED_EMERALD
├── src/compositions.mjs                 # SPLASH_GROUND restated to neutral
└── (57 committed derived assets regenerated across 5 surfaces)

scripts/
├── check-no-emerald.sh                  # NEW — sibling of check-no-jade.sh; +.mjs +.xml
└── check-no-jade.sh                     # unchanged, still enforced

apps/customer-web/app/layout.tsx         # next/font/google → next/font/local
apps/shop-web/src/main.tsx               # @fontsource → local @font-face
apps/back-office/src/main.tsx            # @fontsource → local @font-face

apps/customer-mobile/shared/src/commonMain/
├── composeResources/font/               # general_sans_*.ttf
└── kotlin/.../customer/mobile/
    ├── app/CustomerShell.kt             # restyled nav (5 tabs KEPT — research R7)
    ├── core/presentation/StorefrontKit.kt   # the shared visual vocabulary — largest single edit
    └── features/                        # 33 source-screen states (~15 files) + 6 new screens
        ├── catalog/  cart/  checkout/  addresses/  favorites/  account/  auth/  delivery/
        ├── onboarding/                  # NEW
        ├── notifications/               # NEW (fixture-backed)
        ├── tracking/                    # NEW (real 020 state)
        └── help/                        # NEW (FAQs · Help Center · Customer Service)

apps/shop-mobile/, apps/driver-mobile/   # theme regeneration ONLY — no screen edits
docs/audiences/customer-capabilities.md  # parity register update (FR-046)
```

**Structure Decision**: Two concentric rings. The **inner ring** is the shared identity —
`design-system` (tokens, generated Compose themes, fonts) and `brand` (marks) — which every surface
consumes and which US1/US2 deliver on their own. The **outer ring** is `apps/customer-mobile`, the only
surface receiving a screen-level rebuild (US3/US4). The other five surfaces are touched **only** where
the font mechanism must change, which is why FR-032 and FR-017 forbid structural edits there — a
diff outside those files on shop-web, back-office, shop-mobile, or driver-mobile is a scope error.

## Complexity Tracking

> No Constitution Check violations require justification.

The Principle V amendment is **not** a violation — it is the constitution's own documented mechanism
for replacing a brand constant, exercised once before at v1.10.0. It is recorded here for visibility
and is a gating task, not an exception.

| Item | Status |
|---|---|
| Card layouts | No exception needed — the source supplies a borderless row (R8) |
| Backend path | None used; declared under Principle III (R9) |
| Contrast exemptions | Zero requested; source values tuned instead (R1, R10) |
