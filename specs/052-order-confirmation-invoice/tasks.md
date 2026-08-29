---
description: "Task list for 052 — Order Confirmation & Emailed Receipt"
---

# Tasks: Order Confirmation & Emailed Receipt

**Input**: Design documents from `/specs/052-order-confirmation-invoice/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/receipt.contract.md](./contracts/receipt.contract.md) ·
[quickstart.md](./quickstart.md)

**Design canvas**: https://claude.ai/code/artifact/b00826d5-9d64-45ae-b58b-96fb5d904f6e

**Tests**: INCLUDED, and not as a default. Nine of the fifteen success criteria are *mechanical
proofs* (SC-002 reconciliation, SC-004 exactly-once, SC-008 uniform refusal, SC-010 the palette never
becoming a token, SC-011 no fulfilment structure, SC-012 no fabricated identifier). Each is a test
task below. Where a criterion needs a person — a mail client, a screen reader, five observers — it is
an operator walk in Phase 9, not a test.

**Organization**: by user story, so each can be built and demonstrated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different file, no dependency on an incomplete task
- **[Story]**: US1–US5 from spec.md
- 🧑‍💻 = operator-run (CLAUDE.md § Mode of work): deploys, migrations, anything touching live AWS

---

## Phase 1: Setup

**Purpose**: establish a trustworthy baseline before changing anything.

- [X] T001 Record the baseline: run `cd apis/core-api && go build ./... && go vet ./... && go test ./...`, then `pnpm -r typecheck` and `pnpm -r test` from the repo root, and write the passing package/test COUNTS into `specs/052-order-confirmation-invoice/quickstart.md` under a new "Baseline" heading. ⚠ Counting matters, not just the exit code — 029 shipped with a green `pnpm -r test` and a FAILING typecheck because vitest does not run `tsc`, and the only visible signal was the reporting-package count dropping 12 → 11.
- [X] T002 [P] Record the current bundle and token baselines: `pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size`, `pnpm --filter @effy/design-system tokens:check`, `make cm-tokens-check`, `make email-check`. Append the results to the same "Baseline" heading.
- [X] T003 [P] Confirm `/checkout/complete` is absent from the gated route list in `apps/customer-web/scripts/bundle-budget.mjs` and add a one-line comment there recording that it is deliberately excluded (authenticated, outside the `(shop)` quarantine — research R7), so a later contributor does not "fix" the omission.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the ONE canonical receipt fact set (FR-001). Every surface renders from it, so no story
can start until it exists.

**⚠️ CRITICAL**: no user-story work begins until this phase is complete.

### Data

- [X] T004 Author the forward-only migration `db/migrations/<timestamp>_order_receipt.sql` implementing data-model.md §1 and §2: three nullable `method_*` columns on `public.payment`, the `public.receipt_dispatch` table, and its three indexes. Include `COMMENT ON` for every table and column (house style) and the dev-only single-step down. ⚠ `method_type` gets NO `CHECK` constraint — a closed constraint would turn an unrecognised provider method into a failed write on a paid order.
- [X] T005 Verify the migration's exactly-once guarantee is in the SCHEMA, not the code: confirm `receipt_dispatch_auto_uq` is a PARTIAL unique index on `(order_id) WHERE reason = 'order_paid'`, leaving `customer_request` rows unconstrained so a resend stays representable (research R2).

### Shared contracts

- [X] T006 Extend `packages/shared-types/src/order.ts` per contracts/receipt.contract.md §1: add `imageUrl` to `OrderItemDTO`; add `OrderStage`, `PaymentMethodSummaryDTO`, `DeliveryPromiseDTO`; add `stage`, `paymentMethod`, `deliveryPromises` to `OrderDTO`. ⚠ Add NO field that names a shop, a distance or a ring (FR-009).
- [X] T007 Regenerate the mobile contract DTOs so `apps/customer-mobile/.../commerce/contract/CommerceDto.kt` picks the new fields up from the shared source, and run `make cm-contract-check` to prove no drift. ⚠ Do NOT hand-write a Kotlin type for `OrderStage` — 027 R13 is the precedent where a hand-shaped mobile type silently broke every write while 100 tests passed.

### Hot path — the read model

- [X] T008 [P] Create `apis/core-api/internal/features/orders/stage.go`: a PURE function mapping all of an order's `shop_fulfillment.status` values to one `OrderStage`, per research R5's table. No database access, no dependencies.
- [X] T009 [P] Write `apis/core-api/internal/features/orders/stage_test.go` covering the rollup table, and one case that pins the rule explicitly: a two-portion order with one `delivered` and one `picking` MUST be `packing`. ⚠ It is a ROLLUP, NOT A MAX — the customer has not received their order.
- [X] T010 Extend `apis/core-api/internal/features/orders/orders.go`: `LEFT JOIN public.product_media` (primary only) for the line image, read `method`/`promised_from`/`promised_to` from `public.order_package_delivery`, and read `payment.method_*`. Presign the image like every other product image.
- [X] T011 Assemble the new fields in the orders service and handler in `apis/core-api/internal/features/orders/` — calling `stage.go` for `stage`, aggregating `deliveryPromises` over packages WITHOUT emitting any shop reference, and omitting `paymentMethod` when the columns are NULL.
- [X] T012 [P] Write `apis/core-api/internal/features/orders/orders_test.go` additions asserting the response key-set against `contracts/receipt.contract.md` — not against the Go struct. ⚠ 033 wrote that expectation from its own struct and the test passed while the contract was violated; the assertion must be able to fail.

### Hot path — capturing how it was paid

- [X] T013 In `apis/core-api/internal/features/checkout/`, add a Stripe read of the PaymentIntent with `latest_charge.payment_method_details` expanded, mapping the provider's method to Effy's own family (`card` | `wallet` | `pay_over_time` | `other`).
- [X] T014 Call T013 from `apis/core-api/internal/features/checkout/store.go` **AFTER the finalize transaction commits**, best-effort, writing `payment.method_*`. ⚠ NOT inside the transaction: the webhook's `latest_charge` is an id string so this needs a network round trip, and 027 already recorded the finalize path timing out at ~14 Sydney round trips. A Stripe hiccup must never strand a paid order.
- [X] T015 [P] Write a test proving a FAILING method capture leaves the order `paid` and the finalize outcome unchanged (SC-015's sibling, and the reason T014 sits outside the transaction).

**Checkpoint**: the canonical fact set exists and is served. All user stories can now proceed.

---

## Phase 3: User Story 1 — The web receipt (Priority: P1) 🎯 MVP

**Goal**: a shopper who pays on the web lands on a document-grade receipt carrying every fact in
FR-002, with totals that reconcile to the amount charged.

**Independent Test**: complete a paid order on customer-web; the completion page renders every
element of FR-002 from the platform's own record, and the lines add up to what Stripe charged.

- [X] T016 [P] [US1] Create the bounded status palette as ONE component-local constant in `apps/customer-web/app/checkout/_components/status-palette.ts`: the four light/dark pairs from the design canvas. ⚠ It MUST NOT enter `packages/design-system/src/tokens.css`, and its only use is a status indicator — never a page accent, fill, border or body-text colour (plan § Complexity Tracking).
- [X] T017 [P] [US1] Build the shared receipt pieces in `apps/customer-web/components/receipt/`: `StatusPill` (tinted pill + coloured dot + RAMP-coloured label), `ProgressTrack`, `LineItemRow`, `TotalsBlock`, `SellerIdentity`. ⚠ The hue is NEVER text — that is what keeps `--success` inside its constitutional bound (no `-foreground` pair; 4.00:1 clears 3:1 for a non-text indicator and fails 4.5:1 for text).
- [X] T018 [US1] Rewrite `apps/customer-web/app/checkout/complete/page.tsx` to the design canvas: the `container` utility (FR-018a, research R12) with a two-column desktop layout — document left, rail right — collapsing to one column on small screens. Render unit price per line, the image, the reconciling totals, the payment method, the promise, the stage and the addresses.
- [X] T019 [US1] Preserve the existing gate EXACTLY: `completionState`/`mayClearCart` in `apps/checkout/complete/state.ts` still decide whether a receipt renders and whether the basket may be cleared. ⚠ An unpaid order is not a receipt and MUST NOT empty a basket (FR-017) — the redesign must not reopen the abandoned-at-Klarna defect this logic exists to prevent.
- [X] T020 [US1] Move `apps/customer-web/app/(account)/orders/[id]/page.tsx` to the SAME document components and the SAME `container` column. ⚠ Both pages or neither (research R12) — otherwise the identical document renders at two widths depending on how the customer arrived at it.
- [X] T021 [P] [US1] Write `apps/customer-web/app/checkout/complete/page.test.tsx`: line totals sum to the items subtotal, and subtotal − discount + delivery = grand total, on an order WITH a discount and fee and on one WITHOUT either (SC-002).
- [X] T022 [P] [US1] Write `apps/customer-web/app/checkout/complete/no-leak.test.tsx` asserting the rendered markup AND the raw DTO contain no shop name, id, count, distance or ring (SC-011).
- [X] T023 [P] [US1] Write a test that renders the page with `paymentMethod: null` and `deliveryPromises: []` (a pre-052 order) and asserts it degrades to a complete document with those lines simply absent — never a blank or a dash that reads as unknown.

**Checkpoint**: US1 is demonstrable on its own — pay on the web, see the full receipt.

---

## Phase 4: User Story 2 — The mobile receipt (Priority: P1)

**Goal**: the same document, laid out natively for a phone.

**Independent Test**: pay in the mobile app; the receipt screen carries the same fact set as the web
page, with no field present on one surface and missing on the other.

- [X] T024 [P] [US2] Extend the `Receipt` domain model in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/domain/Checkout.kt` to carry unit price, image URL, stage, delivery promises and payment method. ⚠ 033 found the mobile mapper DISCARDING fields the backend already sent (`brand`, `badges`); `unitPriceAmount` is that shape again — it is already on the wire (research R9).
- [X] T025 [US2] Update `apps/customer-mobile/.../features/checkout/data/CheckoutMappers.kt` to map every new field, treating an unrecognised `stage` or `method` as a non-fatal fallback rather than a deserialization failure, so adding a fifth stage later cannot crash an old app build.
- [X] T026 [P] [US2] Create the bounded status palette as ONE Compose-local constant in `apps/customer-mobile/.../features/checkout/presentation/StatusPalette.kt`. ⚠ It MUST NOT be added to `EffyTheme` or any generated Compose theme file — `tokens:check` passing unchanged is the mechanical proof (SC-010).
- [X] T027 [US2] Redesign `apps/customer-mobile/.../features/checkout/presentation/ReceiptScreen.kt` to the mobile artboard: single column, the promise + progress section, the document (masthead, line rows with unit price and image, reconciling totals, payment method), addresses, the document-status note, and detail rows. Keep the existing dual role (Receipt from checkout vs OrderDetail from history) and `EffyPullToRefresh`.
- [X] T028 [US2] Keep one primary action in a fixed bottom bar at a ≥48 dp target in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/ReceiptScreen.kt`. ⚠ 033 shipped a 32 dp control under a comment claiming it cleared the minimum; measure the touch target, do not assert it in prose.
- [X] T029 [P] [US2] Write `ReceiptScreenTest.kt` / `ReceiptMapperTest.kt` in `commonTest` covering the same reconciliation as T021 and the null-degradation of T023. ⚠ No commas in backtick test names — Kotlin/Native forbids them in a declaration name while the JVM accepts them, which is how 033's iOS test suite silently never compiled.
- [X] T030 [US2] Run the full mobile gate: `./gradlew :shared:testAndroidHostTest :shared:compileKotlinIosSimulatorArm64 :shared:compileTestKotlinIosSimulatorArm64 :androidApp:assembleDebug`, plus `make cm-guard` and `make cm-tokens-check`.

**Checkpoint**: US1 and US2 both work, and a field-by-field diff finds no gap (SC-003).

---

## Phase 5: User Story 3 — The receipt email (Priority: P1)

**Goal**: within moments of payment, the customer receives the complete itemised record.

**Independent Test**: pay for an order; exactly one correctly-rendered receipt email arrives at the
account address with the same figures as the screen.

### The template

- [X] T031 [US3] Widen the `order-confirmation` entry in `packages/email-kit/src/catalog.ts` to the variable set in contracts/receipt.contract.md §3. ⚠ KEEP THE ID: the catalogue says an id is permanent once shipped because it is written into delivery records — and this message has never been sent, so there are no such rows and a new id would strand the artifact and guards already built for it (research R8).
- [X] T032 [US3] Confirm the entry keeps `category: "transactional"` and `onSendFailure: "swallow"`, and add a comment stating why each is load-bearing here: `transactional` makes an unsubscribe link a COMPILE error (FR-024, a customer must not opt out of their own proof of purchase); `swallow` because the order is already paid and a throw would contradict a true fact (FR-023).
- [X] T033 [US3] Rewrite `packages/email-kit/src/templates/order-confirmation.mjml` to the email artboard: masthead with the paid pill, headline, the promise/order two-up, line items with unit price, reconciling totals, payment method, one button, addresses, the document-status note, and a footer that states plainly why there is no unsubscribe link.
- [X] T034 [US3] Regenerate the committed artifacts (`make email-gen`) and run `make email-check`. ⚠ The guard must pass drift, BOTH size budgets, the missing-text-part check, banned techniques, and contrast in all three passes (light, dark, forced-invert).
- [X] T035 [P] [US3] Write `packages/email-kit/test/order-confirmation.size.test.ts` rendering a ≥25-item basket and asserting the output stays inside Gmail's ~102 KB budget without truncation (SC-006).
- [X] T036 [P] [US3] Write `packages/email-kit/test/order-confirmation.text.test.ts` asserting the plain-text part contains every figure and every URL UNESCAPED. ⚠ 039 found `email-kit` HTML-escaping the text part, turning `?token=ABC` into `?token&#x3D;ABC` — invisible in HTML, fatal in `text/plain`, and silent everywhere.

### Enqueue and drain

- [X] T037 [US3] Add the dispatch producer to `apis/core-api/internal/features/checkout/store.go`: insert one `receipt_dispatch` row with `reason='order_paid'` and the recipient snapshotted from `public.customer.email`, INSIDE the existing status-guarded `pending_payment → paid` transaction, `ON CONFLICT DO NOTHING`.
- [X] T038 [P] [US3] Write a Go test proving a re-run of the finalize path inserts exactly ONE `order_paid` dispatch row (SC-004's backend half).
- [X] T039 [US3] Create `apis/edge-api/notifications/src/receipts/drain.ts` — a PURE, dependency-injected drain mirroring `src/worker/drain.ts`: claim `pending` rows `FOR UPDATE SKIP LOCKED`, render via `@effy/email-kit`, send, mark `sent`/`skipped`/`failed`, count attempts, and fail-open when mail is not configured (leave rows pending).
- [X] T040 [US3] Create `apis/edge-api/notifications/src/receipts/repository.ts` (claim/mark/resolve-recipient) and `apis/edge-api/notifications/src/receipts/handler.ts` (the scheduled entry point).
- [X] T041 [US3] Register the scheduled function in `apis/edge-api/notifications/serverless.yml`, add the `MAIL_*` environment variables and a scoped `ses:SendEmail` IAM statement.
- [X] T042 [US3] Write `apis/edge-api/notifications/src/receipts/config.contract.test.ts` that reads the REAL `serverless.yml` and asserts it declares every key in email-kit's exported `MAIL_ENV_KEYS`. ⚠ This guard exists because 035 shipped four undeclared env vars, sent no email at all, and 100 passing tests missed it — because the tests set those variables themselves.
- [X] T043 [P] [US3] Write `drain.test.ts` with fakes (no DB, no SES) covering: a successful send marks `sent` with a `message_id`; no recipient marks `skipped`; a failure increments `attempts` and marks `failed` only at the cap; an unconfigured mailer leaves everything `pending`.
- [X] T044 [P] [US3] Write a test proving a failed send leaves the ORDER untouched — still `paid`, with the on-screen confirmation unaffected (SC-015, FR-023).

**Checkpoint**: paying produces exactly one receipt email; US1–US3 together are the full P1 slice.

---

## Phase 6: User Story 4 — Getting the copy back (Priority: P2)

**Goal**: a customer can re-send themselves the receipt for any of their paid orders, from either
surface, rate-limited and safely refused.

**Independent Test**: request the receipt again on a past paid order from each surface; it arrives.
Exceed the limit; it is refused and nothing is sent.

- [X] T045 [P] [US4] Create `apis/edge-api/customer/src/receipts/repo.ts` with the ATOMIC rate-limited insert: `INSERT … SELECT … WHERE (count of recent customer_request rows for this order) < limit`. ⚠ Count INSIDE the INSERT, never check-then-write — 039 recorded that race explicitly and 046 fixed it this way; zero rows affected IS the refusal (research R6).
- [X] T046 [US4] Create `apis/edge-api/customer/src/receipts/service.ts` resolving the recipient from the AUTHENTICATED SUBJECT and returning the refusal taxonomy from contracts §2 (`429` / `409 not_paid` / `404` / `409 no_recipient`).
- [X] T047 [US4] Create `apis/edge-api/customer/src/functions/customer-orders-v1-id-receipt-post.ts` and register the route in `apis/edge-api/customer/serverless.yml` behind the customer authorizer. ⚠ The request body has NO `email` field — an address in the body turns an authenticated route into an open relay for a document carrying someone's name, address and purchase history.
- [X] T048 [P] [US4] Write `apis/edge-api/customer/src/receipts/service.test.ts` proving the refusal for another customer's order and for a non-existent order are BYTE-IDENTICAL (SC-008), and that a refused request writes no row.
- [X] T049 [P] [US4] Write `apis/edge-api/customer/src/receipts/repo.container.test.ts` firing two concurrent resends at the rate-limit boundary and asserting exactly one row lands. ⚠ Check-then-write passes this serially and fails it here — that is the whole point of the test.
- [X] T050 [US4] Wire the "Send the receipt again" affordance on the web receipt (`apps/customer-web/components/receipt/`) with its success and refusal states, including the plainly-stated rate-limit message.
- [X] T051 [US4] Wire the same affordance on mobile as a detail row in `ReceiptScreen.kt`, with a snackbar for both outcomes. ⚠ A refusal a shopper cannot see is indistinguishable from a bug (033's guest-cap lesson).

**Checkpoint**: US4 works on both surfaces and refuses safely.

---

## Phase 7: User Story 5 — Honest about what the document is (Priority: P2)

**Goal**: the document states what it is, carries a seller identity, and shows no fabricated legal
identifier.

**Independent Test**: with the platform's identifiers unsupplied, no ABN, no tax amount and no "tax
invoice" wording appear anywhere — absent, not blank, not placeholder.

- [X] T052 [P] [US5] Render the seller identity block from `packages/legal-content/src/identifiers.ts` on all three surfaces — trading name plus `hello@effyshopping.com` (the approved customer-facing mailbox). ⚠ Emit NOTHING for a value still holding a `[BRACKETED]` placeholder; the field must be absent, not rendered as the placeholder text.
- [X] T053 [P] [US5] Add the document-status sentence to all three render sites — `apps/customer-web/components/receipt/`, `apps/customer-mobile/.../presentation/ReceiptScreen.kt`, `packages/email-kit/src/templates/order-confirmation.mjml`: this is a record of payment, prices include GST where it applies, and how to request a tax invoice (FR-032).
- [X] T054 [P] [US5] Write `apps/customer-web/components/receipt/legal-absence.test.tsx` and a matching `commonTest` case asserting the rendered web page, the mobile composable output and the rendered email contain NO ABN, no GST amount, no per-line tax indicator and not the phrase "tax invoice" as a document title, while the identifiers remain unsupplied (SC-012).
- [X] T055 [US5] Record the reserved tax-invoice block as a comment at each of the three render sites named in T053, naming the two prerequisites from research R13 so a future contributor finds them at the point of change rather than in a spec (FR-033/FR-034).

**Checkpoint**: all five stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting

- [X] T056 [P] Add the three product events to `apps/customer-web/lib/telemetry.ts` and the mobile taxonomy: `receipt_viewed` (surface, stage), `receipt_resend_requested`, `receipt_resend_refused` (reason). ⚠ No amount, no address, no email — the taxonomy's existing discipline (051 records a payment FAMILY, never a provider decline code).
- [X] T057 [P] Emit drain outcome counters (`sent`/`failed`/`skipped`) from the receipt drain, matching the shape 050's `DrainSummary` already returns.
- [X] T058 Add the sustained-send-failure alarm in `infra/`. ⚠ 038 and 046 BOTH deferred their send-failure alarm with "the service already logs it"; deferring a third time makes the pattern the rule, and this slice's premise is that a missing receipt is invisible to everyone until a customer complains.
- [X] T059 [P] Update the parity register `docs/audiences/customer-capabilities.md` with a §052 row for both customer surfaces.
- [X] T060 [P] Add the triage table from quickstart.md §5 to `docs/` so an operator can answer "no receipt arrived" without reading this spec.
- [X] T061 Run the full machine sweep from quickstart.md §3 and compare every count against the T001/T002 baseline. ⚠ Confirm `tokens:check` and `make cm-tokens-check` are UNCHANGED — that is SC-010's mechanical proof that the status palette never became a design token.
- [X] T062 Prove SC-010 by deletion: remove `apps/customer-web/app/checkout/_components/status-palette.ts` and `apps/customer-mobile/.../presentation/StatusPalette.kt` in turn, confirm the code still compiles, then restore both.

---

## Phase 9: Operator gates & the live walk 🧑‍💻

**⚠ Nothing here is Claude's to run.** These provision, deploy, or need a human eye.

> ✅ **The slice was CONCLUDED on 2026-08-26 with all six of these still open**, on the operator's
> direction. They remain the accurate list of what has not happened — see
> [SIGNOFF.md](./SIGNOFF.md). Deployment steps are in [quickstart.md](./quickstart.md) §1–§2.

- [ ] T063 🧑‍💻 Commit the migration, then `make db-status ENV=dev` and `make db-up ENV=dev` (the 003 commit-guard refuses an uncommitted migration).
- [ ] T064 🧑‍💻 Deploy in this order: `core-api`, then `make edge-deploy SERVICE=customer ENV=dev`, then `SERVICE=notifications ENV=dev`, then customer-web. ⚠ `core-api` BEFORE customer-web — 047 recorded that reversing it briefly broke dev checkout.
- [ ] T065 🧑‍💻 Walk, per `specs/052-order-confirmation-invoice/quickstart.md` §4: SC-001 (five observers), SC-005 (the mail-client matrix incl. Outlook's Word engine — nothing open-source substitutes for it), SC-009 (dark mode, largest text, screen reader on both surfaces).
- [ ] T066 🧑‍💻 Walk the live proofs: SC-004 by re-delivering the webhook (`stripe events resend`), SC-007 the resend and its limit, SC-013 the abandoned-payment path leaving the basket intact, SC-014 the stage advancing when a shop moves a portion, SC-015 by pointing `MAIL_SENDER` at an invalid identity.
- [ ] T067 🧑‍💻 Run the three deliberate NEGATIVE proofs from quickstart.md §4: drop `receipt_dispatch_auto_uq` and watch a second email arrive (then restore it); set one portion of a two-shop order to `delivered` with the other `picking` and confirm the receipt says **packing**; fire two concurrent resends at the limit boundary.
- [ ] T068 🧑‍💻 Write `specs/052-order-confirmation-invoice/SIGNOFF.md` recording what was NOT done, then commit.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** — no dependencies.
- **Phase 2 Foundational** — depends on Setup. **BLOCKS every user story**: it builds the one
  canonical fact set that FR-001 requires all surfaces to render from.
- **Phase 3 (US1) / Phase 4 (US2) / Phase 5 (US3)** — each depends only on Phase 2, and they are
  independent of one another. All three are P1 and together form the complete first slice.
- **Phase 6 (US4)** — depends on Phase 5 (it enqueues into the same table the drain reads) and on
  US1/US2 for its affordance.
- **Phase 7 (US5)** — depends on US1/US2/US3 existing as render sites; the content itself is
  independent.
- **Phase 8 Polish** — after the stories it measures.
- **Phase 9** — operator, last.

### Story dependencies

| Story | Depends on | Independently demonstrable? |
|---|---|---|
| US1 web receipt | Phase 2 | ✅ Pay on web, see the document |
| US2 mobile receipt | Phase 2 | ✅ Pay in app, see the document |
| US3 the email | Phase 2 | ✅ Pay, receive exactly one email |
| US4 resend | US3 (+ US1/US2 for the button) | ✅ Request again on a past order |
| US5 legal status | US1–US3 as render sites | ✅ Inspect for absent tax fields |

### Parallel opportunities

- **Phase 2**: T008/T009 (the pure stage function and its test) run alongside T006/T007 (contracts).
  T012 and T015 are independent test files.
- **After Phase 2, three P1 stories run fully in parallel** — US1 is web, US2 is mobile, US3 is the
  email and the cold path. They share no file.
- **Within US1**: T016, T017, T021, T022, T023 are all separate files.
- **Within US3**: T035, T036, T043, T044 are separate test files.
- **Phase 8**: T056, T057, T059, T060 are independent.

---

## Parallel Example: after the Foundational checkpoint

```bash
# Three P1 stories, no shared file:
Task: "US1 — rewrite apps/customer-web/app/checkout/complete/page.tsx"
Task: "US2 — redesign apps/customer-mobile/.../presentation/ReceiptScreen.kt"
Task: "US3 — rewrite packages/email-kit/src/templates/order-confirmation.mjml"
```

---

## Implementation Strategy

### MVP

**US1 alone** is a shippable increment: the redesigned web receipt, rendering the canonical fact set.
It needs Phases 1–3 (T001–T023) and delivers the visible half of the request.

### Recommended first delivery

**US1 + US2 + US3** — all three are P1, and the spec's premise is that the receipt exists on *both*
surfaces and *in the inbox*. Shipping the redesign without the email leaves the half of the request
the platform genuinely cannot do today still undone.

### Incremental

1. Phases 1–2 → the fact set exists.
2. + US1 → **STOP and validate** on the web. Demo.
3. + US2, + US3 (parallel) → the full P1 slice. Demo.
4. + US4 → self-service resend.
5. + US5 → the document states what it is.
6. Phase 8 → telemetry, alarm, docs. Phase 9 → operator.

---

## Notes

- `[P]` = different file, no dependency on an incomplete task.
- ⚠ markers carry a specific prior defect this platform already paid for. They are not emphasis.
- Out of scope, so tasks must not drift into it: PDF, print stylesheet, GST modelling, refunds, live
  tracking, post-purchase merchandising, any non-customer audience, any change to checkout itself.
- Commit after each logical group; stop at any checkpoint to validate a story on its own.
