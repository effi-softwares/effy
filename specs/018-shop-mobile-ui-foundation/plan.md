# Implementation Plan: Shop Mobile UI Foundation

**Branch**: `(current worktree; no feature branch created)` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-shop-mobile-ui-foundation/spec.md`

## Summary

Replace every reachable shop-mobile screen with a new presentation foundation while preserving the
proven authentication, session, authorization, domain, data, and backend behavior. The first rebuilt
surface is deliberately narrow: EMAIL_OTP authentication; Restoring/Refused states; a safe-area-aware,
edge-to-edge shell; responsive Home/Catalog/Orders/Account navigation; new Home, Account, and manager-gate
screens; and polished placeholders for catalog/orders until their dedicated redesigns.

The implementation uses shared Compose UI but no longer accepts generic Material defaults as the visual
language. It introduces small Effy mobile primitives driven entirely by the generated design tokens,
completes the mobile color-role mapping so no purple/default Material roles leak through, bundles Nunito
Sans and four licensed Material Symbol vectors, centralizes short interruptible motion, observes iOS
Reduce Motion explicitly, and synchronizes system-bar icon contrast with the resolved appearance. The
outer window paints the Effy background edge-to-edge; individual screen/chrome owners consume safe-area
and keyboard insets exactly once.

The legacy catalog presentation (`CatalogListScreens`, `ProductDetailScreens`, `ProductCreateSheet`) and
product-detail route are deleted. Catalog data/domain/use cases and stored product data remain intact for
the later full-screen catalog rebuild. No backend, database, infrastructure, deployment, or migration work
is introduced.

## Technical Context

**Language/Version**: Kotlin **2.4.0**, Compose Multiplatform **1.11.1**, AGP **9.0.1**, JVM target 11;
Swift/iOS host code with iOS deployment target **18.2**.

**Primary Dependencies**:
- Existing: Compose runtime/foundation/UI **1.11.1**, Material3 **1.11.0-alpha07**, lifecycle/ViewModel
  **2.10.0**, coroutines **1.10.2**, serialization **1.9.0**, multiplatform-settings **1.3.0**, Amplify
  Android **2.25.0**, Amplify Swift, and the source-shared `packages/mobile-kit`.
- Add explicitly: Compose animation for common motion; Compose UI test v2 for common semantics/stateful UI
  tests; AndroidX Core in the Android shared source set for system-bar icon control.
- Assets, not libraries: self-hosted Nunito Sans regular/semibold/bold font files and four current Material
  Symbols vector pairs under Compose Resources.
- Deliberately not added: Material Icons Extended, NavigationSuite/Adaptive beta, a third-party animation
  framework, screenshot framework, or DI framework.

**Storage**: Existing Amplify secure session storage unchanged. Add one non-sensitive local preference,
`appearance.mode = light|dark|system`, through the existing multiplatform-settings dependency. Existing
catalog draft storage is preserved but dormant while catalog presentation is retired.

**Testing**: `kotlin.test`, `kotlinx.coroutines.test`, Compose UI test v2, existing hand-written fakes, Android
host tests, Android assemble, and iOS simulator framework link. Manual visual/accessibility validation on
Android phone/tablet and iPhone/iPad remains mandatory for system bars, keyboard, TalkBack/VoiceOver,
motion, appearance overrides, and physical safe areas.

**Target Platform**: Android minSdk 24 / target+compileSdk 36; iPhone and iPad on iOS 18.2+; portrait,
landscape, split/resized windows, gesture and legacy navigation modes.

**Project Type**: One KMP mobile app plus shared design-system/mobile-kit sources; no service work.

**Performance Goals**: 60 fps during shell/auth transitions on supported devices; press feedback begins in
the next rendered frame; peer-tab transition completes within 240 ms at normal motion scale; repeated taps
remain interruptible; rotation/resizing preserves the selected tab without rebuilding the session graph.

**Constraints**: EMAIL_OTP only; login-first; four fixed tabs; no cards/metric dashboard; no raw colors or
spacing values for visual styling; all system bars remain visible; 48dp minimum interactive targets; one
logical OTP field; reduced motion honored; no legacy catalog UI reachable; catalog business/data behavior
preserved; no live AWS mutations.

**Scale/Scope**: Four primary destinations, five root session states/transitions, two authentication steps,
three appearance modes, two navigation forms, four device layout postures, and three retired catalog
presentation files. Shop is the only UI consumer changed; token/mobile-kit changes trigger customer and
driver regression builds.

## Constitution Check

*GATE: evaluated before research and re-checked after Phase 1 design against constitution v1.10.0.*

| Principle | Gate and design response | Status |
|---|---|---|
| **I — Spec-Driven** | Feature 018 has a validated spec; this plan, research, model, contracts, and quickstart precede tasks/implementation. | ✅ PASS |
| **II — Monorepo & shared contracts** | `tokens.css` remains the color/spacing/radius SSOT and generator emits all mobile packages atomically. Generic navigation/motion policy extends `mobile-kit`; shop supplies routes/content/icons. Catalog DTO/domain/data are preserved. | ✅ PASS |
| **III — Dual path** | No backend work. Existing shop cold-path service is reused without endpoint or contract changes. | ✅ N/A |
| **IV — Auth isolation** | Existing shop-only Amplify drivers, access-token path, enumeration-safe errors, record authority, and manager endpoint remain unchanged. Presentation never grants access. | ✅ PASS |
| **V — Native feel & design** | Effy tokens only; Light/Dark/System; Nunito Sans; 48dp targets; purpose-built motion; Uber Eats/eBay direction; no cards; Android edge-to-edge/Material behavior; iOS safe area, native OTP adapter, VoiceOver, and Reduce Motion. Fully separate SwiftUI chrome remains a carried deviation below. | ⚠️ PASS with recorded inherited deviation |
| **VI — Layered architecture** | ViewModels retain immutable state and explicit use cases; platform UI capability sits behind one injected interface; no DI framework; presentation-only deletion does not breach domain/data boundaries. | ✅ PASS |
| **VII — Observability** | Mobile PostHog/Crashlytics remain absent under the already-recorded `mobile-telemetry` deviation. No new PII is logged. | ⚠️ PASS with carried deviation |

**Post-design gate result**: PASS. All research unknowns are resolved. There are no undocumented principle
violations and no backend-path ambiguity.

## Project Structure

### Documentation (this feature)

```text
specs/018-shop-mobile-ui-foundation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── auth-ui.contract.md
│   ├── adaptive-shell.contract.md
│   └── visual-system.contract.md
├── checklists/requirements.md
└── tasks.md                         # created by /speckit-tasks, not this command
```

### Source Code (repository root)

```text
packages/design-system/
├── src/tokens.css                   # SSOT unchanged in values; stale comments corrected if touched
├── scripts/gen-compose-theme.mjs    # complete mobile ColorScheme mapping from existing tokens
├── compose/EffyTokens.kt            # regenerated customer artifact
├── compose-shop/EffyTokens.kt       # regenerated shop artifact; never hand-edited
└── compose-driver/EffyTokens.kt      # regenerated driver artifact

packages/mobile-kit/
├── nav/TabBackStacks.kt             # preserve; reset before sign-out
├── shell/AdaptiveNavShell.kt         # preserve for customer compatibility
├── shell/ResponsiveNavigation.kt     # new bar/rail policy + Effy shell frame; shop migrates first
├── ui/Motion.kt                      # new centralized, interruptible motion grammar
└── ui/WindowSize.kt                  # preserve content size classes; expand policy tests

apps/shop-mobile/
├── androidApp/
│   ├── src/main/AndroidManifest.xml  # add adjustResize; keep bars visible
│   └── src/main/.../MainActivity.kt  # edge-to-edge + Android platform UI controller
├── iosApp/iosApp/
│   ├── ContentView.swift             # retain one full-window safe-area boundary
│   └── iOSApp.swift                  # remove duplicate ignoresSafeArea
└── shared/src/
    ├── commonMain/
    │   ├── composeResources/
    │   │   ├── drawable/             # Home/Catalog/Orders/Account outlined+selected symbols
    │   │   └── font/                 # Nunito Sans regular/semibold/bold
    │   └── kotlin/.../
    │       ├── app/App.kt             # edge background + animated session gate
    │       ├── app/AppContainer.kt    # appearance store; existing data/domain wiring preserved
    │       ├── core/nav/ShopRoutes.kt # four roots + ManagerArea; remove product route
    │       ├── core/platform/PlatformUiController.kt
    │       ├── core/theme/
    │       │   ├── AppearancePreferenceStore.kt
    │       │   ├── EffyTheme.kt
    │       │   └── EffyTypography.kt
    │       ├── core/ui/               # small Effy field/button/page/row primitives
    │       ├── features/auth/presentation/
    │       │   ├── AuthViewModel.kt
    │       │   ├── SignInScreen.kt
    │       │   └── OtpInput.kt         # common contract
    │       └── features/shop/presentation/
    │           ├── ShopShell.kt
    │           ├── HomeScreen.kt
    │           ├── AccountScreen.kt
    │           ├── ManagerAccessScreen.kt
    │           └── FoundationPlaceholderScreen.kt
    ├── androidMain/.../
    │   ├── core/platform/AndroidPlatformUiController.kt
    │   └── features/auth/presentation/OtpInput.android.kt
    ├── iosMain/.../
    │   ├── core/platform/IosPlatformUiController.kt
    │   └── features/auth/presentation/OtpInput.ios.kt  # one UITextField, oneTimeCode convenience
    └── commonTest/.../
        ├── features/auth/presentation/AuthViewModelTest.kt
        ├── features/shop/presentation/ShopShellStateTest.kt
        ├── core/theme/AppearancePreferenceStoreTest.kt
        ├── core/ui/ResponsiveNavigationTest.kt
        └── ui/ShopFoundationUiTest.kt

# REMOVE from shop presentation only; preserve catalog data/domain/tests
apps/shop-mobile/shared/src/commonMain/.../features/catalog/presentation/
├── CatalogListScreens.kt
├── ProductDetailScreens.kt
└── ProductCreateSheet.kt

docs/audiences/shop-capabilities.md   # mobile catalog UI rows become outstanding until rebuild
apps/shop-mobile/README.md            # replace stale base-template status
```

**Structure Decision**: Keep the existing top-level session authority and shared serializable per-tab
back stacks. Introduce a backward-compatible responsive shell in `mobile-kit` and migrate only shop-mobile;
customer-mobile remains on the old shell until its own visual slice. Split the shop monolith into
feature-owned screens and small core UI primitives. Platform UI behavior is injected explicitly at the
native entry points, while business behavior remains behind existing domain use cases.

## Delivery Phasing

1. **Token and platform proof**: complete the generated ColorScheme map; add Nunito/resources; establish
   the edge-to-edge/system-icon controller and reduced-motion bridge; prove Android/iOS compile before UI
   removal.
2. **Presentation retirement**: remove catalog presentation/routes/tests, disconnect catalog from the shell,
   and update capability/README truth. Domain/data/use cases remain.
3. **Authentication foundation (P1)**: rebuild ViewModel state, validation, dedupe, resend, focus/keyboard,
   one logical OTP input, errors, semantics, and forward/back motion.
4. **Responsive shell (P2)**: new four-item production bar/rail, per-tab state, sign-out reset, Home/Account,
   manager gate, and placeholders. Usable width <600dp → bar; ≥600dp → rail.
5. **Visual/motion/accessibility hardening (P3/P4)**: Light/Dark/System selector, platform bar contrast,
   reduced motion, large text, semantics, rapid taps, orientation/split state, and old-UI absence proof.
6. **Cross-app regression and live matrix**: token generator and mobile-kit require shop/customer/driver
   compile gates; operator performs Android+iOS visual/device sign-off from quickstart.

## Telemetry

No PostHog or Crashlytics code exists in the mobile apps. This feature adds no event calls and emits no
credentials, email addresses, or OTP values to logs. The documented `mobile-telemetry` slice remains the
owner of `auth_started`, `auth_completed`, `auth_failed`, `primary_destination_changed`, app version, crash
reporting, and consent behavior. This deferral is explicit rather than silently claiming observability.

## Complexity Tracking

| Deviation / complexity | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Shared Compose visual chrome on iOS** (inherited Principle V deviation) | One KMP presentation is retained, but it now adds UIKit safe-area/status integration, a native OTP input adapter, VoiceOver semantics, iOS Reduce Motion, and HIG-sized controls. | A separate SwiftUI shell/auth implementation doubles the entire presentation and is the named later `iOS native shell` slice; doing it inside this reset would obscure the foundation goal. |
| **Mobile telemetry deferred** (carried Principle VII deviation) | Shared mobile telemetry has an existing named owner and must be introduced once across all mobile apps with consent/PII rules. | Shop-only analytics would duplicate the cross-cutting taxonomy and still leave the other mobile surfaces incomplete. |
| **Complete generated mobile color mapping** | Unmapped Material roles currently fall through to library defaults (including purple selection), violating the theme SSOT. Generator output changes all three mobile packages atomically. | App-local hardcoded colors or editing `EffyTokens.kt` would create drift; avoiding all affected roles leaves the defect latent. |
| **Native iOS OTP and motion bridges** | Compose 1.11.1 does not map common email-OTP autofill to UIKit and its iOS motion-duration scale does not follow Reduce Motion. | Six focusable OTP boxes or trusting unsupported common behavior would be less accessible and would fail paste/autofill/reduced-motion requirements. |

## Operator-Run Steps

No cloud-facing operation. Do not run deployments, Terraform, migrations, or live-state mutations. The
operator only supplies existing dev configuration and performs real-device/simulator visual, accessibility,
and OTP validation described in [quickstart.md](./quickstart.md).
