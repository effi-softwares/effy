# Quickstart: Category-Driven Catalogue (101)

How to prove the feature works in dev. Shapes are in [contracts/api.md](contracts/api.md) and tables
in [data-model.md](data-model.md).

## Prerequisites (operator)

1. Commit the change.
2. `terraform apply` for `infra/envs/dev`. This adds the `categories/` public media prefix (R13).
3. `make purge-orders ENV=dev`, then
   `psql "$(infra/scripts/db-dsn.sh dev)" -f db/reset/101_purge_catalogue_dev.sql`.
4. `make db-up ENV=dev`. This applies `<ts>_category_catalogue.sql` (it refuses if any product is left)
   and `<ts>_catalogue_taxonomy.sql`.
5. Deploy, in this order:
   - `make edge-deploy SERVICE=admin` (removes the catalogue routes), then `catalog`, `shop`,
     `storefront`, `commerce`, `fleet`, `orders`, `driver`, `notifications`, `admin-promotions`;
   - then shop-web, back-office and customer-web;
   - then the customer app build.
6. `psql … -f db/reset/101_minimal_catalogue_dev.sql` (needs an active shop). It replaces the seeded tree with
   Dairy & Eggs › Milk, two attributes (Country of origin, Organic) and one product.

## Automated checks

```sh
pnpm --filter @effy/shared-types test   # suggest, units, product-form, icons/age fixtures
pnpm --filter @effy/edge-shared test    # writers, guards (category-derived, product_type gone, storage column), gateway capacity
make edge-test                          # per-service unit + container tests (Docker; DOCKER_CONFIG=<empty dir>)
make shop-test bo-test cw-test
make cm-contract-check cm-guard         # customer app contract + guards; KMP host tests via Gradle
```

Container tests that must pass:
- `catalogue-taxonomy.container.test.ts`: seed invariants (R16).
- `rebuild-category-derived.container.test.ts`: inheritance, tighten, hide, re-attach, defaults.
- `taxonomy-writer.container.test.ts`: depth, cycle, leaf-with-products and in-use refusals.
- `product-details.container.test.ts`: per-variant values, base units, the exclusion rule.
- `facets.container.test.ts`: AND across attributes, ranges, hidden attributes ignored, placements
  counted once.

## Walk (record outcomes in FEATURE-HISTORY)

1. **Tree (US1).** In back-office, open Categories:
   - add a 5th-level category, then try a 6th: refused;
   - drag a leaf to another department;
   - add a child to a leaf that has products: asked where they move;
   - retire a category in use: refused with a count.
2. **Library and attachments (US2).**
   - Create "Screen size" (number, length, cm), filterable, and attach it Recommended on
     Electronics › TV & Home Theatre.
   - On Fruit & Vegetables › Fresh Fruit, hide Allergens (inherited from the department). Preview a leaf there and one in Pantry, and confirm
     each field's level and source.
   - Try loosening Allergens to Optional on a Pantry sub-category: refused. Try retiring a category that still has sub-categories: refused.
3. **Shop listing (US3, US4).** In shop-web, Add product:
   - type "Greek yoghurt 1kg" and pick the suggested leaf;
   - confirm Storage = Chilled and GST = GST-free arrive pre-set;
   - leave Allergens empty and submit: refused;
   - fill it in and submit;
   - repeat for "USB-C charger" (Electronics) and "Dry dog food" (Pet);
   - change a draft's category and confirm the drop warning;
   - confirm no expiry/packed/batch fields anywhere.
4. **Review (US8).** In back-office review, confirm the category path, any fact overrides, and
   empty recommended details at the top. Approve. Place a product in a second leaf and confirm it
   shows in both aisles and its breadcrumb is its home.
5. **Storefront (US5).** On web and in the app:
   - Dog Food shows dog filters only;
   - Chargers shows connector and power;
   - picking two values of one filter widens the results, while picking values in two filters narrows
     them;
   - a range filter works across g/kg entries;
   - an 18+ product shows "18+" on the tile, page, cart and checkout.
6. **Per-variant (US6, US7).**
   - List a yoghurt with Flavour options (from the library) whose Allergens differ per variant;
   - switching flavour on the product page switches allergens;
   - the "no milk" filter finds it and opens on the matching flavour;
   - a Pack size option shows "500 g / 1 kg" from the packs entered.
7. **Cold chain.** Order a frozen product and confirm the packing, hub and driver screens treat it as
   frozen (`order_item.storage_class = frozen`).
8. **Live taxonomy (SC-006).** With shop-web open on Add product, staff attach a new attribute to that
   leaf. The shop's Details step shows it within a minute, without a reload.
9. **Category coverage (SC-007).** Pick 100 everyday products across all departments (a weekly shop
   to a phone charger) and type each name into the picker. Record how many have an obvious leaf and
   how many get it as the top suggestion.
10. **Missing details (FR-016).** Attach a new Required attribute to a category with live products.
   They stay on sale and appear in the shop's "Missing details" filter and in the back-office list.
