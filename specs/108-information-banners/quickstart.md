# Quickstart: Information Banners (108)

## Prerequisites

- Migration `20261106090000_information_banners.sql` applied (`make db-up ENV=dev`).
- `admin-promotions`, `storefront` and `commerce` deployed. Back-office and customer-web deployed.
- The delivery seed applied (`make seed-delivery ENV=dev`), so a free-delivery amount exists.
- The catalogue seed applied (`make seed-catalogue ENV=dev`), for aisle targets.

## Seed

```bash
AWS_PROFILE=ef make seed-banners ENV=dev
```

Expect 15 rows printed (11 banners, some in several groups), with each one's group, position and skin. Run it again
and the same 15 print.

## Walk

1. **Website Home** (signed out): the hero shows "Groceries to home appliances, from one place" and "Delivered by
   Effy, when it suits you". The side cards show "Free delivery over $150" and "Fresh from Melbourne shops,
   every day". There's no code and no conditions line. Each tap goes to its target.
2. **Cart and checkout**: add any product and open the cart. No banner is listed as an offer, and the totals have no
   discount line. Place an order (test card). The receipt names no promotion.
3. **Live value**: in back-office › Settings › Pricing, activate "Christmas peak 2026" (free from $200). Reload
   website Home. The free-delivery banner reads $200.
4. **Hidden reason**: in back-office › Promotions › Display groups › Home side cards › Preview, with a plan that has
   no free amount, the banner is listed as hidden, "A live value has nothing to show".
5. **Create**: in Promotions, choose New information banner. Enter a headline, insert "Order minimum" (see what it reads
   now), set Where a tap leads to an aisle, place it in Between Home sections, and publish. Website Home shows it
   between sections.
6. **Refusals**: `PATCH` an offer with `kind: "banner"`, which gives 409 `kind_fixed`. `POST` a banner with
   `percentOff`, which gives 422 naming `percentOff`.
7. **App**: open Home on the customer app and see the same four banners. A tap opens its target.

## Tests

```bash
pnpm --filter @effy/edge-shared test        # live values, terms, guard, container: checkout with banners present
pnpm --filter @effy/edge-admin test         # parseWrite banner rules, live-values route
pnpm --filter @effy/back-office test        # tours word-for-word (52), editor body, list filter
pnpm --filter @effy/customer-web test       # toGroupBanner for a banner
pnpm --filter @effy/shared-types commerce-contract:check
```
