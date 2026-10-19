# Quickstart: validating Promotions Rebuilt (094)

## Before

- Dev database migrated through the 094 migration (`AWS_PROFILE=ef make db-status ENV=dev`).
- `admin`, `storefront`, `commerce`, `orders`, `shop`, `notifications` deployed in the order in
  [plan.md](plan.md#deploy-order); back-office and customer-web built from this branch; the customer app
  built from this branch.
- A manager account in back-office; two customer accounts (one with a past paid order, one new).

## Automated

```
pnpm --filter @effy/edge-shared test          # engine: R3/R4 fixtures, rounding, allocation, guards
pnpm --filter @effy/edge-admin test            # writes, immutability, state, groups, audit
pnpm --filter @effy/edge-commerce test         # cart + intent (409 promotions_changed), holds
pnpm --filter @effy/edge-storefront test       # group reads, offers on products, home compatibility
make bo-test && make cw-test                  # back-office and customer-web
(cd apps/customer-mobile && ./gradlew :shared:allTests)
```

Container tests (Docker): `promotion_state`, concurrent holds against `max_uses` and `budget`,
single-use code under two simultaneous intents, refund of a discounted line, cancellation releasing uses.

## Walk (both clients, then back-office)

1. **Carry-over** — before deploying, note a live code and a past order using it. After: the code applies
   with the same discount; the past order's receipt is unchanged (SC-002). Home shows the same banners.
2. **Cart code** — US1 scenarios 1–3.
3. **Automatic** — US1 scenario 2; the discount appears with no code and leaves with a sentence.
4. **Groups** — US2: create a promotion, add it to `home-hero` (1st) and `offers` (3rd); check both
   places on web and app; pause it; within a minute it is gone from both.
5. **Item / BXGY / delivery** — US3–US5 scenarios; the product card shows the offer label.
6. **Targeting and limits** — US6; first-order promotion visible only to the new customer; budget stops it.
7. **Combining** — US8.
8. **Single-use batch** — US7: generate 5, use 1, export, the CSV marks it used.
9. **Performance** — US9 after steps 2–7.
10. **Money** — the cart total = the intent's charge = the receipt (SC-003); refund one discounted line
    and check the amount equals what was paid for it; cancel an order and check the use is released.
11. **Shops** — open the order in shop-web: no promotion name or code anywhere (SC-008).
