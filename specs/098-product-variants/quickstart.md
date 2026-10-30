# Quickstart - 098 Product Variants (validation walk)

## Machine checks (Claude runs)

```bash
pnpm -r typecheck
pnpm --filter @effy/shared-types test          # unit-price fixtures, contract drift
pnpm --filter "./apis/edge-api/*" test         # incl. availability, refreshListing, one-writer guards
CONTAINER_TESTS=1 pnpm --filter @effy/edge-commerce --filter @effy/edge-shared test   # SC-004 against Postgres
pnpm --filter @effy/shop-web --filter @effy/back-office --filter @effy/customer-web test
(cd apps/customer-mobile && ./gradlew :shared:allTests)   # Kotlin unit-price twin, selector VM
scripts/mobile-guard.sh && pnpm --filter @effy/design-system test
```

## Operator steps (the user runs; dev only)

1. `psql "$DSN" -f db/reset/098_purge_catalogue_dev.sql` - read the list it prints, confirm.
2. `make db-up ENV=dev` - 098's migration (refuses if step 1 was skipped).
3. `psql "$DSN" -f db/seeds/084_storefront_catalogue_dev.sql` (aisles) then
   `psql "$DSN" -f db/seeds/098_variant_catalogue_dev.sql` (products with variants).
4. Deploy per plan.md "Deploy order".

## Walk (acceptance)

| # | Do | Expect | Spec |
|---|---|---|---|
| 1 | shop-web: new product, no options, price $2.50 | single form, one variant, no grid | US1-1 |
| 2 | Add option Size: 500 g, 1 kg, 5 kg; basis per 100 g; fill rows; submit | grid of 3; submit refused while a price is empty | US1-2,6 |
| 3 | Add Flavour (Plain, Spiced); keep 3 of 4 combos; try a 3rd option | 3 variants; 3rd option refused | US1-3,4 |
| 4 | back-office review: margin 10% | each variant's resulting price shown, approve → live | US1-7 |
| 5 | customer-web search "rice" | one tile, "From $x", unit price | US2-1, US4 |
| 6 | Open product; 5 kg tracked at 0 | opens on first available; 5 kg shown "Sold out", disabled | US2-3,4 |
| 7 | Switch sizes | price, unit price, image, URL follow | US2-7,8 |
| 8 | Add 2 × 1 kg and 1 × 500 g; pay | two cart lines with labels; order lines keep labels | US2-9,10 |
| 9 | Shop stock screen | only the 1 kg count fell; history names the order | US3-3 |
| 10 | Shop order + pick list + label + driver manifest + receipt + delivery note | "Basmati Rice - 1 kg" everywhere, barcode on pick line | US5 |
| 11 | Search the 500 g barcode | product opens on 500 g | US2-12 |
| 12 | Live product: add 2 kg, change 500 g price; deactivate 5 kg | deactivation immediate; others pending until approved | US6 |
| 13 | Customer app: repeat 5–8 | same variants, labels, prices, unit prices | SC-008 |
| 14 | Heart on product page with Spiced selected; add saved to cart | Spiced added; after removing Spiced → told to choose | FR-015a |
