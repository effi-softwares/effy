# Research: Customer Mobile Redesign (087)

Every decision below is grounded in the current source (inventory taken 2026-10-14) and the design canvas
https://claude.ai/artifact/WSJRR99YaDrAU6LJaChbQv. `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`.

## D1 — Theme source: the storefront file, per-target generator

- **Decision**: `gen-compose-theme.mjs` gains a per-target `source`. The customer target reads
  `packages/design-system/src/storefront/tokens.css`; shop and driver keep `src/tokens.css`. The customer
  output gains the storefront roles (`primaryMuted`, `brand`, `brandForeground`, `brandMuted`, `scrim`) and
  drops nothing the app still reads; the console-only roles the customer app reads today (`success`,
  `disabled`, `disabledForeground`, `placeholder`) are mapped onto storefront values in the generator
  (`success → brand`, `disabled → muted`, `disabledForeground/placeholder → mutedForeground`) — a mapping
  table in the script, not new tokens in the CSS.
- **Rationale**: Principle V — one file per identity, both in the design-system package, no app-local
  palette. 084's tokens file already says it is expected to be the mobile app's input (084 D14) and keeps
  `:root` a plain hex block for this generator. `--scrim` is `rgba(…)`: the parser gains rgba support.
- **Light only**: the storefront file has no `.dark` block, so the customer output emits one `ColorScheme`
  and `EffyTheme` stops reading `AppearanceMode`/system dark (FR-004). `AppearanceMode`,
  `AppearanceModeTest` and the `appearance_mode` key are deleted (they had no UI and no reader).
- **Alternatives rejected**: a hand-written Kotlin palette in the app (Principle V forbids it); restating
  storefront hexes into `tokens.css` (two files, one palette — the five-defect shape).
- **Guard**: `check-compose-theme.mjs` regenerates every target from its own source and fails on drift;
  a new check fails if the customer output contains a dark scheme or any hex absent from the storefront file.

## D2 — Radius and shape on mobile

- **Decision**: the customer layout tokens emit the storefront scale **sm 4 / md 6 / lg 8 / xl 12**, plus
  the sheet top **16** from the canvas Foundations board, as a customer-only shape set. Buttons and fields
  6, cards and image wells 8, banners 12, sheet top 16. No pill buttons; badges and the stepper are the
  canvas's shapes. `MaterialTheme.shapes` is overridden so no M3 default radius leaks.
- **Rationale**: the shared `EffyRadius` (`com.effyshopping.mobile.design`) is audience-neutral and is read
  by mobile-kit for shop and driver; changing it would restyle those apps. The customer's shapes therefore
  live in the customer package (`EffyStorefrontShape`), generated from the same storefront file.
- **Sheet 16**: the storefront file has no 16. Rather than a generator constant, it is added to
  `storefront/tokens.css` as `--radius-sheet: 1rem` (cited to the canvas), so every shape still has one
  source. The web does not consume it; `check-storefront-tokens.mjs` is told it exists.

## D3 — Geist on mobile

- **Decision**: commit Geist **static TTFs** (Regular 400, Medium 500, SemiBold 600, Bold 700) and Geist
  Mono Medium to `packages/design-system/mobile-assets/font/`, from the official Vercel `geist-font`
  release (SIL OFL 1.1, licence file committed beside them). `sync-mobile-assets.mjs` copies them into
  `composeResources/font/` and (for the payment sheet) `androidMain/res/font/`; General Sans files are
  removed from the customer app only (shop and driver keep their own sync list).
- **Rationale**: FR-003 (no run-time download); the repo has only variable woff2, which Compose resources
  and Stripe Android cannot load. Bold 700 is needed — the canvas's large titles and prices are 700 and the
  current app silently falls back to SemiBold.
- **Typography**: `EffyTypography` for the customer target is regenerated from the canvas's type table
  (Foundations board): display 36/40 Bold, auth title 32/36 Semi, price 30/36 Bold, large title 34/41 Bold,
  page 24/32 Semi, section 20/28 Semi, bar title 17/24 Semi, body 16/22, button 15–16 Medium/Semi, small
  14/20, meta 12/16. All 15 M3 slots are defined (today `displayMedium/Small` fall back to the platform font).
  Prices use tabular figures.
- **Alternatives rejected**: downloadable fonts (network at first paint; not on iOS); keeping General Sans
  (the operator asked for the web's identity).

## D4 — Icons

- **Decision**: replace Material Symbols with **Lucide** (ISC licence) vector drawables, the set the canvas
  and the web use, converted to Android vector XML into `mobile-assets/drawable/` with a `lucide_` prefix,
  synced like today. Stroke 2 (1.75 at 27dp tab size). Tab icons get an outline + filled-ish "selected"
  variant by stroke weight (Lucide has no filled set; selection is colour + indicator, as on the board).
- **Rationale**: FR-005; adds the missing glyphs (plus, minus, check, chevron, filter, sort, truck, clock,
  card, bell-dot, map-pin, coins). Aisle icons map through `CategoryIcons.kt`, extended to the 084 aisle
  keys (fixes the fallback-icon drift; `CategoryIconsTest` updated to the new keys).

## D5 — Five tabs (Cart becomes a tab)

- **Decision**: `CustomerTab` gains `Cart` between Search and Orders. `CustomerNavKey.Cart` stops being a
  pushed route and becomes the Cart tab's root; every former `push(Cart)` becomes `selectTab(Cart)`.
  The tab badge reads `container.cart.state` (quantity sum, "99+" cap). Guests may open the Cart tab (as
  they can open the cart today); "Check out" still pushes `SignIn(returnTo = Checkout)` for guests.
  Re-tapping the active tab pops it to root (FR spec scenario US1-6; today it does nothing).
- **Tests changed deliberately**: `ScreenInventoryTest` (its own comment says changing the tab set is a
  navigation change — this spec is that change, FR-006/007), `CustomerNavKeySerializationTest` (route
  count unchanged: Cart moves from route to tab root, still serialisable), `customerNavSavedState`.
- **Bar sizing**: the bar is redrawn in the app (not by `NavigationSuiteScaffold`'s default item), using
  mobile-kit's `ResponsiveNavigation` slot API so the rail at ≥600dp keeps working. Row 58dp + bottom inset,
  27dp icons, 12sp labels, 3dp blue indicator, white 96% ground with a top hairline (Tab bar board).
  ⚠ mobile-kit is shared with shop and driver: the customer bar is a customer composable passed in, not a
  change to mobile-kit's default bar.

## D6 — Headers: large title + collapse, pushed bar, no ribbon

- **Decision**: a new `EffyLargeTitleBar` (tab roots) and a restyled `EffyAppBar` (pushed pages), both in
  `CM/core/presentation/`. Large title 34sp Bold left (or the "effy." wordmark — a vector with the green
  full stop — on Home) and the bell (with an unread dot reserved, unused until notifications exist); it
  collapses to a 17sp centred title as the list scrolls (nested-scroll connection, 0→1 over 52dp). Pushed
  bar: "‹ Back" in primary (iOS text back; Android shows the arrow only), centred 17sp title, no border.
  Edge-to-edge with white status-bar area and dark status-bar icons on both platforms (FR-009).
- **Header content rule**: header trailing slots accept only the bell; `CartAction` and the Home heart are
  removed from headers (Saved stays reachable from Account and the Home shortcut row per the Home board).
  A guard test fails a header given any other trailing action.
- **Back**: still `LocalNavBack` — the single source for "bar or arrow" is unchanged. Points and Payment
  methods move onto `EffyAppBar` and so gain Back (FR-029).

## D7 — Sheets replace every dialog and menu

- **Decision**: one `EffySheet` (rewritten) is the only overlay: grab handle 48×5, top radius 16, scrim
  from `--scrim`, content scroll, **footer slot pinned** above `navigationBars + ime` insets with 34dp
  bottom padding on iOS-height insets, max height 92% with a full-height mode. Confirmations use an
  `EffyConfirmSheet` (icon, title, body, primary/destructive + ghost cancel). The dirty-discard confirm is
  shown **inside** the same sheet (a second page of the sheet), not a dialog.
- **Inventory to convert**: 13 `AlertDialog`/`DropdownMenu` sites in `StorefrontKit`, `AccountScreens`
  (sign out everywhere), `AddressBookScreen` (delete, set-default-first), `CartScreen` (the unused
  "Empty your cart?" — deleted), `SearchScreen` (sort menu → sort sheet), `SavedListsBar` (new / rename /
  delete list). Inline confirms on the receipt (cancel order) become sheets too, matching the Order board.
- **Guard**: `scripts/mobile-guard.sh` gains `AlertDialog`, `Dialog(`, `DropdownMenu` and
  `ModalBottomSheet` outside `EffySheet.kt` for the customer app (SC-002).
- **Implementation base**: M3 `ModalBottomSheet` (pinned 1.11.0-alpha07) with `dragHandle` replaced and
  the footer laid out outside the scrolling content. Keyboard: `imePadding` on the footer; the sheet uses
  `WindowInsets.ime` so pinned actions stay above the keyboard (FR-014).

## D8 — Motion and transitions

- **Decision**: extend mobile-kit's existing `EffyMotion`/`LocalMotionLevel` (keeps reduce-motion and the
  Android animator-scale handling) with customer motion tokens from the Motion board: press 100ms,
  standard 200ms, emphasised 300ms, sheet 350ms spring, iOS push 350ms with the iOS ease
  `(0.32, 0.72, 0, 1)`, page under-shift −30% with 10% dim.
  ⚠ The token *values* are customer-specific; they are added beside the existing durations, which shop and
  driver keep.
- **Transitions** (Page transitions board):
  - Push / pop: `NavDisplay.transitionSpec` / `popTransitionSpec` / `predictivePopTransitionSpec`, retuned;
    iOS interactive edge swipe via Navigation 3's predictive-back on iOS (CMP 1.11 back gesture handler),
    disabled on Payment (while confirming) and Order confirmed.
  - Tab switch: 150ms cross-fade (the unused `MotionRole.PeerDestination`).
  - Large-title collapse: scroll-linked, no time-based animation.
  - Tile → product: `SharedTransitionLayout` around `NavDisplay`, `sharedElement(key = "product-image-$id")`
    on the tile image and the product gallery's first page; skipped when motion is not Full.
  - Pull to refresh: existing `EffyPullToRefresh`, restyled spinner colour.
- **Micro-animations**: press scale on every tappable (one `Modifier.effyPress()`); "+" → stepper
  (`AnimatedContent` width + fade, 250ms); badge bump (scale 1→1.25→1 spring); number roll on totals
  (`AnimatedContent` vertical slide per digit); skeleton shimmer (kept); heart pop; segmented/indicator
  slide (`animateDpAsState`); list item add/remove (`Modifier.animateItem`); success tick on Order confirmed
  (path-draw 600ms); snackbar slide-up; sticky bar entrance; image fade-in on load (Coil crossfade 200ms).
- **Haptics** (FR-020): `LocalHapticFeedback` (`TextHandleMove`-light / `Confirm` on order placed) — no new
  dependency; iOS maps through CMP's UIKit haptic implementation.
- **Kept** (FR-016): every row of the current-motion table (push/pop, bar hide, button/card press,
  shimmer, pull-to-refresh translation, OTP caret, onboarding indicator, FAQ expand, pagers) — the tasks
  carry a checklist row per item.
- **Reduce motion** (FR-019): every new spec reads `LocalMotionLevel`; `Reduced` → fades ≤150ms, `None` →
  snap. Infinite animations (shimmer, caret) stop.

## D9 — Fat-finger sizing

- **Decision**: one `EffySize` object in the customer kit (target 48, row 60, field 48, primary action 52,
  tab row 58, large-title bar 60, pushed bar 52, gutter 16) and a test that walks the kit's components at
  their minimums. `EffyPrimaryButton` 52dp radius 6, `EffySecondaryButton` 48dp, `EffyField` 48dp/16sp.
  The pill `EffyPrimaryAction` (mobile-kit) stops being used by the customer app.

## D10 — Component replacements (one of each)

- **Decision**: replace raw M3 controls in customer screens with kit components styled from the board:
  `EffySearchField` (light-blue `primaryMuted` fill, 48dp, icon + clear), `EffyTextField` (replaces every
  `OutlinedTextField`), `EffyCheckbox`/`EffyRadio`/`EffySwitch` (M3 with storefront colours via
  `CheckboxDefaults.colors(...)` etc. — keep the accessible M3 behaviour), `EffyChip` (radius 6, not pill),
  `EffySegmented`, `EffyStepper` (Lucide minus/plus, 44dp in-card / 48dp page), `EffyBadge`, `EffySnackbar`
  (one host, bottom, above tab bar / pinned bar), `EffyStatusPill` (replaces `StatusPalette.kt`'s hard-coded
  hexes with storefront roles: paid → brand on brandMuted, in progress → primary on primaryMuted, problem →
  foreground with an icon). `ProductTile` gains the overlay "+" (FR-027) and is the one tile (the ad-hoc
  140dp "More like this" tile is removed).
- **Guard**: `mobile-guard.sh` fails `OutlinedTextField`, `FilterChip`, `ScrollableTabRow`, `Badge(` and a
  `Color(0x…)` literal in customer `features/` (colours come from the theme only — SC-004).

## D11 — No red

- **Decision**: `error` maps to the storefront `destructive` (black). Error text is always paired with a
  Lucide `circle-alert`/`triangle-alert` icon (`EffyInlineError`). The trash buttons become black icons.
  `scripts/check-no-storefront-red.sh` is extended to the customer app's Kotlin and generated theme.

## D12 — Orders list data (FR-034)

- **Decision**: no backend change. The commerce orders list already returns `stage`, `arrivalEstimates`,
  `deliveredAt`, `thumbnails` (+ 086 `thumbnailWidths`) to the web (`packages/shared-types/src/order.ts`,
  `apis/edge-api/commerce/src/orders/service.ts`). The mobile DTO/mapper/`OrderSummary` gain those fields;
  the row shows `STATUS_WORD`-equivalent stage words, arrival through the existing pinned
  `distinctArrivals`/`DeliveryWindowText`/`deliverySummary` twins, and up to four thumbnails (+N).
- **Placed date**: also mapped if present on the DTO (`placedAt`); shown as the meta line on the board.

## D13 — Sub-aisles (FR-035)

- **Decision**: no backend change. `Category.parentKey` is already delivered and unused. Results for an
  aisle with children show a horizontal chip row ("All" + children, ≤ one row scroll); choosing one reloads
  with that `categoryKey`. Since 084 an aisle's results include its sub-aisles server-side, so "All" is the
  parent key.

## D14 — Recent searches (FR-036)

- **Decision**: stored in the existing `DevicePreferences` (settings store) as a JSON list of
  `{text, at}`, max 10, de-duplicated case-insensitively, newest first; written when a search is submitted
  (IME action or a result opened) — not on every keystroke. Cleared on sign-out via `SessionManager`'s
  existing sign-out hook. Not sent anywhere; not in analytics (no PII).

## D15 — Notifications page (FR-037, deferred list)

- **Decision**: keep the route and screen, delete `NotificationFixtures`, render the Notifications board's
  empty state; when push permission is denied show "Turn on notifications" opening system settings
  (platform `openAppSettings` driver). The bell has no unread dot (nothing to count).

## D16 — Google sign-in (FR-033)

- **Finding**: Google federation is **built but PARKED platform-wide** (`infra/envs/dev/auth-customer.tf`,
  operator decision 2026-07-14, `customer_google_enabled = false`); the web shows no Google button either.
- **Decision**: the button is **hidden** on mobile while federation is off, driven by a build-config flag
  `googleSignInEnabled` (default false) — never a button that does nothing. Wiring native Google sign-in
  (hosted UI via Amplify `signInWithSocialWebUI`, app callback scheme on the app client) is out of this
  feature and becomes possible only when the operator un-parks federation.

## D17 — Defects

| Defect | Fix |
|---|---|
| Receipt literal `${…}` (`ReceiptScreen.kt` 209, 253, 565, 711) | real templates; `ReceiptTextTest` renders a receipt and fails on `${` in any string |
| Points / Payment methods no Back | move onto `EffyAppBar` (D6) |
| Help `support@effyshopping.com` | `hello@effyshopping.com`; "Email us" opens `mailto:`; `mobile-guard.sh` fails any `@effyshopping.com` address other than `hello@` in the customer app |
| Cart "arrives in N packages" / "Package N" | removed; lines are one list; a guard fails the words "package"/"packages" in cart and checkout presentation |
| "You'll sign in at checkout" to signed-in users | shown only when `session is Guest` |
| Google stub | hidden (D16) |
| Also (found, in passing): order detail says "Thank you" on every open; receipt lines show a grey box though `imageUrl` exists; payment total uses an undefined type slot | fixed as part of the Order / Payment boards |

## D18 — Copy casing

- **Decision**: sentence case everywhere per the boards ("Your cart is empty", "Check out", "Add to cart",
  "Orders"); pinned delivery wording untouched (FR-025).

## D19 — Onboarding artwork

- **Decision**: the Onboarding board uses flat brand artwork, not hot-linked Unsplash photos and not a
  gradient. Artwork ships as bundled vector/WebP resources in `mobile-assets/`. No network at onboarding.

## D20 — Payment sheet theming

- **Decision**: `gen-stripe-appearance.mjs` gains the same per-target source as D1 and Geist as the Android
  resource font; button radius 6 (not the 28dp pill). iOS appearance set through the Swift bridge with the
  same values (bundled Geist registered in `Info.plist` `UIAppFonts`).

## D21 — Card layouts

- **Decision**: permitted for this surface (Principle V storefront clause): addresses, delivery windows,
  summaries and the payment total are bordered white cards with `shadow-xs` equivalent (1dp hairline +
  0.05 alpha 1dp shadow) exactly as on the boards. Product tiles have no border or shadow.
