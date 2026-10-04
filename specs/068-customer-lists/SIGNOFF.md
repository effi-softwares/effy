# Sign-off — 068 Customer Lists

**Date**: 2026-10-04 · **Status**: 🚧 **58/61 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.** Open: the deploy (T060), the walks (T061), and part of the
accessibility pass (T054: the end-to-end a11y suite was not extended, and no screen reader has been
run).

Client feedback R3. ⚠ Built on an unconfirmed reading of the request: lists a customer names for
themselves, not product categories.

## What this slice changed that was not true before

**A shopper can keep more than one list.** They name a list ("Weekly Items"), put saved products in
any number of lists, and add everything purchasable in one list to the cart in one action. The
saved list they already had is now the default list, "Saved", with everything that was in it.

Also now true, and not before:

- **A tap on a heart cannot take a product out of a list the shopper built.** The platform refuses
  that un-save, so the rule holds for mobile builds already on phones.
- **A product has one remembered price, whatever lists it is in.** Two lists cannot show two
  different "was" prices.
- **033 FR-066 ("exactly one saved list per shopper") is retired.**
- **On web, a removal can be undone and a row says when it is already in the cart.** 033 required
  both; only mobile had them.

## Built

| Layer | What |
|---|---|
| Migration | `20261004090557_customer_lists.sql` — `customer_list`, `customer_list_entry`, an idempotent backfill. No column change to `customer_saved_item`; its comments state its new meaning |
| `shared-types` | list DTOs, `LIST_LIMIT`, `LIST_NAME_MAX`, `DEFAULT_LIST_ID`, `SavedListRefusal`, `namedProductIds` on the membership; Kotlin contract regenerated |
| `api-client` | `DomainError.type` (the problem's `type`), additive |
| `core-api` | `saveditems`: 8 new `/v1/lists` routes; `/v1/saved/*` kept as "the default list"; the un-save refusal; one list query for every list |
| `customer-web` | heart branch with the chooser loaded on demand; `ListChooser`; "Add to list" on the product page; lists as tabs; `/saved/[listId]`; per-list add-all, remove, undo; 5 proxy routes; 3 telemetry events |
| `customer-mobile` | `ToggleOutcome`; named set in `SavedStore`; `ListRepository` + six use cases; chooser sheet; lists bar, name and delete dialogs on the saved screen; "Add to list" on the product page |

## Verified

| Check | Result |
|---|---|
| `pnpm -r typecheck` | 21/21 |
| `go test ./internal/features/saveditems/` with containers | **95 pass**, against the real 068 migration. ⚠ This package was **red at HEAD** before this slice (stale test seed) |
| `go test -short ./...`, `go vet ./...` | clean |
| `@effy/customer-web` | **536** (was 489), production build passes |
| Guest bundle gate | every route within 174 KB; `/` 173.8 (0.2 KB left), `/search` 173.4, `/product/[id]` 171.4 |
| customer-mobile Android host tests | **352** (was 331); iOS simulator test target compiles; `make cm-guard` passes |
| `@effy/design-system` guards | pass (364 files) |
| Contract | regenerates byte-stable; every new type present in `CommerceDto.kt` |

**Negative proofs, each run by breaking the thing:**

1. Removing the named-list check from the heart's un-save → `TestHeartUnsave_…` fails.
2. Removing the orphan sweep from list deletion → `TestDeleteList_…` fails.
3. Adding `listName: string` to a telemetry event → the telemetry guard fails.

**Proven by container test, not by a fake**: the backfill keeps order and price and is safe to run
twice; no saved product without a list after any write; two concurrent creates of one name yield
one list; a 21st list and a duplicate name in another case are refused; an entry in another
shopper's list is refused by the schema itself; add-all takes only the named list.

## Defects found while building

- **⚠ PRE-EXISTING, FIXED: the saved-items container tests were red at HEAD.** Their seed inserted
  into `delivery_pricing_rule` (withdrawn) and their product table lacked 054's stock columns, so
  every test failed at setup. They now load the real migration instead of a hand copy.
- **⚠ PRE-EXISTING, FIXED: web add-all showed product ids as a count.** `SavedList` typed
  `added` as a number; it is a list of ids. Found by the new per-list add-all test.
- **⚠ MINE, CAUGHT BY THE WIRE TEST**: a shopper with no named lists got
  `"namedProductIds": null` (a nil Go slice), which a client calling a method on it would crash on.
  It is always an array now.
- **⚠ MINE, CAUGHT ONLY BY THE PRODUCTION BUILD**: `/saved/[listId]` awaited `params` outside
  Suspense. Typecheck and 535 tests passed; `next build` refused it.
- **⚠ THE PLAN WAS WRONG ABOUT HEADROOM**: it assumed 2.1–5.5 KB on `/` from a comment in
  `bundle-budget.mjs`. Measured, it was 0.3 KB.

## Open

**Operator, in this order** ([quickstart.md](quickstart.md) §2):

1. `make db-up ENV=dev`
2. `make core-image-push ENV=dev && make core-deploy ENV=dev`
3. Run the two repair statements, then confirm the zero-orphans query returns 0. ⚠ Between steps 1
   and 2 the old core-api writes saved rows that are in no list.
4. Push customer-web; build the mobile app.
5. Walk quickstart §3 A–G on web, Android and iOS, **including D3 with the previous mobile build**,
   and run the log sweep for the sentinel list name.

**Not done:**

- The end-to-end a11y suite does not cover the chooser or a named list's page, and no screen reader
  has been run (T054).
- Telemetry emits nothing: PostHog is not initialised on web, and mobile has no event taxonomy.
- Kotlin's `LIST_NAME_MAX` is a hand mirror with no pin to the TypeScript constant.
- Undo after removing a product from its **last** list restores its place and resets its remembered
  price (033 already behaved this way).
- Two names that look identical but differ in Unicode composition can coexist.

**For the client:** confirm the reading (customer-owned lists, not categories), and whether every
customer should start with "Weekly Items" and "Daily Items" (they start with "Saved" only).
