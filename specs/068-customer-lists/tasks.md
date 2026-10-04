# Tasks: Customer Lists

**Input**: Design documents from `specs/068-customer-lists/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/customer-lists.md](contracts/customer-lists.md),
[quickstart.md](quickstart.md)

**Tests**: included. The quickstart names ten container proofs, and the heart rule (SC-008), the
bypass refusals (SC-009) and the guest-storage survival each need a test that can be broken.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md; setup, foundational and polish tasks carry none
- `GO` = `apis/core-api/internal/features/saveditems`
- `CW` = `apps/customer-web`
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `CM_TEST` = `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile`

**Story order differs from the spec's numbering.** US3 (the heart stays true) is built first: it
closes the destructive tap before any way to create a named list exists (plan, phase plan).

---

## Phase 1: Setup

- [x] T001 Fill the "Baseline" table in `specs/068-customer-lists/quickstart.md`, measured BEFORE any change: reporting-package count from `pnpm -r typecheck`; test counts for `@effy/shared-types` and `@effy/customer-web`; `go test -short ./...` in `apis/core-api`; customer-mobile `:shared:testAndroidHostTest`; `pnpm --filter @effy/customer-web size` for `/`, `/product/[id]` and `/search` in KB; the state of `make cm-contract-check`
- [x] T002 Create the migration file with `make db-new name=customer_lists` (produces `db/migrations/<ts>_customer_lists.sql`)
- [x] T003 [P] Research R14: search for any explicit enumeration of customer tables in the account-closure and data-export paths (`git grep -n "customer_saved_item\|cart_saved_item" -- apis db packages/legal-content`) and record under R14 in `specs/068-customer-lists/research.md` whether the two new tables must be named anywhere; if so, add the edit to T058

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the two tables with the backfill, the contracts, and the Go package re-pointed at
entries with `/v1/saved/*` behaving exactly as before.

**⚠ No user story work starts until this phase is complete.**

- [x] T004 Write the migration in `db/migrations/<ts>_customer_lists.sql` per data-model.md: `public.customer_list` with `customer_list_name_ck`, `customer_list_default_uq`, `customer_list_name_uq`, `customer_list_owner_uq`; `public.customer_list_entry` with PK `(list_id, product_id)`, both composite foreign keys `ON DELETE CASCADE`, `customer_list_entry_list_idx`, `customer_list_entry_saved_idx`; the two idempotent backfill statements (default list per customer with saved items; default entry per saved item with `added_at = saved_at`); a rewritten `COMMENT ON TABLE public.customer_saved_item` and `COMMENT ON COLUMN … saved_at` stating the new meaning; `COMMENT ON` every new table and column; a header noting `public.cart_saved_item` is a different capability and untouched; a Down dropping both new tables and stating that named lists are lost
- [x] T005 [P] Extend `packages/shared-types/src/saved-item.ts` per contracts §2: `LIST_LIMIT`, `LIST_NAME_MAX`, `DEFAULT_LIST_ID`, `SavedListDTO`, `SavedListCreateRequest`, `SavedListRenameRequest`, `SavedListEntryRequest`, and optional `namedProductIds` on `SavedMembershipDTO`; counts are `WireInt`, imported not redeclared; export from `packages/shared-types/src/index.ts`
- [x] T006 Register every new type in all three places in `packages/shared-types/src/customer-commerce-contract.ts` (import, re-export, a field on `CustomerCommerceContract`), run `make cm-contract-gen`, and grep `packages/shared-types/contract/CommerceDto.kt` for each of the four new type names and `namedProductIds`; a name with zero hits is a failure (depends on T005)
- [x] T007 Create `GO/lists_repository.go` with the shared statements: `ensureDefaultSQL` (`INSERT … ON CONFLICT DO NOTHING` on the partial unique index, returning the default list id), `resolveListSQL` (list id for this customer from a uuid or the literal `default`; `ErrListNotFound` otherwise), `insertEntrySQL` (`ON CONFLICT DO NOTHING`, `added_at` writable), `sweepOrphansSQL` exactly as data-model.md, and the sentinel errors `ErrListNotFound`, `ErrNameTaken`, `ErrInvalidName`, `ErrListLimit`, `ErrDefaultList`, `ErrInNamedLists` (depends on T004)
- [x] T008 Re-point `GO/repository.go` at entries without changing any `/v1/saved` behaviour: `listSQL` reads `FROM customer_list_entry e JOIN customer_saved_item s … WHERE e.customer_id = $1 AND e.list_id = $2 ORDER BY e.added_at DESC` with `e.added_at AS saved_at` and the verdict `CASE` untouched (research R4), and `List` takes a list id; `Save` runs ensure-default and inserts the default entry (using `savedAt` as `added_at`) in the same transaction after the saved row; `Merge` ensures the default and inserts a default entry per item including items already saved (research R11); `membershipSQL` and `countSavedSQL` unchanged (depends on T007)
- [x] T009 Update `GO/service.go` so `List` and `AddAllToCart` take a list reference and the existing handlers in `GO/handler.go` pass `default`; `go build ./...` passes and the existing `GO/service_test.go` and `GO/wire_contract_test.go` pass with changes only where a fake's signature changed (depends on T008)
- [x] T010 Container test `GO/lists_container_test.go` (follow the container setup in `apis/core-api/internal/features/checkout/receipt_dispatch_container_test.go`) against every migration: the backfill puts each pre-existing saved item in the default list in the same order with the same `saved_price_amount` (FR-035, SC-006); running the two backfill statements a second time changes nothing; a `zeroOrphans(t, customerID)` helper asserting the data-model invariant, called after save and after merge (depends on T008)
- [x] T011 Make every consumer compile against the widened contract: `CM/features/saved/data/HttpSavedRepository.kt` maps `namedProductIds` (absent → empty), so `pnpm -r typecheck`, `go build ./...` and customer-mobile `:shared:compileAndroidMain` pass (depends on T006)

**Checkpoint**: schema, contracts and re-pointed queries exist; every surface behaves as before.

---

## Phase 3: User Story 3 — The heart still takes one tap and still tells the truth (P1)

**Goal**: one-tap save lands in "Saved"; the heart is filled for a product in any list; a tap on
a filled heart never removes a product from a named list.

**Independent test**: quickstart walks A and D, with named-list entries seeded by SQL until US1
exists.

### Tests for User Story 3

- [x] T012 [P] [US3] Extend `GO/lists_container_test.go`: `Remove` (heart un-save) of a product with a named-list entry returns `ErrInNamedLists` and deletes nothing; of a product only in the default list deletes the saved row and its entry; membership returns the product in `productIds` when it is only in a named list, and `namedProductIds` is exactly the named subset; zero orphans after each (FR-018 to FR-020, SC-008)
- [x] T013 [P] [US3] Extend `GO/wire_contract_test.go` and `CM_TEST/features/saved/SavedWireContractTest.kt` with one byte-identical membership literal carrying `namedProductIds`, and one WITHOUT it that must still decode in Kotlin (the old-backend case)
- [x] T014 [P] [US3] Extend `CW/lib/saved-store.test.ts`: a pre-068 envelope `{version:1, productIds:[…]}` loads with every id intact and an empty named set (the guest-survival proof, research R5); `adoptSaved` with named ids round-trips; the storage key is still `effy:saved:v1`
- [x] T015 [P] [US3] Extend `CM_TEST/features/saved/SavedStoreTest.kt`: `adopt` sets both sets; a toggle on a saved product in the named set does not change `saved` and reports "open chooser"; a `409` on remove reverts the one product; no commas in backtick test names

### Implementation for User Story 3

- [x] T016 [US3] In `GO/repository.go`, make `Remove` transactional under `lockCustomerSQL`: if any entry exists in a non-default list for this product return `ErrInNamedLists`, else delete the saved row (entries cascade); add `NamedProductIDs(ctx, customerID)` (distinct `product_id` of entries in non-default lists, served by `customer_list_entry_saved_idx`)
- [x] T017 [US3] In `GO/service.go` add the named ids to `Membership`; in `GO/handler.go` emit `namedProductIds` on `GET /v1/saved/ids` and map `ErrInNamedLists` to `409` with reason `in_named_lists` in `respond` (depends on T016)
- [x] T018 [P] [US3] `CW/lib/saved-store.ts`: add optional `namedIds` to the v1 `Envelope` WITHOUT changing `KEY` or `SCHEMA_VERSION`; `adoptSaved(productIds, namedIds = [])`; `useNamedIds()` / `isInNamedList(productId)` returning a frozen, identity-stable empty array as `EMPTY` does; a comment recording why the version must not be bumped
- [x] T019 [US3] `CW/lib/saved-actions.ts`: `refreshSaved` and `CW/lib/saved-merge.ts` adopt `namedProductIds`; `toggleSaved` returns a discriminated result (`ok` | `refused` | `open_chooser`), returning `open_chooser` without sending when un-saving a product in the named set, and on a `409` reverting the mirror and returning `open_chooser` (depends on T018)
- [x] T020 [US3] `CW/app/(shop)/_components/SaveControl.tsx`: on `open_chooser`, load the chooser with `import("./ListChooser")` (a placeholder module exporting `openListChooser(productId)` until T033); accessible name unchanged; then run `pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size` and record `/`, `/product/[id]`, `/search` deltas in quickstart's baseline table — `/search` must be byte-identical and no route may exceed the budget (depends on T019)
- [x] T021 [P] [US3] `CM/features/saved/domain/SavedStore.kt`: add `named: StateFlow<Set<String>>`; `SavedMembership` in `CM/features/saved/domain/Saved.kt` gains `namedProductIds`; `adopt` sets both; `reset` clears both
- [x] T022 [US3] `CM/features/saved/domain/SavedUseCases.kt`: the toggle use case returns a sealed outcome (`Done` | `Refused` | `OpenChooser`), returning `OpenChooser` without a request when the product is in `named`, and on a `409 in_named_lists` reverting and returning `OpenChooser`; update the callers in `CM/features/saved/presentation/SavedTiles.kt`, `CM/features/catalog/presentation/{HomeScreen,SearchScreen,ProductDetailScreen}.kt` and `CM/features/checkout/presentation/ReceiptScreen.kt` to accept the outcome (the sheet itself arrives in T036) (depends on T021)

**Checkpoint**: hearts are truthful across lists and cannot destroy a named-list entry, on current
and installed builds.

---

## Phase 4: User Story 1 — Make a list and put products in it (P1) 🎯 MVP

**Goal**: create a named list, place products in it from the chooser, see the list's page.

**Independent test**: quickstart walk B.

### Tests for User Story 1

- [x] T023 [P] [US1] Unit test `GO/lists_service_test.go` for `NormaliseListName`: trims, collapses whitespace runs, strips control characters, empty → `ErrInvalidName`, exactly 40 code points accepted, 41 refused, an emoji counts as one, "Saved" / "saved" / " SAVED " → `ErrNameTaken`
- [x] T024 [P] [US1] Extend `GO/lists_container_test.go`: create returns the list; a duplicate name in a different letter case → `ErrNameTaken`; two concurrent creates of one name yield one list; a 21st named list → `ErrListLimit`; create-with-product is atomic (a refused product creates no list); add is idempotent; add to a deleted list → `ErrListNotFound` and the product is in no new list; adding an already-saved product at the 200 cap succeeds and a new one → `ErrCapReached`; the same product in two lists reports one `saved_price_amount`; customer B cannot read, add to or see customer A's list (`ErrListNotFound`); `GET` lists for a customer with no default row returns the synthesised default with count 0 and writes nothing
- [x] T025 [P] [US1] Handler test `GO/lists_handler_test.go` posting straight at the routes: `invalid_name`, `name_taken`, `list_limit`, malformed `productId` → 400, each refusal body carries its closed-set reason and never echoes the submitted name (SC-009, FR-040)
- [x] T026 [P] [US1] Extend the wire contract pair (`GO/wire_contract_test.go`, `CM_TEST/features/saved/SavedWireContractTest.kt`) with one byte-identical `SavedListDTO[]` literal copied from a real response: Kotlin decodes it, `count` and `onlyHereCount` emit as integers, and `LIST_LIMIT` / `LIST_NAME_MAX` equal Go's `ListLimit` / `ListNameMax`
- [x] T027 [P] [US1] Web test `CW/app/(shop)/_components/ListChooser.test.tsx`: renders every list with its checked state; ticking sends one add; "New list" creates and adds in one call; `name_taken` and `invalid_name` show on the field; a name containing `<script>` renders as literal text; a `401` shows the sign-in prompt
- [x] T028 [P] [US1] Mobile test `CM_TEST/features/saved/ListChooserViewModelTest.kt`: load, toggle, create-and-add, each refusal reason mapped to its message, signed-out state

### Implementation for User Story 1

- [x] T029 [US1] `GO/lists_service.go`: constants `ListLimit = 20`, `ListNameMax = 40`, the reserved name; `NormaliseListName`; domain `List{ID, IsDefault, Name *string, Count, OnlyHereCount, ContainsProduct *bool}`; `Lists(ctx, customerID, productID *string)`, `Create(ctx, customerID, name, productID *string)`, `AddEntry(ctx, customerID, listRef, productID, restoreAddedAt *time.Time)`, `Items(ctx, customerID, listRef)`; extend the `Reader` seam
- [x] T030 [US1] `GO/lists_repository.go`: `Lists` in one statement (default first then `created_at`; `count`, `onlyHereCount`, optional `containsProduct`; synthesise the default when no row, without writing); `CreateList` in a transaction under `lockCustomerSQL` (count named lists, insert, map `23505` on `customer_list_name_uq` to `ErrNameTaken`, optional entry via `AddEntry`'s statements); `AddEntry` (resolve list, product exists, cap check unless already saved, insert saved row with `insertSavedSQL`, insert entry) (depends on T029)
- [x] T031 [US1] `GO/lists_handler.go`: `GET /v1/lists`, `POST /v1/lists`, `GET /v1/lists/:listId/items`, `PUT /v1/lists/:listId/entries/:productId`, behind the same middleware as `/v1/saved`; DTO mapping with the default's id as `default` and `name` null; refusal mapping per contracts §2; register from `Register` in `GO/handler.go` so `apis/core-api/cmd/core-api/main.go` needs no new wiring (depends on T030)
- [x] T032 [P] [US1] Web proxy routes through `proxyToCore`: `CW/app/api/lists/route.ts` (GET, POST), `CW/app/api/lists/[listId]/items/route.ts` (GET), `CW/app/api/lists/[listId]/entries/[productId]/route.ts` (PUT)
- [x] T033 [US1] `CW/lib/list-actions.ts` (fetch lists for a product, create, add; updates the mirror's saved and named sets on success) and `CW/app/(shop)/_components/ListChooser.tsx`: a native `<dialog>` (the `MiniCart` pattern, no dialog library) of checkbox rows, "Saved" first, a "New list" row with a text field and a remaining-characters count from `LIST_NAME_MAX`, plain-text names, focus returned to the opener on close; replaces T020's placeholder and keeps the `openListChooser(productId)` export (depends on T032)
- [x] T034 [US1] Entry points on web: an "Add to list" button beside the heart in `CW/app/(shop)/product/[id]/page.tsx` (a small client component that `import()`s the chooser on click); after a successful one-tap save in `CW/app/(shop)/_components/SaveControl.tsx`, a `toast` with an "Add to a list" action that `import()`s the chooser; re-run `pnpm --filter @effy/customer-web size` and record the deltas — if a route exceeds the budget, reduce the web presentation, do not raise the limit (depends on T033)
- [x] T035 [US1] Lists on the web account pages: `CW/app/(account)/saved/ListTabs.tsx` (a horizontally scrolling tab row, "Saved" first, each with its count, a "New list" control); `CW/app/(account)/saved/[listId]/page.tsx` reading `/v1/lists/{id}/items` server-side (404 → redirect to `/saved`); `CW/app/(account)/saved/page.tsx` renders the tabs above the default list; `CW/app/(account)/saved/SavedList.tsx` takes `listId` and `listName`, shows an "Add to list" row action opening the chooser, and for an empty named list says the list is empty with a route into the store (FR-026) (depends on T033)
- [x] T036 [P] [US1] Mobile data and domain: `SavedList` model, `ListRepository` (lists, create, addEntry, items) in `CM/features/saved/domain/Saved.kt`; implementation in `CM/features/saved/data/HttpSavedRepository.kt` with DTO→domain mapping; use cases in `CM/features/saved/domain/SavedUseCases.kt` that update `SavedStore.saved` and `named` on success; wire in `CM/app/AppContainer.kt`
- [x] T037 [US1] `CM/features/saved/presentation/ListChooserSheet.kt` and its ViewModel: a Material 3 modal bottom sheet of 48 dp checkbox rows, "Saved" first, a "New list" row with a counted text field, refusal messages per reason, a signed-out state; open it from the `OpenChooser` outcome at every heart call site from T022, from a snackbar action "Add to a list" after a one-tap save, and from an "Add to list" control beside the heart in `CM/features/catalog/presentation/ProductDetailScreen.kt` (depends on T036)
- [x] T038 [US1] `CM/features/saved/presentation/SavedScreen.kt` and `SavedViewModel.kt`: a scrollable tab row of lists with counts above the existing content, the selected list's items loaded per tab, a "New list" action, a row action "Add to list" opening the sheet, the empty-named-list message (depends on T037)

**Checkpoint**: a shopper can create "Weekly Items", fill it and read it, on web and mobile.

---

## Phase 5: User Story 2 — Do the weekly shop in one action (P1)

**Goal**: add everything purchasable in one list to the cart; the list is unchanged.

**Independent test**: quickstart walk C.

### Tests for User Story 2

- [x] T039 [P] [US2] Extend `GO/service_test.go` and `GO/lists_container_test.go`: add-all from list A adds none of list B's products; skipped products are named with the verdict as the reason; every entry is still present afterwards (SC-002); a retry with the same `changeId` derives the same per-item ids
- [x] T040 [P] [US2] Extend `CW/lib/saved-display.test.ts` (or add `CW/app/(account)/saved/SavedList.test.tsx`): add-all posts to the current list's route; the unavailable state when nothing is purchasable; rows already in the cart state the count

### Implementation for User Story 2

- [x] T041 [US2] `POST /v1/lists/:listId/add-to-cart` in `GO/lists_handler.go`, calling the list-scoped `AddAllToCart` from T009; `POST /v1/saved/add-to-cart` remains the default list
- [x] T042 [P] [US2] Web: `CW/app/api/lists/[listId]/add-to-cart/route.ts`; `CW/app/(account)/saved/SavedList.tsx` posts add-all to the current list and keeps the existing skipped-items report and in-cart statement on every list's rows
- [x] T043 [P] [US2] Mobile: `SavedCartRepository.addAllToCart` takes a list id in `CM/features/saved/domain/Saved.kt` and `CM/features/saved/data/HttpSavedRepository.kt` (drop the unused `postcode` parameter); `SavedViewModel.kt` and `SavedScreen.kt` run add-all for the selected tab

**Checkpoint**: MVP complete — US3 + US1 + US2 deliver the client's request end to end.

---

## Phase 6: User Story 4 — Keep lists tidy (P2)

**Goal**: rename, remove from one list with undo, delete a list without touching the others.

**Independent test**: quickstart walk E.

### Tests for User Story 4

- [x] T044 [P] [US4] Extend `GO/lists_container_test.go`: rename keeps entries and order; rename to another list's name → `ErrNameTaken`; rename to the same name in a different case succeeds; rename or delete of the default → `ErrDefaultList`; removing an entry leaves the product's other entries and its saved row; removing the last entry deletes the saved row; `restoreAddedAt` returns an entry to its position; deleting a list leaves every other list's entries (SC-007) and un-saves products that were only there; delete is idempotent; `onlyHereCount` equals the number un-saved by the delete; zero orphans after each
- [x] T045 [P] [US4] Web test `CW/app/(account)/saved/ListTabs.test.tsx`: the default tab offers neither rename nor delete; the delete confirmation states both counts; `name_taken` on rename shows on the field

### Implementation for User Story 4

- [x] T046 [US4] `GO/lists_repository.go`, `GO/lists_service.go`, `GO/lists_handler.go`: `PATCH /v1/lists/:listId` (normalise, update, `23505` → `ErrNameTaken`); `DELETE /v1/lists/:listId` (transaction: delete list, sweep); `DELETE /v1/lists/:listId/entries/:productId` (transaction: delete entry, sweep; always 204); `restoreAddedAt` accepted on the entry `PUT`
- [x] T047 [P] [US4] Web: proxy handlers `PATCH`/`DELETE` in `CW/app/api/lists/[listId]/route.ts` and `DELETE` in `CW/app/api/lists/[listId]/entries/[productId]/route.ts`; rename and delete (native `<dialog>` confirmation stating `count` and `onlyHereCount`) in `CW/app/(account)/saved/ListTabs.tsx`; in `CW/app/(account)/saved/SavedList.tsx` remove calls the entry route for the current list with undo sending `restoreAddedAt`, and the mirror is refreshed afterwards so hearts follow
- [x] T048 [P] [US4] Mobile: rename, delete and removeEntry in `ListRepository` and `HttpSavedRepository.kt`; a manage menu (rename, delete with the two-count confirmation) on named tabs only in `CM/features/saved/presentation/SavedScreen.kt`; per-list remove with undo in `SavedViewModel.kt`; a membership refresh after each so `SavedStore` follows

**Checkpoint**: lists can be corrected and removed without collateral loss.

---

## Phase 7: User Story 5 — Guests keep one list (P3)

**Goal**: a guest saves as today; named lists ask for sign-in; device saves join "Saved".

**Independent test**: quickstart walk F.

### Tests for User Story 5

- [x] T049 [P] [US5] Extend `GO/lists_container_test.go`: merge places every merged product in the default list; a product already saved only in a named list gains a default entry and `added` does not count it; no named list's entries change; merging twice is identical; zero orphans
- [x] T050 [P] [US5] Extend `CW/lib/saved-store.test.ts` and `CM_TEST/features/saved/SavedStoreTest.kt`: a guest's tap on a filled heart always un-saves (the named set is empty for a guest), and nothing about lists is written to device storage

### Implementation for User Story 5

- [x] T051 [P] [US5] Web: the chooser's `401` state in `CW/app/(shop)/_components/ListChooser.tsx` says lists need an account and links to sign-in with a return target built by `CW/lib/next-target.ts`; the heart stays filled
- [x] T052 [P] [US5] Mobile: the signed-out state of `CM/features/saved/presentation/ListChooserSheet.kt` routes to the existing deferred sign-in; `CM/features/saved/presentation/SavedScreen.kt` hides the tab row's "New list" for a guest and keeps the existing device-only notice

**Checkpoint**: all five stories work independently.

---

## Phase 8: Polish & cross-cutting

- [x] T053 [P] Declare the three events from plan.md in `CW/lib/telemetry.ts` (`saved_list_created`, `saved_list_entry_added`, `saved_list_add_all`) with exactly the listed properties, call them at the create, add and add-all sites on web, and add a test in `CW/lib/telemetry.test.ts` that no event type has a property that could carry a name; declare the same three on mobile wherever 033's saved events are declared (if none are, record that in research R12 and stop)
- [ ] T054 [P] Accessibility pass: chooser rows are labelled checkboxes with the list name; the chooser traps and restores focus; tabs expose selected state; every new mobile target is at least `EffyMinTouchTarget`; extend `CW/e2e/a11y.spec.ts` to open the chooser and a named list's page
- [x] T055 [P] Add a pointer under FR-066 in `specs/033-customer-saved-items/spec.md` ("⚠ RETIRED 2026-10-04 by 068-customer-lists"), and correct the stale "five-way verdict" comments in `GO/repository.go`'s package doc to three
- [x] T056 [P] Update `docs/audiences/customer-capabilities.md` with a §068 parity entry, recording the one standing difference (no heart and no chooser on the web search grid)
- [x] T057 Run quickstart §1 in full (`pnpm -r typecheck`, shared-types tests, `make cm-contract-check`, the Go packages, customer-web test + build + size, the mobile host tests and iOS simulator compile, `make cm-guard`) and fill the "After" column of the baseline table
- [x] T058 Run the quickstart §4 sweeps that need no deploy (the `wishlist` grep; `git diff --stat` showing nothing under the cart feature beyond tests) and apply any table-enumeration edit found in T003
- [x] T059 Write `specs/068-customer-lists/SIGNOFF.md` (what was built, what was verified by machine, what is open) and add the 068 entry to `FEATURE-HISTORY.md` and the "Features recorded" list in `CLAUDE.md`
- [ ] T060 **Operator**: deploy per quickstart §2 in order — `make db-up ENV=dev`; `make core-image-push ENV=dev && make core-deploy ENV=dev`; run the repair statements; confirm the zero-orphans query returns 0; then push customer-web and build the mobile app
- [ ] T061 **Operator**: walk quickstart §3 A–G on web, Android and iOS (including D3 with the previous mobile build), check 20 lists in the tab row, and run the §4 log sweep for the sentinel name

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → user stories → **Polish (8)**.
- T060 and T061 are the user's; everything before them is machine-verifiable without a deploy.

### User story dependencies

- **US3** (Phase 3): needs only Foundational. Built first on purpose.
- **US1** (Phase 4): needs US3 (the heart's `OpenChooser` outcome is one of the chooser's entry points).
- **US2** (Phase 5): needs US1's list pages for its UI; the route (T041) needs only Foundational.
- **US4** (Phase 6): needs US1.
- **US5** (Phase 7): backend (T049) needs only Foundational; UI needs US1's chooser.

### Within a story

Tests are written first and must fail; repository → service → handler → proxy → store/actions →
UI. T020 and T034 are gates: the size check passes before work continues on top of them.

### Parallel opportunities

- T005 beside T004; T003 beside everything in Setup.
- In each story, every test task marked [P] together.
- Once the Go routes of a story exist, its web and mobile tasks run side by side (T032–T035 vs
  T036–T038; T042 vs T043; T047 vs T048; T051 vs T052).
- All of T053–T056.

## Parallel example: User Story 1

```text
Tests together:   T023  T024  T025  T026  T027  T028
Then backend:     T029 → T030 → T031
Then two tracks:  web    T032 → T033 → T034, T035
                  mobile T036 → T037 → T038
```

## Implementation strategy

### MVP (US3 + US1 + US2)

Setup, Foundational, then Phases 3 to 5. That is the client's request: named lists, filled from
the heart, bought in one action, with the existing saved items intact. Stop and run walks A to D.

### Incremental delivery

1. Foundational: deployable on its own; nothing changes for anyone.
2. US3: deployable on its own; no visible change until a named list exists.
3. US1 + US2: the feature the client asked for.
4. US4: tidy. Until it ships, a list cannot be renamed or deleted, so do not release US1 to
   customers without it.
5. US5: guest wording and the merge proof.

## Notes

- No commits: the user commits.
- The user runs every migration and deploy (T060); the tasks before it only author files.
- The web mirror's storage key and version must not change (T018). A guest's saved items live
  only there.
- One `listSQL`. Do not copy the verdict `CASE` into a second statement (research R4).
- Uniqueness of names lives only in `customer_list_name_uq`. Do not add a "does it exist" check
  before the insert (research R3).
- No commas in Kotlin backtick test names.

## As built (2026-10-04): where the work differs from the task text

58 of 61 done. Open: T054 (partly), T060 and T061 (the operator's).

- **T010, T024, T044, T049 — "against every migration".** The Go container tests stand up the
  subset of earlier tables the SQL spans (the package's existing pattern) and then apply the **real
  068 migration file**, read from `db/migrations/`. The tables, constraints and backfill under test
  are the ones that will run. They are not run against all 60-odd earlier migrations.
- **T009 — "existing tests pass with changes only where a fake's signature changed".** They did not
  pass at all before: `repository_test.go` was red at HEAD (a stale seed). The seed was repaired
  (stock columns added, the insert into a withdrawn table removed) as part of this slice.
- **T025 — "posting straight at the routes".** core-api has no test seam for injecting a customer
  identity (the context key is unexported and the middleware needs a database). The handler test
  pins every refusal's status and reason through `respond`; the bypass proofs are the service test
  (a bad name never reaches the store) and the container test (the table's CHECK refuses 41
  characters whatever the service does).
- **T026 — the two limits in Kotlin.** Go is pinned to the TypeScript constants by a test that
  reads `saved-item.ts`. Kotlin's `LIST_NAME_MAX` is a hand mirror with no pin: the generator emits
  types, not constants. It only drives the remaining-characters count; the platform decides.
- **T020 / T034 — the bundle.** Passed, with 0.2 KB left on `/`. `/search` is 0.3 KB smaller, not
  byte-identical (research R7).
- **T029–T031 and T041, T046 were built together.** The whole Go surface went in at Foundational
  rather than story by story, because one package owns one invariant. Story order still held on
  the clients: the heart's refusal existed before any client could create a named list.
- **T051 — the sign-in link** is built from the current path directly rather than through
  `lib/next-target.ts`, which validates an inbound target and does not build one.
- **T052 — sign-in from the chooser on mobile.** Offered as a button on Home, Search and the product
  page. On the receipt and the saved screen the chooser has no route to sign-in; both are
  signed-in-only screens, so a guest never opens it there.
- **T053 — telemetry.** Declared and called on web. Nothing on mobile: it has no event taxonomy
  (research R12). The `heart` source was dropped to keep telemetry off the heart's guest path.
- **T054 — accessibility.** Done: chooser rows are labelled checkboxes on both surfaces; web dialogs
  are native `<dialog>` with `aria-labelledby`; the tab row marks the current list; mobile rows are
  `EffyMinTouchTarget` tall and each is one toggle. **Not done**: `e2e/a11y.spec.ts` was not
  extended, because the chooser and a named list's page need a signed-in session the suite does not
  set up. Nobody has run a screen reader over any of it.

Added beyond the task list, each because a test or a build found it:

- **A web defect from 033, fixed.** The saved list rendered `added` (a list of product ids) as if
  it were a count, so add-all told the shopper "9f2c…,1a7b… items added to your cart".
- **Undo and the in-cart statement on web.** 033 required both and only mobile had them.
- **`@effy/api-client` `DomainError.type`** and **`reason` in the web proxy's error body**: the
  only way two different `400`s from one route can be told apart on web. Both additive.
- **`/saved/[listId]` awaits `params` inside Suspense.** Awaiting it in the page component passed
  typecheck and every test and failed the production build.
