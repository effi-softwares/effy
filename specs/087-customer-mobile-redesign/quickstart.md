# Quickstart: validating 087 (Customer Mobile Redesign)

## Prerequisites

- Dev backend as it is today (no deploy, migration or Terraform step in this feature).
- Xcode + an iPhone simulator (iPhone 16 and iPhone SE 3rd gen); an Android emulator (API 34, Pixel 8).
- A dev customer account with: a default address Effy delivers to, one courier-only address, orders at
  several stages (one delivered, one in progress, one refunded), some points, a saved card.

## Automated checks (Claude runs these)

```sh
pnpm --filter @effy/design-system tokens:gen      # regenerate customer theme from storefront/tokens.css
pnpm --filter @effy/design-system tokens:check    # no drift; customer output light-only
pnpm --filter @effy/design-system mobile-assets:check
pnpm --filter @effy/design-system test
make cm-guard                                     # mobile-guard.sh incl. new dialog / colour / address rules
scripts/check-no-storefront-red.sh
scripts/check-no-refresh-timers.sh
cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug
pnpm --filter @effy/shared-types test             # pinned delivery wording twins unchanged (SC-008)
```

Expected: all green; shop-mobile and driver-mobile still build unchanged (`./gradlew assembleDebug` in each).

## Walk (operator, on iPhone and Android) — per spec success criteria

1. **Frame (US1)**: launch → Home shows "effy." wordmark, bell, light-blue search, no dark band, no header
   line; five tabs; add an item → Cart badge bumps; open a product → page slides in, tab bar hidden, "‹ Back";
   edge-swipe back on iOS; re-tap Home tab from a pushed page → root.
2. **Sheets (US2)**: Security → Sign out on all devices → a bottom sheet with pinned buttons; Address book →
   delete; Saved → new/rename/delete list; Search → Sort and Filters; Address sheet with keyboard open →
   pinned Save stays visible. No centred dialog anywhere (SC-002).
3. **Motion (US2)**: tile "+" → stepper + haptic; scroll Home → title collapses; pull to refresh Orders;
   tile → product shared image; turn on Reduce Motion → fades only, shimmer static.
4. **Screens (US3)**: open each board's screen beside the canvas (Discover, Cart/checkout/orders, Account,
   Sign in/help/legal) at iPhone SE and Pro Max widths; Settings → Larger Text max → nothing clipped.
5. **Checkout wording**: Effy address → "Same-day delivery"/"Standard delivery" words as today; courier
   address → estimate wording as today; out-of-area → the one refusal sentence.
6. **Defects (US4)**: receipt shows real order number, promo code, card ending; Points and Payment methods
   have Back; Help shows hello@effyshopping.com; multi-supplier cart shows no package count; signed-in cart
   has no "sign in at checkout"; no Google button.
7. **Data (US5)**: Orders rows show stage, arrival, thumbnails; an aisle with sub-aisles shows the chip row;
   search three times → recents on Search tab, clear them, sign out → gone; bell → honest empty state.

Record the walk in `FEATURE-HISTORY.md` under 087.
