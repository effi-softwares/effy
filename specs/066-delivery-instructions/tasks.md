# Tasks: Customer Delivery Instructions

**Input**: Design documents from `specs/066-delivery-instructions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/delivery-instructions.md](contracts/delivery-instructions.md),
[quickstart.md](quickstart.md)

**Tests**: included. The quickstart names five negative proofs and two bypass/leak checks that need
tests to break.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md; setup, foundational and polish tasks carry none
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `CM_TEST` = `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile`
- `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`
- `DM_TEST` = `apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile`

---

## Phase 1: Setup

- [x] T001 Record the baseline in a "Baseline" section of `specs/066-delivery-instructions/quickstart.md`, measured BEFORE any change: reporting-package count from `pnpm -r typecheck`; test counts for `@effy/shared-types`, `@effy/edge-customer`, `@effy/edge-driver`, `@effy/edge-orders`, `@effy/customer-web`, `@effy/back-office`; `go test -short ./...` in `apis/core-api`; `:shared:testAndroidHostTest` for customer-mobile and driver-mobile; the customer-web `size` output per route; and the state of `contract:check`, `commerce-contract:check`, `driver-contract:check`
- [x] T002 Create the migration file with `make db-new name=delivery_instructions` (produces `db/migrations/<ts>_delivery_instructions.sql`)
- [x] T003 Confirm core-api's request logging does not log request bodies by reading `apis/core-api/internal/platform/logger/` and `apis/core-api/internal/platform/httpx/`; record the finding in `specs/066-delivery-instructions/research.md` under R7 (if bodies are logged, add a redaction task before T013)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the columns, the one validation rule in both languages, and the contracts.

**⚠ No user story work starts until this phase is complete.**

- [x] T004 Write the migration in `db/migrations/<ts>_delivery_instructions.sql` per data-model.md: `delivery_handover` + `delivery_note` on `public."order"`, `default_delivery_handover` + `default_delivery_note` on `public.customer_address`, each handover `CHECK (… IN ('leave_at_door','meet_at_door'))`, each note `CHECK (char_length(…) <= 250 AND btrim(…) <> '')`, `COMMENT`s stating NULL = none given and that the order columns are deliberately not inside `delivery_address`, and a Down dropping all four
- [x] T005 [P] Create `packages/shared-types/src/delivery-instructions.ts`: `HandoverPreference`, `HANDOVER_PREFERENCES`, `DELIVERY_NOTE_MAX = 250`, `DeliveryInstructionsDTO`, and `normaliseDeliveryInstructions` implementing research R3 (strip control characters except `\n`, collapse whitespace, trim, empty → null, count Unicode code points, refuse — never truncate — over the limit, refuse an unknown handover); export it from `packages/shared-types/src/index.ts`
- [x] T006 [P] Create the shared fixture `packages/shared-types/src/delivery-instructions.fixtures.json` (blank, whitespace-only, exactly 250, 251, an emoji as the 250th character, control characters, mixed whitespace and line breaks, unknown handover, both parts null) and the unit test `packages/shared-types/src/delivery-instructions.test.ts` that runs every case
- [x] T007 [P] Create the Go mirror `apis/core-api/internal/platform/deliveryinstructions/deliveryinstructions.go` (`Instructions{Handover, Note *string}`, `Normalise`, typed errors `ErrNoteTooLong`, `ErrHandoverInvalid`) and `deliveryinstructions_test.go` that reads the SAME fixture file from `packages/shared-types/src/` by relative path and fails if any case disagrees
- [x] T008 Add the contract fields per `contracts/delivery-instructions.md`: `deliveryInstructions?` on `CreateCheckoutIntentRequest` in `packages/shared-types/src/checkout.ts`; `deliveryInstructions` on the customer order DTO in `packages/shared-types/src/order.ts`; `defaultDeliveryInstructions` on `AddressDTO`, `CreateAddressRequest`, `UpdateAddressRequest` in `packages/shared-types/src/address.ts`; `deliveryInstructions` on the order detail DTO in `packages/shared-types/src/order-admin.ts`; `handover` on `DeliveryDropDTO` in `packages/shared-types/src/driver.ts` (depends on T005)
- [x] T009 Regenerate all three Kotlin contracts (`pnpm --filter @effy/shared-types contract:gen commerce-contract:gen driver-contract:gen`) and READ the generated enum and nullable fields in `packages/shared-types/contract/` and `packages/shared-types/contract-driver/` (depends on T008)
- [x] T010 Make every existing producer and consumer compile against the widened contracts with honest values (null where nothing is read yet): `apis/core-api/internal/features/orders/orders.go`, `apis/edge-api/customer/src/addresses/`, `apis/edge-api/orders/src/orders/service.ts`, `apis/edge-api/driver/src/work/delivery.ts`, `apps/customer-web/lib/addresses/`, `CM/features/addresses/data/AddressMappers.kt`, `CM/features/checkout/data/CheckoutMappers.kt`, `DM/features/delivery/data/HttpDeliveryRepository.kt`, so `pnpm -r typecheck`, `go build ./...` and both apps' `:shared:compileAndroidMain` pass (depends on T009)

**Checkpoint**: schema, rule and contracts exist; nothing user-visible.

---

## Phase 3: User Story 1 — Tell the driver how to deliver this order (P1) 🎯 MVP

**Goal**: a customer gives a handover preference and/or a note at checkout; it is stored with the
order and shown back on the confirmation and the order page, on web and mobile.

**Independent test**: quickstart W1–W4.

### Tests for User Story 1

- [x] T011 [P] [US1] Container test `apis/core-api/internal/features/checkout/delivery_instructions_container_test.go` against every migration: intent with instructions writes both columns normalised; intent with the field absent writes NULL/NULL; a second intent replaces the first; a 251-character note and an unknown handover are refused and write nothing (SC-009)
- [x] T012 [P] [US1] Unit test in `apis/core-api/internal/features/checkout/service_test.go`: the validation error names the field and the rule and does NOT contain the submitted text (FR-028)
- [x] T013 [P] [US1] Web test `apps/customer-web/app/checkout/DeliveryInstructions.test.tsx`: chips toggle and can be unselected; the counter shows remaining characters and input stops at the limit counted in code points; whitespace-only yields no instructions; a note containing `<script>`, an `<a>` and a `javascript:` URL renders as literal text and creates no element (SC-006)
- [x] T014 [P] [US1] Mobile test `CM_TEST/features/checkout/DeliveryInstructionsDraftTest.kt`: the draft normalises, enforces the limit and maps to the intent request; no commas in backtick test names

### Implementation for User Story 1

- [x] T015 [US1] Accept `deliveryInstructions` in the intent request struct in `apis/core-api/internal/features/checkout/handler.go`, pass it through the service input in `service.go`, normalise it with `deliveryinstructions.Normalise`, and map its errors to a 422 field error that never echoes the value (depends on T007)
- [x] T016 [US1] Add `SetOrderDeliveryInstructions(ctx, orderID, handover, note *string)` to the `Store` interface and `pgStore` in `apis/core-api/internal/features/checkout/store.go`, mirroring `SetOrderBilling`, and call it from the intent flow in `service.go` right after the pending order is upserted, so each intent rewrites it (depends on T004, T015)
- [x] T017 [US1] Return `deliveryInstructions` from the customer order reads in `apis/core-api/internal/features/orders/orders.go` (select both columns; `null` when both are NULL) and extend `orders_test.go`
- [x] T018 [P] [US1] Build `apps/customer-web/app/checkout/DeliveryInstructions.tsx`: a sectioned row (no card) with two choice chips, a plain `<textarea>` with a remaining-characters counter, using `normaliseDeliveryInstructions`; rendered text only, no `dangerouslySetInnerHTML`
- [x] T019 [US1] Hold the draft in `apps/customer-web/app/checkout/CheckoutFlow.tsx`, keep it across steps and a failed payment (FR-006), and send it on the intent call; surface a 422 on the field
- [x] T020 [P] [US1] Show the instructions on the confirmation and order page in `apps/customer-web/components/receipt/ReceiptDocument.tsx` (and `apps/customer-web/components/OrderAddresses.tsx` if that is where the delivery block renders): nothing at all when null (SC-003); extend `ReceiptDocument.test.tsx`
- [x] T021 [P] [US1] Add the draft to the domain in `CM/features/checkout/domain/Checkout.kt`, map it in `CM/features/checkout/data/CheckoutMappers.kt` and send it from `CM/features/checkout/data/HttpCheckoutRepository.kt`
- [x] T022 [US1] Add the control to `CM/features/checkout/presentation/CheckoutScreen.kt` and its state to `CheckoutViewModel.kt` (chips, text field with counter, 48 dp targets, survives a failed payment)
- [x] T023 [P] [US1] Show the instructions on `CM/features/checkout/presentation/ReceiptScreen.kt`; nothing when null

**Checkpoint**: US1 works alone — instructions can be given, are stored, and are shown back to the
customer on both surfaces.

---

## Phase 4: User Story 2 — The driver reads the instructions before the door (P1)

**Goal**: the assigned driver sees the note on three screens and is told the handover preference in
words; "leave at the door" leads into the existing unattended-photo proof.

**Independent test**: quickstart W5, W6.

### Tests for User Story 2

- [x] T024 [P] [US2] Container test `apis/edge-api/driver/src/work/drop-instructions.container.test.ts` against the real migrations: a drop for an order with a note and `leave_at_door` returns `instructions` = the note verbatim and `handover`; an order with neither returns null/null; another driver is refused identically to a nonexistent drop (FR-022)
- [x] T025 [P] [US2] Mobile test `DM_TEST/features/delivery/HandoverTest.kt`: wire → domain mapping of `handover`, the sentence shown for each value, and that no value removes a proof option (FR-020)

### Implementation for User Story 2

- [x] T026 [US2] In `deliveryDrop` in `apis/edge-api/driver/src/work/delivery.ts`, select `o.delivery_note` and `o.delivery_handover`, return them as `instructions` and `handover`, and replace the "ALWAYS NULL" comment with one saying where the value now comes from (depends on T004)
- [x] T027 [P] [US2] Add `handover` to `Drop` in `DM/features/delivery/domain/Delivery.kt` (a `Handover` enum: `LeaveAtDoor`, `MeetAtDoor`, with its driver-facing sentence) and map it in `DM/features/delivery/data/HttpDeliveryRepository.kt`
- [x] T028 [US2] Show the handover sentence beside the existing `InstructionCallout` on `DM/features/delivery/presentation/EnRouteScreen.kt`, `ArrivedScreen.kt` and the drop detail in `DeliveryScreens.kt`; render nothing when both note and handover are absent (FR-021)
- [x] T029 [US2] In the proof chooser in `DM/features/delivery/presentation/ProofScreens.kt`, when the handover is `LeaveAtDoor` list "Leave at door" first with "The customer asked for this"; when `MeetAtDoor` show "The customer wants to receive this in person"; disable nothing (research R6)

**Checkpoint**: US1 + US2 — a note typed at checkout appears on the driver's three screens.

---

## Phase 5: User Story 3 — Save instructions on an address (P2)

**Goal**: an address carries default instructions; checkout prefills from them; an order can
override without changing the default.

**Independent test**: quickstart W7, W8.

### Tests for User Story 3

- [x] T030 [P] [US3] Extend `apis/edge-api/customer/src/addresses/service.test.ts`: create and update validate with the shared rule; an update with the key ABSENT leaves the default unchanged; with `null` clears it; with a value replaces it; the 422 never echoes the value
- [x] T031 [P] [US3] Container test `apis/edge-api/customer/src/addresses/repo.container.test.ts` against the real migrations: round-trip of both columns; the clear case; the database CHECK refuses 251 characters even if the service is bypassed
- [x] T032 [P] [US3] Web test `apps/customer-web/app/checkout/CheckoutFlow.instructions.test.tsx`: selecting an address prefills its default; editing does not PATCH the address; ticking "save to this address" PATCHes after a successful intent; switching address replaces the draft with the new address's default, edited or not (FR-015)
- [x] T033 [P] [US3] Mobile test `CM_TEST/features/checkout/InstructionsPrefillTest.kt`: the same four behaviours in the ViewModel

### Implementation for User Story 3

- [x] T034 [US3] Add the two columns to the row type and DTO mapping in `apis/edge-api/customer/src/addresses/model.ts`, to the SELECT/INSERT/UPDATE in `repo.ts` (update keyed on the PRESENCE of each field, not `COALESCE`), validation via `normaliseDeliveryInstructions` in `service.ts`, and the request parsing in `http.ts`
- [x] T035 [P] [US3] Add the default-instructions fields to `apps/customer-web/app/(account)/addresses/_components/AddressForm.tsx` (reusing `DeliveryInstructions.tsx`) and to `apps/customer-web/lib/addresses/{model,repo}.ts`
- [x] T036 [US3] In `apps/customer-web/app/checkout/CheckoutFlow.tsx` and `AddressPicker.tsx`: set the draft from the selected address's default, track `edited`, replace on address switch, and add the "Save to this address" checkbox that PATCHes after a successful intent
- [x] T037 [P] [US3] Add the fields to `CM/features/addresses/domain/AddressBook.kt`, `data/AddressMappers.kt`, `data/HttpAddressRepository.kt`, and the form in `presentation/AddressFormSheet.kt` + `AddressFormLogic.kt`
- [x] T038 [US3] Prefill, override and "save to this address" in `CM/features/checkout/presentation/CheckoutViewModel.kt` and `CheckoutScreen.kt`

**Checkpoint**: a customer with a saved default completes checkout without retyping.

---

## Phase 6: User Story 4 — A placed order keeps what was said (P2)

**Goal**: prove an address edit or delete moves no placed order.

**Independent test**: quickstart W9.

- [x] T039 [P] [US4] Extend `apis/core-api/internal/features/checkout/delivery_instructions_container_test.go`: after the order is paid, changing `customer_address.default_delivery_note` and then deleting the address leaves the order's two columns untouched; and an intent that sends NO instructions for an address that HAS a default stores NULL/NULL (the server never reads the default — research R4)
- [x] T040 [P] [US4] Source guard `apis/core-api/internal/features/checkout/delivery_instructions_guard_test.go`: fail naming the file if any non-test Go file under `internal/features/checkout` or `internal/features/orders` references `default_delivery_note` or `default_delivery_handover`

**Checkpoint**: US4 holds by construction and is pinned.

---

## Phase 7: User Story 5 — Staff see what the customer asked for (P3)

**Goal**: back-office order detail shows the instructions.

**Independent test**: quickstart W10.

- [x] T041 [P] [US5] Extend `apis/edge-api/orders/src/orders/repository.container.test.ts` and `service.test.ts`: the order detail returns `deliveryInstructions`, null when none; a `csa` can read it
- [x] T042 [US5] Select both columns in `apis/edge-api/orders/src/orders/repository.ts` and map them in `service.ts`
- [x] T043 [US5] Show them under the delivery address in `apps/back-office/src/features/orders/OrderDetailScreen.tsx` as a detail row (text node only; nothing when null), with a test in `apps/back-office/src/features/orders/` rendering the markup-injection note as literal text

**Checkpoint**: all five stories work.

---

## Phase 8: Polish & cross-cutting

- [x] T044 [P] Prohibition guard `apis/edge-api/shared/src/delivery-instructions.guard.test.ts`: read every non-test `.ts` under `apis/edge-api/shop/src` and `apis/edge-api/notifications/src` and fail naming any file containing `delivery_note` or `delivery_handover` (FR-025, FR-027)
- [x] T045 [P] Declare `checkout_delivery_instructions_set` (`handover`, `hasNote`, `fromSavedDefault`) in the typed taxonomy: `apps/customer-web/lib/telemetry.ts` (fired through a DYNAMIC import so the guest bundle does not move — 027's lesson), the customer-mobile `AnalyticsEvent`, and `docs/telemetry/commerce-events.md`; assert in a test that no property is sourced from the note
- [x] T046 [P] Accessibility pass: chips expose selected state and a group label, the counter is announced politely, and the driver's handover sentence is included in each screen's spoken content — `apps/customer-web/app/checkout/DeliveryInstructions.tsx`, `CM/features/checkout/presentation/CheckoutScreen.kt`, `DM/features/delivery/presentation/ArrivedScreen.kt`
- [x] T047 Run the five negative proofs in `specs/066-delivery-instructions/quickstart.md` §5 by breaking each thing in turn; record which test caught each
- [x] T048 Full verification sweep: everything in `quickstart.md` §1, with reporting-package counts and bundle sizes compared to T001; `storefront-locks`; `cm-guard`; `mobile-guard`
- [x] T049 [P] Update the parity registers `docs/audiences/customer-capabilities.md` §066 and `docs/audiences/driver-capabilities.md` §066; write `specs/066-delivery-instructions/SIGNOFF.md`; add the 066 entry to `FEATURE-HISTORY.md` and its line to the index in `CLAUDE.md`; update the R4a row of `docs/prd/2026-10-client-feedback-prd.md` if the PRD tracks status
- [ ] T050 OPERATOR: deploy in the order given in `specs/066-delivery-instructions/quickstart.md` §2 — `db-up`, then `core-deploy` BEFORE pushing customer-web, then `edge-deploy` for `customer`, `orders`, `driver`
- [ ] T051 OPERATOR: walk W1–W13 and run the two checks in §4 of `specs/066-delivery-instructions/quickstart.md` (the 251-character `curl` and the sentinel-note log sweep); record results in `SIGNOFF.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → user stories → **Polish (8)**.
- In Phase 2: T005 → T008 → T009 → T010; T004, T006, T007 alongside.

### User story dependencies

- **US1** needs Phase 2 only.
- **US2** needs Phase 2 for its server half. To see a real note on a driver screen it needs US1's
  T015–T016 (something has to write the order's columns); its own tests seed the columns directly.
- **US3** needs US1's checkout control (T018, T019, T021, T022), which it prefills.
- **US4** needs US1's T016 and US3's T034 (there must be a default to change).
- **US5** needs Phase 2 only; its tests seed the columns.

### Parallel opportunities

- Phase 2: T004, T005, T006, T007 together.
- US1: T011–T014 together; then hot path T015 → T016 → T017 while web (T018 → T019, T020) and mobile
  (T021 → T022, T023) proceed side by side.
- US2 and US5 can run alongside US1 once Phase 2 is done.
- US3: T030–T033 together; T035 and T037 alongside T034.
- Polish: T044, T045, T046, T049 together.

## Parallel example: User Story 1

```text
Together:  T011 Go container test · T012 Go unit test · T013 web test · T014 mobile test
Then:      T015 → T016 → T017 (hot path)
Alongside: T018 → T019, T020 (web)   and   T021 → T022, T023 (mobile)
```

## Implementation strategy

### MVP (US1 + US2)

Phases 1–4. US1 alone stores instructions nobody acts on, which is worse than not asking. The
smallest thing worth shipping is the pair: a customer says it and the driver reads it.

### Incremental delivery

1. Phases 1–2: foundation.
2. US1 + US2: demo W1–W6.
3. US3: saved defaults. Demo W7, W8.
4. US4, US5: proofs and the staff view. Demo W9, W10.
5. Polish, then the operator deploy and walks.

## Notes

- **Deviations are recorded in [SIGNOFF.md](SIGNOFF.md)**: optional contract fields, 400 not 422, no
  separate handler test (T012) or web address-form test (T035), and no third copy of the rule on mobile.

- T016 is where "at placement" is decided; T039 is what proves the server never reads a saved
  default.
- T044 is the test that keeps the text away from shops and emails for good. It must be seen to fail
  under its negative proof (T047).
- A test task is done when the test has been seen to fail without the implementation.
- No commit is made by the implementer; the operator commits.
