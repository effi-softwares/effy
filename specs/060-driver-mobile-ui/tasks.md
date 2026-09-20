---

description: "Task list for 060-driver-mobile-ui"
---

# Tasks: Driver Mobile UI Completion

**Input**: Design documents from `/specs/060-driver-mobile-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/screen-inventory.md](./contracts/screen-inventory.md)

**Tests**: The spec does not request TDD. The **guards** below are not optional tests — they are
requirements (FR-010, FR-011, FR-013, FR-016, FR-017, R4) and each must be **proven by breaking it**
(057 shipped a guard that did not catch its own negative proof).

**Organization**: Grouped by user story. Each story is independently implementable and demonstrable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1–US7 from spec.md
- **⚠ OPERATOR**: the user runs this, not the assistant

## Path Conventions

- Driver app: `apps/driver-mobile/`
- Shared presentation root: `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/` — abbreviated **`<D>/`** below
- Android/iOS source sets: `apps/driver-mobile/shared/src/{androidMain,iosMain}/kotlin/com/effyshopping/driver/mobile/` — **`<DA>/`** / **`<DI>/`**
- Shared mobile package: `packages/mobile-kit/common/`
- Icon SSOT: `packages/design-system/mobile-assets/drawable/`

---

## Phase 1: Setup — the two blocking spikes

**Purpose**: Resolve the toolchain and iOS-linking unknowns before anything depends on them.
**⚠ If T002 fails, apply FR-023e**: the Map tab ships the stylised route, T001/T004 revert, and the
reason is recorded in plan.md Complexity Tracking. Every other phase proceeds unchanged.

- [X] T001 Bump the toolchain in `apps/driver-mobile/gradle/libs.versions.toml` + `gradle/wrapper/gradle-wrapper.properties`. ⚠ **It was FIVE parts, not two** — each forced by the next: `kotlin 2.4.0→2.4.20` → `composeMultiplatform 1.11.1→1.12.0` → `android-compileSdk 36→37` (CMP 1.12.0's androidx artifacts demand it) → `agp 9.0.1→9.1.0` (nine artifacts demand it) → `gradle 9.1.0→9.3.1` (AGP 9.1.0 demands it, incl. a re-pinned `distributionSha256Sum` verified against services.gradle.org). See [research.md](./research.md) § S1 RESULT
- [X] T002 **SPIKE S1 (BLOCKING)** — ✅ **PASSED**, no source change needed. — verify the bump in `apps/driver-mobile/`: run `:shared:compileAndroidMain`, `:shared:testAndroidHostTest`, `:shared:compileKotlinIosSimulatorArm64` and ⚠ `:shared:compileTestKotlinIosSimulatorArm64` (033: this target had never run and was broken for months). Confirm material3 1.11.0-alpha07, lifecycle, navigation3, Ktor, Amplify, Firebase and BuildKonfig all still resolve
- [X] T003 [P] Add `maplibre-compose = "0.17.0"` + the `org.maplibre.compose:maplibre-compose` library entry to `apps/driver-mobile/gradle/libs.versions.toml`, and wire it into `commonMain` in `apps/driver-mobile/shared/build.gradle.kts`
- [X] T004 [P] Add CameraX (`camera-core`, `camera-camera2`, `camera-lifecycle`, `camera-view`) to `apps/driver-mobile/gradle/libs.versions.toml` and the `androidMain` dependencies in `apps/driver-mobile/shared/build.gradle.kts`
- [ ] T005 [P] **⚠ OPERATOR — SPIKE S2 (BLOCKING for iOS)** — add MapLibre's linker flags to the `iosApp` target in `apps/driver-mobile/iosApp/iosApp.xcodeproj` (Build Settings → Other Linker Flags): `-l"c++" -lz -framework CoreFoundation -framework CoreGraphics -framework CoreText -framework Foundation -framework ImageIO -framework Metal -framework QuartzCore`, then build `iosApp`. ⚠ Until this lands the iOS build **fails to link**
- [X] T006 [P] Record the pre-change baseline in `specs/060-driver-mobile-ui/BASELINE.md`: current test counts for `apps/customer-mobile` and `apps/shop-mobile` (`:shared:testAndroidHostTest`), so the "unmodified pass" claim in T017 is measurable rather than asserted

**Checkpoint**: Toolchain settled, or the FR-023e fallback recorded.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared primitives every story consumes. ⚠ **`packages/mobile-kit` is source-included
(`kotlin.srcDir`) into all three mobile apps** — every edit here compiles into customer-mobile and
shop-mobile too (research R3). Edits MUST be additive and proven.

**⚠ CRITICAL**: No user story work begins until this phase is complete.

### Placeholder infrastructure (serves US2, consumed by every story)

- [X] T007 Create the provenance marker type in `<D>/core/placeholder/Placeholder.kt`: a `Provenance` enum (`PLATFORM`, `PLACEHOLDER_DECORATIVE`, `PLACEHOLDER_OPERATIONAL`, `DERIVED`) and a `Placeholder<T>` wrapper carrying the value, its class and its `unblockedBy` reason, per [data-model.md](./data-model.md) §1
- [X] T008 Add `unavailableLabel()` to `<D>/core/placeholder/Placeholder.kt` — the single renderer for a `PLACEHOLDER_OPERATIONAL` field, so "shown as unavailable" is one implementation rather than a convention each screen re-invents (FR-015, SC-015)

### Shared UI primitives → `packages/mobile-kit`

- [X] T009 [P] Create `packages/mobile-kit/common/ui/SwipeToConfirm.kt` — ⚠ **built on STABLE `draggable` + `Animatable`, not `AnchoredDraggable`** (deviation from research R6, recorded in the file): mobile-kit is one source compiled by TWO toolchains (driver on CMP 1.12.0, the others on 1.11.1) and `AnchoredDraggable` is experimental with a changing state API. A track with `Idle`/`Confirmed` anchors, a commit threshold, spring-back on release short of it (FR-018), and ⚠ **an accessibility click action + custom action** so the gesture is operable by switch and screen-reader users (research R6 — the design does not show this)
- [X] T010 [P] Create `packages/mobile-kit/common/ui/EffySkeleton.kt` — a shimmer brush via `infiniteRepeatable`, plus `SkeletonBlock`/`SkeletonLine` primitives; ⚠ suppressed to a static tint under reduced motion (FR-009)
- [X] T011 [P] ⚠ **FR-020 NARROWED, recorded in the file**: the keypad serves the DELIVERY code only. Putting it on the SIGN-IN code would destroy emailed-OTP autofill and paste, and `OtpCells` already draws the design's boxed positions with 036's one-node accessibility model. Create `packages/mobile-kit/common/ui/NumericKeypad.kt` — the design's 3×4 in-app keypad (digits + backspace), 48 dp targets, consumed by both the sign-in code (US5) and the delivery code (US1) per FR-020
- [X] T012 [P] Create `packages/mobile-kit/common/ui/DigitBoxes.kt` — discrete digit boxes with filled/empty/error states, parameterised on length (6 for sign-in, 4 for delivery), reusing the existing `OtpCells` styling where it fits
- [X] T013 [P] Create `packages/mobile-kit/common/ui/ChoiceChips.kt` — the single-select chip row used by contactless drop-spots (FR-023) and the problem-reason picker (FR-021)
- [X] T014 **Principle II promotion** — move `EffyPullToRefresh` from `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/presentation/EffyPullToRefresh.kt` to `packages/mobile-kit/common/ui/EffyPullToRefresh.kt`, updating customer-mobile's six call-site imports **only**
- [X] T015 ⚠ **Prove the promotion changed nothing** — run `apps/customer-mobile` `:shared:testAndroidHostTest` and confirm it passes **with zero test-file edits**, matching the T006 baseline. That unmodified pass is the evidence (SC-012); an edited test proves nothing
- [X] T016 [P] Run `apps/shop-mobile` `:shared:testAndroidHostTest` and confirm unchanged against the T006 baseline (mobile-kit source reaches it too)

### Icons → the shared SSOT

- [X] T017 [P] Author the four navigation glyphs (Today, Map, History, Account — outlined + selected) as VectorDrawables in `packages/design-system/mobile-assets/drawable/`, following the existing `ic_*_outlined.xml` / `ic_*_selected.xml` naming
- [ ] T018 [P] ⚠ **RESEQUENCED to the phases that consume them** — authoring 12 glyphs blind, before the screens exist, is speculative; each is added with its screen. Author the in-screen glyphs into `packages/design-system/mobile-assets/drawable/`: hub marker, shop marker, package, camera, flash, flip, signature, chevron, check, warning, phone, settings
- [X] T019 ⚠ **FOUND: driver-mobile was never wired into the asset SSOT at all.** `sync-mobile-assets.mjs` gave it `kinds: ["font"]` on a 026 comment ending *"it gains `drawable` when it gets its shell"* — 049 gave it a shell and nobody returned. `mobile-assets:check` reported ✅ throughout, because an app configured to take nothing is trivially in sync. Fixed to `["drawable", "font"]`; 84 → 138 asset copies. Run `pnpm --filter @effy/design-system run tokens:check` so `mobile-assets:check` copies the new drawables into all three apps and verifies the copies. ⚠ **Then render each new icon on a device** — 024 shipped a converter that emitted `pathData="M undefined,undefined"`: **valid XML that compiled, packaged, and failed to inflate at runtime**, taking the launcher icon and splash with it (research R9)
- [X] T020 Replace `TabGlyph` (the first-letter placeholder, `<D>/app/DriverShell.kt`) with the real per-tab icons from T017 (FR-008)

### Routes and state

- [X] T021 Add the four new routes to `<D>/core/nav/DriverRoutes.kt` — `ShopProblemRoute(runId, stopId)`, `AppearanceRoute`, `HelpRoute`, `PermissionDeniedRoute` — and ⚠ register each in `driverNavJson`'s serializers module, or per-tab back stacks fail to restore across process death
- [X] T022 Create `<D>/core/nav/RouteSerializerGuardTest.kt` — enumerate every `AppNavKey` subtype and fail if one is absent from `driverNavJson`. **Prove it by adding a route without a serializer**
- [X] T023 [P] Add `AuthFieldError.LockedOut` to `<D>/features/auth/presentation/AuthViewModel.kt` ⚠ (today a locked-out driver sees the *same* message as one who mistyped)
- [X] T024 [P] Add `offline`, `cachedAt`, `loadFailed` to `TodayUiState` in `<D>/features/today/presentation/TodayViewModel.kt`, with `cachedAt` read from the existing offline queue's own timestamp (⚠ `PLATFORM`, not invented)
- [X] T025 [P] Add `confirmedPackageIds: Set<String>` and `swipeProgress: Float` to `CollectionUiState` in `<D>/features/collection/presentation/CollectionViewModel.kt` (FR-019; ⚠ UI-local — sends nothing, per data-model §2)
- [X] T026 [P] Add `proofNote`, `failNote` and `dropSpot` to `DeliveryUiState` in `<D>/features/delivery/presentation/DeliveryViewModel.kt` and thread them into the existing repository parameters ⚠ that currently receive `null` at every call site (FR-022/FR-023)

**Checkpoint**: Primitives exist, the other two apps are provably unaffected, story work can begin.

---

## Phase 3: User Story 1 — A driver can walk an entire shift on finished screens (P1) 🎯 MVP

**Goal**: The 20 screens on the design's own demonstration path are finished — off duty → collection
run → shop stop → hub check-in → same-day run → drop → en route → arrived → proof → complete.

**Independent test**: Install, sign in, walk the whole path in both appearances. No screen on it is a
bare list of default controls. Matches [quickstart.md](./quickstart.md) §4.

### Today (screens 9–12)

- [X] T027 [US1] Rebuild the off-duty state in `<D>/features/today/presentation/TodayScreen.kt` (screen 9): duty pill, date + location line, the large two-line greeting, the shift figures row, and a single 62 dp primary action — replacing the current small informational panel
- [X] T028 [US1] Rebuild the phase indicator in `<D>/features/today/presentation/TodayScreen.kt` (screens 10–11) so each half carries its own kicker, title and progress meta, not just a label
- [X] T029 [US1] Create the current stop/drop hero in `<D>/features/today/presentation/CurrentWorkCard.kt` (screens 10–11): map strip, title row with a status chip, address, and a metrics footer. ⚠ **A recorded Principle V card exception** (plan Complexity Tracking / research R12) — it holds a map, which a detail row cannot
- [X] T030 [US1] Create the "Up next" queue + hub footer row in `<D>/features/today/presentation/UpNextList.kt` (screens 10–11): numbered rows, per-row trailing pill, and a "Whole run ›" affordance
- [X] T031 [P] [US1] Polish the idle state in `<D>/features/today/presentation/TodayScreen.kt` (screen 12) to the design's pulsing-ring treatment and add the pull-to-refresh hint

### Collection run (screens 16–18)

- [X] T032 [US1] Rebuild `CollectionRunScreen` in `<D>/features/collection/presentation/CollectionScreens.kt` (screen 16): progress bar, assignment line, per-stop blocks with address + meta + **a per-stop action button**, and the dashed hub row that ends the run. ⚠ A recorded card exception (research R12)
- [X] T033 [US1] Rebuild `ShopStopScreen` in `<D>/features/collection/presentation/CollectionScreens.kt` (screen 17): per-package **tappable confirmation rows** with reference, destination and method pill, plus a running confirmed count (FR-019)
- [X] T034 [US1] Replace the stop's "Collect all" button with `SwipeToConfirm` (T009) in `<D>/features/collection/presentation/CollectionScreens.kt` (FR-018, SC-013)
- [X] T035 [US1] Create `<D>/features/collection/presentation/ShopProblemScreen.kt` (screen 18) — ⚠ **currently a bare `TextButton` that fires `onReport("missing")` instantly**. The screen picks the package, picks what is wrong, takes a note, and states that reporting does not block the rest of the stop or the run (FR-021)
- [X] T036 [US1] Wire `ShopProblemRoute` into `<D>/app/DriverShell.kt` and reach it from the shop stop

### Hub check-in (screens 19–20)

- [ ] T037 [US1] Rebuild `HubCheckinScreen` in `<D>/features/collection/presentation/CollectionScreens.kt` (screen 19): the scanned-in total, a proportional split bar, and two split blocks each with a state chip ("Loaded" / "Handed to carrier"). ⚠ A recorded card exception (research R12)
- [ ] T038 [US1] Replace the hub's confirm button with `SwipeToConfirm` (T009) — the gesture that ends phase one and unlocks phase two (FR-018)
- [ ] T039 [US1] Build the distinct nothing-same-day state in `<D>/features/collection/presentation/CollectionScreens.kt` (screen 20) with its own copy and closing action ⚠ (today only the button's label changes)

### Same-day run and drops (screens 21–24)

- [ ] T040 [US1] Rebuild `DeliveryRunScreen` in `<D>/features/delivery/presentation/DeliveryScreens.kt` (screen 21): progress bar, "N of M delivered", numbered drops, per-drop window and pill
- [ ] T041 [US1] Rebuild the drop detail body in `<D>/features/delivery/presentation/DeliveryScreens.kt` (screen 22): status pill, "Deliver to" block, the instructions call-out, a **numbered package list**, and the note that packages from several shops travel as one drop
- [ ] T042 [US1] Create the en-route state in `<D>/features/delivery/presentation/EnRouteScreen.kt` (screen 23) — ⚠ **a state that already exists in `DropStatus` and has never had a screen**: map surface, destination sheet, Call / Message / Navigate, "I've arrived"
- [ ] T043 [US1] Create the arrived state in `<D>/features/delivery/presentation/ArrivedScreen.kt` (screen 24) — ⚠ same: the large "You're at …" heading, the instructions call-out, Call customer, Can't deliver, and `SwipeToConfirm` to complete

### Proof (screens 25–31)

- [ ] T044 [US1] Rebuild the proof picker in `<D>/features/delivery/presentation/ProofScreens.kt` (screen 25): four selectable rows with glyph, title, description and chevron, **plus the optional note field** the current picker has no room for (FR-022)
- [ ] T045 [US1] Create `expect fun CameraPreviewSurface` in `<D>/core/platform/CameraPreviewSurface.kt` and the shared photo-proof chrome in `<D>/features/delivery/presentation/ProofPhotoScreen.kt` (screen 26): header, framing guidance, caption bar, shutter, flash, flip (research R8)
- [ ] T046 [P] [US1] Implement the Android actual in `<DA>/core/platform/CameraPreviewSurface.android.kt` — a live CameraX preview bound to the composable's lifecycle
- [ ] T047 [P] [US1] Implement the iOS actual in `<DI>/core/platform/CameraPreviewSurface.ios.kt` — the designed stand-in that hands off to the system camera on shutter. ⚠ **This gives iOS photo proof it does not have at all today** (`rememberPhotoCapture` returns `null` there, so the option is hidden); the live AVFoundation viewfinder is deferred and recorded in the register
- [ ] T048 [US1] Rebuild the delivery-code screen in `<D>/features/delivery/presentation/ProofScreens.kt` (screen 27) on `DigitBoxes` + `NumericKeypad` (T011/T012), with the "customer doesn't have the code" fallback link (FR-020)
- [ ] T049 [P] [US1] Restyle the signature screen in `<D>/features/delivery/presentation/SignaturePad.kt` (screen 28) to the design's header + Clear action + "Sign above" guidance; keep the existing capture logic
- [ ] T050 [US1] Rebuild the contactless screen in `<D>/features/delivery/presentation/ProofScreens.kt` (screen 29): photo thumbnail plus the **"Where you left it" chip picker** (`ChoiceChips`, T013) replacing free text, serialised into the existing note field (FR-023)
- [ ] T051 [US1] Rebuild the completion screen in `<D>/features/delivery/presentation/ProofScreens.kt` (screen 30): animated tick, drop detail line, the run-progress figures, and both actions (Next drop / Back to run)
- [ ] T052 [US1] Add the note field to the undeliverable picker in `<D>/features/delivery/presentation/DeliveryScreens.kt` (screen 31) and align the reason labels with the design (FR-022)

**Checkpoint**: US1 complete — the app's core loop is demonstrable on its own.

---

## Phase 4: User Story 2 — Anyone can tell which parts of the app are real (P1)

**Goal**: The provenance register covers every screen and field, and is mechanically prevented from
going stale.

**Independent test**: Open the register, pick five screens at random, and confirm the classification
matches what the app renders — without reading code.

- [ ] T053 [US2] Create the per-feature placeholder files — `<D>/features/{today,collection,delivery,map,account,history,activity}/data/PlaceholderData.kt` — and move every invented value out of the composables written in Phase 3. ⚠ **Never inline**: with no in-app marking, one file per feature is the only thing that keeps the register findable (research R11)
- [ ] T054 [US2] Author fixtures fresh. ⚠ **Do not copy the design's sample content** (FR-012): not the named driver, not the Melbourne street addresses, not the `EFY-409xx` references, and ⚠ **not `1800 EFFY OPS`** — a dispatch number is an outward-facing identifier the constitution requires be operator-supplied
- [ ] T055 [US2] Apply the ⛔ rule across Phase 3's screens: every `PLACEHOLDER_OPERATIONAL` field (ETA, distance, delivery window) renders via `unavailableLabel()` (T008), **never as a value** (FR-015, SC-015)
- [ ] T056 [US2] Fill the per-screen sections of `specs/060-driver-mobile-ui/provenance-register.md` for US1's 20 screens — every readable field, its class, source or reason, and `unblockedBy`
- [ ] T057 [US2] Create `<D>/core/placeholder/PlaceholderRegisterGuardTest.kt` — enumerate every value exported from a `PlaceholderData.kt` and **fail naming the value** if the register does not list it. ⚠ Without this the register is a comment, and 058 recorded what a comment is worth
- [ ] T058 [US2] **Prove T057 by breaking it** — add an unlisted value to a `<D>/features/*/data/PlaceholderData.kt`, confirm `PlaceholderRegisterGuardTest` fails naming it, then remove it
- [ ] T059 [US2] Add the `DERIVED` inheritance rule to the guard: a derived figure whose inputs include a placeholder is classified by its **weakest** input, so "3 of 4 stops done" cannot look trustworthy when one of the four was invented

**Checkpoint**: US1 + US2 together are a demonstrable, honest MVP.

---

## Phase 5: User Story 3 — A driver can see their run on a map (P2)

**Goal**: The Map tab renders real OpenStreetMap cartography with both run modes. No dead end.

**Independent test**: Open Map. Both modes render, the segmented control switches them, the stop list
matches, attribution is visible, and no "coming soon" remains anywhere.

**⚠ Depends on T002 (S1) and T005 (S2).** If S1 failed, build this phase on the FR-023e stylised
route instead; every task below stands except T061.

- [ ] T060 [US3] Create `<D>/features/map/presentation/MapViewModel.kt` with `MapUiState { mode, stops, hubIndex }` per [data-model.md](./data-model.md) §2, deriving stops from the existing collection/delivery run use cases
- [ ] T061 [US3] Create `<D>/core/platform/EffyMapCanvas.kt` — ⚠ **the ONLY file in the app permitted to import `org.maplibre.*`** (research R4). Points at OpenFreeMap `https://tiles.openfreemap.org/styles/liberty`; ⚠ **not** `tile.openstreetmap.org`, whose Tile Usage Policy forbids distributing an app that uses it (research R2)
- [ ] T062 [US3] Create `<D>/core/platform/MapLibreImportGuardTest.kt` — fail if `org.maplibre.*` is imported anywhere but `EffyMapCanvas.kt`. **Prove it by adding the import elsewhere**
- [ ] T063 [US3] Build `<D>/features/map/presentation/MapScreen.kt` (screens 33–34): the Collection / Same-day segmented control, the map canvas, and the ordered stop list beneath with ETA and meta columns
- [ ] T064 [US3] Render the hub distinctly from ordinary stops, in run sequence, in `<D>/features/map/presentation/MapScreen.kt` and `<D>/core/platform/EffyMapCanvas.kt` (FR-023d)
- [ ] T065 [US3] Assert the OpenFreeMap attribution is present in `<D>/features/map/presentation/MapAttributionTest.kt` (FR-023b). ⚠ MapLibre adds it automatically — and an automatic behaviour that silently stops is precisely the defect class to pin
- [ ] T066 [US3] Make each stop row open its collection stop or delivery drop, and replace `MapRoot -> ComingSoonScreen` in `<D>/app/DriverShell.kt`
- [ ] T067 [US3] Delete `<D>/features/placeholder/ComingSoonScreen.kt` and confirm no reference remains (FR-003, SC-002)
- [ ] T068 [US3] Register the map's placeholder coordinates in `provenance-register.md` — ⚠ the cartography is ✅ real, the pins are 🟡 invented (049 R13: shops have no coordinates, orders are un-geocoded); `unblockedBy: shop.address + geocoding`

**Checkpoint**: The app has no dead ends.

---

## Phase 6: User Story 4 — A driver can manage their own account (P2)

**Goal**: Account and its three sub-screens are finished. A driver can find dispatch.

**Independent test**: Reach every sub-screen from Account; change appearance and see it persist.

- [ ] T069 [US4] Rebuild `<D>/features/account/AccountScreen.kt` (screen 41): an identity block with initials avatar, then one row list — duty status, zone, hub, vehicle, appearance ›, help ›, sign out — with sign out in the destructive treatment, and the version footer
- [ ] T070 [P] [US4] Create `<D>/features/account/AppearanceScreen.kt` (screen 42) — light / dark / follow-system as rows with explanations and a selected indicator, replacing the inline chips; wire `AppearanceRoute`
- [ ] T071 [P] [US4] Create `<D>/features/account/HelpScreen.kt` (screen 43) — ⚠ **absent entirely today**, so a driver needing dispatch has nowhere to go. ⚠ The dispatch number renders via `unavailableLabel()` until the operator supplies one (FR-012, constitution § Real-World Identifiers)
- [ ] T072 [P] [US4] Rework the sign-out confirmation in `<D>/features/account/AccountScreen.kt` (screen 44) to state what happens to work still held, rather than the current generic warning
- [ ] T073 [US4] Register US4's fields in `provenance-register.md`

---

## Phase 7: User Story 5 — First run and sign-in look like the driver's app (P3)

**Goal**: Nine screens. ⚠ Including fixing copy that tells drivers they are signing into a **shop**.

**Independent test**: Launch cold, sign in, force each code outcome — correct, wrong, expired, locked.

- [ ] T074 [US5] Rebuild the splash in `<D>/app/App.kt` (screen 1): full-bleed brand ground, the outlined mark with its entrance animation, the "EFFY DRIVER" lockup and a bottom spinner
- [ ] T075 [US5] ⚠ **Fix the audience copy** in `<D>/features/auth/presentation/SignInScreen.kt` (screen 2): "Shop workspace" → the driver lockup, "Welcome back" → "Sign in", and delete *"Passwordless access for provisioned shop operators."* Replace with the design's driver wording (FR-010)
- [ ] T076 [US5] Rebuild code entry in `<D>/features/auth/presentation/SignInScreen.kt` (screen 3) on `DigitBoxes` + `NumericKeypad` (T011/T012), with the "Wrong email?" back affordance and the resend line (FR-020)
- [ ] T077 [P] [US5] Build the verifying state (screen 4) — inline spinner + "Verifying…" — in `<D>/features/auth/presentation/SignInScreen.kt`
- [ ] T078 [P] [US5] Build the invalid and expired states (screens 5–6) in `<D>/features/auth/presentation/SignInScreen.kt` with the design's error affordance and distinct messages
- [ ] T079 [US5] Build the locked-out state (screen 7) on `AuthFieldError.LockedOut` (T023) — ⚠ today a locked-out driver sees the **same message** as one who mistyped, which tells them to retry something that cannot succeed
- [ ] T080 [P] [US5] Rebuild `<D>/features/onboarding/PermissionPrimingScreen.kt` (screen 8): the three-step progress indicator, "Three things Effy needs", and bordered glyph rows with dividers
- [ ] T081 [P] [US5] Create `<D>/features/onboarding/PermissionDeniedScreen.kt` (screen 45) — the consequence stated plainly plus a route to settings; wire `PermissionDeniedRoute` and reach it from any screen whose capability was refused
- [ ] T082 [US5] Create `<D>/features/auth/NoShopCopyGuardTest.kt` — fail on "shop workspace" / "shop operator" / "provisioned shop" in driver UI source, word-bounded over comment-stripped source. ⚠ **Prove it by restoring the old copy** (057's first guard attempt was defeated by a missing delimiter)
- [ ] T083 [US5] Register US5's fields in `provenance-register.md`

---

## Phase 8: User Story 6 — Every wait, failure and outage has a designed state (P3)

**Goal**: Four cross-cutting states. ⚠ A loading dock is where this app is used.

**Independent test**: Force a slow load, a failed load and no connectivity, on a list and a detail screen.

- [X] T084 [P] [US6] Build the Today skeleton in `<D>/features/today/presentation/TodaySkeleton.kt` (screen 14) from `EffySkeleton` (T010). ⚠ **Compose it from the same primitives as the real content** — 028 recorded that a skeleton built differently *cannot* match, because a `Row` coerces `Modifier.width()` into what is left (research R10)
- [ ] T085 [P] [US6] Build the drop-detail skeleton in `<D>/features/delivery/presentation/DropSkeleton.kt` (screen 32), same rule
- [X] T086 [P] [US6] Build the failed-load state in `<D>/features/today/presentation/TodayScreen.kt` (screen 15) on `loadFailed` (T024): named failure, "your stops are safe", and a retry action — replacing the red line of text
- [X] T087 [US6] Build the offline banner and cached-run state (screen 13) in `<D>/features/today/presentation/TodayScreen.kt` and `<D>/app/DriverShell.kt`: a persistent indicator, rows marked cached, the last-synced line from `cachedAt`, and the promise that confirmations upload on reconnect. ⚠ The offline write queue has existed since 049 and has **never had an interface**
- [ ] T088 [US6] Register US6's fields in `provenance-register.md` — ⚠ `cachedAt` is ✅ `PLATFORM` (the queue's own timestamp), not invented

---

## Phase 9: User Story 7 — History and activity are complete records (P3)

**Goal**: Six screens. Both run types get their own record; proof is shown, not described.

**Independent test**: Complete a drop and a run, open each from history.

- [ ] T089 [P] [US7] Restyle the history list in `<D>/features/history/presentation/HistoryScreens.kt` (screens 37–38): day groups, leading marks, and the time + proof trailing columns
- [ ] T090 [US7] Create a distinct collection-run record in `<D>/features/history/presentation/HistoryRunScreen.kt` (screen 39): the run's split bar, its own timeline, and the read-only footnote ⚠ (today a run gets the same generic layout as a drop)
- [ ] T091 [US7] Rebuild the drop record in `<D>/features/history/presentation/HistoryScreens.kt` (screen 40) to **render the captured proof image** with its caption ⚠ (today it prints "Photo/signature captured" and shows nothing). The geotag line is ⛔ and renders as unavailable — a wrong geotag on a delivery record is evidence in a dispute
- [ ] T092 [P] [US7] Add "Mark all read" and per-item title + body to `<D>/features/activity/presentation/ActivityScreen.kt` (screens 35–36) ⚠ (today only the body renders)
- [ ] T093 [P] [US7] Align the four notification strings — run assigned, packages ready, window starting, short-package report — with the design in the push-handling source, and pin them in `<D>/core/push/NotificationCopyTest.kt` (FR-002, research R14)
- [ ] T094 [US7] Register US7's fields in `provenance-register.md`

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T095 [P] Create `<D>/NoCurrencyGuardTest.kt` — fail on `$`, `AUD`, `price`, `total`, `earning`, `payout`, `tip` in driver UI source (FR-011, SC-007). **Prove it by adding a money string**
- [ ] T096 [P] Create `<D>/NoDesignColourGuardTest.kt` — fail on the design's own hex values (`0a0a0a`, `fafafa`, `e01010`, `0C9409`, `151515`, `111111`) appearing as colour literals in driver source (FR-005, SC-010). **Prove it by transcribing one**
- [ ] T097 Verify every interactive target across `<D>/features/` and `packages/mobile-kit/common/ui/` is ≥ 48 dp on the smallest supported screen (SC-011). ⚠ 033 found a control whose own comment claimed it met the minimum and was **32 dp**
- [ ] T098 Verify reduced motion suppresses the shimmer and shortens transitions across `<D>/features/` and `packages/mobile-kit/common/ui/EffySkeleton.kt` (FR-009)
- [ ] T099 Run the full machine sweep per [quickstart.md](./quickstart.md) §2: driver Android + iOS suites (⚠ including `compileTestKotlinIosSimulatorArm64`), `:androidApp:assembleDebug`, customer-mobile and shop-mobile **unmodified**, `pnpm --filter @effy/design-system test`, `tokens:check` **unchanged**, both retired-hue sweeps
- [ ] T100 Run the four source sweeps in [quickstart.md](./quickstart.md) §6 and confirm all four return nothing
- [ ] T101 Complete `provenance-register.md`: 45/45 screens, summary counts filled, no field unclassified (SC-004)
- [ ] T102 Update `docs/audiences/driver-capabilities.md` with a §060 entry
- [ ] T103 Update `CLAUDE.md` § Current status — ⚠ it currently states *"`apps/driver-mobile` remains the base template"*, which has been false since 049
- [ ] T104 Write `specs/060-driver-mobile-ui/SIGNOFF.md` recording what was verified, what is placeholder, and what is deferred

### ⚠ Operator-run

- [ ] T105 ⚠ **OPERATOR** — **the 45-screen walk**: photograph every screen in both appearances (90 images) per [quickstart.md](./quickstart.md) §4. ⚠ **This is SC-001, and it is the only thing that proves this feature.** 039 shipped four live defects behind a fully green suite
- [ ] T106 ⚠ **OPERATOR** — the §5 interaction checks on real Android **and** iOS hardware: swipe cancel-and-commit, swipe accessibility with TalkBack/VoiceOver, per-package tick, proof notes on every path, drop-spot chips, the in-app keypad, touch targets
- [ ] T107 ⚠ **OPERATOR** — SC-003: someone who did not build it walks the shift loop end to end
- [ ] T108 ⚠ **OPERATOR** — supply the real dispatch phone number, or leave the help field showing as unavailable (which is correct, not a bug)
- [ ] T109 ⚠ **OPERATOR** — constitution **PATCH v2.0.1** in `.specify/memory/constitution.md` (Principle V, the mobile bullet): clarify that mobile renders **General Sans** as the fallback face because Geist is not self-hosted (research R5). ⚠ Found while planning; it is the same law-vs-practice gap the cobalt amendment closed, reopened elsewhere
- [ ] T110 ⚠ **OPERATOR** — the commit

---

## Dependencies

```
Phase 1 (Setup, spikes S1/S2)
        │
        ▼
Phase 2 (Foundational — placeholder, mobile-kit, icons, routes, state)
        │
        ├─────────────┬──────────┬──────────┬──────────┬──────────┐
        ▼             ▼          ▼          ▼          ▼          ▼
   Phase 3 US1   Phase 6 US4  Ph7 US5   Ph8 US6   Ph9 US7   (independent)
    (P1) 🎯           (P2)       (P3)      (P3)      (P3)
        │
        ▼
   Phase 4 US2 ──── registers US1's fields; each later phase registers its own
        │
        ▼
   Phase 5 US3 (P2) ── additionally needs T002 (S1) + T005 (S2)
        │
        ▼
   Phase 10 Polish
```

**Hard dependencies**

- T002 (S1) blocks T003, T061 — and, on failure, converts US3 to the FR-023e fallback
- T005 (S2) blocks every iOS map build
- T007/T008 block T055 and every register task
- T009 blocks T034, T038, T043
- T011/T012 block T048 and T076
- T014 blocks T015/T016 — ⚠ **the shared-source proof**
- T021 blocks T036, T070, T071, T081
- T023 blocks T079 · T024 blocks T086/T087 · T025 blocks T033 · T026 blocks T044/T050/T052
- T067 (delete ComingSoonScreen) requires T066

**Story independence**: US4, US5, US6 and US7 depend only on Phase 2 and can be built in any order,
or in parallel, once it is done. US3 additionally needs the spikes. US2 follows whichever story
phases have landed — each registers its own fields.

---

## Parallel Execution Examples

**Phase 2** — five independent mobile-kit files plus two icon batches:

```
T009 SwipeToConfirm · T010 EffySkeleton · T011 NumericKeypad · T012 DigitBoxes · T013 ChoiceChips
T017 nav icons · T018 in-screen icons
T023 · T024 · T025 · T026   (four different ViewModels)
```

**Phase 3** — the platform camera actuals:

```
T046 CameraPreviewSurface.android.kt   ┐ different source sets,
T047 CameraPreviewSurface.ios.kt       ┘ no shared file
```

**Phases 6–9 in parallel** once Phase 2 is done — four different feature packages:

```
T070 AppearanceScreen · T071 HelpScreen      (account)
T077 · T078 · T080 · T081                    (auth / onboarding)
T084 · T085 · T086                           (skeletons)
T089 · T092                                  (history / activity)
```

**Phase 10** — the two new guards:

```
T095 NoCurrencyGuardTest · T096 NoDesignColourGuardTest
```

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2).**

US1 alone is a walkable, finished shift loop — the design's own demonstration path and the only thing
Effy could put in front of a real driver. ⚠ **US2 ships with it, not after it.** A screen-complete app
with no register is indistinguishable from a working one, and the whole point of rendering placeholder
data is that someone can still tell what is real. Shipping US1 without US2 would be the exact hazard
this feature exists to avoid.

**Then, in value order**: US3 (the Map dead end) → US4 (a driver can reach dispatch) → US5 (stop
telling drivers they signed into a shop) → US6 (the loading dock) → US7 (records).

**Incremental delivery**: every phase from 5 onward is independently demonstrable and independently
shippable. Phase 10's operator walk is the only thing that closes the feature — and ⚠ **T105 is the
single most important task in this list**, because every other form of verification here has already
been shown, on this platform, to pass while the screens were wrong.

---

## Task Summary

| Phase | Story | Tasks | Screens |
|---|---|---|---|
| 1 Setup | — | T001–T006 (6) | — |
| 2 Foundational | — | T007–T026 (20) | — |
| 3 | **US1** (P1) 🎯 | T027–T052 (26) | 20 |
| 4 | **US2** (P1) | T053–T059 (7) | cross-cutting |
| 5 | **US3** (P2) | T060–T068 (9) | 2 |
| 6 | **US4** (P2) | T069–T073 (5) | 4 |
| 7 | **US5** (P3) | T074–T083 (10) | 9 |
| 8 | **US6** (P3) | T084–T088 (5) | 4 |
| 9 | **US7** (P3) | T089–T094 (6) | 6 |
| 10 Polish | — | T095–T110 (16) | — |
| **Total** | | **110** | **45** ✅ |

**Guards, each proven by breaking it**: `RouteSerializerGuard` (T022) · `PlaceholderRegisterGuard`
(T057/T058) · `MapLibreImportGuard` (T062) · `NoShopCopyGuard` (T082) · `NoCurrencyGuard` (T095) ·
`NoDesignColourGuard` (T096).

**Operator tasks**: T005, T105–T110.
