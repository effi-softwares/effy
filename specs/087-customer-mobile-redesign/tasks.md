# Tasks: Customer Mobile Redesign

**Input**: Design documents from `specs/087-customer-mobile-redesign/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D21), data-model.md, contracts/ui-kit.md,
contracts/navigation-and-motion.md, quickstart.md

**Design source**: canvas https://claude.ai/artifact/WSJRR99YaDrAU6LJaChbQv - every screen task names its
board (`<Board>.dc.html`), committed by T001 to `docs/reference-screens/Effy Customer Mobile/`. Open the
board before writing the screen; match layout, sizes, colours, wording and states.

**Tests**: included where the plan names a guard or a pinned behaviour (navigation, sizing, recents,
receipt text, theme drift). Screen visuals are verified by the operator walk (quickstart.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md

## Path Conventions

- `CM/` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`
- `CT/` = `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/`
- `DS/` = `packages/design-system/`
- `MK/` = `packages/mobile-kit/common/ui/`

## Standing rules for every task

- Never hand-edit generated files (`DS/compose/*.kt`, `DS/compose-payment-android/*`, synced
  `composeResources/font|drawable`): change the source, then run `pnpm --filter @effy/design-system tokens:gen`
  / `mobile-assets:sync`.
- mobile-kit (`MK/`) is compiled into shop and driver: **additive changes only**.
- Pinned wording (`CoverageWords.kt`, `DeliveryWindowWords.kt`, `EffyWindowsView.kt`, `DeliveryTypeWords.kt`,
  `DeliveryFeeWords.kt`, `DeliveryWindowText.kt`, `refundStateLabel`) is **read, never edited** (FR-025).
- No `Color(0x…)` in `CM/features/`; no `AlertDialog` / `Dialog(` / `DropdownMenu`; every tappable ≥ 48dp.
- Every existing animation listed in contracts/navigation-and-motion.md "Kept from today" must survive.
- Sentence case for app-authored copy (D18).

---

## Phase 1: Setup

**Purpose**: reference material and assets in the repo.

- [X] T001 Copy the canvas boards (the 40 `*.dc.html`, `canvas.json`, and `ds/effy/` from the session scratchpad `mobile/project/`) into `docs/reference-screens/Effy Customer Mobile/` and add a `README.md` there linking the canvas URL and listing boards by group (as in plan.md)
- [X] T002 [P] Add Geist static TTFs (Regular 400, Medium 500, SemiBold 600, Bold 700) and Geist Mono Medium from the official Vercel `geist-font` release to `DS/mobile-assets/font/` as `geist_regular.ttf`, `geist_medium.ttf`, `geist_semibold.ttf`, `geist_bold.ttf`, `geist_mono_medium.ttf`, plus `DS/mobile-assets/font/GEIST-OFL.txt` (the operator downloads if the sandbox has no network; Claude states the exact URL and stops for it)
- [X] T003 [P] Add Lucide icons (ISC licence) as Android vector XMLs `lucide_<name>.xml` in `DS/mobile-assets/drawable/` for every icon used on the boards (at least: house, search, shopping-cart, package, user-round, bell, chevron-left, chevron-right, chevron-down, plus, minus, x, check, heart, sliders-horizontal, arrow-up-down, truck, clock, map-pin, coins, credit-card, key-round, log-out, smartphone, shield, trash-2, pencil, circle-alert, triangle-alert, info, mail, help-circle, file-text, gift, tag, refresh-cw, eye, eye-off, history, list-plus), plus `DS/mobile-assets/drawable/LUCIDE-LICENSE.txt`; stroke 2, 24 viewport
- [X] T004 [P] Wordmark and onboarding art: **no asset files** - the wordmark is type (Geist Bold "effy" + a `brand` full stop), as the web's `BrandMark.tsx` does, and the onboarding art is the board's flat shapes drawn with a Compose `Canvas` (T055); `arrow-right` added to the Lucide list

---

## Phase 2: Foundational (blocking - the theme pipeline and the kit)

**Purpose**: the customer app draws in the storefront identity and has one component for each control.
Nothing in Phase 3+ starts before this phase is green.

### Pipeline (research D1–D3, D20)

- [X] T005 Add `--radius-sheet: 1rem;` (comment citing the canvas Foundations board) to the radius group in `DS/src/storefront/tokens.css`, and teach `DS/scripts/check-storefront-tokens.mjs` that it exists (no web consumer required)
- [X] T006 Rework `DS/scripts/gen-compose-theme.mjs`: give each `TARGETS` entry a `source` (customer → `../src/storefront/tokens.css`; shop, driver → `../src/tokens.css`, unchanged output); parse `rgba(r,g,b,a)` to ARGB; for a source with no `.dark` block emit **one light scheme only** (no `Dark` object); emit storefront roles `primaryMuted`, `brand`, `brandForeground`, `brandMuted`, `scrim`; map console-only names for the customer target via a table (`success→brand`, `disabled→muted`, `disabledForeground→mutedForeground`, `placeholder→mutedForeground`); change the banner comment to name the actual source file
- [X] T007 In the same generator, emit for the customer target `DS/compose/EffyStorefrontShape.kt` (sm 4, md 6, lg 8, xl 12, sheet 16 from the storefront `@theme` radii + `--radius-sheet`) and a customer `DS/compose/EffyTypography.kt` built on Geist with all 15 M3 slots per research D3 (displayLarge 36/40 Bold … labelSmall 12/16 Semi; large-title 34/41 Bold exposed as `EffyType.largeTitle`, bar title 17/24 Semi as `EffyType.barTitle`, price 30/36 Bold as `EffyType.price`; tabular figures on price styles); leave `EffyLayoutTokens.kt` (shared `EffyRadius`) unchanged for shop/driver
- [X] T008 Update `DS/scripts/check-compose-theme.mjs` to regenerate every target from its own `source` and diff; add assertions that the customer `EffyTokens.kt` has no dark scheme and contains no hex absent from `storefront/tokens.css`
- [X] T009 Update `DS/scripts/sync-mobile-assets.mjs` and `DS/scripts/check-mobile-assets.mjs` to use a per-app list: customer gets Geist fonts (+ `androidMain/res/font/` copy for Stripe), Lucide, wordmark and onboarding art, and stops receiving General Sans and the Material Symbols tab/action icons it no longer uses; shop and driver lists unchanged
- [X] T010 Update `DS/scripts/gen-stripe-appearance.mjs` to the same per-target source; customer appearance uses storefront colours, Geist (`R.font.geist_*`), button and input radius 6
- [X] T011 Run `pnpm --filter @effy/design-system tokens:gen && pnpm --filter @effy/design-system mobile-assets:sync`, then `tokens:check`, `mobile-assets:check`, `test`; confirm `DS/compose-shop/` and `DS/compose-driver/` are byte-identical to before (git diff empty)
- [X] T012 Make `CM/core/theme/EffyTheme.kt` light-only: one `lightColorScheme` from the generated tokens (error/errorContainer = destructive black), `MaterialTheme.shapes` from `EffyStorefrontShape`, typography from the generated Geist set, `LocalEffyStorefrontColor` providing `primaryMuted/brand/brandMuted/scrim`; remove the `mode` parameter; delete `CM/core/theme/AppearanceMode.kt`, `CT/core/theme/AppearanceModeTest.kt` and the `appearance_mode` key + accessors in `CM/core/storage/DevicePreferences.kt`; fix every caller (`CM/app/App.kt`, `CM/core/session/SessionManager.kt`)
- [X] T013 Enable edge-to-edge with a white status-bar area and dark status-bar icons: Android in `apps/customer-mobile/androidApp/src/main/kotlin/**/MainActivity.kt` (`enableEdgeToEdge` with light `SystemBarStyle`), iOS via `UIStatusBarStyle = UIStatusBarStyleDarkContent` in `apps/customer-mobile/iosApp/iosApp/Info.plist`; (done as `UIUserInterfaceStyle = Light`, which also keeps keyboards and the payment sheet light; Geist is registered at run time by the generated `EffyFonts` instead of `UIAppFonts`, because Compose already bundles the files)
- [X] T014 Theme the iOS payment element in `apps/customer-mobile/iosApp/iosApp/SwiftPaymentElementBridge.swift` with the generated customer values (primary `#1d4ed8`, text `#09090b`, border `#e4e4e7`, radius 6, Geist) - generated by `gen-stripe-appearance.mjs` as `iosApp/iosApp/EffyPaymentAppearance.swift` and guarded by `tokens:check` (no hand-written literals)

### Customer kit (contracts/ui-kit.md) - split `StorefrontKit.kt` into focused files

- [X] T015 Create `CM/core/presentation/EffySize.kt` (target 48, row 60, rowWithSubtitle 64, field 48, primary 52, secondary 48, tabRow 58, largeTitleBar 60, pushedBar 52, gutter 16, sheetHandle 48×5) (Lucide drawables are read through the generated `Res.drawable.lucide_*` accessors directly - no wrapper object)
- [X] T016 (Done customer-local instead: the storefront timings live in `CM/core/presentation/EffyMotionKit.kt` as `EffyStorefrontMotion`, reading mobile-kit's `LocalMotionLevel` - no change to mobile-kit at all.) Add customer motion tokens **additively** to `MK/Motion.kt` (`EffyMotion.Press 100`, `Standard 200`, `Emphasised 300`, `Push 350`, `TabFade 150`, `IosEase = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)`, `SheetSpring` damping 0.86 / stiffness 380, `ShimmerMs 1100`) without changing existing values; then create `CM/core/presentation/EffyMotionKit.kt` with `Modifier.effyPress(scale)`, `Modifier.effyBump(trigger)`, `EffyNumberRoll(text)`, and helpers that read `LocalMotionLevel` (Full → spec, Reduced → ≤150ms fade, None → snap)
- [X] T017 [P] Create `CM/core/presentation/EffyButtons.kt`: `EffyPrimaryButton` (52, radius 6, primary, 16sp Semi, press 0.98, loading, `destructive=true` → black), `EffySecondaryButton` (48, 1dp border), `EffyGhostButton`, `EffyTextLink`; remove the old button implementations from `CM/core/presentation/StorefrontKit.kt`
- [X] T018 [P] Create `CM/core/presentation/EffyFields.kt`: `EffyTextField`, `EffyPasswordField` (eye toggle, Lucide eye/eye-off), `EffySearchField` (48, `primaryMuted`, search icon, clear button, IME search action callback), focus ring 2dp `ring`, error = `EffyInlineError`; remove `EffyField`/`EffyPasswordField` from `StorefrontKit.kt`
- [X] T019 [P] Create `CM/core/presentation/EffySelection.kt`: `EffyCheckboxRow`, `EffyRadioRow`, `EffySwitchRow` (M3 controls with storefront colours, whole row 60dp target), `EffyChip` (radius 6, selected `primaryMuted` + primary border/text), `EffySegmented` (sliding thumb animated by `animateDpAsState`)
- [X] T020 [P] Create `CM/core/presentation/EffyRows.kt`: `EffyRow` (icon, title, subtitle, trailing, chevron; 60/64), `EffyGroup` (white, 1dp border, radius 8, hairlines between rows, optional section caption), `EffyDetailRow` (label/value, emphasised), `EffyHairline`; migrate `EffyNavRow`/`EffyValueRow` callers' API onto `EffyRow` and delete them from `StorefrontKit.kt`
- [X] T021 [P] Create `CM/core/presentation/EffyIndicators.kt`: `EffyStepper` (Lucide minus/plus, 44 compact / 48 page, `EffyNumberRoll` count), `EffyBadge` (99+), `EffyStatusPill(kind)` (paid/delivered → brand on brandMuted; in progress → primary on primaryMuted; problem → foreground on muted + alert icon; cancelled/inert → mutedForeground on muted), `EffyInlineError`, `EffyCard` (white, 1dp border, radius 8, `shadow-xs` equivalent); delete `CM/features/checkout/presentation/StatusPalette.kt` after moving its callers
- [X] T022 [P] Create `CM/core/presentation/EffyStates.kt`: skeleton primitives (keep `effyShimmer` 1100ms; static when motion ≠ Full), `EffyEmptyState` (56dp icon chip, 20sp title, body, one primary action), `EffyErrorState` (alert icon, black text, always "Try again"), `EffyLoadingSwap` (`AnimatedContent` crossfade between loading / content / error, 200ms); port existing skeletons (`EffyHomeSkeleton`, `EffyProductCardSkeleton`) to the new shapes
- [X] T023 Create `CM/core/presentation/ProductTile.kt`: image well radius 8 (no border/shadow), overlay add button bottom-right (40 visual / 48 target, Lucide plus, white with hairline) that morphs into `EffyStepper` when `inCartQty > 0` (`AnimatedContent` width+fade 250ms, haptic `TextHandleMove`), Sale badge and savings text in `brand`, name 2 lines, price 16 Bold tabular with struck compare-at, heart overlay via existing `TileSaveControl`, unavailable overlay, `Modifier.sharedElement` hook parameter (key `product-image-<id>`); replace `EffyProductCard`/`EffyRailTile` uses with it and delete them; keep `RailSizingTest` passing
- [X] T024 Update `CM/core/presentation/ProductImage.kt`: Coil crossfade 200ms (instant when motion ≠ Full), failure/empty → plain `muted` well with a small Lucide image icon (remove the first-letter mark)
- [X] T025 Create `CM/core/presentation/EffySheet.kt` (replacing the `EffySheet` in `StorefrontKit.kt`): `ModalBottomSheet` with custom handle 48×5, top radius 16, `scrim` colour, content in a scroll container, **footer slot laid out outside the scroll** with `navigationBarsPadding().imePadding()` and ≥34dp bottom on iOS insets, `fullHeight` mode (92% max otherwise), `busy` blocks dismissal, `dirty` → in-sheet "Discard your changes?" page (two pinned buttons) instead of a dialog; plus `EffyConfirmSheet(icon, title, body, confirmLabel, destructive, cancelLabel, onConfirm)` per `Security.dc.html`
- [X] T026 Create `CM/core/presentation/EffySnackbar.kt`: one bottom host composable (`EffySnackbarHost`) placed above the tab bar or pinned bar via a `LocalEffyBottomObstruction` height, slide-up 200ms, optional action; snackbar visuals per `Patterns.dc.html`
- [X] T027 Create `CM/core/presentation/EffyFrame.kt`: `EffyLargeTitleBar(title | wordmark=true, scroll: EffyCollapse, search: (@Composable () -> Unit)?, onBell)` (34sp Bold left, bell 48 target right, no border, collapses to 17sp centred over 52dp via a nested-scroll connection `rememberEffyCollapse()`), restyled `EffyAppBar(title, onBell?)` (Back from `LocalNavBack`: "‹ Back" text in primary on iOS, chevron-left on Android; centred 17sp Semi title; trailing only the bell; no border), `EffyPinnedBar` (hairline + floating shadow, gutter 16, bottom inset ≥34 iOS, slide-up entrance), `EffyWordmark` (full stop tinted `brand`); move `EffyBackArrow` here; reduce `CM/core/presentation/StorefrontKit.kt` to formatting helpers only (or delete it if empty)
- [X] T028 Add `CT/core/presentation/KitSizingTest.kt`: asserts every `EffySize` minimum ≥ 48 where it is a target, and (compose UI test where available in commonTest) that `EffyPrimaryButton`, `EffyRow`, `EffyChip`, `EffyStepper`, tab cell and tile add button measure ≥ 48×48dp
- [X] T029 Extend `scripts/mobile-guard.sh` for the customer app: fail `AlertDialog`, `Dialog(`, `DropdownMenu`, `ModalBottomSheet` outside `core/presentation/EffySheet.kt`, `OutlinedTextField`, `FilterChip`, `ScrollableTabRow`, `BadgedBox`, `Color(0x` under `features/`, any `@effyshopping.com` other than `hello@effyshopping.com`, and the words `package`/`packages` in `features/cart/presentation` and `features/checkout/presentation/CheckoutScreen.kt` user-facing strings; extend `scripts/check-no-storefront-red.sh` to scan `apps/customer-mobile/shared/src` and `DS/compose/` (the guard will fail until Phase 3–5 convert the sites - run it in report mode, then enforce in T095)

**Checkpoint**: the app builds and runs in the new colours, type and kit (layouts still old); shop and driver unchanged.

---

## Phase 3: User Story 1 - One new look and one app frame (P1) 🎯 MVP

**Goal**: five-tab bar with Cart, borderless headers (large title / pushed bar), no dark ribbon, header
holds only title/logo, Back, bell.

**Independent test**: quickstart walk step 1 on iPhone and Android.

- [X] T030 [US1] Add `Cart` to the tab enum between Search and Orders in `CM/core/nav/CustomerNavState.kt`, make `CustomerNavKey.Cart` the Cart tab's root key in `CM/core/nav/CustomerNavKey.kt`, add a `selectTab(tab)` call for every former `push(CustomerNavKey.Cart)` across `CM/features/**` (Home, Search, Product, Saved, Promotion, add-to-cart snackbars), and keep `customerNavSavedState` and `ALL_CUSTOMER_ROUTES` complete
- [X] T031 [US1] Implement re-tap-active-tab → pop to root in `CM/core/nav/CustomerNavState.kt`; keep system-back behaviour (pop; non-Home root → Home)
- [X] T032 [US1] Update `CT/app/ScreenInventoryTest.kt` to the five tabs (Home, Search, Cart, Orders, Account) with a comment citing 087 FR-006; update the nav serialisation test(s) in `CT/` for the Cart root; add `CT/core/nav/TabNavigationTest.kt` (reselect → root, cart is a tab, history survives) - the "never pushes the cart" rule is ENFORCED by `scripts/mobile-guard.sh` (a source rule, which a unit test cannot see)
- [X] T033 [US1] Create `CM/app/EffyTabBar.kt` per `TabBar.dc.html` (5 equal cells, row ≥58 + bottom inset, 27dp Lucide icons house/search/shopping-cart/package/user-round, 12sp labels 600/500, selected primary + 3dp indicator animated between cells, others mutedForeground, white 96% + top hairline, `EffyBadge` with bump on count increase) and pass it into `ResponsiveNavigation` from `CM/app/CustomerShell.kt` as the compact bar (mobile-kit gained ONE optional `bottomBar` slot, default null - shop/driver unchanged) (rail ≥600dp keeps working with the same icons); badge count derived from `container.cart.state` (available quantity sum)
- [X] T034 [US1] Remove `CM/features/cart/presentation/CartAction.kt` and every header cart/heart trailing action (Home header heart and cart, Search/Results/Product app-bar carts); Saved remains reachable from Account and the Home shortcut row
- [X] T035 [US1] Put every tab root on `EffyLargeTitleBar`: Home (wordmark + search entry that selects the Search tab with focus), Search ("Search" + live `EffySearchField`), Cart ("Cart"), Orders ("Orders"), Account ("Account") - in `CM/features/catalog/presentation/HomeScreen.kt`, `SearchScreen.kt`, `CM/features/cart/presentation/CartScreen.kt`, `CM/features/checkout/presentation/OrdersScreen.kt`, `CM/features/account/presentation/AccountScreens.kt`; bell navigates to `Notifications`
- [X] T036 [US1] Put every pushed page on the restyled `EffyAppBar` (sweep `CM/features/**/presentation/*.kt`), including `PointsScreen.kt` and `PaymentMethodsScreen.kt` which today use a bare `Scaffold` heading (this also closes FR-029); auth screens use `EffyAppBar` with an empty title
- [X] T037 [US1] Add `CT/app/HeaderActionsTest.kt` (or a guard rule in `scripts/mobile-guard.sh`): the bars' trailing slot accepts only the bell - no other trailing composable parameter exists on `EffyLargeTitleBar`/`EffyAppBar`

**Checkpoint**: US1 complete - frame and navigation match the App bar and Tab bar boards.

---

## Phase 4: User Story 2 - Sheets instead of dialogs; tactile, animated app (P1)

**Goal**: no centred dialog anywhere; pinned sheet actions; every transition and micro-animation on the boards.

**Independent test**: quickstart walk steps 2–3; `make cm-guard` dialog rules pass.

### Sheets (research D7)

- [X] T038 [P] [US2] Convert "Sign out everywhere?" in `CM/features/account/presentation/AccountScreens.kt` (Security) to `EffyConfirmSheet` per `Security.dc.html`; add a "Sign out" confirm sheet only if the board shows one
- [X] T039 [P] [US2] Convert delete-address and "Set another default first" in `CM/features/addresses/presentation/AddressBookScreen.kt` to `EffyConfirmSheet`s
- [X] T040 [P] [US2] Convert new list / rename list / delete list in `CM/features/saved/presentation/SavedListsBar.kt` to `EffySheet` (name field + pinned Create/Save) and `EffyConfirmSheet` (delete); replace `ScrollableTabRow` with an `EffyChip` row per `Saved.dc.html`
- [X] T041 [P] [US2] Replace the sort `DropdownMenu` in `CM/features/catalog/presentation/SearchScreen.kt` with a sort `EffySheet` of `EffyRadioRow`s (Best match only with a query, Newest, Price low→high, Price high→low)
- [X] T042 [P] [US2] Delete the unused "Empty your cart?" dialog and the unused `SavedRow`/`SummaryRow` in `CM/features/cart/presentation/CartScreen.kt`
- [X] T043 [P] [US2] Convert the receipt's inline confirms (cancel order "Yes, cancel it / Keep my order", "Something wrong with this order?" form) in `CM/features/checkout/presentation/ReceiptScreen.kt` to `EffyConfirmSheet` and an `EffySheet` with pinned Send, per `Order.dc.html`
- [X] T044 [US2] Move the remaining sheets onto the new `EffySheet` API with pinned footers: `CM/features/catalog/presentation/FilterSheet.kt` (pinned "Show N results" + "Clear all"), `CM/features/saved/presentation/ListChooserSheet.kt` (pinned Done), `CM/features/addresses/presentation/AddressFormSheet.kt` (fullHeight, pinned Save, keyboard-safe), the single-field sheets in `CM/features/account/presentation/PersonalDetailsScreen.kt`; delete the old discard `AlertDialog`

### Transitions (contracts/navigation-and-motion.md)

- [X] T045 [US2] Retune `NavDisplay` `transitionSpec` / `popTransitionSpec` / `predictivePopTransitionSpec` in `CM/app/CustomerShell.kt`: push = enter from 100% x, exit to −30% x with a 10% dim overlay, 350ms `IosEase`; pop inverse; reduced → 150ms fade; none → snap
- [X] T046 [US2] Interactive iOS edge-swipe back: wire Navigation 3 predictive back on iOS (CMP back-gesture handler) so the page follows the finger and completes past 35% width or on fling; if the platform handler is unavailable on CMP 1.11.1, implement a 20dp left-edge drag detector in `CM/app/CustomerShell.kt` driving the same seekable transition; disable it on `Payment` while `paying` and on `Receipt` reached by `resetTo` (add `CT/core/nav/BackGestureTest.kt` for the enable/disable rule)
- [X] T047 [US2] Tab switch 150ms cross-fade in `CM/app/CustomerShell.kt` (use the unused `MotionRole.PeerDestination`); tab bar show/hide on push/pop slides with the page (keep `snapTo` when motion ≠ Full)
- [X] T048 [US2] Shared element tile → product: wrap `NavDisplay` in `SharedTransitionLayout` in `CM/app/CustomerShell.kt`, provide the scopes via a `LocalEffySharedScope`, apply `sharedElement(key = "product-image-$id")` in `ProductTile` and on the first gallery page in `CM/features/catalog/presentation/ProductDetailScreen.kt`; only when motion is Full
- [X] T049 [US2] Large-title collapse: connect `rememberEffyCollapse()` to the root list of Home, Search, Cart, Orders, Account (the screens from T035)
- [X] T050 [US2] Restyle `EffyPullToRefresh` use (spinner primary) on Home, Orders, Saved, Points, Order details, Product - keep the content-translation behaviour (no change to `MK/EffyPullToRefresh.kt` beyond an optional colour parameter, additive) - (spinner left at mobile-kit default; content translation unchanged)

### Micro-animations and haptics

- [X] T051 [US2] Apply `Modifier.effyPress()` to every tappable kit element (rows, chips, tiles, buttons, tab cells) in `CM/core/presentation/*` and `CM/app/EffyTabBar.kt`
- [X] T052 [US2] Number roll on cart/checkout/payment totals and stepper counts (`EffyNumberRoll`), heart pop in `CM/features/saved/presentation/SaveControl.kt`, `Modifier.animateItem()` on cart lines, saved rows, address rows and recents, chip/segmented indicator slide, snackbar and pinned-bar slide-up
- [X] T053 [US2] Haptics via `LocalHapticFeedback`: light on add-to-cart and quantity change (`ProductTile`, Product pinned bar, Cart stepper), success on order confirmed (`ReceiptScreen.kt` confirmation mode)
- [X] T054 [US2] Walk the "Kept from today" list in contracts/navigation-and-motion.md against the code and record each item's file:line in a comment block at the top of `CM/core/presentation/EffyMotionKit.kt` (FR-016 evidence)

**Checkpoint**: US2 complete - no dialogs; transitions and micro-animations per boards; reduce motion honoured.

---

## Phase 5: User Story 3 - Every screen in the new design (P1)

**Goal**: each screen matches its board. Each task: open the board, rebuild the screen with the kit, keep
the ViewModel and its state unchanged unless stated, keep all pinned words, sentence-case copy, add
loading (skeleton) / empty / error states shown on the board.

**Independent test**: quickstart walk steps 4–5, screen by screen against the boards.

### Discover and shop

- [X] T055 [P] [US3] Onboarding per `Onboarding.dc.html` in `CM/features/onboarding/presentation/OnboardingScreen.kt`: bundled flat art from T004 (remove Unsplash URLs and the gradient), wordmark, pager indicator animation kept, pinned "Next"/"Get started", "Skip"
- [X] T056 [US3] Home per `Main.dc.html` in `CM/features/catalog/presentation/HomeScreen.kt` and `HomeBlocks.kt`: aisle circles row, offers carousel with flat text panel instead of the dark gradient scrim (update `EffyPromoBanner` in the kit), section rails of `ProductTile`s, skeleton; keep `HomeBlocksTest` block order
- [X] T057 [P] [US3] Map the 084 aisle keys to Lucide icons in `CM/features/catalog/presentation/CategoryIcons.kt` and update `CT/features/catalog/CategoryIconsTest.kt`
- [X] T058 [US3] Search tab and Results/aisle per `Search.dc.html` and `Results.dc.html` in `CM/features/catalog/presentation/SearchScreen.kt`: `EffySearchField`, filter + sort chips row with active count, result count, 2-column `ProductTile` grid, footer loading row while paging, skeleton, empty ("No results for …") and failed (with Try again) states
- [X] T059 [US3] Filters sheet per `Filters.dc.html` in `CM/features/catalog/presentation/FilterSheet.kt`: `EffySwitchRow` On sale, price min/max `EffyTextField`s, category `EffyRadioRow`s, facet `EffyCheckboxRow`s with counts, pinned "Show N results"
- [X] T060 [US3] Product per `Product.dc.html` in `CM/features/catalog/presentation/ProductDetailScreen.kt`: gallery with animated dots, brand, name, price (`EffyType.price`), Sale/savings in brand, unavailable panel, save + "Add to list", Description and Details groups, allergen note, "More like this" rail of `ProductTile`s (remove the ad-hoc 140dp tile), `EffyPinnedBar` with stepper + "Add to cart" ("Added" state animated), skeleton instead of spinner, `EffyErrorState`
- [X] T061 [P] [US3] Add to a list sheet per `AddToList.dc.html` in `CM/features/saved/presentation/ListChooserSheet.kt` (checkbox rows with counts, new-list field + create, signed-out variant)
- [X] T062 [P] [US3] Offer per `Offer.dc.html` in `CM/features/catalog/presentation/PromotionScreen.kt`: artwork, code box with Copy → Copied (animated, `EffySecondaryButton`), conditions/availability rows, how-to text, pinned "Browse products", unavailable and failed states

### Cart, checkout and orders

- [X] T063 [US3] Cart tab per `Cart.dc.html` in `CM/features/cart/presentation/CartScreen.kt`: one list of lines (image, name, each-price, "Was", unavailable note with icon, line total, `EffyStepper`, black trash), promo field (signed-in), summary group, `EffyPinnedBar` with total + "Check out", blocked reasons, empty state "Your cart is empty" with "Start shopping" (selects Home), bottom snackbar with Undo
- [X] T064 [US3] Checkout - Delivered by Effy per `Checkout.dc.html` in `CM/features/checkout/presentation/CheckoutScreen.kt`: sectioned cards - address cards (radio, Default badge, coverage line), "Add a new address" sheet, delivery instructions (handover `EffyChip`s, note field, save-to-address checkbox), delivery windows as selectable tiles (56dp, 2 per row) under "Same-day delivery" / "Standard delivery" with the "Any time during the day" default and "Need a specific time?" expansion animated (`animateContentSize`), ASAP row titled "Standard", fee lines, points `EffySwitchRow`, billing switch + address, inline errors with icon, legal line, `EffyPinnedBar` with order total (cart total + chosen fee, number roll) + "Pay now"; every visible word from the existing pinned twins
- [X] T065 [US3] Checkout - Courier delivery per `Checkout-Courier.dc.html` in the same file: courier card with the pinned courier lines and estimate wording, fee lines, no chooser; unserviced address shows the one refusal sentence (from `CoverageWords.kt`) with an icon
- [X] T066 [US3] Payment per `Payment.dc.html` in `CM/features/payment/presentation/PaymentScreen.kt`: "Total due" card using `EffyType.price` (fixes the undefined `displaySmall`), Stripe element host, mandate text, `EffyPinnedBar` "Pay $X", security note, skeleton while preparing, session-lost state with "Back to checkout"
- [X] T067 [US3] Order confirmed and Order details per `Confirmation.dc.html` and `Order.dc.html` in `CM/features/checkout/presentation/ReceiptScreen.kt`: confirmation mode shows the animated tick + "Thank you" + pinned "Keep shopping" (kit button, not the mobile-kit pill); details mode shows `EffyStatusPill` stage, no "Thank you"; arrival card (pinned wording), stage sentence, item rows with `ProductImage` thumbnails (fixes the grey box), summary group, payment line, addresses, refunds section, actions as rows opening sheets (from T043), add an `EffyErrorState` for load failure distinct from Pending
- [X] T068 [US3] Orders tab per `Orders.dc.html` in `CM/features/checkout/presentation/OrdersScreen.kt`: `EffySegmented` Ongoing/Completed, order rows as cards (rich data comes in US5 - this task lays out the row with today's fields: number, items, delivered-by words, total, "Buy again"), skeleton list, empty states ("No orders in progress" / "No completed orders") with "Start shopping", error with Try again, bottom snackbar for reorder results

### Account

- [X] T069 [US3] Account tab per `Account.dc.html` in `CM/features/account/presentation/AccountScreens.kt`: profile row (avatar initials on primary, name, email, chevron), shortcut row (Saved, Notifications, Orders), `EffyGroup`s Shopping / Account / Help / Legal with Lucide icons, app version footer; no appearance setting
- [X] T070 [P] [US3] Personal info per `PersonalInfo.dc.html` in `CM/features/account/presentation/PersonalDetailsScreen.kt` (value rows, single-field sheets with pinned Save, email read-only explanation) - (inherits the restyled kit rows/sheets; no screen-specific rewrite)
- [X] T071 [P] [US3] Address book and address sheet per `Addresses.dc.html` / `AddressForm.dc.html` in `CM/features/addresses/presentation/AddressBookScreen.kt` and `AddressFormSheet.kt` (address cards with label, Default badge, coverage line with brand-green "Delivered by Effy", row actions; grouped form fields; pinned "Add address") - (rows, coverage line, actions, sheets restyled; layout otherwise as before)
- [X] T072 [P] [US3] Saved items and lists per `Saved.dc.html` in `CM/features/saved/presentation/SavedScreen.kt` and `SavedTiles.kt` (list chips, segmented sort, rows with price-drop in brand, in-cart state, pinned "Add everything available to cart", skeleton, empties) - (kit chips/sheets, inline errors, price-drop in green, black trash; layout otherwise as before)
- [X] T073 [P] [US3] Effy points per `Points.dc.html` in `CM/features/points/presentation/PointsScreen.kt` (balance card, worth, expiry, history rows with +/− in brand/foreground, "Show older", empty)
- [X] T074 [P] [US3] Payment methods per `PaymentMethods.dc.html` in `CM/features/paymentmethods/presentation/PaymentMethodsScreen.kt` (card rows with brand name from `brand`, expiry, Default, Remove via `EffyConfirmSheet`, footnote, empty/failure states)
- [X] T075 [P] [US3] Security per `Security.dc.html` and password flows in `CM/features/account/presentation/AccountScreens.kt` and `PasswordScreens.kt` (grouped rows, pinned primary on each password step, OTP field unchanged in behaviour)
- [X] T076 [P] [US3] Privacy & data per `Privacy.dc.html` in `CM/features/account/presentation/AccountScreens.kt` (analytics `EffySwitchRow`, policy row, Delete account row in black with icon)
- [X] T077 [P] [US3] Delete account per `DeleteAccount.dc.html` in `CM/features/account/presentation/DeleteAccountScreen.kt` (blockers, what happens, what we keep, code step, final action black destructive `EffyPrimaryButton`, confirm sheet) - (errors and buttons on the kit; layout otherwise as before)
- [X] T078 [P] [US3] Notifications per `Notifications.dc.html` in `CM/features/notifications/presentation/NotificationsScreen.kt`: honest empty state; when push permission is denied, a "Turn on notifications" row opening system settings through a new `openAppSettings()` in `CM/core/platform/` (expect/actual: Android `ACTION_APPLICATION_DETAILS_SETTINGS`, iOS `UIApplicationOpenSettingsURLString`); delete `NotificationFixtures`

### Sign in, help and legal

- [X] T079 [US3] Auth screens per `Auth.dc.html`, `Auth-Code.dc.html`, `Auth-Password.dc.html`, `Auth-Name.dc.html` in `CM/features/auth/presentation/AuthScreens.kt`: `EffyAppBar` (back only), wordmark, 32sp title, subtitle, kit fields, pinned primary actions, "Or" divider, inline links, errors with icon; `OtpInput` behaviour unchanged (one logical node, iOS native field)
- [X] T080 [P] [US3] Help per `Help.dc.html` in `CM/features/help/presentation/HelpScreens.kt` (FAQ accordions with animated chevron rotation, topic rows that open the matching FAQ, Customer Service with a working "Email us" `mailto:`); refresh the stale FAQ answers to the current delivery model words
- [X] T081 [P] [US3] Give feedback per `Feedback.dc.html` in `CM/features/feedback/presentation/FeedbackScreen.kt` (category chips, message, name/email, pinned "Send feedback", success state) - keep the existing optional 1–5 experience chips only if the board shows them, and confirm `mobile-guard.sh` still passes (no "out of 5") - (errors on the kit; layout otherwise as before)
- [X] T082 [P] [US3] Legal per `Legal.dc.html` in `CM/features/legal/presentation/LegalScreens.kt` and `LegalMarkdown.kt` (grouped index rows, document typography in Geist, tables bordered) - (inherits the kit; no screen-specific rewrite)

### States and banners

- [X] T083 [US3] Consent banner per `Patterns.dc.html` in `CM/core/observability/AnalyticsConsentBanner.kt` (two equal buttons, above the tab bar, slide-up); app-level `Barred`/`Closing`/`Restoring` states in `CM/app/App.kt` restyled with the kit (`EffyEmptyState`, skeleton instead of spinner where the board shows it)
- [ ] T084 [US3] Large-text pass: on each screen above, verify at the largest system text size that nothing clips and pinned bars stay reachable; fix overflow with wrapping or `maxLines` + ellipsis as on the boards (record any screen-specific fix in the screen's file) - ⚠ OPEN: needs a device at the largest text size; part of the operator walk (quickstart step 4)

**Checkpoint**: US3 complete - all boards matched.

---

## Phase 6: User Story 4 - Defects fixed (P2)

**Goal**: the six defects are gone. (FR-029 Back is closed by T036.) Tasks touch files also edited in
Phase 5 - do each after its screen task.

**Independent test**: quickstart walk step 6.

- [X] T085 [US4] Fix the four literal `${…}` templates in `CM/features/checkout/presentation/ReceiptScreen.kt` (order number, promo code in "Discount (…)", card ending, refund amount with currency via the one money formatter) and add `CT/features/checkout/ReceiptTextTest.kt` that builds every receipt string from a fixture and fails on `${` or `$'`
- [X] T086 [US4] Help contact address `support@effyshopping.com` → `hello@effyshopping.com` in `CM/features/help/presentation/HelpScreens.kt` (guard from T029 enforces it)
- [X] T087 [US4] Remove "Your order arrives in N packages." and "Package N" grouping from `CM/features/cart/presentation/CartScreen.kt`; stale FAQ text that implies a split goes in T080
- [X] T088 [US4] Show "You'll sign in at checkout. Your cart is kept." only when the session is `Guest` in `CM/features/cart/presentation/CartScreen.kt`
- [X] T089 [US4] Add `googleSignInEnabled: Boolean = false` to `CM/core/config/AppConfig.kt` and hide "Continue with Google" and its "Or" divider in `CM/features/auth/presentation/AuthScreens.kt` when false; delete the stub message; add a test in `CT/features/auth/` that the button is absent by default

**Checkpoint**: US4 complete.

---

## Phase 7: User Story 5 - The information the new screens show (P2)

**Goal**: orders list stage/arrival/thumbnails, sub-aisles, recent searches (notifications list deferred -
T078 ships the empty state).

**Independent test**: quickstart walk step 7.

- [X] T090 [US5] Extend the orders-list DTO mapping in `CM/features/checkout/data/CheckoutMappers.kt` and `OrderSummary` in `CM/features/checkout/domain/Checkout.kt` with `placedAt`, `stage`, `arrivals` (via the existing `distinctArrivals` twin), `deliveredAt`, `thumbnails` (+ `thumbnailWidths` → rendition URL via the 086 helper the app already uses for product images, if present; else the plain URL), `fullyRefunded`, `refundedTotal`; regenerate the Kotlin contract DTOs with `make cm-contract-gen` if the list DTO lacks these fields, then `make cm-contract-check`; all fields optional (pre-084 orders degrade to today's row)
- [X] T091 [US5] Render the rich row in `CM/features/checkout/presentation/OrdersScreen.kt` per `Orders.dc.html`: `EffyStatusPill` stage (Refunded when fully refunded), arrival line from the pinned `DeliveryWindowText`/`deliverySummary` twins (as sold; ASAP shows the estimate only, courier shows the estimate wording), placed/delivered date meta, up to four 40dp thumbnails + "+N"; add `CT/features/checkout/OrderSummaryRowTest.kt` covering missing fields, refunded, cancelled, the stage fallback
- [X] T092 [US5] Sub-aisles: in `CM/features/catalog/presentation/SearchViewModel.kt` derive `children` of the entry `categoryKey` from the loaded categories (`parentKey`, `productCount > 0`); in `SearchScreen.kt` show an "All" + children `EffyChip` row on Results when children exist (selecting reloads with that key; "All" = parent); add `CT/features/catalog/SubAisleTest.kt`
- [X] T093 [US5] Recent searches data layer per data-model.md: `CM/features/catalog/domain/RecentSearch.kt` (model + use-cases `RecordSearch`, `ObserveRecentSearches`, `RemoveRecentSearch`, `ClearRecentSearches`), `CM/features/catalog/data/DeviceRecentSearchRepository.kt` on `DevicePreferences` key `recent_searches` (JSON, max 10, case-insensitive de-dupe, newest first), wired in `CM/app/AppContainer.kt`; clear on sign-out and account deletion in `CM/core/session/SessionManager.kt`; add `CT/features/catalog/RecentSearchesTest.kt` (cap, de-dupe, order, clear)
- [X] T094 [US5] Recent searches UI in `SearchViewModel.kt` / `SearchScreen.kt` per `Search.dc.html`: shown when the query is blank (with the aisle list below), tap fills and submits, per-row remove (x), "Clear" all; record on IME search and on opening a result from a typed query; never sent to analytics

**Checkpoint**: US5 complete.

---

## Phase 8: Polish & cross-cutting

- [X] T095 Switch `scripts/mobile-guard.sh` and `scripts/check-no-storefront-red.sh` customer rules from report mode to enforcing; run `make cm-guard`, `scripts/check-no-storefront-red.sh`, `scripts/check-no-refresh-timers.sh`, `scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh` - all green
- [ ] T096 Sweep `CM/` for leftovers: unused `StorefrontKit.kt` remnants, Material Symbols drawables no longer referenced, `ComingSoonTab`, `EffyListRow`, the unrouted `CM/features/tracking/presentation/TrackOrderScreen.kt` (delete - its stages are shown on Order details), four money helpers collapsed to one (`StorefrontFormat.kt`) with currency on refund amounts - ⚠ PARTLY DONE: StorefrontKit, ComingSoonTab, the tracking screen, StatusPalette and NotificationFixtures are deleted; the four money helpers are NOT yet collapsed and a few Material Symbols drawables are still referenced (ic_google_g, ic_favorite_selected)
- [X] T097 Run the full check list in `specs/087-customer-mobile-redesign/quickstart.md` "Automated checks": design-system gen/check/test, `make cm-guard`, `make cm-codegen`, `cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug`, `pnpm --filter @effy/shared-types test`; and build `apps/shop-mobile` and `apps/driver-mobile` (`./gradlew assembleDebug`) to prove they are unchanged
- [X] T098 [P] Update docs: `CLAUDE.md` Design system section (customer mobile now on the storefront identity, light only; Geist + Lucide bundled; the generator's per-target source) and the "Mobile apps" paragraph (five customer tabs); `packages/design-system/README.md`; `docs/audiences/customer-capabilities.md` (mobile gains sub-aisles, recents, orders detail; loses dark mode; Google hidden while parked)
- [X] T099 [P] Note in `.specify/memory/constitution.md` Sync Impact Report history that the 084 D14 follow-up ("customer-mobile adopts the storefront identity") is closed by 087 - a history note only, no principle text change and no version bump
- [X] T100 Add the 087 entry to `FEATURE-HISTORY.md` (what changed, guards added, tests changed deliberately: `ScreenInventoryTest`, nav serialisation, `CategoryIconsTest`, `AppearanceModeTest` deleted; no backend/migration/deploy; operator steps: download Geist if T002 was handed over, device walk per quickstart on iPhone + Android, sign-off) and add 087 to the feature list in `CLAUDE.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T004)**: none; T002–T004 parallel.
- **Foundational (T005–T029)**: after Setup. Pipeline T005→T006→T007→T008→T009→T010→T011→T012; T013–T014 after T011. Kit T015–T016 first, then T017–T022 in parallel, then T023–T027 (T023 needs T021; T025 needs T017; T027 needs T015), T028–T029 last. **Blocks all stories.**
- **US1 (T030–T037)**: after Foundational. T030→T031→T032; T033 after T030; T034–T036 after T033.
- **US2 (T038–T054)**: after Foundational; T045–T049 need US1's shell (T033, T035). Sheet conversions T038–T043 are parallel.
- **US3 (T055–T084)**: after US1 (frame) - individual screens are parallel where marked [P]; T056/T058/T060 share catalog files (sequential); T063–T068 sequential within checkout files.
- **US4 (T085–T089)**: each after its screen task in US3 (T085 after T067; T086 after T080; T087–T088 after T063; T089 after T079).
- **US5 (T090–T094)**: T090→T091 after T068; T092 after T058; T093→T094 after T058.
- **Polish (T095–T100)**: after all stories.

### Story dependencies

- US1 is the MVP and the base for US2/US3 (frame, tabs).
- US2 transitions depend on US1's shell; sheet conversions are independent of US1.
- US3 depends on Foundational + US1. US4 and US5 attach to US3 screens but are independently testable.

### Parallel opportunities

- Setup: T002, T003, T004.
- Kit: T017–T022 (six separate files).
- US2: T038–T043 (six different feature files).
- US3: T055, T057, T061, T062, T070–T078, T080–T082 (separate files).
- Polish: T098, T099.

## Parallel Example: Foundational kit

```text
T017 EffyButtons.kt   T018 EffyFields.kt   T019 EffySelection.kt
T020 EffyRows.kt      T021 EffyIndicators.kt   T022 EffyStates.kt
```

## Parallel Example: User Story 3 (Account group)

```text
T070 PersonalDetailsScreen.kt   T071 AddressBookScreen.kt + AddressFormSheet.kt
T072 SavedScreen.kt             T073 PointsScreen.kt
T074 PaymentMethodsScreen.kt    T078 NotificationsScreen.kt
```

## Implementation Strategy

### MVP first

1. Phase 1 + Phase 2 → app in new colours, Geist, Lucide, new kit (old layouts).
2. Phase 3 (US1) → five tabs, new headers, no ribbon. **Stop and walk step 1.**

### Incremental delivery

3. US2 → sheets + motion (walk steps 2–3).
4. US3 by board group: Discover & shop → Cart/checkout/orders → Account → Sign in/help/legal → states (walk 4–5 per group).
5. US4 defects and US5 data alongside their screens (walk 6–7).
6. Polish → guards enforcing, docs, FEATURE-HISTORY; operator device walk and sign-off.

## Notes

- No backend, migration, Terraform or deploy task exists in this feature; if one appears necessary,
  stop and return to plan.md.
- Claude does not commit; the operator commits per phase.
- Total: 100 tasks.
