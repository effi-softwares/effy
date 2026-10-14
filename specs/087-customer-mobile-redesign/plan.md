# Implementation Plan: Customer Mobile Redesign

**Branch**: `087-customer-mobile-redesign` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/087-customer-mobile-redesign/spec.md`

**Design**: Claude Design canvas https://claude.ai/artifact/WSJRR99YaDrAU6LJaChbQv (40 boards) on the Effy
design system https://claude.ai/artifact/2XxzgKFopY2b9ot1fyjuRD. Local copy of the boards:
the session scratchpad `mobile/project/*.dc.html` (to be copied into `docs/reference-screens/Effy Customer Mobile/` by T001).

## Summary

Move `apps/customer-mobile` from the console identity to the **storefront identity** (constitution v3.3.0,
Principle V) and rebuild every screen to its board: borderless iOS-style headers (large title on tab
roots, "‹ Back" + centred title on pushed pages), a roomy **five-tab bar with Cart as a tab**, **bottom
sheets for every overlay** with pinned actions, iOS push/pop with edge swipe, shared-element tile→product,
and the micro-animations on the Motion board — keeping every existing animation and every pinned word.

The approach is **shell first**: (1) the theme pipeline generates a light-only customer theme from
`storefront/tokens.css` with Geist and Lucide; (2) a customer UI kit replaces raw Material controls; (3) the
frame (tab bar, headers, sheets, motion) lands; then (4) screens are restyled board by board, each a
self-contained slice. **No backend, migration, Terraform or deploy step**: the orders-list fields and
sub-aisles are already served (research D12, D13); recent searches are device-only; the notifications
list is deferred; Google sign-in stays hidden while federation is parked (D16).

## Technical Context

**Language/Version**: Kotlin 2.4.0, Compose Multiplatform 1.11.1, material3 1.11.0-alpha07 (the pinned
trio — unchanged, and unchanged in shop/driver); Node 22 for the design-system generators; Swift for the
iOS payment/auth bridges.

**Primary Dependencies**: Navigation 3 1.1.1 (per-tab `NavBackStack`, `NavDisplay` transition specs,
predictive back), Compose `SharedTransitionLayout`, Coil 3.1.0 (crossfade), Stripe Android 23.17.0 + iOS
bridge (appearance only), Amplify (unchanged). **No new libraries.** Assets: Geist static TTFs (OFL) and
Lucide icons (ISC) as committed resources.

**Storage**: device preferences only (recent searches, D14). No server storage change.

**Testing**: `:shared:allTests` (commonTest — kit sizing, nav, recent searches, receipt text, wording
twins), design-system node guards (`tokens:check`, `mobile-assets:check`, `test`), `make cm-guard`
(`scripts/mobile-guard.sh`, extended), `scripts/check-no-storefront-red.sh` (extended to Kotlin),
`@effy/shared-types` tests (pinned wording twins), operator device walk (quickstart).

**Target Platform**: iOS 16+ (reference design) and Android minSdk 24 / target 36. Phones are the design
target; ≥600dp keeps the rail and is not redesigned.

**Project Type**: mobile app (KMP + Compose) + shared design-system package.

**Performance Goals**: transitions and scrolling at the display rate with no visible stutter on a
three-year-old phone (SC-005); first content of Home no slower than today; no font or icon network fetch.

**Constraints**: storefront identity only (no red, no dark, no gradients, green never an action); touch
targets ≥48dp; pinned delivery wording unchanged byte-for-byte; mobile-kit changes must not alter shop or
driver; generated files never hand-edited; no refresh timers; no new route without the nav guards.

**Scale/Scope**: 36 routes / ~30 screens across 17 feature folders, ~25 kit components, 13 dialog/menu
sites to convert, 3 navigation tests to update, 6 defects, 3 data additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

| Principle | Check | Result |
|---|---|---|
| I/II Single source, codegen | Theme, type, shapes generated from `storefront/tokens.css` by the existing generator (per-target source); no app-local palette; `tokens:check` guards drift (D1–D3) | ✅ |
| III One serverless backend | No backend change at all | ✅ |
| V Storefront identity | Customer mobile adopts the storefront identity the constitution reserves for it ("the customer mobile app when a later feature moves it"): five values, no red, **light only**, cards permitted, Geist bundled | ✅ |
| V Dark mode | Required for the **console identity**; the storefront identity is light only — the customer app leaves the console identity in this feature, so no amendment. ⚠ The Sync Impact "Follow-up TODO (084 D14)" is closed by this feature (T-docs) | ✅ |
| V Native feel, fat-finger, micro-animations | iOS-first per HIG (large titles, edge swipe, sheets), Android system back; 48dp minimum; motion tokens + reduce-motion (D8, D9) | ✅ |
| V No gradients / flat fills | Onboarding gradient and banner dark scrim are **removed** (D19; banner text sits on a flat panel per Main board) | ✅ |
| V Shadows on floating layers only | Sheets, pinned bars, snackbars; storefront cards carry the hairline `shadow-xs` (permitted by the storefront clause) | ✅ |
| VI Layered architecture, explicit wiring | Recent searches: repository → use-cases → ViewModel, wired in `AppContainer`; no DI framework | ✅ |
| VII Observability | Screen-view events keep names; Cart tab adds `screen_view{cart}` via the existing taxonomy; recents never in analytics | ✅ |
| Hidden fulfilment | Cart/checkout lose the package count (FR-031); guard added | ✅ |
| Approved addresses | Help uses `hello@effyshopping.com`; guard fails any other `@effyshopping.com` in the app | ✅ |
| No polling | Live updates unchanged; `check-no-refresh-timers.sh` stays green | ✅ |
| Pinned trio | Unchanged in all three apps | ✅ |

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/087-customer-mobile-redesign/
├── spec.md
├── plan.md                         # this file
├── research.md                     # D1–D21
├── data-model.md                   # RecentSearch, OrderSummary additions, tabs
├── quickstart.md                   # checks + device walk
├── contracts/
│   ├── ui-kit.md                   # the customer kit, per board
│   └── navigation-and-motion.md    # tabs, routes, transitions, micro-animations
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
packages/design-system/
├── src/storefront/tokens.css              # + --radius-sheet (D2); otherwise unchanged
├── scripts/gen-compose-theme.mjs          # per-target source; rgba; storefront roles; light-only customer
├── scripts/check-compose-theme.mjs        # regenerate per source; customer has no dark scheme
├── scripts/gen-stripe-appearance.mjs      # per-target source; Geist; radius 6
├── scripts/sync-mobile-assets.mjs         # per-app font/icon lists (customer: Geist + Lucide)
├── mobile-assets/font/                    # + geist_{regular,medium,semibold,bold}.ttf, geist_mono_medium.ttf, OFL
├── mobile-assets/drawable/                # + lucide_*.xml, effy_wordmark.xml, onboarding art
├── compose/                               # GENERATED customer theme (EffyTokens, EffyTypography, EffyStorefrontShape)
└── compose-payment-android/               # GENERATED Stripe appearance

packages/mobile-kit/common/ui/Motion.kt    # + customer motion tokens beside existing ones (additive only)

apps/customer-mobile/
├── shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
│   ├── app/{App,CustomerShell}.kt         # 5 tabs, EffyTabBar, SharedTransitionLayout, transitions, edge-to-edge
│   ├── core/nav/                          # CustomerTab + Cart, reselect → root, swipe-back rules
│   ├── core/theme/EffyTheme.kt            # light only; AppearanceMode deleted
│   ├── core/presentation/                 # the kit: Frame, Sheets, Controls, ProductTile, States, Motion, Size
│   ├── core/storage/DevicePreferences.kt  # recent_searches key
│   └── features/<17 folders>/presentation # screens restyled per board
│       features/catalog/data|domain       # RecentSearchRepository + use-cases
│       features/checkout/data|domain      # OrderSummary mapping (+ stage, arrivals, thumbnails)
├── shared/src/commonTest/…                # updated nav tests + new kit/recents/receipt/guard tests
├── shared/src/androidMain/res/font/       # synced Geist for Stripe
└── iosApp/iosApp/{Info.plist,SwiftPaymentElementBridge.swift}  # UIAppFonts Geist; appearance

scripts/mobile-guard.sh                    # + no dialogs/menus, no Color literals in features, approved address, no package count
scripts/check-no-storefront-red.sh         # + customer-mobile Kotlin and generated theme
docs/reference-screens/Effy Customer Mobile/  # the canvas boards, committed for reference
```

**Structure Decision**: Everything customer-specific lives in the customer app and in the customer
targets of the design-system generators. mobile-kit receives **additive** changes only (motion tokens),
because it is compiled into the shop and driver apps; the tab bar is a customer composable passed into
the shared `ResponsiveNavigation`.

## Delivery order (each phase leaves the app shippable)

1. **Pipeline** — generator per-target source, storefront theme (light), Geist, Lucide, Stripe appearance;
   `EffyTheme` light-only. The app already reads as the new colours/type with old layouts.
2. **Kit** — controls, rows, fields, chips, stepper, pills, states, `ProductTile` with "+" (contracts/ui-kit.md).
3. **Frame** — five tabs + `EffyTabBar` + badge; `EffyLargeTitleBar` / `EffyAppBar`; edge-to-edge; header
   actions removed; `EffySheet`/`EffyConfirmSheet`; every dialog and menu converted; transitions and
   shared element; reselect → root. (US1, US2.)
4. **Screens by board group** — Discover & shop → Cart, checkout & orders → Account → Sign in, help &
   legal → Onboarding & states. Each group closes its defects (US4) and data (US5) where they live:
   cart package count and guest message (Cart), receipt text and image (Order), Back (Points, Payment
   methods), address (Help), Google hidden (Auth), recents and sub-aisles (Search/Results), orders data
   (Orders), notifications empty state (Notifications).
5. **Guards, docs, walk** — guard extensions, CLAUDE.md / constitution follow-up note / FEATURE-HISTORY,
   quickstart walk by the operator.

## Risks

| Risk | Mitigation |
|---|---|
| Changing the generator breaks shop/driver themes | per-target source with shop/driver unchanged; `tokens:check` regenerates all three and diffs; build both apps in CI step of quickstart |
| mobile-kit change restyles shop/driver | additive-only rule; tab bar and kit are customer-local |
| iOS edge-swipe / predictive back immature on CMP 1.11 | fall back to Navigation 3's back handler with a custom swipe detector on the leftmost 20dp; tracked as its own task with a device check |
| Shared element + Navigation 3 interplay | gated behind `LocalMotionLevel == Full`; failure mode is a plain push |
| M3 `ModalBottomSheet` pinned footer + IME on iOS | footer outside scroll with `imePadding`; device test on iPhone SE with keyboard |
| Pinned wording accidentally restyled into new words | words come only from the existing twins; `@effy/shared-types` tests run in quickstart |
| Font licence | Geist and Lucide licences committed beside the files |
| Scope size (~30 screens) | board-group phases, each independently shippable; no backend coupling |

## Complexity Tracking

None — no constitution violations.
