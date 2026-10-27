# Quickstart: Back-Office Product Catalogue (102)

How to prove 102 works. Contracts: [contracts/api.md](contracts/api.md). Data:
[data-model.md](data-model.md).

## Operator steps (the user runs these — Claude does not)

1. Terraform (`infra/envs/dev`): the `product-import` SQS queue + DLQ + alarm, the `imports/` lifecycle
   rule on the media bucket, the worker's IAM. `make plan ENV=dev` then `make apply ENV=dev`.
2. Migration: `make db-up ENV=dev` (commit it first — `db-up` refuses an uncommitted migration) (`20261027090000_backoffice_product_catalogue.sql`).
3. Deploy, in this order (the shop must refuse held products before back-office can hold them; the catalog stack
   reads the new queue's SSM parameters, so Terraform first): `SERVICE=shop`, `SERVICE=notifications`,
   `SERVICE=catalog`, then back-office and shop-web.

## Local checks (Claude runs these)


```bash
# container suites need Docker and CONTAINER_TESTS=1 (DOCKER_CONFIG=<empty dir> if the desktop credential helper hangs)
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shared test   # authoring.ts, setVariantState 'held', safe-fetch, guards
CONTAINER_TESTS=1 pnpm --filter @effy/edge-catalog test  # list SQL (+50k perf), holds, bulk, Effy create, import check/create
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test     # held / effy_setup refusals, REVIEW_STATE_SQL
pnpm --filter @effy/edge-notifications test
pnpm --filter @effy/shared-types test
pnpm --filter @effy/back-office test && pnpm --filter @effy/shop-web test && pnpm --filter @effy/web-kit test
pnpm turbo typecheck lint
# capacity: the staff gateway must stay under 75 %
(cd apis/edge-api/shared && npx vitest run src/lib/gateway-capacity.contract.test.ts)
```

## Walk (dev)

| # | Do | Expect |
|---|---|---|
| 1 | Back-office › Catalogue › Products | Every product of every shop; tab counts add up to All |
| 2 | Search a size's SKU, then a barcode | The one product, once |
| 3 | Choose a department in the aisle filter | Products in every aisle under it |
| 4 | Copy the URL with filters to a new tab | Same view |
| 5 | Sign in as csa; open a product | Everything visible, no action offered |
| 6 | Hold an on-sale product with a reason | Gone from customer-web search, aisle and its link within 1 min; shop-web shows "Held by Effy" + reason; shop push received |
| 7 | In shop-web try to put it on sale, and a size on sale | Refused with one sentence |
| 8 | Release it | On sale again; shop told |
| 9 | Select 5 products from 2 shops › Set margin | 5 changed; each History shows it; each shop gets nothing (margin is Effy's) |
| 10 | New product for a shop, without a picture | Saved as Draft (Effy setting up); shop-web shows it read-only "Effy is setting this up" |
| 11 | Add its main picture | On sale at once; shop told "added by Effy"; content now the shop's (an edit in shop-web becomes a pending change) |
| 12 | Imports › download template for two leaves; fill 50 rows, 5 wrong (bad aisle, missing required detail, duplicate SKU, bad price, dead picture link) | After checking: 45 ready, the 5 each naming the problem; nothing created |
| 13 | Create | 45 products for the shop, each "Imported" with a link to the import; ones without picture links stay Draft until pictured |
| 14 | Upload the same file again | Warned it was imported before; every row not ready (SKU exists); nothing created |
