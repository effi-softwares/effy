# Implementation Plan: Driver Mobile UI Completion

**Branch**: `dev` (no feature branch — this project registers no `before_specify` git hook) | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/060-driver-mobile-ui/spec.md`

## Summary

Build every screen of `apps/driver-mobile` to the imported design "Effy Driver App v2", in the
platform's **live cobalt** token set rather than the design's retired monochrome one. Feature 049 built
the app's flows against a real backend and left its appearance unbuilt: **14 of the design's 45 in-app
screens do not exist**, 23 render the right information with none of the design's layout or
interaction, and the Map tab is a "coming soon". This feature closes all three gaps, renders fields the
platform cannot supply as placeholders, and produces a **provenance register** that is the single
authority on which parts of the app are real.

**Technical approach**: a presentation-layer slice, no backend. Shared chrome in `commonMain`, with
three per-platform surfaces (`expect/actual`) where a screen genuinely needs the OS: the map, the
camera viewfinder, and the existing photo handoff. OpenStreetMap arrives through **MapLibre Compose**
against **OpenFreeMap** tiles — ⚠ *not* OSM's own tile servers, which forbid app distribution (R2).
That costs a Kotlin/CMP bump, which the three-independent-Gradle-builds layout confines to this app
alone (R3). Two blocking spikes gate the map; FR-023e's stylised fallback means the tab is finished
either way.

## Technical Context

**Language/Version**: Kotlin **2.4.0 → 2.4.20** (bump, gated on spike S1 — R3)

**Primary Dependencies**: Compose Multiplatform **1.11.1 → 1.12.0** · Material 3 `1.11.0-alpha07` +
`material3-adaptive-navigation-suite` · **NEW: `org.maplibre.compose:maplibre-compose:0.17.0`** ·
**NEW: CameraX** (Android only, for the in-app viewfinder) · `packages/mobile-kit` (source-included) ·
`packages/design-system/compose-driver` (generated theme) · Ktor 3.5.1 · Amplify 2.25.0 (all unchanged)

**Storage**: N/A — no migration, no schema change, no new persisted state beyond the existing
appearance preference and offline queue.

**Testing**: `:shared:testAndroidHostTest` (Kotlin/JVM host tests) · `:shared:iosSimulatorArm64Test` ·
`:androidApp:assembleDebug` · `mobile-guard` · `cm-contract-check` · the design-system gates
(`check-tokens`, `check-component-shape`, `check-token-usage`, `tokens:check`, `mobile-assets:check`,
the retired-hue sweeps) · **new source guards**: single-MapLibre-import, placeholder-register parity,
no-currency, no-shop-copy

**Target Platform**: Android `minSdk 24 / compileSdk 36` and iOS (simulator + device), one shared
presentation layer

**Project Type**: Mobile (Kotlin Multiplatform + Compose Multiplatform), Clean Architecture + MVVM

**Performance Goals**: 60 fps on the swipe-to-confirm gesture and list scrolling on a mid-range
Android device; map first paint within 2 s on a warm network

**Constraints**: No backend change · no colour outside the design-system tokens · no currency anywhere ·
48 dp minimum touch targets · both appearances on every screen · reduced-motion respected ·
⚠ `packages/mobile-kit` is **source-shared with customer-mobile and shop-mobile**, so every edit to it
must be additive and proven against their suites

**Scale/Scope**: 45 in-app design screens across ~24 destinations · 7 user stories · 31 functional
requirements · one app, two platforms

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Evaluated against **constitution v2.0.0** (amended 2026-09-20 for cobalt — this feature was the
trigger; see that amendment's Sync Impact Report).

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven Development** | ✅ PASS | `spec.md` → this plan → `tasks.md`. The constitution was amended *before* planning rather than after, so no artifact was written against a rule it contradicts. |
| **II. Shared Packages (no copy-paste)** | ✅ PASS | `EffyPullToRefresh` is **promoted** from customer-mobile into `mobile-kit` rather than copied (R7); skeletons and the swipe track are authored in `mobile-kit`; icons go into the `mobile-assets` SSOT, not app-local resources (R9). |
| **III. Dual Path (hot/cold)** | ✅ **N/A** | No backend work of any kind. No endpoint, no Lambda, no Go handler, no migration. |
| **IV. Auth Isolation (4 pools)** | ✅ PASS | No auth change. The driver pool, its client and the single-token protocol are untouched. Sign-in **copy** changes (FR-010); the flow does not. |
| **V. Native-Feel, Consistent Design** | ⚠ **PASS WITH RECORDED EXCEPTIONS** | Cobalt from the design-system SSOT, no design colour transcribed (FR-005/007). Dark mode + user-selectable retained. 48 dp targets (FR-008). Micro-animations required (FR-009). **Three card layouts justified** under the principle's own escape clause — see R12 and Complexity Tracking. **Reference platforms**: Uber/Bolt/foodpanda are the driver-app reference the constitution names for this surface. ⚠ **A typeface gap was found** — see Complexity Tracking. |
| **VI. Layered Architecture & Explicit Wiring** | ✅ PASS | Presentation only; existing `ViewModel → UseCase → Repository` layering untouched. New per-platform surfaces follow the established `expect/actual` driver pattern (`AuthDriver`, `MapLauncher`, `PhotoCapture`). No DI framework. |
| **VII. Observability & Telemetry** | ⚠ **DEFERRED, declared** | Mobile telemetry has been deferred on every mobile slice since 013 and is **explicitly out of scope** in the spec. Declared here rather than silently omitted, per the principle's requirement that telemetry be *declared*. No new crash or analytics surface is introduced. |

**Real-World Identifiers**: ✅ PASS. The design's `1800 EFFY OPS` dispatch number is **not** adopted
(FR-012) — a phone number on a driver's help screen is exactly an outward-facing identifier the
constitution requires be operator-supplied. The help screen shows the field as unavailable until the
operator supplies a real number, and the register records it. ⚠ This is the constitution's
"fail loudly rather than carry a guess" rule applied to a UI field rather than a config value.

**Quality Gates**: ✅ The colour gate (`check-tokens` / `check-token-usage` / retired-hue sweeps) is in
the verification set. No operator-unsupplied identifier ships.

**Gate result: PASS.** Three exceptions recorded in Complexity Tracking, none of them a deviation the
constitution forbids outright.

## Project Structure

### Documentation (this feature)

```text
specs/060-driver-mobile-ui/
├── plan.md                    # This file
├── spec.md                    # Feature specification
├── research.md                # Phase 0 — R1..R14, spikes S1/S2
├── data-model.md              # Phase 1 — screen/state/field model
├── quickstart.md              # Phase 1 — the 45-screen validation walk
├── provenance-register.md     # Phase 1 — ⚠ THE FEATURE DELIVERABLE (US2/FR-013)
├── contracts/
│   └── screen-inventory.md    # Phase 1 — 45 design screens → destinations + states
├── checklists/
│   └── requirements.md        # Spec quality checklist (complete)
└── tasks.md                   # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
apps/driver-mobile/
├── gradle/libs.versions.toml              # S1: kotlin 2.4.20, compose 1.12.0, +maplibre, +camerax
├── iosApp/iosApp/                         # S2: linker flags (OPERATOR, in Xcode)
└── shared/src/
    ├── commonMain/kotlin/com/effyshopping/driver/mobile/
    │   ├── app/
    │   │   ├── App.kt                     # splash state rebuilt
    │   │   └── DriverShell.kt             # ⚠ TabGlyph letters → real icons
    │   ├── core/
    │   │   ├── placeholder/Placeholder.kt # NEW — the marker type (R11)
    │   │   ├── platform/
    │   │   │   ├── EffyMapCanvas.kt       # NEW — ⚠ the ONLY MapLibre import (R4)
    │   │   │   └── CameraPreviewSurface.kt# NEW — expect (R8)
    │   │   └── ui/                        # NEW — swipe track, skeletons, keypad, chips
    │   └── features/
    │       ├── auth/        # splash, email copy, 5 OTP states
    │       ├── onboarding/  # perms progress, perm-denied (NEW)
    │       ├── today/       # offduty, home ×2, empty, offline, skeleton, error
    │       ├── collection/  # run, stop (tick + swipe), problem (NEW), hub ×2
    │       ├── delivery/    # run, drop, enroute (NEW), arrived (NEW), 5 proof, success, failed
    │       ├── map/         # NEW FEATURE — collection + delivery modes
    │       ├── activity/    # mark-all-read, title+body
    │       ├── history/     # run record, drop proof render
    │       └── account/     # rows, appearance (NEW), help (NEW), signout
    ├── androidMain/…/CameraPreviewSurface.android.kt   # NEW — CameraX
    └── iosMain/…/CameraPreviewSurface.ios.kt           # NEW — designed stand-in + handoff

packages/
├── mobile-kit/common/ui/
│   ├── EffyPullToRefresh.kt      # ⚠ PROMOTED from customer-mobile (R7) — shared by 3 apps
│   ├── EffySkeleton.kt           # NEW (R10)
│   └── SwipeToConfirm.kt         # NEW (R6)
└── design-system/mobile-assets/drawable/   # NEW driver icons → SSOT (R9)
```

**Structure Decision**: The existing `apps/driver-mobile` three-module KMP layout (`shared` +
`androidApp` + `iosApp`) with `commonMain` presentation is retained unchanged. One new feature package
(`features/map/`) is added; everything else edits existing feature packages in place. Genuinely shared
UI goes to `packages/mobile-kit` (Principle II) and icons to the `mobile-assets` SSOT — ⚠ both are
**source-shared with the other two mobile apps**, which is where this feature's real regression risk
lives (R3), not in the toolchain bump.

## Phased Delivery

Ordered so each phase is independently demonstrable, and so the two risky spikes resolve before
anything depends on them.

| Phase | Content | Gates |
|---|---|---|
| **0 — Spikes** | S1 toolchain bump · S2 iOS linker flags (operator) | Both compile targets green, incl. iOS **test** compilation (033's lesson) |
| **1 — Foundations** | Placeholder marker + register scaffold · icons into SSOT · `SwipeToConfirm`, `EffySkeleton` in mobile-kit · promote `EffyPullToRefresh` | ⚠ customer-mobile + shop-mobile suites pass **unmodified** |
| **2 — US1 the shift loop** | offduty · home ×2 · collection-run · shop-stop · shop-problem · hub ×2 · delivery-run · drop-detail · enroute · arrived · 5 proof · success · failed | The design's own demo walk, both appearances |
| **3 — US2 the register** | Every screen and field classified; the drift guard | Guard fails when a placeholder is unlisted |
| **4 — US3 the map** | `EffyMapCanvas` · both modes · stop list · attribution | Map renders on **both** platforms; no key in the bundle |
| **5 — US4 account** | account rows · appearance · help · signout | Every sub-screen reachable |
| **6 — US5 auth** | splash · driver copy · 5 OTP states · perms · perm-denied | Copy sweep clean |
| **7 — US6/US7 states + history** | skeletons ×2 · error · offline · history run/drop/proof · activity | All 45 screens photographed |

## Complexity Tracking

> Recorded exceptions. Each is a deliberate, justified departure — none is an undocumented deviation.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Card layouts on 3 screens** (Principle V's "no card layouts") | The current-stop/drop hero contains a **map strip** a detail row cannot hold; collection-run's blocks each carry a **per-stop action button**, which is a card however it is named; hub-checkin's two split blocks must show a **proportional relationship** between two outcomes of one quantity. | Tables/rows/sections are used for the other ~21 destinations. For these three, a row loses the thing the screen exists to communicate. Principle V's escape clause requires exactly this justification; full per-screen reasoning in [research.md R12](./research.md). |
| **A pre-1.0 dependency** (`maplibre-compose` 0.17.0, documented breaking changes between minors) | It is the only Compose Multiplatform library rendering OSM on **both** platforms. The operator chose OpenStreetMap; the alternatives are Android-only, Google Maps (key + billing), or building a tile engine. | Bounded by design: **one** import site (`EffyMapCanvas.kt`), asserted by a source guard, so an upgrade is one file and FR-023e's fallback is a substitution rather than a rewrite. |
| **Toolchain bump** (Kotlin 2.4.0 → 2.4.20, CMP 1.11.1 → 1.12.0) | No MapLibre release is built against CMP 1.11.x. | Cannot be avoided while keeping OSM. ⚠ **Contained structurally**: three independent Gradle builds mean it cannot reach customer-mobile or shop-mobile. Gated on spike S1 with a recorded fallback. |
| **iOS camera viewfinder deferred** (the `proof-photo` *surface*, not the screen) | A live iOS viewfinder needs a Swift AVFoundation bridge — the same shape as the platform's other deferred iOS bridges (050's `SwiftPushBridge`). | The **screen ships on both platforms**; only the preview surface differs, and iOS hands off to the system camera. ⚠ This still **closes a live defect**: iOS has *no* photo proof today because `rememberPhotoCapture` returns null there. One register entry records the gap. |
| **⚠ Typeface: constitution says Geist, mobile renders General Sans** | Found while planning (R5): **no Geist font file exists in this repository**; mobile has no CSS-style fallback chain, so it renders the only committed face. | Correct behaviour — General Sans is the fallback doing its declared job — but the constitution does not **say** so, which is the same law-vs-practice gap the cobalt amendment just closed. **A PATCH clarification (v2.0.1) is owed.** This feature does not add Geist to mobile: that is a design-system slice with its own licensing question. |
| **Telemetry deferred** (Principle VII) | Out of scope in the spec; mobile telemetry has been deferred on every mobile slice since 013. | Declared rather than omitted, which is what Principle VII requires. No new crash/analytics surface is added, so nothing regresses. |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1 artifacts. **Still PASS.** The design phase changed the verdict in one
place and added nothing new:

- ⚠ **Principle V gained a finding**, not a violation: the Geist/General Sans gap (R5). It is recorded
  above and owed a PATCH amendment; it does not block this feature, because mobile rendering the
  declared fallback face is the correct behaviour under the token declaration as written.
- **Principle II strengthened**: the design work surfaced `EffyPullToRefresh` as an existing
  customer-mobile component, turning a would-be duplicate into a promotion (R7).
- **Real-World Identifiers held under pressure**: the design supplies a plausible dispatch phone
  number, and the correct answer is to refuse it and show the field as unavailable — the rule's
  "fail loudly rather than carry a guess" applied to UI.
- No new backend, auth, or data-path concern emerged, so III, IV and VI are unchanged.
