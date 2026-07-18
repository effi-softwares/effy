# Research: Shop Mobile UI Foundation

All Phase 0 unknowns are resolved. Each decision records its rationale and rejected alternatives.

## R1 — Reset boundary: presentation only

**Decision**: Delete the reachable shop catalog/list/detail/create presentation, its presentation-bound
tests, and `CatalogProductRoute`. Rebuild authentication, session screens, shell, Home, Account, manager
gate, and placeholders. Preserve auth/session/platform drivers, shop and catalog domain/data/use cases,
generated DTOs, catalog draft storage, HTTP/config, and backend behavior.

**Rationale**: The user asked for a complete UI reset, while FR-003/FR-032 require proven security and
business behavior to survive. Deleting presentation rather than hiding it makes the old bottom sheet and
detail layouts impossible to reach, while keeping the later full-screen catalog rebuild inexpensive.

**Alternatives considered**: reskin existing screens (rejected: retains rejected hierarchy); delete the
whole catalog slice (rejected: destroys valid business/data work); keep old routes disconnected (rejected:
process restoration/deep navigation could revive them).

## R2 — Edge-to-edge with component-owned insets

**Decision**: Paint the Effy root background across the full window, remove `safeDrawing` from the root
`Surface`, and let the auth scroller, root-state content, and navigation chrome each consume the safe/system/
IME insets they own exactly once. Keep system bars visible.

**Rationale**: Root safe padding currently shrinks the themed surface and exposes an unthemed band behind
the status bar. Official guidance calls root padding safe but wasteful and recommends fine-grained inset
ownership for edge-to-edge apps. Insets animate with the keyboard and include cutouts/gesture regions.

**Alternatives considered**: fixed status/nav heights (device-specific and wrong); blanket root padding
(recreates the band); padding both shell and navigation components (double inset).

**Sources**: [Android insets setup](https://developer.android.com/develop/ui/compose/system/insets-ui),
[Android edge-to-edge](https://developer.android.com/develop/ui/compose/system/setup-e2e),
[Apple safe areas](https://developer.apple.com/documentation/uikit/positioning-content-relative-to-the-safe-area).

## R3 — System-bar appearance follows resolved Effy appearance

**Decision**: Keep Android `enableEdgeToEdge`, add `adjustResize`, and explicitly synchronize status/navigation
icon brightness with Effy Light/Dark/System. On iOS retain one full-window SwiftUI boundary, remove the
duplicate, and update the hosting controller interface/status style when Effy forces an appearance.

**Rationale**: Automatic icon styling follows the OS/app trait and can become unreadable when the user forces
the opposite Effy mode. Target SDK 36 is edge-to-edge by default. System information must remain present.

**Alternatives considered**: immersive mode (forbidden by product need); opaque fixed bars (visually
disconnect the app); OS-only icon style (fails forced appearance).

**Sources**: [Android system bar icons](https://developer.android.com/develop/ui/compose/system/setup-e2e),
[Apple status bars](https://developer.apple.com/design/human-interface-guidelines/status-bars).

## R4 — Responsive navigation policy

**Decision**: Use a bottom bar when usable width is below 600dp and a side rail at 600dp or above. Measure
the current post-inset app window, not physical device class. Preserve `TabBackStacks` across recomposition,
rotation, resize, and chrome changes; reset all stacks before sign-out.

**Rationale**: Standard compact/medium breakpoints respond to phones, tablets, split screen, and landscape.
Feature 018 explicitly prefers a rail in landscape when horizontal space exists, so a width-first override is
more appropriate than the default NavigationSuite rule that may keep a bar on compact-height landscape.

**Alternatives considered**: `isTablet` (not window-aware); orientation alone (rail can be too narrow in
split screen); new adaptive beta dependencies (unnecessary after the existing hand-owned stacks were
device-proven).

**Sources**: [window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes),
[adaptive navigation](https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation).

## R5 — Original Effy shell rather than generic component defaults

**Decision**: Build a small backward-compatible `mobile-kit` responsive frame and Effy primitives from
Foundation/Compose UI plus only the stable behavior needed from Material components. Keep the navigation
chrome visually stable, use lists/rows/dividers/whitespace, and provide icons/labels/selection shape.

**Rationale**: The current component-gallery feel is caused by default shapes, outlined boxes, uniform
buttons, missing typography, and default color roles. A compact primitive set creates one consistent
language without adding a new UI framework.

**Alternatives considered**: style every legacy Material component individually (retains structural debt);
third-party UI kit (new visual authority); separate shop-only navigation-state implementation (violates
shared cross-cutting rule).

## R6 — Complete generated mobile color roles

**Decision**: Extend `gen-compose-theme.mjs` so every Material color role the new mobile foundation can
request maps to an existing light/dark Effy token. Regenerate customer, shop, and driver artifacts atomically.
Never edit `EffyTokens.kt` directly and never invent a local status color.

**Rationale**: The current generated scheme maps only a subset. Unmapped roles inherit library defaults,
which explains the purple selected navigation in the screenshot. The source theme already supplies neutral,
primary, secondary, muted, accent, destructive, border/input/ring, and foreground pairs.

**Alternatives considered**: raw hex (forbidden); shop-only palette copy (second source); simply avoid all
unmapped roles (leaves future default leakage).

**Source**: [local generated theme](../../packages/design-system/compose-shop/EffyTokens.kt).

## R7 — Typography, spacing, radii, and assets

**Decision**: Bundle Nunito Sans regular/semibold/bold in shop Compose Resources, bind a deliberate type
scale in `EffyTheme`, and use only generated `EffySpacing`/`EffyRadius` for visual rhythm. Bundle four current
Material Symbols Rounded/Outlined vector pairs as common resources.

**Rationale**: The theme names Nunito Sans but the source app has no font assets or typography mapping.
Current Material Symbols are license-safe, cross-platform vector resources; individual files avoid the large,
deprecated Material Icons Extended artifact.

**Alternatives considered**: system fonts (break theme); Material Icons Extended (not maintained and large);
hand-drawn glyphs (quality/licensing inconsistency).

**Sources**: [Compose Multiplatform resources](https://kotlinlang.org/docs/multiplatform/compose-multiplatform-resources-usage.html),
[Material Symbols](https://developers.google.com/fonts/docs/material_symbols),
[Compose icon recommendation](https://developer.android.com/develop/ui/compose/graphics/images/material).

## R8 — Motion grammar and interruption

**Decision**: Add one centralized motion grammar: short directional fade/slide for email→code and nested
forward/back; fade-through for peer tab changes; short fade for session→shell; animated selection/press;
`AnimatedVisibility` for errors. Use interruptible state animations/springs and no decorative loops.

**Rationale**: Motion should communicate hierarchy/cause and survive rapid taps. `AnimatedVisibility`
removes absent content from semantics; alpha-only hiding does not. Stable navigation chrome reduces motion.

**Alternatives considered**: shared-element transitions (unneeded complexity); animate the entire shell
(disorienting); Lottie/custom animation assets (no product need).

**Sources**: [Compose animations](https://developer.android.com/develop/ui/compose/animation/introduction),
[interruptible animation specs](https://developer.android.com/develop/ui/compose/animation/customize),
[Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion).

## R9 — Reduced Motion needs an iOS bridge

**Decision**: Let Android Compose honor system `MotionDurationScale`. On iOS observe
`UIAccessibility.isReduceMotionEnabled` plus its change notification through the injected platform UI
controller. When reduced, replace translations/scales with immediate state changes or minimal fades.

**Rationale**: The resolved Compose 1.11.1 iOS motion scale remains `1f`; it does not automatically follow
UIKit Reduce Motion. The preference must update live and be centralized.

**Alternatives considered**: trust common scale on iOS (incorrect); app-specific motion setting (duplicates
OS accessibility); remove all feedback (state becomes unclear).

**Sources**: [MotionDurationScale](https://developer.android.com/reference/kotlin/androidx/compose/ui/MotionDurationScale),
[iOS Reduce Motion](https://developer.apple.com/documentation/uikit/uiaccessibility/isreducemotionenabled).

## R10 — One logical OTP field with optional native convenience

**Decision**: Maintain one OTP string and one accessibility node. Support paste, normalization, selection,
deletion, explicit submit, error preservation, and a resend cooldown. Android uses the common field and does
not claim SMS autofill for an email code. iOS uses a thin `UITextField` adapter with `.oneTimeCode` so system
QuickType can assist when available; autofill is never required.

**Rationale**: Six separate digit fields are fragile for focus, paste, screen readers, and replacement text.
Compose 1.11.1 does not yet map common content types to UIKit, while UIKit has a stable one-time-code type.

**Alternatives considered**: six focusable boxes (accessibility regression); SMS OTP semantic on Android
(wrong credential channel); experimental common mapping (not implemented upstream).

**Sources**: [Compose autofill](https://developer.android.com/develop/ui/compose/text/autofill),
[Apple one-time-code autofill](https://developer.apple.com/documentation/uikit/uitextcontenttype/onetimecode),
[Compose UIKit interop](https://kotlinlang.org/docs/multiplatform/compose-uikit-integration.html).

## R11 — Accessibility contract and tests

**Decision**: All targets are at least 48dp; navigation merges icon+label into one selected semantic node;
visible labels persist; headings/errors/roles are explicit; errors use a polite live region; no countdown is
live-announced; large text has no fixed-height text box. Add Compose UI v2 semantics tests, Android automated
checks where supported, and live TalkBack/VoiceOver/XCTest audits.

**Rationale**: Compose maps common semantics into native iOS accessibility objects. Accessibility must be a
component invariant, not final polish, and state cannot rely on color/motion alone.

**Alternatives considered**: icon-only navigation (ambiguous); duplicate icon descriptions plus visible label
(double announcement); automated tests only (cannot prove platform reading order/system chrome).

**Sources**: [Compose semantics](https://developer.android.com/develop/ui/compose/accessibility/semantics),
[48dp targets](https://developer.android.com/develop/ui/compose/accessibility/api-defaults),
[Compose iOS accessibility](https://kotlinlang.org/docs/multiplatform/compose-ios-accessibility.html),
[Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

## R12 — Appearance preference and test strategy

**Decision**: Finish the existing `AppearanceMode` contract with a settings-backed observable store and an
Account selector. Default System, persist locally, update instantly. Test state/policy/semantics in common
tests; use real simulator/device matrix for system bars, insets, keyboard, font rendering, motion, and visual
quality. No screenshot dependency is added in this slice.

**Rationale**: `AppearanceMode` exists but App always uses System and there is no store/control. Visual
goldens alone cannot validate safe areas or platform accessibility; semantics plus live evidence provide the
right split at current project maturity.

**Alternatives considered**: in-memory mode (does not persist); three separate platform theme stores
(duplication); screenshot library introduction during the UI reset (widens toolchain before the foundation
stabilizes).

**Source**: [Compose Multiplatform 1.11 UI testing](https://blog.jetbrains.com/kotlin/2026/05/compose-multiplatform-1-11-0/).
