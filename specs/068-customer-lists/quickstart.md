# Quickstart: validating 068

Contract: [contracts/customer-lists.md](contracts/customer-lists.md) · Data:
[data-model.md](data-model.md)

## Prerequisites

- Docker running, for the container tests.
- A dev customer with at least three saved items recorded **before** the migration, one of them
  showing a price drop.
- A second dev customer, for the isolation checks.
- At least one product that is `unavailable` and one that is `archived`.

## Baseline (T001, measured 2026-10-04 before any change)

| Check | Before | After |
|---|---|---|
| `pnpm -r typecheck` reporting packages | 21 | 21 |
| `@effy/shared-types` tests | 34 | 34 |
| `@effy/customer-web` tests | 489 (58 files) | 536 (62 files) |
| `go test -short ./...` non-ok packages | 0 | 0 |
| `go test ./internal/features/saveditems/` (containers) | ⚠ **RED at HEAD**: `relation "public.delivery_pricing_rule" does not exist` — the test seed still inserted into a table delivery-zone withdrawal removed | green, 95 tests, against the real 068 migration |
| customer-mobile `:shared:testAndroidHostTest` | 331 | 352; iOS simulator test target compiles |
| customer-web `size` `/` | 173.7 KB | 173.8 KB |
| customer-web `size` `/search` | 173.7 KB | 173.4 KB (not byte-identical: chunks regrouped; research R7) |
| customer-web `size` `/product/[id]` | 171.3 KB | 171.4 KB |
| `cm-contract-check` | green | regenerates byte-stable; ⚠ reads red until the regenerated files are committed |
| `@effy/design-system` guards | — | green (364 files) |

⚠ **Headroom on `/` is 0.3 KB, not the 2.1–5.5 KB `bundle-budget.mjs` records and the plan
assumed.** `SaveControl` is on `/`. Everything the heart gains must fit in that.

## 1. Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types test
make cm-contract-check
(cd apis/core-api && go test ./internal/features/saveditems/... ./internal/features/cart/... ./internal/platform/availability/...)
pnpm --filter @effy/customer-web test && pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64)
make cm-guard
```

The container tests in `saveditems` must cover, against the real migrations:

| Proof | Requirement |
|---|---|
| backfill: every pre-existing saved item is in the default list, same order, same price | FR-035, SC-006 |
| zero orphans after each of: save, un-save, add, remove, delete list, merge | data-model invariant |
| heart un-save of a product in a named list removes nothing | FR-020, SC-008 |
| deleting a list leaves every other list's entries | FR-005, SC-007 |
| duplicate name (different case), 41 characters, 21st list: each refused, posted straight at the route | FR-009, SC-009 |
| two concurrent creates with one name: one list | spec edge case |
| customer B cannot read, rename, delete or add to customer A's list | FR-008, SC-010 |
| adding an already-saved product at the 200 cap succeeds; a new one is refused | FR-033, FR-034 |
| add-all from one list adds nothing from another | FR-028 |
| the same product in two lists reports one `savedPriceAmount` | FR-031 |

## 2. Deploy (operator; order matters)

```sh
make db-up ENV=dev
make core-image-push ENV=dev && make core-deploy ENV=dev   # BEFORE pushing customer-web
```

Then repair the window between those two steps (research R10). Idempotent; safe to run twice:

```sql
INSERT INTO public.customer_list (customer_id, is_default)
SELECT DISTINCT s.customer_id, true FROM public.customer_saved_item s
ON CONFLICT DO NOTHING;

INSERT INTO public.customer_list_entry (list_id, product_id, customer_id, added_at)
SELECT l.id, s.product_id, s.customer_id, s.saved_at
FROM public.customer_saved_item s
JOIN public.customer_list l ON l.customer_id = s.customer_id AND l.is_default
WHERE NOT EXISTS (SELECT 1 FROM public.customer_list_entry e
                  WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id);
```

Must return 0 before customer-web is pushed:

```sql
SELECT count(*) FROM public.customer_saved_item s
WHERE NOT EXISTS (SELECT 1 FROM public.customer_list_entry e
                  WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id);
```

Then push customer-web (042 deploys it), and build the mobile app.

## 3. Walks (web, then repeat on Android and iOS)

**A. Nothing was lost (US3)**
1. Sign in as the customer with pre-existing saved items. Open Saved items.
2. Every item is there, in the same order; the price-drop item still shows its drop.
3. The lists row shows "Saved" with the right count and nothing else.

**B. Make a list and fill it (US1)**
1. On a product page, tap an empty heart. It fills at once; the confirmation offers "Add to a
   list".
2. Use it. Choose "New list", name it `Weekly Items`. The product is in both lists.
3. On four more products, open "Add to list" on the product page and tick `Weekly Items` only.
   Each heart is filled on the home rails afterwards.
4. Open `Weekly Items`: five rows, newest first, each with price, verdict, add to cart, remove.
5. Try to create `weekly items`. Refused: name taken. Try `Saved`. Refused.

**C. The weekly shop (US2)**
1. Add an `unavailable` product to `Weekly Items`.
2. "Add all to cart". Five are added; the sixth is named with its reason.
3. The list still has six rows; five say they are in the cart, with a count.
4. Open "Saved" and confirm nothing from it was added.

**D. The heart never destroys (US3)**
1. On a tile for a product that is only in `Weekly Items`, tap the filled heart. The chooser
   opens; the list is unchanged.
2. On a tile for a product only in "Saved", tap the filled heart. It un-saves.
3. **Old build**: with the previous mobile build still installed, tap the filled heart of a
   product in `Weekly Items`. It flips back to filled; the list is unchanged.

**E. Tidy (US4)**
1. Rename `Weekly Items` to `Weekly Shop`. Contents and order unchanged.
2. Remove a product that is also in "Saved". Its heart stays filled. Undo: it returns to its place.
3. Delete `Weekly Shop`. The confirmation states how many products it holds and how many will
   stop being saved. Confirm. Those in "Saved" are still there; the others' hearts are empty.
4. "Saved" offers neither rename nor delete.

**F. Guest (US5)**
1. Signed out, tap a heart: saved, no prompt. Use "Add to a list": told lists need an account,
   offered sign-in; the heart is still filled.
2. Sign in to the account with named lists. The device's saves are in "Saved", the count is
   disclosed, the named lists are unchanged.

**G. Two devices**
1. Delete a list on web while the phone's chooser is open on it; tick it on the phone. Refused and
   explained; the product is in no new list.

## 4. Sweeps

- **Names in logs (SC-011)**: create a list named `zz-sentinel-068`, walk B to E, then search the
  core-api log group for the string. Zero hits.
- **Bundle (SC-012)**: `pnpm --filter @effy/customer-web size` — every route within budget; the
  measured values are in the baseline table. `/` has 0.2 KB left.
- **Wording**: `git grep -i wishlist -- apps/customer-web apps/customer-mobile` returns nothing
  shopper-facing.
- **Cart set-aside untouched**: `git diff --stat` shows no change under
  `apis/core-api/internal/features/cart/` beyond tests, and none to `cart_saved_item`.
