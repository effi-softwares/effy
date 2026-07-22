# Tasks: Customer Address Book

**Feature**: 022-customer-address-book · **Date**: 2026-07-22
**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different file, no dependency on an incomplete task)
- **[US#]** — the user story this task serves (user-story phases only)
- **🧑‍💻** — OPERATOR-RUN. Claude authors; the operator runs anything touching AWS, the DB, or live state.

## Path Conventions

- Backend (hot path, reused): `apis/core-api/internal/features/addresses/`
- Design-system: `packages/design-system/src/`
- Web: `apps/customer-web/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`

**Tests included** alongside implementation (repo convention + Quality Gate). This is a **small,
mostly-frontend slice** over an existing backend — **no migration, no new DTOs**.

> ✅ **Backend CRUD already exists** (019, `/v1/addresses`); set-default is already exactly-one-safe. The
> only backend change is the delete-default guard (Phase 2). Everything else is client surface work.

---

## Phase 1: Setup (shared design-system primitive)

**Purpose**: The responsive add/edit container both surfaces need, added once to the design-system
(Principle II).

- [x] T001 Add the shadcn **Drawer** component (vaul) to `packages/design-system/src/ui/drawer.tsx`; add `vaul` to `packages/design-system/package.json`
- [x] T002 Build `ResponsiveModal` — Dialog at/above the breakpoint, Drawer below, via the existing `useIsMobile` hook — in `packages/design-system/src/ui/responsive-modal.tsx`; export both from the ui barrel
- [x] T003 [P] Write a test asserting `ResponsiveModal` renders Dialog above the breakpoint and Drawer below (mock `useIsMobile`) in `packages/design-system/src/ui/responsive-modal.test.tsx`

**Checkpoint**: `pnpm --filter @effy/design-system typecheck && test` green; the shared responsive
container exists.

---

## Phase 2: Foundational (the one backend change) — blocking

**⚠ The clients' delete-default UX (US4) relies on this 409.**

> ⚠ **CORRECTION (post-implementation):** address management is customer profile → **cold path**
> (`edge-api/customer`), per the routing law (011 FR-028). The CRUD was **moved** there and **removed**
> from core-api. T004–T006 below describe the (superseded) hot-path build; the delivered backend is the
> `edge-api/customer/src/addresses/` slice (`GET/POST /customer/v1/addresses`, `PATCH/DELETE
> /customer/v1/addresses/{id}`) + `ProblemType.Conflict` in edge-shared + 10 vitest tests. Checkout
> keeps its direct `customer_address` SQL read for the snapshot.

- [x] T004 Delete-default guard (single race-free CTE, 404-vs-409-vs-deleted) — **delivered on the cold path** in `apis/edge-api/customer/src/addresses/repo.ts` (`remove`) + `service.ts` (`DefaultDeleteBlockedError`), not core-api
- [x] T005 Map the blocked default → **409** (distinct from 404) — `apis/edge-api/customer/src/addresses/http.ts` (`addressErrorResponse`), using the new `ProblemType.Conflict`
- [x] T006 [P] Tests — `apis/edge-api/customer/src/addresses/service.test.ts`: access decision (no-record/barred/scoped-to-internal-id, SC-005), validation, and the three delete outcomes (blocked→409 / not-found→404 / deleted)

**Checkpoint**: `go build ./... && go vet ./... && go test ./...` green; the invariant is server-enforced.

---

## Phase 3: User Story 1 — A customer sees all their saved addresses (P1) 🎯 MVP

**Goal**: The address book lists the customer's addresses (default marked), with an empty state, on both
surfaces, account-gated.

**Independent Test**: With several addresses (one default), open the book on each surface — all appear,
default marked, empty state when none, sign-in prompt when unauthenticated.

### Web

- [x] T007 [P] [US1] Define domain types + DTO→domain mapping in `apps/customer-web/lib/addresses/model.ts`
- [x] T008 [US1] Implement `listAddresses` in `apps/customer-web/lib/addresses/repo.ts` (via the existing `/api/addresses` proxy) and `addressBookQuery` in `apps/customer-web/lib/addresses/queries.ts`
- [x] T009 [US1] Build `AddressList` + `AddressRow` (label/recipient/lines, default marker, **list not cards**) and the empty state in `apps/customer-web/app/(account)/addresses/_components/`
- [x] T010 [US1] Add the account-gated page `apps/customer-web/app/(account)/addresses/page.tsx` (calls `requireCustomer` like the other account pages) rendering the list
- [x] T011 [P] [US1] Write list tests (rows, default marked, empty state, no card layout) in `apps/customer-web/app/(account)/addresses/*.test.tsx`

### Mobile

- [x] T012 [P] [US1] Define `AddressBook` domain models + `AddressRepository` interface + `ListAddresses` use case in `features/addresses/domain/`
- [x] T013 [US1] Implement `HttpAddressRepository` (`GET v1/addresses`, `request{}` failure idiom) + `AddressMappers` (Double→Int narrowing) in `features/addresses/data/`
- [x] T014 [US1] Implement `AddressBookViewModel` (MVVM, immutable UiState, `coroutineScope` seam) + `AddressBookScreen` (`LazyColumn` of rows, default marker, empty state) in `features/addresses/presentation/`
- [x] T015 [US1] Reach the address book from the Account tab (nav wiring) + `AppContainer` (repo + use cases `by lazy`) in `features/account/…` and `app/AppContainer.kt`
- [x] T016 [P] [US1] Add `FakeAddressRepository` + `AddressBookViewModelTest` (list, empty) in `commonTest/.../features/addresses/`

**Checkpoint**: The address book lists addresses on both surfaces. **MVP.**

---

## Phase 4: User Story 2 — A customer adds a new address (P1)

**Goal**: Add via the responsive form — web dialog/drawer, mobile FAB → bottom sheet; first address
auto-defaults; label chips; validation preserves input.

**Independent Test**: On each surface open the add form (web: dialog wide / drawer narrow; mobile: FAB →
sheet), submit valid → appears; submit invalid → field error, input kept; first-ever add becomes default.

### Web

- [x] T017 [US2] Add `createAddress` to `repo.ts` + a create mutation (invalidates the book) to `queries.ts`; add the create proxy path in `apps/customer-web/app/api/addresses/route.ts` (exists) — verify it forwards POST
- [x] T018 [US2] Build `AddressFormModal` — the address form inside `ResponsiveModal` — with **Home/Work/Other label chips** (Other → free text), optional phone, field-level errors preserving input, in `apps/customer-web/app/(account)/addresses/_components/AddressFormModal.tsx`
- [x] T019 [US2] Wire an "Add address" button on the page opening `AddressFormModal`; on success the new row appears without reload
- [x] T020 [P] [US2] Tests: dialog≥breakpoint / drawer<breakpoint, valid add appears, invalid keeps input, label chips map to the free-text label, first-add auto-default, dismiss saves nothing (SC-009)

### Mobile

- [x] T021 [US2] Add `AddAddress` use case + `createAddress` to `HttpAddressRepository`/`AddressMappers`; extend the ViewModel with add state
- [x] T022 [US2] Build the add form in a `ModalBottomSheet` raised by a `FloatingActionButton` (label chips, optional phone, validation) in `AddressBookScreen.kt`
- [x] T023 [P] [US2] ViewModel tests: add appears, first-add default, validation, sheet dismiss saves nothing

**Checkpoint**: US1 + US2 = a fillable address book on both surfaces.

---

## Phase 5: User Story 3 — A customer sets an address as default (P1)

**Goal**: Set any address default from the list; exactly one default (already server-safe); checkout
pre-selects it.

**Independent Test**: Set a non-default as default → exactly one default, previous cleared, persists,
checkout pre-selects it.

- [x] T024 [US3] Add `setDefault` (PATCH `makeDefault:true`) to web `repo.ts` + a mutation invalidating the book; a "Set as default" per-row control (distinct from the row-body edit) in `AddressRow.tsx`
- [x] T025 [US3] Same on mobile: `SetDefault` use case + a per-row "Set default" control in `AddressBookScreen.kt` + ViewModel action
- [x] T026 [P] [US3] Tests both surfaces: after set-default exactly one default marked; idempotent when already default (FR-014); (backend exactly-one is already covered by 019 — assert the client reflects it)

**Checkpoint**: The customer controls their default outside checkout.

---

## Phase 6: User Story 4 — A customer deletes an address (P1)

**Goal**: Delete behind a confirmation; deleting the default (with others) is blocked with a reassign
prompt (server 409 is the backstop); past orders untouched.

**Independent Test**: Delete a non-default (confirm) → leaves list; a prior order's address unchanged;
deleting the default with others → blocked + reassign prompt (UI **and** direct API → 409); sole address
→ allowed.

- [x] T027 [US4] Add `deleteAddress` to web `repo.ts` + a mutation; the `[id]` patch/delete proxy `apps/customer-web/app/api/addresses/[id]/route.ts` (NEW); a `DeleteAddressDialog` (confirmation, `alert-dialog`)
- [x] T028 [US4] Web delete-default UX: disable/redirect deleting the default while others exist, prompting to set another default first; map a server **409** to the same prompt (backstop) in `AddressRow.tsx` / delete flow
- [x] T029 [US4] Mobile: `DeleteAddress` use case + per-row delete with a confirm; the same default-block UX + 409 mapping in `AddressBookScreen.kt` / ViewModel
- [x] T030 [P] [US4] Tests both surfaces: confirm-then-delete removes the row; delete-default blocked with prompt; 409 handled; sole-address delete allowed → empty state

**Checkpoint**: All P1 stories complete — a fully usable address book.

---

## Phase 7: User Story 5 — A customer edits an existing address (P2)

**Goal**: Tap the row body → the pre-filled responsive form; save updates the row; default unchanged
unless explicitly changed.

**Independent Test**: Tap a row body (not the set-default/delete controls) → pre-filled form; change a
field, save → list updated, default unaffected; invalid → field error preserving input.

- [x] T031 [US5] Web: `updateAddress` in `repo.ts` + mutation; make the **row body** open `AddressFormModal` pre-filled (label chip re-selected from the stored value; Other for non-Home/Work); set-default/delete controls do NOT open it (FR-017a)
- [x] T032 [US5] Mobile: `UpdateAddress` use case; row-tap opens the pre-filled bottom-sheet form; per-row controls don't trigger edit
- [x] T033 [P] [US5] Tests both surfaces: row-body opens edit (controls don't), edit persists, default unchanged, chip re-selection round-trips (Home/Work vs Other), invalid keeps input

**Checkpoint**: Full CRUD — view / add / edit / set-default / delete — on both surfaces.

---

## Phase 8: Polish & Cross-Cutting

- [x] T034 [P] Add PostHog events (`address_added/edited/deleted/default_set/delete_default_blocked`) with **no address fields** (SC-008) in `apps/customer-web/lib/telemetry.ts`; document in `docs/telemetry/`
- [x] T035 [P] Update the parity register `docs/audiences/customer-capabilities.md` §022 (view/add/edit/set-default/delete on both surfaces)
- [x] T036 Run the full sweep from [quickstart.md](./quickstart.md) §1: `pnpm -r typecheck` + design-system/customer-web Vitest + `go build/vet/test` + `./gradlew :shared:allTests` + `pnpm turbo build`
- [ ] T037 🧑‍💻 `make edge-deploy SERVICE=customer ENV=dev` (the cold-path address routes) + the two surfaces; walk SC-001…SC-011 in [quickstart.md](./quickstart.md) §3, incl. the **direct-API delete-default 409 proof** (SC-010, `/customer/v1/addresses/{id}`) and the cross-customer refusal (SC-005)
- [ ] T038 🧑‍💻 Verify parity on customer-mobile (SC-007) and commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code

---

## Dependencies & Execution Order

```
Phase 1 (design-system ResponsiveModal)  ─┐
Phase 2 (backend delete guard)            ─┤  both foundational; independent of each other
        └─▶ Phase 3 (US1 list)  🎯 MVP
                 └─▶ Phase 4 (US2 add — needs ResponsiveModal from Ph1)
                        ├─▶ Phase 5 (US3 set-default)
                        ├─▶ Phase 6 (US4 delete — needs the Ph2 guard)
                        └─▶ Phase 7 (US5 edit — needs the Ph4 form)
   Phase 8 (Polish) ── after all
```

### User Story Dependencies

- **US1** (list) — foundation; needs only the surfaces. **MVP.**
- **US2** (add) — needs the ResponsiveModal (Phase 1) + US1's list to append into.
- **US3** (set-default) — needs US1's rows; backend already exactly-one-safe.
- **US4** (delete) — needs US1's rows + the Phase 2 guard for the default-block backstop.
- **US5** (edit) — needs US2's form (reused, pre-filled) + US1's rows.

### Parallel Opportunities

- **Phase 1 ∥ Phase 2** — design-system and backend are independent.
- **Web ∥ Mobile within every story** — different files, different toolchains (e.g. T007–T011 ∥ T012–T016).
- All `[P]` test tasks alongside their implementation.

---

## Implementation Strategy

### MVP (Phase 1 + 2 + US1)

The shared modal, the backend guard, and the address **list** on both surfaces. That alone gives the
customer visibility of their saved addresses — the foundation. Stop and validate before the write actions.

### Incremental

1. **US1** — see the addresses. *(MVP)*
2. **US2** — add (the responsive form lands here).
3. **US3 / US4** — set-default and delete complete the P1 management loop.
4. **US5** — edit (reuses the US2 form pre-filled), the P2 finisher.

### Notes

- **Small backend footprint**: only Phase 2 touches Go — one guard + one error mapping + tests. Everything
  else is client + the one shared component.
- **No migration, no DTO/contract change** beyond the one 409 the clients already map.
- **Both surfaces at parity** — mirror the web and mobile tracks file-for-file per story.
