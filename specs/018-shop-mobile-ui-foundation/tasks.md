# Tasks: Shop Mobile UI Foundation

**Input**: Design documents from `/specs/018-shop-mobile-ui-foundation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included because the feature specification, UI contracts, and quickstart explicitly require state-transition, semantics, responsive-navigation, route-restoration, and legacy-absence proof.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as a coherent increment. Shared design-system, platform, motion, and UI primitives are established first because every story depends on them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same phase
- **[Story]**: Maps the task to a user story from `spec.md`
- Every checklist item names the exact file or files it changes or validates

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the existing KMP project, generated theme pipeline, and source sets for the new foundation without changing business behavior.

- [X] T001 Add Compose animation, Compose UI test v2, AndroidX Core, and required test source-set dependencies in `apps/shop-mobile/gradle/libs.versions.toml` and `apps/shop-mobile/shared/build.gradle.kts`
- [X] T002 [P] Complete the Material `ColorScheme` role-to-token mapping in `packages/design-system/scripts/gen-compose-theme.mjs` and regenerate `packages/design-system/compose/EffyTokens.kt`, `packages/design-system/compose-shop/EffyTokens.kt`, and `packages/design-system/compose-driver/EffyTokens.kt`
- [X] T003 [P] Add licensed Nunito Sans regular, semibold, and bold resources plus their license in `apps/shop-mobile/shared/src/commonMain/composeResources/font/nunito_sans_regular.ttf`, `apps/shop-mobile/shared/src/commonMain/composeResources/font/nunito_sans_semibold.ttf`, `apps/shop-mobile/shared/src/commonMain/composeResources/font/nunito_sans_bold.ttf`, and `apps/shop-mobile/shared/src/commonMain/composeResources/font/OFL.txt`
- [X] T004 [P] Add licensed outlined and selected Home, Catalog, Orders, and Account Material Symbol vectors in `apps/shop-mobile/shared/src/commonMain/composeResources/drawable/ic_home_outlined.xml`, `ic_home_selected.xml`, `ic_catalog_outlined.xml`, `ic_catalog_selected.xml`, `ic_orders_outlined.xml`, `ic_orders_selected.xml`, `ic_account_outlined.xml`, and `ic_account_selected.xml`
- [X] T005 [P] Add the Material Symbols asset attribution in `apps/shop-mobile/shared/src/commonMain/composeResources/drawable/MATERIAL_SYMBOLS_LICENSE.txt`
- [X] T006 Configure keyboard resize behavior while retaining visible edge-to-edge system bars in `apps/shop-mobile/androidApp/src/main/AndroidManifest.xml`

**Checkpoint**: Dependencies and authored/generated assets are ready; all three generated mobile token artifacts remain drift-guarded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the theme, platform, inset, motion, responsive-shell, and reusable UI infrastructure required by every user story.

**⚠️ CRITICAL**: No user-story implementation begins until this phase compiles on Android and links for the iOS simulator.

- [X] T007 Bind the Nunito Sans resources to the Effy title, section, body, metadata, label, and validation type scale in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/theme/EffyTypography.kt`
- [X] T008 Extend the generated color schemes with Effy typography and resolved Light/Dark/System state while keeping `tokens.css` as the styling authority in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/theme/EffyTheme.kt`
- [X] T009 [P] Define platform UI state, resolved-appearance synchronization, reduced-motion observation, and disposal contracts in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/platform/PlatformUiController.kt`
- [X] T010 [P] Implement Android reduced-motion observation and visible status/navigation icon contrast control in `apps/shop-mobile/shared/src/androidMain/kotlin/com/effyshopping/shop/mobile/core/platform/AndroidPlatformUiController.kt`
- [X] T011 [P] Implement the UIKit Reduce Motion observation and interface-style control in `apps/shop-mobile/shared/src/iosMain/kotlin/com/effyshopping/shop/mobile/core/platform/IosPlatformUiController.kt`
- [X] T012 Remove the duplicate SwiftUI full-window boundary while retaining exactly one edge-to-edge Compose host in `apps/shop-mobile/iosApp/iosApp/ContentView.swift` and `apps/shop-mobile/iosApp/iosApp/iOSApp.swift`
- [X] T013 [P] Define centralized None/Reduced/Full motion levels and interruptible Press, Selection, PeerDestination, Forward, Back, RootState, and Visibility specs in `packages/mobile-kit/ui/Motion.kt`
- [X] T014 [P] Implement the width-first `<600dp` bottom-bar and `≥600dp` side-rail policy with component-owned safe insets and stable content chrome in `packages/mobile-kit/shell/ResponsiveNavigation.kt`
- [X] T015 Preserve the existing content size classes while exposing testable usable-width navigation policy helpers in `packages/mobile-kit/ui/WindowSize.kt`
- [X] T016 Build token-driven page, field, primary-action, text-action, section, identity-row, error, loading, and placeholder primitives with 48dp targets in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/ui/EffyComponents.kt`
- [X] T017 Pass the platform UI controller explicitly into the common app from `apps/shop-mobile/androidApp/src/main/kotlin/com/effyshopping/shop/mobile/MainActivity.kt` and `apps/shop-mobile/shared/src/iosMain/kotlin/com/effyshopping/shop/mobile/MainViewController.kt`, updating `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/app/App.kt` without adding platform dependencies to domain/data code
- [X] T018 Compile the foundational targets with `apps/shop-mobile/gradlew :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64` using `apps/shop-mobile/build.gradle.kts`

**Checkpoint**: The design system, native system-UI adapters, motion policy, responsive chrome, and Effy primitives are available to all stories.

---

## Phase 3: User Story 1 - Sign In Through a Calm, Focused Flow (Priority: P1) 🎯 MVP

**Goal**: Deliver the complete passwordless work-email and one-time-code journey, including restoration, refusal, validation, retry, resend, keyboard, system-area, and protected-content guarantees.

**Independent Test**: Start signed out on supported phone and tablet sizes, request a code, enter it, recover from one invalid attempt, and reach the signed-in shell without protected content appearing before `SessionManager` authorizes the operator.

### Tests for User Story 1

- [X] T019 [P] [US1] Add failing unit coverage for every `AuthUiState` transition, local validation, input normalization, duplicate suppression, enumeration-safe identity error mapping, error preservation, resend cooldown, back, and `SessionManager` handoff in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/AuthViewModelTest.kt`
- [X] T020 [P] [US1] Add failing Compose UI coverage for email/code focus order, one OTP semantic node, inline polite errors, loading/disabled states, keyboard-safe reachability, and auth back behavior in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/AuthFoundationUiTest.kt`

### Implementation for User Story 1

- [X] T021 [US1] Replace the coarse auth state with `AuthStage`, `AuthSubmission`, `AuthFieldError`, masked destination, derived actions, resend countdown, and deduplicated method-based MVVM behavior in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/AuthViewModel.kt`
- [X] T022 [P] [US1] Define one logical OTP editor contract with paste, normalization, selection, deletion, semantics, and explicit submit support in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/OtpInput.kt`
- [X] T023 [P] [US1] Implement the common email-OTP editor without SMS autofill claims for Android in `apps/shop-mobile/shared/src/androidMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/OtpInput.android.kt`
- [X] T024 [P] [US1] Implement the single-node UIKit `UITextField` `.oneTimeCode` adapter for iOS in `apps/shop-mobile/shared/src/iosMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/OtpInput.ios.kt`
- [X] T025 [US1] Build the branded, scrollable, IME-aware email and code screens with one primary action, masked destination, resend, different-email, errors, and reduced-motion-aware forward/back transitions in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/SignInScreen.kt`
- [X] T026 [US1] Replace the old auth composables and connect the new ViewModel and screen without exposing the container beyond composition wiring in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/AuthScreens.kt`
- [X] T027 [US1] Rebuild the edge-painted Restoring, SignedOut, Refused, and SignedIn session gate with protected-graph isolation and reduced-motion-aware root transitions in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/app/App.kt`
- [X] T028 [US1] Run the auth unit and Compose UI tests from `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/AuthViewModelTest.kt` and `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/AuthFoundationUiTest.kt`

**Checkpoint**: Authentication is independently usable, enumeration-safe, keyboard-safe, accessible, and cannot reveal protected UI before authoritative session completion.

---

## Phase 4: User Story 2 - Navigate a Responsive, Safe App Shell (Priority: P2)

**Goal**: Deliver a signed-in shell with four production-quality destinations, safe bottom-bar/rail adaptation, preserved per-tab state, predictable back behavior, and genuine Home/Account content.

**Independent Test**: Visit all four destinations on a small portrait phone and a wide/landscape device, resize while on a non-default destination, and confirm chrome selection, system-area safety, route continuity, reselect, back, manager gating, and sign-out reset.

### Tests for User Story 2

- [X] T029 [P] [US2] Add failing policy tests for the 600dp boundary, four-item ordering, component-owned inset consumption, and live bar/rail switching in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/core/ui/ResponsiveNavigationTest.kt`
- [X] T030 [P] [US2] Add failing state tests for per-tab retention, reselect-to-root, nested back, Home fallback, rapid taps, and reset-before-sign-out in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopShellStateTest.kt`
- [X] T031 [P] [US2] Update route round-trip tests to cover only Home, Catalog, Orders, Account, and ManagerArea in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/mobile/kit/NavKeySerializationTest.kt`

### Implementation for User Story 2

- [X] T032 [US2] Reduce the serializable shop navigation graph to four roots plus ManagerArea while preserving stable tab IDs and start routes in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/nav/ShopRoutes.kt`
- [X] T033 [US2] Split the shop shell from the old monolith and integrate `TabBackStacks`, responsive chrome, production icons, merged selected semantics, rapid-tap safety, back handling, and reset-before-sign-out in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopShell.kt`
- [X] T034 [P] [US2] Build the sectioned Home screen from real operator/shop context and genuine Catalog/Manager actions without metrics or card filler in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/HomeScreen.kt`
- [X] T035 [P] [US2] Build the sectioned Account identity screen with role, status, shop, and explicit sign-out action in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/AccountScreen.kt`
- [X] T036 [P] [US2] Build restrained Catalog and Orders foundation placeholders with no invented data or nonfunctional controls in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/FoundationPlaceholderScreen.kt`
- [X] T037 [P] [US2] Rebuild the manager destination with role-aware courtesy visibility and backend-authoritative checking, granted, and uniform-denied states in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ManagerAccessScreen.kt`
- [X] T038 [US2] Remove the superseded Home, Account, manager, placeholder, glyph, and shell implementations from `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopScreens.kt` after the split files are wired
- [X] T039 [US2] Add Compose UI coverage for icon+label selection semantics, bottom-bar/rail layout, destination continuity, placeholders, Account sign-out, and manager gate states in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/ShopFoundationUiTest.kt`
- [X] T040 [US2] Run the responsive policy, navigation-state, route-serialization, and Shop foundation UI tests from `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/core/ui/ResponsiveNavigationTest.kt`, `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopShellStateTest.kt`, `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/mobile/kit/NavKeySerializationTest.kt`, and `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/ShopFoundationUiTest.kt`

**Checkpoint**: The signed-in shell is independently navigable and responsive, preserves state through resizing, and exposes no catalog/detail implementation from its root destinations.

---

## Phase 5: User Story 3 - Experience a Modern and Coherent Interface (Priority: P3)

**Goal**: Complete the visual language, persisted appearance selection, motion/reduced-motion behavior, system-bar contrast, and accessibility guarantees across authentication and shell screens.

**Independent Test**: Exercise every authentication state and shell destination in Light, Dark, and Follow system modes; verify peer transitions remain within 240ms and interrupt cleanly; test normal and reduced motion; then audit large text, contrast, keyboard, TalkBack, VoiceOver, and iOS HIG interaction behavior.

### Tests for User Story 3

- [X] T041 [P] [US3] Add failing persistence and live-resolution tests for Light, Dark, System, unknown stored values, and immediate updates in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/core/theme/AppearancePreferenceStoreTest.kt`
- [X] T042 [P] [US3] Add failing deterministic tests asserting peer-destination motion completes within 240ms, full/reduced/none policies select the correct feedback, reduced/none remove translation and scale, and interrupted transitions resolve to the latest state in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/mobile/kit/MotionTest.kt`

### Implementation for User Story 3

- [X] T043 [US3] Implement the observable settings-backed `appearance.mode` store with System default and immediate persistence in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/theme/AppearancePreferenceStore.kt`
- [X] T044 [US3] Wire appearance state through `AppContainer` and the root theme so runtime and OS changes do not reset session or navigation state in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/app/AppContainer.kt` and `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/app/App.kt`
- [X] T045 [US3] Add an accessible Light/Dark/System selector to the Account sections using only Effy theme roles in `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/AccountScreen.kt`
- [X] T046 [US3] Apply centralized press, selection, error visibility, auth hierarchy, root-state, and fade-through destination motion with stable chrome across `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/SignInScreen.kt`, `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopShell.kt`, and `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/app/App.kt`
- [X] T047 [US3] Synchronize resolved appearance and live reduced-motion changes with Android and iOS system UI through `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/platform/PlatformUiController.kt`, `apps/shop-mobile/shared/src/androidMain/kotlin/com/effyshopping/shop/mobile/core/platform/AndroidPlatformUiController.kt`, and `apps/shop-mobile/shared/src/iosMain/kotlin/com/effyshopping/shop/mobile/core/platform/IosPlatformUiController.kt`
- [X] T048 [US3] Audit and correct headings, focus order, live-region errors, selected roles, merged icon labels, 48dp shared targets, 44pt-or-larger iOS targets, Dynamic Type/scalable text, predictable iOS back affordances, and non-color cues across `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/ui/EffyComponents.kt`, `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/auth/presentation/SignInScreen.kt`, and `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/shop/presentation/ShopShell.kt`
- [X] T049 [US3] Extend `ShopFoundationUiTest.kt` with Light/Dark/System, no-default-palette, reduced-motion, large-text, and semantics assertions in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/ShopFoundationUiTest.kt`
- [X] T050 [US3] Run appearance, motion, auth UI, and Shop UI tests from `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/core/theme/AppearancePreferenceStoreTest.kt`, `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/mobile/kit/MotionTest.kt`, `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/AuthFoundationUiTest.kt`, and `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/ShopFoundationUiTest.kt`

**Checkpoint**: The foundation is token-driven, modern, animated without distraction, accessible without color reliance, and consistent with forced or system appearance on both platforms.

---

## Phase 6: User Story 4 - Begin Again Without Legacy Presentation (Priority: P4)

**Goal**: Permanently remove the rejected dashboard/catalog/detail/create-sheet presentation while retaining catalog domain, data, use cases, drafts, authentication, and authorization behavior.

**Independent Test**: Inspect every reachable route and semantic tree after sign-in and confirm only the new foundation appears; Catalog and Orders render placeholders, and no old list, detail, Edit, New product, or bottom sheet can be restored or opened.

### Tests for User Story 4

- [X] T051 [P] [US4] Add a failing route and reachable-semantics absence test for `CatalogProductRoute`, New product, product detail/Edit, letter glyphs, and product bottom-sheet actions in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/LegacyPresentationAbsenceTest.kt`

### Implementation for User Story 4

- [X] T052 [US4] Delete the retired catalog presentation files `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/catalog/presentation/CatalogListScreens.kt`, `ProductDetailScreens.kt`, and `ProductCreateSheet.kt` while preserving `features/catalog/data/`, `features/catalog/domain/`, and `core/draft/`
- [X] T053 [US4] Delete presentation-bound catalog tests in `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/catalog/presentation/CatalogViewModelsTest.kt` while retaining catalog domain and repository fakes/tests
- [X] T054 [US4] Update the mobile capability truth to mark catalog UI rebuilding as outstanding and the new auth/shell foundation as delivered in `docs/audiences/shop-capabilities.md`
- [X] T055 [US4] Replace the stale template/legacy UI description with the new supported foundation, retained domain boundary, and future full-screen product-flow direction in `apps/shop-mobile/README.md`
- [X] T056 [US4] Extend `scripts/mobile-guard.sh` with shop-only failures for retired presentation files and symbols, run `make sm-guard`, and run `apps/shop-mobile/gradlew :shared:allTests` to execute `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/ui/LegacyPresentationAbsenceTest.kt` against `specs/018-shop-mobile-ui-foundation/contracts/adaptive-shell.contract.md`

**Checkpoint**: No rejected presentation can be reached, restored, or accidentally reused; valid catalog business/data code remains available for the later redesign.

---

## Phase 7: Polish & Cross-Cutting Validation

**Purpose**: Prove generated contracts, both native builds, cross-app compatibility, security invariants, physical layouts, accessibility, motion, and visual quality.

- [X] T057 Run `make sm-contract-check sm-tokens-check sm-guard` and resolve any drift or secret/credential guard failure against `specs/018-shop-mobile-ui-foundation/quickstart.md`
- [X] T058 Run `./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64` from `apps/shop-mobile/build.gradle.kts` and resolve every test, Android assembly, or iOS linkage failure
- [X] T059 [P] Run `cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64` using `apps/customer-mobile/build.gradle.kts` and confirm the token generator and backward-compatible mobile-kit changes do not migrate or break its current shell
- [X] T060 [P] Run `cd apps/driver-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64` using `apps/driver-mobile/build.gradle.kts` and confirm the generated token changes do not break its scaffold
- [ ] T061 Validate Restoring, Email, Code, Refused, Home, Catalog placeholder, Orders placeholder, Account, and manager states across the Android/iOS posture matrix and record device, OS, posture, state, and pass/fail evidence under a Validation Results section in `specs/018-shop-mobile-ui-foundation/quickstart.md`
- [ ] T062 Validate malformed email, enumeration-safe unknown/unprovisioned identity handling, request dedupe, paste, wrong/expired code, resend, offline retry, valid sign-in, session restoration/expiry, manager denial, and sign-out reset without PII/OTP logging; then run `make shop-verify-isolation SHOP_TOKEN="$SHOP_ACCESS_TOKEN" BO_TOKEN="$BACK_OFFICE_ACCESS_TOKEN" ENV=dev` through `scripts/verify-cross-pool.sh` and record redacted results in `specs/018-shop-mobile-ui-foundation/quickstart.md`
- [ ] T063 Validate Light/Dark/Follow system, opposite OS/app appearance, system-bar contrast, normal/reduced motion, rapid taps, large text and Dynamic Type, 44pt-or-larger iOS targets, predictable iOS back behavior, grayscale/high contrast, TalkBack, VoiceOver, and hardware keyboard behavior; record results against `specs/018-shop-mobile-ui-foundation/contracts/visual-system.contract.md` in `specs/018-shop-mobile-ui-foundation/quickstart.md`
- [ ] T064 Capture phone portrait, phone landscape, tablet portrait, and tablet landscape Light/Dark evidence; have named reviewer(s) score hierarchy, spacing, navigation clarity, and modernity separately from 1–5; require every dimension to score at least 4; and record screenshot paths, reviewers, scores, and failures in `specs/018-shop-mobile-ui-foundation/quickstart.md`
- [ ] T065 Profile repeated authentication and destination transitions with Android `adb shell dumpsys gfxinfo com.effyshopping.shop.mobile` and iOS Instruments Core Animation, verify steady-state rendering meets the 60fps goal with no queued stale transition, and record device/build/tool/results in `specs/018-shop-mobile-ui-foundation/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: No dependencies; T002–T005 can proceed in parallel while T001/T006 prepare the project.
- **Phase 2 — Foundational**: Depends on Phase 1. T009–T011, T013, T014, and T016 are separable file groups; T017 integrates them; T018 is the phase gate.
- **Phase 3 — US1**: Depends on Phase 2. Tests T019/T020 are written first and must fail before T021–T027.
- **Phase 4 — US2**: Depends on Phase 2 and integrates with the signed-in result from US1 for end-to-end testing. State/policy implementation remains testable with a synthetic signed-in session.
- **Phase 5 — US3**: Depends on US1 and US2 because it hardens and animates those delivered surfaces.
- **Phase 6 — US4**: Depends on US2 because the new Catalog placeholder and route graph must be active before legacy presentation is deleted.
- **Phase 7 — Polish**: Depends on all desired stories; T059/T060 can run in parallel after shared changes stabilize.

### User Story Dependency Graph

```text
Setup → Foundation → US1 (authentication MVP)
                   └→ US2 (responsive shell; synthetic-session testable)
                       ├→ US3 (visual/motion/accessibility hardening; also needs US1)
                       └→ US4 (legacy presentation removal)
US1 + US2 + US3 + US4 → Cross-platform and cross-app validation
```

### User Story Completion Order

- **US1 (P1)**: Starts after Foundation and provides the independently demonstrable authentication MVP.
- **US2 (P2)**: Starts after Foundation; can be developed alongside US1 using a synthetic signed-in state, then integrated with US1.
- **US3 (P3)**: Starts after US1 and US2 surfaces exist.
- **US4 (P4)**: Starts after US2 disconnects the shell from legacy Catalog routes; can proceed alongside US3.

### Within Each User Story

- Write the listed tests first and confirm their new assertions fail for the expected reason.
- Implement state and policy before composables that consume them.
- Implement common contracts before Android/iOS adapters.
- Wire screens only after their primitives and state owners compile.
- Run the story-specific test task before its checkpoint is considered complete.

---

## Parallel Execution Examples

### User Story 1

```text
T019 AuthViewModel transition tests || T020 authentication Compose UI tests
T022 common OTP contract → (T023 Android OTP || T024 iOS OTP)
```

### User Story 2

```text
T029 responsive policy tests || T030 shell-state tests || T031 route tests
After T033 defines shell integration: T034 Home || T035 Account || T036 placeholders || T037 manager screen
```

### User Story 3

```text
T041 appearance persistence tests || T042 motion policy tests
After T043/T044: T045 Account selector || T047 platform synchronization
```

### User Story 4

```text
T051 absence test can be authored while T054 capability documentation and T055 README truth are updated
After the new shell is active: T052 presentation deletion → T053 presentation-test deletion → T056 absence proof
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundation and prove both native targets compile.
3. Complete Phase 3 US1 with tests-first auth state and UI work.
4. Stop and validate the signed-out → OTP → authoritative-session journey independently.
5. Do not present this as the complete visual reset until US2–US4 and the final validation phase are complete.

### Incremental Delivery

1. **Foundation proof**: generated colors, typography, assets, platform insets/system UI, motion, responsive frame.
2. **US1**: calm, protected EMAIL_OTP authentication MVP.
3. **US2**: adaptive four-destination shell with real Home/Account and placeholders.
4. **US3**: persisted appearance, coherent motion, reduced motion, and accessibility hardening.
5. **US4**: delete legacy catalog presentation while preserving domain/data.
6. **Final proof**: generated guards, all native builds/tests, customer/driver regressions, device/accessibility/visual matrix.

### Safe Stopping Points

- After T018: shared foundation compiles but no user journey is claimed complete.
- After T028: authentication MVP is independently complete.
- After T040: signed-in shell is independently complete with placeholders.
- After T050: visual, motion, appearance, and accessibility contracts are implemented.
- After T056: presentation reset boundary is proven.
- After T065: Feature 018 is ready for acceptance review.

---

## Notes

- Tasks marked `[P]` change independent files; do not parallelize tasks that later converge on the same file without coordinating the final integration task.
- Generated `EffyTokens.kt` files are outputs only; authored palette values remain in `packages/design-system/src/tokens.css`.
- Catalog data/domain/use cases, stored product data, drafts, auth behavior, session authority, role interpretation, and backend manager gating are preserved.
- No task authorizes deployment, Terraform, migration, live AWS mutation, or logging of email addresses, OTP values, tokens, subjects, or SDK exception details.
- The future product creation/editing experience remains a separate full-screen feature; no replacement form is implemented here.
