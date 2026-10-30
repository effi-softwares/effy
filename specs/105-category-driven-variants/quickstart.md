# Quickstart: verify 105

## Local (no AWS)

```bash
pnpm --filter @effy/shared-types test
pnpm --filter @effy/shared-types commerce-contract:check      # regenerated contract committed
pnpm --filter @effy/web-kit test
pnpm --filter @effy/shop-web test && pnpm --filter @effy/back-office test
pnpm --filter @effy/edge-shared test                          # container tests need Docker (see cleanup memory)
pnpm --filter catalog test && pnpm --filter storefront test && pnpm --filter shop test
rg -n "pack_size|PACK_SIZE_OPTION_NAME|clothing_size" apps packages apis --glob '!**/node_modules/**'   # only the migration
```

Expected: all green; the `rg` finds nothing outside `db/migrations/`.

## Operator, in order

1. `AWS_PROFILE=ef make db-up-one ENV=dev` — `20261030090000_category_driven_variants.sql`.
   It prints nothing on success; a NOTICE lists products kept as one variant (they had orders).
2. Deploy `SERVICE=shop`, `SERVICE=catalog`, `SERVICE=storefront`, `SERVICE=commerce` (reads `variantLabelSql`, unchanged
   SQL but redeployed with the shared library), then shop-web, back-office, customer-web.

## Walk

1. Back-office › Categories & attributes: no "Size" (XXS–4XL) in the library; Women's clothing's form has no Size.
2. Shop console › New product in a category offering Flavour: Variants & prices › With variants › Add an option lists
   Flavour only (with three of its values). Add Strawberry and Vanilla; each variant's details show Net quantity.
   Enter 500 g and 1 kg, choose "Per 100 g": each row shows its own unit price.
3. A category with no option attributes: "With variants" is disabled and says so.
4. Submit; approve in back-office review: the option summary reads "Flavour: Strawberry, Vanilla"; a "Net quantity" row
   shows each variant's quantity.
5. Storefront / customer-web product page: choose by Flavour; unit price beside each price.
6. Import a CSV naming "Pack size" as Option 1 name: the row is refused naming the column.
7. An order placed before the change for a Pack-size product still shows its variant name (e.g. "— 500 g").
