# Tasks: Checkout Shipping & Billing Addresses

**Feature**: 023-checkout-shipping-billing · **Date**: 2026-07-22
**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different file, no dependency on an incomplete task)
- **[US#]** — the user story this task serves (user-story phases only)
- **🧑‍💻** — OPERATOR-RUN. Claude authors; the operator runs anything touching AWS, the DB, or live state.

## Path Conventions

- Backend (hot path): `apis/core-api/internal/features/{checkout,orders}/`
- Shop guard (cold path): `apis/edge-api/shop/src/fulfillments/`
- Shared DTOs: `packages/shared-types/src/` (+ generated `contract/CommerceDto.kt`)
- Web: `apps/customer-web/app/checkout/` + `app/(account)/orders/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/`

> ✅ **Reuses 022 + 021.** Checkout reads the 022 Address Book (`/customer/v1/addresses`) and reuses its
> `ResponsiveModal` + saved-address list; re-pricing on a shipping change is 021. `delivery_address` stays
> the **shipping** snapshot (not renamed). Billing is **one nullable column**; `NULL` = "same as shipping".
> The shop boundary (FR-018) holds by column separation — 020's amendment is a **guard test**, not a change.

---

## Phase 1: Setup (schema + shared contracts) — blocking

- [x] T001 Add the migration `db/migrations/<ts>_order_billing_address.sql`: `ALTER TABLE public."order" ADD COLUMN billing_address jsonb;` + `COMMENT ON COLUMN` per [data-model.md](./data-model.md) (nullable; NULL = same as shipping; never exposed to the shop). Use `make db-new NAME=order_billing_address` for the timestamp.
- [x] T002 [P] Add the DTO fields in `packages/shared-types/src/`: `OrderDTO.billingAddress?: OrderAddressDTO | null` in `order.ts`; `CreateCheckoutIntentRequest.billingAddressId?: string | null` in `checkout.ts` (reuse `OrderAddressDTO` for both; document null = "same as shipping")
- [x] T003 Regenerate the Kotlin contract (`pnpm --filter @effy/shared-types commerce-contract:gen`) → `packages/shared-types/contract/CommerceDto.kt`; confirm the drift guard passes

**Checkpoint**: `pnpm -r typecheck` green; the column + DTO fields exist; contract drift-clean.

---

## Phase 2: Foundational (hot-path billing snapshot write) — blocking for US4/US5/US6

**⚠ US4's UI sends `billingAddressId`; the backend must snapshot it. US1–US3 (shipping picker) do NOT
depend on this phase — they build on the existing shipping snapshot and can proceed after Phase 1.**

- [x] T004 In `apis/core-api/internal/features/checkout/store.go`: extend the order INSERT/UPDATE to carry `billing_address` ($n::jsonb, nullable); add a billing snapshot read (reuse `AddressSnapshot` for the billing id) so the pending order records billing when divergent
- [x] T005 In `apis/core-api/internal/features/checkout/service.go`: add `IntentInput.BillingAddressID string`; in `CreateCheckoutIntent`, when `BillingAddressID` is set, valid, and **≠ AddressID**, snapshot it into `billing_address`; otherwise write `NULL` (same as shipping). Billing never affects the amount/quote
- [x] T006 [P] Go tests in `apis/core-api/internal/features/checkout/*_test.go`: billing same-as → `NULL`; divergent → snapshot stored; `BillingAddressID` equal to `AddressID` → `NULL`; invalid/foreign billing id → validation error (customer-scoped)

**Checkpoint**: `go build ./... && go vet ./... && go test ./...` green; the order records billing correctly.

---

## Phase 3: User Story 1 — Checkout pre-selects my default address (P1) 🎯 MVP

**Goal**: Checkout reads the customer's saved addresses and pre-selects the default as the shipping
address; no saved address → prompt to add. Both surfaces.

**Independent Test**: Signed-in customer with ≥1 saved address (one default) opens checkout → the default
is pre-selected and shown; reach pay without touching the address (SC-001).

### Web

- [x] T007 [P] [US1] In `apps/customer-web/app/checkout/page.tsx`: the server-side read already lists addresses via edge (`/customer/v1/addresses`); pass the full list (not just for the old form) to `CheckoutFlow` and mark the default
- [x] T008 [US1] Build `apps/customer-web/app/checkout/AddressPicker.tsx` (selected-address summary + a **list** of saved addresses, default marked, **no cards** — FR-022) and wire it into `CheckoutFlow.tsx`, pre-selecting the default as the shipping address; empty list → an "add an address" prompt that blocks pay (FR-007)
- [x] T009 [P] [US1] Web tests `apps/customer-web/app/checkout/*.test.tsx`: default pre-selected; no-address → prompt + pay blocked; deterministic selection when none is default (FR-002)

### Mobile

- [x] T010 [P] [US1] In `features/checkout/presentation/CheckoutViewModel.kt`: load the saved addresses (edge address repo, reuse 022's) into immutable UiState; pre-select the default as the shipping address
- [x] T011 [US1] In `features/checkout/presentation/CheckoutScreen.kt`: the shipping-address section shows the selected address (summary row, not a card); empty → prompt that blocks pay
- [x] T012 [P] [US1] `commonTest` ViewModel tests: default pre-selected; no-address → blocked; deterministic when none default

**Checkpoint**: Checkout pre-selects the default on both surfaces. **MVP.**

---

## Phase 4: User Story 2 — Change the shipping address at checkout (P1)

**Goal**: A picker over saved addresses switches the shipping address; delivery/amount re-price for the new
destination before pay; the default is unchanged.

**Independent Test**: At checkout with ≥2 addresses, open the picker, select a non-default → it becomes the
shipping address and delivery/amount reflect it; the saved default is unchanged (SC-002).

### Web

- [x] T013 [US2] In `AddressPicker.tsx` / `CheckoutFlow.tsx`: opening the picker lists saved addresses; selecting one sets the shipping address and triggers the existing 021 re-quote (delivery options + amount) before pay (FR-005); selection is per-order (does not change the saved default, FR-006)
- [x] T014 [P] [US2] Web tests: switch → shipping + amount reflect new destination; re-quote fired; default unchanged

### Mobile

- [x] T015 [US2] In `CheckoutScreen.kt` / `CheckoutViewModel.kt`: a picker (bottom sheet/list) switches the shipping address and re-quotes; per-order only
- [x] T016 [P] [US2] `commonTest`: switch re-prices; default unchanged

**Checkpoint**: The customer can ship to any saved address.

---

## Phase 5: User Story 3 — Enter a new address during checkout (P1)

**Goal**: "Add a new address" at checkout opens the 022 responsive form; the new address is saved to the
book and selected — no navigation away.

**Independent Test**: At checkout, add a new address via the responsive form (dialog/drawer web; bottom
sheet mobile) → saved to the book, selected as shipping, present in the account Address Book afterwards
(SC-003).

### Web

- [x] T017 [US3] In `AddressPicker.tsx`: an "add a new address" action opens the shared `@effy/design-system/ui` `ResponsiveModal` add form (reuse the 022 `AddressFormModal`); on success `POST /customer/v1/addresses` (via the existing `/api/addresses` proxy), then select the returned address as shipping (`makeDefault` false — a one-off add does not change the default)
- [x] T018 [P] [US3] Web tests: add-new appears + selected; invalid keeps input (SC-009 no-save-on-dismiss); new address present in a subsequent list read

### Mobile

- [x] T019 [US3] In `CheckoutScreen.kt`: an "add address" action raises the bottom-sheet form (reuse the 022 mobile add form); create via the edge address repo, then select
- [x] T020 [P] [US3] `commonTest`: add-new selected; validation; dismiss saves nothing

**Checkpoint**: US1–US3 = a full shipping-address experience on both surfaces.

---

## Phase 6: User Story 4 — Billing defaults to shipping, can differ (P1)

**Goal**: A "Billing same as shipping" toggle (ON by default); OFF reveals a billing picker/add-new; the
intent sends `billingAddressId` only when diverged. (Backend snapshot is Phase 2.)

**Independent Test**: Toggle ON → place → `billing_address IS NULL`. Toggle OFF + different address → place
→ distinct `billing_address`; toggle back ON discards it (SC-004, SC-005, FR-013).

### Web

- [x] T021 [US4] Build `apps/customer-web/app/checkout/BillingSection.tsx`: a "Billing address same as shipping" toggle (ON by default); OFF reveals the same picker + add-new as shipping (reuse `AddressPicker`); the intent sends `billingAddressId` only when OFF and the chosen billing ≠ shipping; ON or equal → omit it (FR-009–FR-013); block pay when OFF with no billing chosen (FR-012)
- [x] T022 [P] [US4] Web tests: default ON → no `billingAddressId`; diverge → sent; OFF+none → pay blocked; toggle-back-ON discards the divergent selection

### Mobile

- [x] T023 [US4] In `CheckoutScreen.kt` / `CheckoutViewModel.kt`: the "same as shipping" toggle + billing picker/add-new; same send/omit rules; block pay when OFF with no billing
- [x] T024 [P] [US4] `commonTest`: same-as omits; diverge sends; toggle-back discards; pay-blocked

**Checkpoint**: Orders carry a correct billing address (NULL when same, snapshot when diverged).

---

## Phase 7: User Story 5 — Receipt & history show both addresses (P2)

**Goal**: The receipt/history show shipping in full and billing in full when different; "Billing: same as
shipping" when identical.

**Independent Test**: Place same-billing → receipt reads "Billing: same as shipping". Place divergent →
both shown in full. Editing/deleting the saved address later leaves the order unchanged (SC-005, SC-006).

### Backend

- [x] T025 [US5] In `apis/core-api/internal/features/orders/orders.go` + `handler.go`: select `billing_address` and map `OrderDTO.billingAddress` (null when the column is NULL → the client renders "same as shipping"); do NOT COALESCE server-side (the client needs to know it was "same")
- [x] T026 [P] [US5] `apis/core-api/internal/features/orders/orders_test.go`: receipt returns `billingAddress: null` for same-as orders and the snapshot for divergent; immutability after a saved-address change

### Web + Mobile

- [x] T027 [US5] Web: `app/(account)/orders/[id]/page.tsx` + `app/checkout/complete/page.tsx` show the shipping address in full and billing in full when non-null, else "Billing: same as shipping" (FR-016)
- [x] T028 [P] [US5] Web tests: same-as text vs both-shown; immutability rendering
- [x] T029 [US5] Mobile: the receipt screen + `CheckoutMappers.kt` render both / "same as shipping"
- [x] T030 [P] [US5] `commonTest`: same-as vs divergent receipt mapping

**Checkpoint**: Full CRUD-of-record — both addresses on every receipt.

---

## Phase 8: User Story 6 — Shop sees shipping only, never billing (P1)

**Goal**: Lock FR-018 — billing never reaches any shop surface/API. The design already excludes it (the
shop selects only `delivery_address`); this phase proves and documents it.

**Independent Test**: For a divergent-billing order, the shop fulfilment API/UI shows the shipping address
and the billing address appears **zero** times (SC-007).

- [x] T031 [US6] Add `apis/edge-api/shop/src/fulfillments/no-billing.guard.test.ts`: assert the shop fulfilment SQL (`repository.ts`) and the fulfilment DTOs/mappers contain no reference to `billing` (grep the module source / assert the mapped payload has no billing key), and that `delivery_address` (shipping) IS mapped — locking FR-018 structurally
- [x] T032 [US6] Record the **020 amendment** in `specs/020-shop-order-fulfillment/` (a note: the order now carries shipping + billing; the shop is restricted to shipping by column separation + the guard) and in the shop parity register `docs/audiences/shop-capabilities.md`

**Checkpoint**: The billing/shop boundary is enforced and proven.

---

## Phase 9: Polish & Cross-Cutting

- [x] T033 [P] Add checkout PostHog events to `apps/customer-web/lib/telemetry.ts`: `checkout_address_changed`, `checkout_address_added`, `checkout_billing_diverged` — **no address fields** (SC-009); document in `docs/telemetry/commerce-events.md`
- [x] T034 [P] Update the parity register `docs/audiences/customer-capabilities.md` §023 (pre-select / switch / add-new / billing / receipt-both, both surfaces)
- [x] T035 Full sweep per [quickstart.md](./quickstart.md) §1: `pnpm -r typecheck` + shared-types build (regen) + customer-web Vitest + `pnpm --filter @effy/edge-shop test` (the guard) + `go build/vet/test` + `./gradlew :shared:allTests` + `pnpm turbo build` + contract drift guard
- [x] T036 🧑‍💻 Commit the migration (003 commit-guard) + `make db-up ENV=dev`; `make core-run` + the two surfaces; walk SC-001…SC-009 in [quickstart.md](./quickstart.md) §4, incl. the **shop no-leak proof** (SC-007) and the same-as-vs-divergent billing logic
- [x] T037 🧑‍💻 Sign off: parity registers (customer §023 + shop 020 amendment) + commit spec/plan/research/data-model/contracts/quickstart/tasks **alongside** the code + migration

---

## Dependencies & Execution Order

```
Phase 1 (migration + DTOs + regen) ─── blocks everything
   ├─▶ Phase 2 (backend billing snapshot) ─── blocks US4, US5-backend, US6-live
   ├─▶ Phase 3 (US1 pre-select)  🎯 MVP ─┐
   │        └─▶ Phase 4 (US2 switch) ────┤ shipping picker stack (US1→US2→US3), web ∥ mobile
   │                └─▶ Phase 5 (US3 add-new — needs the 022 ResponsiveModal)
   ├─▶ Phase 6 (US4 billing — needs Ph2 backend + Ph3 picker to reuse)
   ├─▶ Phase 7 (US5 receipt — needs Ph1 DTO; backend T025 + clients)
   └─▶ Phase 8 (US6 guard — needs Ph1 column; independent of the UI)
Phase 9 (Polish) ── after all
```

### User Story Dependencies

- **US1** (pre-select) — needs Phase 1 only; the shipping picker foundation. **MVP.**
- **US2** (switch) — needs US1's picker + 021 re-quote.
- **US3** (add-new) — needs US1's picker + the 022 ResponsiveModal/mobile form.
- **US4** (billing) — needs Phase 2 backend + US1–US3's picker (reused for billing).
- **US5** (receipt) — needs Phase 1 DTO; backend T025 + the client receipts.
- **US6** (shop no-leak) — needs Phase 1 column only; independent of all UI.

### Parallel Opportunities

- **Phase 2 ∥ Phase 3** — the backend billing spine and the shipping picker are independent after Phase 1.
- **Web ∥ Mobile within every story** — different files, different toolchains.
- **US6 (guard) ∥ everything** after Phase 1 — it's a static assertion + a doc note.
- All `[P]` test tasks alongside their implementation.

---

## Implementation Strategy

### MVP (Phase 1 + US1)

The migration/DTOs plus checkout pre-selecting the default shipping address on both surfaces — the
everyday friction removed. Stop and validate before the switch/add-new/billing work.

### Incremental

1. **US1** — pre-select the default. *(MVP)*
2. **US2 / US3** — switch + add-new complete the shipping experience.
3. **US4** — billing (the "same as shipping" toggle; backend snapshot from Phase 2).
4. **US5** — receipts show both.
5. **US6** — lock the shop/billing boundary (guard + 020 amendment).

### Notes

- **Small, sharp backend**: one migration column, ~2 checkout files, the orders receipt DTO, one shop guard
  test. No new library, no Principle-III exception.
- **`delivery_address` stays shipping** — no rename, so 019/020/021 readers are untouched for shipping.
- **Billing = NULL when same** — the receipt "same as shipping" text and the toggle-back-discard both fall
  out of the representation.
- **Both surfaces at parity** — mirror the web and mobile tracks file-for-file per story.
