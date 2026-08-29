---
description: "Task list for 055 Refunds & Order Cancellation"
---

# Tasks: Refunds & Order Cancellation

**Input**: Design documents from `/specs/055-refunds-cancellation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED, and not as a matter of taste. ⚠ **This slice moves real money.** The refund
ceiling (SC-002) and idempotency (SC-003) are **database** properties — a fake would accept two writes
and prove nothing — so both are container-backed. [quickstart.md](./quickstart.md) §2 lists eight
things to be proven **by breaking them**.

**Organization**: by user story, in the order [plan.md](./plan.md) sets — which is **not** spec
priority order. ⚠ **US4 (the failure path) is built BEFORE US5 (what the customer sees)**: showing a
shopper "refunded" before the platform can learn a refund failed would mean confidently telling people
money is coming when it is not.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: the user story served (US1…US6). Setup, Foundational and Polish carry none.

---

## Phase 1: Setup

- [X] T001 Write the forward-only Goose migration `db/migrations/<timestamp>_refunds_cancellation.sql` — `public.refund`, `public.refund_line`, `public.refund_request`, `public.refund_request_item`, `public.refund_proposal_dismissal`, per [data-model.md](./data-model.md) §1–4. `COMMENT ON` every table and column.
- [X] T002 In the same migration, widen two existing CHECKs ([data-model.md](./data-model.md) §6): `public.stock_movement.reason` gains `refund` — 054 wrote *"the CHECK grows when the slice that needs it lands"* — and `public.shop_fulfillment.status` gains a terminal `unfulfillable`. ⚠ **Widen, never replace** (the third widening of that status CHECK): no data migration, no rewrite of the fan-out.
- [X] T003 ✅ **VERIFIED AGAINST REAL POSTGRESQL 16** — the whole 56-migration chain applies cleanly, and every guard refuses what it claims (goodwill-without-note, item-kind-with-goodwill-reason, duplicate idempotency key, deleting a refunded order, a second open request, `failed` with no reason). Add the constraints that make invalid states unrepresentable rather than merely refused: `refund.ON DELETE RESTRICT` (a record of money must not vanish with its order), `UNIQUE(idempotency_key)`, `UNIQUE(provider_refund_id)`, the goodwill-needs-a-note CHECK, and the **partial unique index** `refund_request(order_id) WHERE status='open'` (FR-005r4).
- [X] T004 [P] Add the refund DTOs to `packages/shared-types/src/refund.ts` and export them, per [contracts/refunds-api.contract.md](./contracts/refunds-api.contract.md). ⚠ Use `WireInt` for every integer (027 R13 — 054's first draft generated `Double` and only reading the Kotlin back caught it).
- [X] T005 [P] Register the refund DTOs in the customer commerce contract and regenerate. ✅ Verified `Long`, not `Double` (027 R13 avoided). ⚠ **The shop generator is NOT touched**: US6's unfulfillable exit needs a status value, not a refund DTO, and adding staff refund shapes to the shop contract would put a payment provider's failure text in an app shop operators use.
- [ ] T005a ⚠ **PRE-EXISTING DEFECT FOUND, NOT FIXED** (recorded so it is not mistaken for this slice's): `contract/CommerceDto.kt` carries **two** `val quantity: Double` fields on existing order/cart DTOs — 027's R13 shape, in the customer contract, unchanged at HEAD. Fixing means a `WireInt` change plus mobile mapper updates and belongs to whoever owns those DTOs.
- [X] T006 ⚠ Extend `PaymentGateway` in `apis/core-api/internal/features/checkout/gateway.go` with `CreateRefund` and refund-event parsing, implemented in `stripegateway.go` on the **existing** client. Not a second way of talking to the provider (Principle VI).

---

## Phase 2: Foundational (BLOCKING — no user story starts until this is done)

**Purpose**: the records, the derived totals, the ceiling and the back-office identity — with **nothing
able to issue a refund yet**. Everything here is provably inert.

- [X] T007 ⚠ Add a **back-office `PoolVerifier`** in `apis/core-api/cmd/core-api/main.go` alongside the customer one, and an `/v1/admin` route group behind it. ⚠ This is the slice's one structural change and [research.md](./research.md) R1 is why: per-pool validation with a pinned issuer is the shape Principle IV sanctions; the rejected alternative — the cold path forwarding an operator's token — is the auth-brokering it forbids by name.
- [X] T008 Add a back-office staff gate reading `admin.staff` (not the `cognito:groups` claim): **write = admin/manager** (FR-019). ⚠ Reading lives on the cold path, where `csa` can do it (FR-020).
- [X] T009 [P] **NEGATIVE PROOF (quickstart §2e)** — a **customer** token is refused by an `/v1/admin` route. ⚠ `core-api` accepted only customer tokens until today; this is new attack surface on the service that holds the payment secret. **The reverse direction is T053a**, in Phase 5, because the customer route it needs does not exist until then.
- [X] T010 `apis/core-api/internal/features/refunds/repository.go` — the append-only refund writes and the **derived** totals. ⚠ No `refunded_amount` column exists and none is added ([research.md](./research.md) R7, 027's counted-not-stored rule): a counter and the rows can disagree, and then nobody knows which is true.
- [X] T011 ⚠ The ceiling, as a `SUM` **inside the writing transaction under a row lock** — never a read-then-write. Two staff refunding at once is the case it exists for. ⚠ The ceiling is `payment.amount`, **not** `order.grand_total_amount` ([research.md](./research.md) R10): they can differ, and the wrong one refunds money that never arrived.
- [X] T012 [P] ⚠ Exclude `submitting` from every total and from the ceiling (FR-005e). Until the provider has it, no money is on its way — counting it would let a refund that was never accepted reduce what can be refunded.
- [X] T013 [P] **Container-backed proof (SC-002)**: two concurrent refunds against one order never exceed what was paid. ⚠ `docker info` first — 052 lost a session's exactly-once proofs to a silent skip.
- [X] T014 [P] **NEGATIVE PROOF (quickstart §2a)** ✅ — without `FOR UPDATE`, two concurrent refunds both succeed: **`expected 1, actual 2`**, a customer refunded twice against one payment.
  - ⚠ **THE FIRST VERSION OF THIS PROOF WAS WORTHLESS.** Two goroutines racing `Record` finish fast enough to serialise by accident, so the test **passed with the lock removed**. It needed a barrier holding both at the door until both arrive — and the barrier had to go **BEFORE** the lock: placing it after deadlocks, because the first goroutine holds the row while the second waits for a signal it can never send. A green concurrency test is the easiest kind to write by mistake.
- [ ] T015 [P] ⚠ **NOT NEEDED AS A TEST — the design makes it unrepresentable.** There is no `refunded_amount` column to drift, so there is nothing to break. Recorded rather than faked. **NEGATIVE PROOF (quickstart §2h)**: add a stored `refunded_amount`, let it drift from the rows, and confirm the two disagree — the reason R7 chose derivation.

**Checkpoint**: refunds can be recorded and totalled; nothing can move money.

---

## Phase 3: User Story 1 — Staff refund an order that went wrong (P1)

**Goal**: a staff member can return money, in whole or in part, with a reason and an audit trail.

**Independent test**: take a paid order with a recorded shortfall, refund the affected line from the
console, and confirm the money is returned, the total reflects it, and the action is attributed.

- [X] T016 [US1] `refunds/service.go` — the two kinds (FR-003). ⚠ **Item-derived amounts are COMPUTED from the selected lines and an `amount` in the request is REJECTED, not ignored** (A7a): if the client could send one, it and the lines could disagree, and the record would claim a refund covered items it did not.
- [X] T017 [US1] Goodwill refunds: a free amount with a **mandatory note** (FR-003c). It exists so the honest case for an untied amount — a late delivery — does not have to borrow a line and put a false statement in the audit trail.
- [X] T018 [US1] Per-line ceiling (FR-003a): `SUM(quantity)` across a product's refund lines vs `order_item.quantity`. The same unit cannot be refunded twice.
- [X] T019 [US1] ⚠ The **derived** idempotency key (FR-005) — from the order, the lines and the action, never random. It is both our uniqueness constraint and the key sent to the provider, so an ambiguous retry cannot create a second refund *there* either.
- [X] T020 [US1] Map Effy's reason vocabulary to the provider's on the way out ([research.md](./research.md) R5). ⚠ **`fraudulent` is never sent** — the provider's own documentation says it blocklists the payer's card and email, a consequence for a person beyond this order, decided in a console with no review step.
- [X] T021 [US1] `refunds/handler.go` — `POST /v1/admin/orders/{orderId}/refunds`, behind the T008 gate.
- [X] T022 [P] [US1] Service tests: the computed amount, a rejected client amount, goodwill without a note, over-ceiling with the remaining amount stated, a line already fully refunded.
- [X] T022a [P] [US1] Test (**FR-011**): the amount sent to the provider equals the derived or entered amount **exactly** — nothing subtracted for the processing fee. ⚠ The fee is Effy's cost, and deducting it would breach the consumer guarantees the published policy itself invokes.
- [X] T023 [P] [US1] **Container-backed proof (SC-003)**: the same refund submitted twice returns the money once.
- [X] T024 [P] [US1] **NEGATIVE PROOF ✅ EXECUTED** — a random idempotency key fails `TestIdempotencyKey_IsDerivedAndStable`: *"the same action must derive the same key, or a retry refunds twice"*.
- [X] T025a [P] [US1] ⚠ **NOT PROVABLE BY BREAKING — the field does not exist.** A destination appears **zero** times across the service, handler and DTOs, so adding one to "prove" FR-006 would be theatre. Proven positively instead: `TestIssue_SendsMoneyToTheOrdersOwnPaymentAndNowhereElse` asserts the PaymentIntent reaching the provider is the one read from **this order's own payment row**, under the ceiling lock. Same reasoning as T015.
- [X] T025 [P] [US1] **NEGATIVE PROOF ✅ EXECUTED** — removing the amount rejection makes the item-refund test fail. (quickstart §2d): accept an `amount` on an item-derived request and confirm the lines and amount can then disagree.
- [X] T026 [P] [US1] **NEGATIVE PROOFS ✅ EXECUTED, TWICE** — adding `csa` to `WriteRoles` fails by name; commenting out the `status = 'active'` term fails the disabled-admin test. ⚠ Container-backed, not a unit test: the gate is one SQL predicate over a schema this service had never read, and the only thing that can be wrong with it is the SQL (an earlier draft joined a `role_id` column that does not exist). Test: a `csa` is refused every write, identically whichever order is named (FR-019/FR-021); an `admin` succeeds.
- [X] T027 [US1] ⚠ **WAS MARKED DONE AND WAS NOT** — the queries and their container tests existed while **nothing called them**, so the order read carried no refund field and the console had nothing to render. The suite was green because the tests exercised the repository directly, never the service that composes the response: **053's paging defect exactly**. Now composed in `getOrder`, with container tests that go **through `getOrder`**, and a drift guard reading the Go ceiling constant (**negative proof ✅ executed** — dropping `failed` from `refundedCents` fails it by name). `apis/edge-api/orders/src/` — return refunds on the order read (FR-020), and an **awaiting-a-decision** filter on the list (FR-004c). ⚠ Cold path: `edge-api/admin` is at 434/500 CloudFormation resources with `versionFunctions:false` spent; `orders` has room.
- [X] T028 [US1] ⚠ Same correction as T027 — derived correctly, but unreachable until the composition landed. Derive **proposed refunds** from shortfalls with no covering refund line (FR-004a), plus the dismissal row that suppresses one (FR-004b). ⚠ **No proposals table** ([data-model.md](./data-model.md) §4): a proposal is a view of other facts, and storing it means it can go stale when a picker corrects a quantity — recording only the *exception* keeps the happy path derived.
- [X] T029 [P] [US1] Test: a shortfall edited three times yields **one** proposal, not three (FR-004b).
- [X] T030 [US1] `apps/back-office/src/features/orders/` — issue a refund, dismiss a proposal, read the history. Detail rows and a table, **no cards** (Principle V).
- [X] T031 [US1] ⚠ The refund control must not be triggerable by accident — it moves money. A confirmation step naming the amount and what it covers.
- [X] T032 [P] [US1] Console tests. ⚠ Assert on behaviour, not class names (052's `MethodList.test.tsx` asserted nothing for weeks), and read the refusal off the **plain object** the api-client throws (053's defect; 054 fixed the `fields`/`errors` mapping it depended on).

**Checkpoint**: money can be returned. Nothing yet knows whether it arrived.

---

## Phase 4: User Story 4 — A refund that does not arrive is not silently lost (P1)

**Goal**: the platform learns when a refund fails, and stops claiming money was returned.

⚠ **Built before anything customer-facing.** A refund is asynchronous: the bank can reject it **up to 30
days later**. A platform that records success at submission will tell customers their money is on its
way and never find out it was wrong.

**Independent test**: issue a refund, force the provider to report a later failure, and confirm the
order stops claiming the money was returned and the failure is visible to staff.

- [X] T033 [US4] `refunds/state.go` + a guard reading the ceiling SQL. **NEGATIVE PROOFS ✅ EXECUTED, TWICE** — dropping `failed` from `CountedStatuses` fails by name; removing `submitting` from `NeedsAttention` fails the silent-failure test. The five-state machine The five-state machine ([data-model.md](./data-model.md) §7). ⚠ `submitting`/`submitted` and `failed`/`refused` are separate because each pair answers a different question: has the provider got it, and could retrying ever help.
- [X] T034 [US4] ⚠ **AND IT FOUND A DEFECT OF MY OWN, BY READING THE CODE BACK.** `HandleWebhook` opened with `if evt.PaymentIntentID == "" { return nil }` — which is **every** `refund.*` event, since a refund event names a refund and not an intent. Refund events were **discarded before they were deduped or dispatched**, and every test on both sides passed because each half was correct in isolation: `HandleRefundEvent` worked perfectly and was never called. **NEGATIVE PROOF ✅ EXECUTED** (3 tests fail). `refunds/webhook.go` `refunds/webhook.go` — handle `refund.updated`, `refund.failed`, `charge.refunded` on the **existing** signature-verified endpoint (the sanctioned webhook exception).
- [X] T035 [US4] ⚠ The dedup now runs **before** the routing, which is what T034 got wrong. Idempotent processing Idempotent processing against the existing `stripe_event` dedup table (FR-010).
- [X] T036 [US4] ⚠ Recorded as a new `external` **kind** with `actor_kind = 'system'` and **no actor subject** — the migration was widened rather than forcing a provider-issued refund into `back_office`, which would put a false statement in the one record that says who moved money. Proven to reduce the ceiling, and to be recorded exactly once. An event for a refund the platform does not recognise is **recorded, not discarded** ⚠ An event for a refund the platform does not recognise is **recorded, not discarded** (FR-010). A refund issued from the provider's own dashboard is a real thing that happens, and dropping it leaves the order claiming money it no longer holds.
- [X] T037 [US4] ⚠ The classification existed; **nothing retried**, so an ambiguous failure left the row `submitting` forever with nobody looking for it. Now bounded (2 attempts, context-honouring) under the SAME key, then surfaced as `Stalled`. ⚠ **AND A SECOND DEFECT**: the idempotent-hit path reported a hardcoded `"submitting"`, so an operator clicking again on a refund that never got an answer was told the same reassuring thing as one whose refund was accepted — it now reports the row's real state. Classify a submission failure before retrying ⚠ Classify a submission failure before retrying (FR-005d): **ambiguous** (timeout, unreachable) retries under the SAME idempotency key, bounded, then escalates; **definite** is never retried — retrying a decision cannot change it — and the provider's own reason is surfaced to staff.
- [X] T038 [US4] ⚠ `submitting` said **"Sending to the bank"**, which reads as progress when it is the *absence of an answer*. Corrected to "No answer from the bank — needs checking": an operator told "sending" waits, one told the truth escalates. FR-005f FR-005f: a staff member can tell **whether the money went** from the order screen alone. That is the only question anyone asks about a refund; a state that cannot answer it is not a state.
- [X] T039 [P] [US4] **7 container-backed tests.** Tests Tests: submitted-not-refunded; a later success; a later failure clearing the claim; a redelivered event changing state at most once; an unknown refund recorded.
- [X] T040 [P] [US4] ✅ **PROVEN** — three operator clicks against an unreachable provider yield **one** refund row, every attempt carrying the same idempotency key. **Container-backed proof (SC-006a)** **Container-backed proof (SC-006a)**: with the provider unreachable, no number of retries produces more than one refund.
- [X] T041 [P] [US4] **NEGATIVE PROOF ✅ EXECUTED** — the existing tests did **not** catch it, so `TestCeiling_AStalledRefundDoesNotReduceWhatCanStillBeRefunded` was written first; adding `submitting` to `refundedCents` then makes it fail. **NEGATIVE PROOF (quickstart §2c)** **NEGATIVE PROOF (quickstart §2c)**: count `submitting` toward the total and confirm a not-yet-accepted refund wrongly reduces the ceiling.
- [X] T042 [P] [US4] ✅ Proven: one gateway call, `refused`, reason verbatim. Test Test: a definite refusal is **not** retried, and its reason reaches staff verbatim.

---

## Phase 5: User Story 2 — A customer asks to cancel an order (P1)

**Goal**: a shopper can cancel before anyone starts picking, and the published policy stops lying.

**Independent test**: cancel an unpicked order and confirm the full amount returns and no shop is left
holding work; then confirm a picked order offers no control and says why.

- [X] T043 [US2] Cancellation **is** a full refund ⚠ Cancellation **is** a full refund ([research.md](./research.md) R3): `CaptureMethod: automatic` means the money is already captured, so the provider's cancel operation never applies to an Effy order. Implement it as one, reusing everything above.
- [X] T044 [US2] `POST /v1/orders/{orderId}/cancel` `POST /v1/orders/{orderId}/cancel` — customer pool. Permitted only while **no shop has begun preparing** (FR-012, A2).
- [X] T045 [US2] Return the **entire** amount including delivery (FR-013) Return the **entire** amount including delivery (FR-013). ⚠ Unlike a partial refund, which does not — the delivery happened (A10).
- [X] T046 [US2] ⚠ A NEW `withdrawn` STATE, deliberately NOT `unfulfillable` — the shop did not fail to supply anything, the order was called off. Conflating them tells a shop it failed at something nobody wanted, and makes shop-reliability reporting count cancellations as shop failures. Recorded as a `state_changed` event carrying its `from_status`, in the SAME statement as the update. ⚠ `actor_staff_id` is NULL and that is the honest value: that column references `shop_staff`, and no shop staff member withdrew this. Withdraw every shop portion Withdraw every shop portion so nobody picks a cancelled order, recorded (FR-014).
- [X] T047 [US2] **NEGATIVE PROOF ✅ EXECUTED** — removing `FOR UPDATE OF o` makes both concurrent cancels take effect. Cancelling and being picked are **mutually exclusive** ⚠ Cancelling and being picked are **mutually exclusive** (FR-017) — a guarded transition, not a check-then-write.
- [X] T048 [US2] `POST /v1/admin/orders/{orderId}/cancel` `POST /v1/admin/orders/{orderId}/cancel` — staff may cancel at any pre-delivery stage (FR-018), because a phone call arrives after the customer's own control has closed.
- [X] T049 [US2] ⚠ **THIS IS ITS FIRST WRITER**, as the gap register said. `order.status = 'canceled'` `order.status = 'canceled'`. ⚠ Permitted by the CHECK since 019 and **never written** — this is its first writer, which is why the gap register could say "nothing in the codebase ever writes it."
- [X] T050 [US2] ⚠ The key-set test caught the omission the way 033's should have — it reads the CONTRACT, not the struct. Required, never optional: an optional field lets `undefined` read as "cannot cancel" and hide the control silently. Server-derived `cancellable` Server-derived `cancellable` on the order DTO. ⚠ The client must **never** compute it from a stage — that is the `summarizeFulfillment` mistake 052 deleted.
- [X] T051 [P] [US2] ✅ **PROVEN**, barrier placed BEFORE the lock (the only arrangement that makes the goroutines genuinely contend). Exactly one takes effect; the other is told it was already done, which the handler turns into a 200. **Container-backed proof** **Container-backed proof**: two simultaneous cancels refund once and cancel once (FR-017).
- [X] T052 [P] [US2] Plus: nobody may cancel once the package has left the shop, staff included. Test Test: a picked order refuses customer cancellation but permits staff cancellation.
- [X] T053 [P] [US2] ✅ Byte-identical, because the ownership term sits inside the same predicate as the lookup rather than being a second question. Test Test: "not yours" and "no such order" are **byte-identical** refusals (FR-016).
- [X] T053a [P] [US2] **NEGATIVE PROOF ✅ EXECUTED** — mounting the customer cancel route on the back-office verifier fails by name. ⚠ Until US2 every customer route on this service was a READ, so this direction had nothing to test against. **NEGATIVE PROOF (quickstart §2f)** — a **back-office** token is refused by `POST /v1/orders/{orderId}/cancel`. The other half of T009: the isolation must hold in both directions, and this is the first phase in which the customer route exists to test it against.
- [X] T054 [US2] ⚠ Both surfaces read `cancellable` from the wire and never derive it. **NEGATIVE PROOFS ✅ EXECUTED** on both: replacing the web refusal with "can no longer be cancelled" fails 2 tests; dropping the field in the mobile mapper fails the build. `apps/customer-web` and `apps/customer-mobile` `apps/customer-web` and `apps/customer-mobile` — the cancel control, present only when `cancellable`. ⚠ The wording when absent must not imply the order can never be cancelled; staff still can.
- [X] T055 [US2] **FR-016a — POLICY SUPERSEDED.** `v2.md` is `current`, `v1.md` is `superseded`. ⚠ **FR-016a — SUPERSEDE THE PUBLISHED POLICY.** Author `packages/legal-content/src/documents/refunds-returns/v2.md` with `status: current` and a new `effectiveDate`, and mark `v1.md` `status: superseded`. It currently says an order may be cancelled *"before it is dispatched"* (looser than A2) and *"to cancel, use the app"* (untrue until this ships).
  - ⚠ **A NEW VERSION, NOT AN EDIT.** The 045 system is version-file based precisely so a document a customer has already read keeps its text and its date. Rewriting `v1.md` in place would change, with no record, a policy people relied on — and the version history the storefront renders would show one document that has always said whatever it says today.
  - ⚠ **This is a task, not an observation.** A live legal document outliving the product it describes is the defect. Ships in the same change as T054, or the policy still lies.
- [X] T055a [US2] ✅ `legal:gen` run; `documents.ts` + `LegalContent.kt` regenerated; `@effy/legal-content` green (9 tests). ⚠ **Regenerate and commit the derived legal artifacts**: `pnpm --filter @effy/legal-content legal:gen`, then commit `src/generated/documents.ts` **and** the mobile `LegalContent.kt`. **Without this the whole workspace suite goes RED** — `@effy/legal-content`'s `test` script runs `check.mjs` first, which fails with *"drift: src/generated/documents.ts is stale"*. ⚠ A red suite that looks like a regression is how a correct change gets reverted.
- [X] T056 [P] [US2] ⚠ **AND IT FOUND ONE BEYOND CANCELLATION**: v1 promised "refund **or replacement**" for missing/damaged/incorrect items, and the platform has **no replacement mechanism and no back-office order creation** — verified, not assumed. v2 promises a refund for those cases and keeps the ACL entitlement, which cannot be excluded, as something arranged with the customer directly. **SC-010a** **SC-010a**: read the corrected policy against the built behaviour — not against this spec — and confirm no sentence describes a capability the product lacks.

---

## Phase 6: User Story 5 — The customer can see what happened to their money (P2)

**Goal**: a shopper can answer "where is my money" without contacting anyone.

**Independent test**: refund part of an order and confirm both customer surfaces show the refund, the
revised total, and honest timing.

- [X] T057 [US5] ⚠ **ALL FOUR FIELDS ARE `omitempty`, AND THAT IS SC-011** — an unrefunded order serialises byte-identically to its pre-055 self: no empty array, no "0.00", no `fullyRefunded:false`. **NEGATIVE PROOFS ✅ EXECUTED** (counting `submitting` toward the total; making `fullyRefunded` a first-refund flag). Extend the customer `OrderDTO` Extend the customer `OrderDTO` with `refunds`, `refundedTotal`, `amountPaidAfterRefunds`, and a **derived `fullyRefunded`** (FR-023). ⚠ Derived from the totals, not a stored flag, and reaching it piece by piece must look identical to reaching it in one act. ⚠ **The receipt is unchanged** (FR-024) — what was charged is a historical record; a refund is a later event shown alongside it, never folded into it.
- [X] T058 [US5] ⚠ An unknown state degrades to `on_its_way`, **never** `completed` — telling a shopper their money arrived is the one claim that stops them looking for it. Map five internal states to **three** ⚠ Map five internal states to **three** customer-facing ones (`on_its_way` / `completed` / `there_was_a_problem`). A shopper cannot act on the difference between `submitting` and `submitted`, and `refused` vs `failed` is our problem.
- [X] T059 [US5] ⚠ **STRONGEST FORM: THE COLUMN IS NEVER SELECTED.** `refundRow` has no `failure_reason` field, so no mapper can leak it by accident. Asserted on the DTO, the web block and the mobile labels. No provider `failureReason` reaches a customer ⚠ **No provider `failureReason` reaches a customer** — "your bank rejected the refund" is staff information, and surfacing it invites a shopper to argue with a message they cannot act on.
- [X] T060 [P] [US5] **NEGATIVE PROOFS ✅ EXECUTED** — leaking the provider's reason fails 2 tests; promising a credit line fails 3. ⚠ **AND IT REPLACED 020's STALE COPY**: "contact support and we'll sort it out" was written when no money could move; the platform now proposes a refund for every shortfall automatically, so telling a shopper to chase money we already know we owe IS gap G3. `apps/customer-web` `apps/customer-web/app/(account)/orders/[id]/` — the refund block, and nothing at all when there are no refunds (FR-028).
- [X] T061 [P] [US5] **NEGATIVE PROOF ✅ EXECUTED** — making `amountPaidAfterRefunds` fall back to "0.00" instead of the charged total fails by name (it would tell an unrefunded shopper they paid nothing). `apps/customer-mobile` `apps/customer-mobile` — the same, at parity.
- [X] T062 [US5] ⚠ **ONE SENTENCE, THREE SURFACES** — web, mobile and the email all render the policy's own wording, and each pins it in a test. Timing wording (FR-026) ⚠ Timing wording (FR-026) — **reuse the published policy's own sentence** ("usually processed within a few business days, though the time to appear depends on your bank") rather than writing a second one, so the two cannot drift. It must **not** promise a credit line: a refund issued soon after payment may appear as a **reversal**, with the original charge simply vanishing and no separate credit ([research.md](./research.md) R2). A customer told to look for a credit will not find one.
- [X] T063 [US5] ✅ Integer cents throughout: ten ten-cent refunds come to exactly "1.00", not `0.9999…`. The charged total is asserted **not** to move (FR-024). **The numbers must add up.** ⚠ **The numbers must add up.** 051 and 052 both shipped a receipt whose lines did not, and a refund adds a second set of figures to the same document. Test the arithmetic on both surfaces.
- [X] T064 [US5] ⚠ **THE GUARDS CAUGHT TWO OMISSIONS BEFORE ANY TEST RAN** — a missing plain-text part and a missing fixture, each failing by name. `email-check` now passes 12 templates. The 12th email template The 12th email template — refund confirmation, naming the amount and order (FR-027).
- [X] T065 [P] [US5] ✅ Proven by marshalling an empty `orderDTO` and asserting none of the four keys appear. **SC-011**: **SC-011**: an order with no refunds is byte-identical to its pre-slice self on every customer surface.
- [X] T066 [P] [US5] ⚠ **AND THE SWEEP ITSELF HAD A DEFECT**: a substring check for `"shop"` fails on the platform's own domain, `effyshopping.com`, which appears in every email footer. Now a word-boundary match — a sweep that cannot survive the company's own name is one that gets deleted rather than fixed. **SC-009** **SC-009**: sweep every customer response and email for shop identity, shop count, or a provider failure reason.

---

## Phase 7: User Story 3 — A customer asks for a refund (P2)

**Goal**: the ask lands attached to the order instead of in a generic inbox.

**Independent test**: raise a request from both surfaces, confirm it reaches back-office attached to
that order, and confirm the customer is told the outcome.

- [X] T067 [US3] ✅ **PROVEN IT MOVES NO MONEY**: the payment gateway is never called and no `public.refund` row is written. `POST /v1/orders/{orderId}/refund-requests` `POST /v1/orders/{orderId}/refund-requests` — items and a message. ⚠ **It moves no money and must not read as a decision** (FR-005r); a request form that withdrew money would be exactly the wrong thing to build.
- [X] T068 [US3] **NEGATIVE PROOF ✅ EXECUTED** — disabling the `23505` branch fails both the duplicate and the 8-way race test. ⚠ The index is **partial** so a shopper whose first ask was declined can raise a second; a plain unique index would bar them forever. One open request per order One open request per order, enforced by the **partial unique index** from T003 — not a check-then-write two taps can slip between (FR-005r4).
- [X] T069 [P] [US3] **NEGATIVE PROOF ✅ EXECUTED** — removing `CloseOpenRequestForOrder` leaves the request open after its refund. ⚠ Declining carries the **same gate as paying**: telling a customer they are not owed money they believe they are owed is exactly as consequential, and nobody comes back to check it. A second decision cannot overwrite the first. `POST /v1/admin/refund-requests/{id}/decline` and closing a request when a refund is issued against it (FR-005r2).
- [X] T069a [P] [US3] Show the outcome **on the order** (FR-005r3). Show the outcome **on the order** (FR-005r3). ⚠ A decline is deliberately **not** emailed: an unsolicited "we said no" invites a reply into something that is not a conversation, and the order screen is where the shopper is already looking.
- [X] T070 [P] [US3] Already wired in Phase 3's `getOrder` composition. Surface the request on the order Surface the request on the order in `edge-api/orders`, in the customer's own words.
- [X] T071 [P] [US3] ⚠ **AND IT SURFACED A REAL DEFECT I NEARLY SHIPPED** — neither customer surface carried `orderItemId`. `order_item` has **no uniqueness on (order, product)**, so a product id cannot identify a line, and passing one where the other is expected does **not error**: the server's join matches nothing and every item the shopper named is **silently dropped**. Added to the contract, the Go DTO, the mobile `ReceiptItem` and both mappers. **NEGATIVE PROOF ✅ EXECUTED** on the mobile mapper. `apps/customer-web` + `apps/customer-mobile` `apps/customer-web` + `apps/customer-mobile` — raise a request from the order. ⚠ Replaces "Get help" pointing at the generic 046 feedback form **with no order reference attached**.
- [X] T072 [P] [US3] **11 container-backed Go tests + 4 console + 6 web.** Tests Tests: no money moves; a duplicate is refused as already open; the outcome reaches the customer; "not yours" is indistinguishable from "no such order".

---

## Phase 8: User Story 6 — A shop that cannot fulfil its portion has an exit (P3)

**Goal**: remove the last state a shop cannot get out of. Cuttable — the money is already reachable.

**Independent test**: mark a portion unfulfillable and confirm it leaves the shop queue and appears to
back-office as awaiting a decision.

- [ ] T073 [US6] `POST /shop/v1/fulfillments/{id}/unfulfillable` in `apis/edge-api/shop/` with a reason. ⚠ **Moves no money** (FR-031).
- [ ] T074 [US6] Refuse it once the portion is collected — the goods have left the shop and it is no longer their call.
- [ ] T075 [P] [US6] Surface it to back-office as awaiting a refund decision.
- [ ] T076 [P] [US6] Shop-web and shop-mobile controls, at parity.
- [ ] T077 [P] [US6] Tests: the queue exit, the collected refusal, and that no money moves.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T078 FR-030 stock return (**US1**'s last piece) in `refunds/stock.go` — ⚠ **only** for an item-derived refund on an uncollected portion of a tracked product ([research.md](./research.md) R8). A goodwill refund returns nothing (it names no items); a collected portion returns nothing (the goods are gone). ⚠ Inventing stock is worse than not returning it.
- [ ] T079 [P] Test (**US1**): the three cases above, and that a `refund` movement is written with the order cited.
- [ ] T080 [P] FR-032: a cancelled or fully refunded order must not block account closure as "in transit" — the 053 fix, extended to the states this slice introduces.
- [ ] T081 [P] Four counters in `internal/platform/metrics/metrics.go` ([research.md](./research.md) R9). ⚠ Pin the **label name per metric** — 054 declared one with `outcome` and called it with `stage`, which does not panic; it silently emits a series every alert misses.
- [ ] T082 [P] Test: every counter has a call site, and no label carries an order id, customer id or amount.
- [ ] T083 ⚠ `infra/observability/alerts/055-refunds-cancellation.yml` + register it in that README — a sustained `failed` rate, and a refund stuck in `submitted` (the shape an insufficient-balance hold takes, which otherwise looks like nothing at all). ⚠ **Written and INERT**: no Prometheus stack exists. Recorded in the plan's Complexity Tracking.
- [ ] T084 [P] Append-only guard for `public.refund` — no `UPDATE`/`DELETE` outside the permitted status transitions. 054's mechanism, second outing.
- [ ] T085 [P] Run every machine gate in [quickstart.md](./quickstart.md) §1 and record the counts. ⚠ Count reporting packages — 029 found `pnpm -r test` green while `typecheck` failed.
- [ ] T086 [P] Confirm the two pre-existing red gates are unchanged at clean HEAD (`saveditems`, `platform/delivery`) so they are not attributed to this slice.
- [ ] T087 [P] Update `docs/audiences/customer-capabilities.md` §055, `docs/audiences/shop-capabilities.md` §055, and ⚠ **`docs/order-console-guide.md`** — 053's operator guide for the very screen this slice adds a money-moving control to.
- [ ] T088 [P] Update `ORDER-FLOW-GAPS.md` — **G3 closed**; ⚠ record what it does NOT close: replacements, disputes, substitutions, and shop cost attribution.
- [ ] T089 [P] Update `CLAUDE.md`'s Active feature section.
- [ ] T090 Write `specs/055-refunds-cancellation/SIGNOFF.md` — what was machine-verified, what a person walked, and what was not.

### Operator steps (⚠ NOT run by the assistant)

- [ ] T091 Commit the migration, then `make db-up ENV=dev`.
- [ ] T092 ⚠ `make apply ENV=dev` **first** — `core-api` needs the back-office pool id, its client ids, and the back-office origin in its CORS allowlist ([research.md](./research.md) R1), or every console refund call fails at the pre-flight.
- [ ] T093 `make core-image-push ENV=dev && make core-deploy ENV=dev` — ⚠ the `&&` matters: on 2026-08-29 a failed push was followed by a deploy of a two-day-old image.
- [ ] T094 `make edge-deploy SERVICE=orders ENV=dev` and `SERVICE=shop ENV=dev`.
- [ ] T095 Register the `refund.*` webhook events with the provider and confirm they reach the endpoint.

### The walks a suite cannot do

- [ ] T096 [P] Walk **US1**'s validation — quickstart §3 — staff refunds, timed (SC-001).
- [ ] T097 ⚠ Walk **US4**'s validation — quickstart §4 — **the failure path**, including forcing a real `refund.failed`. The most important walk in the slice: it is the one that proves the platform does not lie about money.
- [ ] T098 [P] Walk **US2**'s validation — quickstart §5 — cancellation, and **read the corrected policy against the product** (SC-010a).
- [ ] T099 [P] Walk **US3/US5/US6** validation — quickstart §6–§8 — proposals, requests, customer visibility (SC-008's five observers), stock and the shop exit.
- [ ] T100 ⚠ **Look at it** (quickstart §10): both customer surfaces with a refund in each state; light, **dark**, large text; a failed refund legible with **no colour at all**; the console's money-moving control; and the confirmation email in a real client. 039 shipped four live defects with a fully green suite.

---

## Implementation status — 2026-08-29 (updated)

**29 of 106 — Phases 1, 2, the US1 service and the cold-path read complete.**

⚠ **The proposals derivation is proven against the REAL migrations, not a schema subset.** 053's
container harness hand-writes its tables; this one applies all 57 migrations, because the derivation
reads five tables across three slices (020's shortfall, 054's stock, 055's refunds) and a hand-written
subset could pass against a schema the platform does not have. It immediately earned that: the fixture
was refused first by `order_item_product_id_fkey` (a random uuid for a real FK) and then by **my own
`refund_goodwill_needs_note_ck`** — the constraint doing its job on the person who wrote it. The blocking foundation is in: the back-office verifier, the
append-only refund repository, the ceiling under a row lock, and the negative proofs for both.

**⚠ THE CONCURRENCY PROOF WAS WORTHLESS AT FIRST.** Two goroutines racing `Record` finish fast enough
to serialise by accident, so `TestCeiling_Concurrent…` **passed with the row lock removed**. It needed
a barrier — and the barrier had to sit **BEFORE** the lock: placing it after deadlocks, because the
first goroutine holds the row while the second waits for a signal it can never send. With the barrier
and no lock: **`expected 1, actual 2`** — a customer refunded twice against one payment.

**⚠ Two existing guards caught this slice's changes, which is them working:**
- 054's one-rule guard flagged `admin.staff.status = 'active'` in the new staff gate → given a
  point-of-use `availability-exempt:` marker naming the table.
- **035's config-contract guard** (sixth outing) refused the build the moment `config.go` required
  `AUTH_BACK_OFFICE_*` without `infra/envs/dev/core-api.tf` declaring it — *"the service boots
  fail-closed in dev and dies on deploy, or worse, resolves an empty value."* Terraform and the
  Makefile now declare both, and ⚠ the SSM key `/effy/dev/auth/back-office/user_pool_id` was verified
  to exist against live AWS rather than assumed.

**⚠ A SILENT-TRUNCATION DEFECT FOUND BY A TEST.** `money.ParseCents` **truncates** past two decimals —
documented, and correct for its original use (values from a `numeric(12,2)` column, which never have
extra digits). It is wrong for a **goodwill amount typed by a human**: an operator entering `12.345`
would have refunded $12.34 with nothing on screen saying so. `goodwillCents` now refuses it. ⚠ The fix
is in this slice, not in `money` — changing the shared helper would ripple across every wire amount on
the platform to solve a problem only free operator input has.

**⚠ One defect of my own, caught by reading it back**: `auth/staff.go` first joined
`admin.role r ON r.id = sr.role_id`. The real schema keys `admin.role` on `key` (a text PK) and
`staff_role` joins on `role_key` — it would have compiled, deployed, and refused **every** staff member
at runtime. Written from the migration afterwards, not from memory.

## Implementation status — 2026-08-29

**6 of 106 done — Phase 1 (Setup) complete.** Nothing is half-finished: every `[X]` builds, typechecks
and tests green.

**Verified this session**: the **whole 56-migration chain applies cleanly against real PostgreSQL 16**
(Docker up), and every new constraint was proven to refuse what it claims —
- goodwill without a note → `refund_goodwill_needs_note_ck`
- item-kind carrying the goodwill reason → `refund_goodwill_reason_ck`
- a duplicate idempotency key → `refund_idempotency_key_key`
- **deleting a refunded order → `refund_order_id_fkey`** (the RESTRICT that keeps a record of money
  from vanishing with the row it points at)
- a second open request on one order → `refund_request_one_open_uq`
- `failed` with no reason → `refund_failure_has_reason_ck`

Plus: `go build`/`vet`/`gofmt` clean · `go test -short ./...` all packages · `pnpm -r typecheck` 19/19 ·
generated Kotlin verified as `Long`, not `Double` (027 R13 avoided).

⚠ **The compile-time interface assertion earned its keep**: adding `CreateRefund` to `PaymentGateway`
failed the build at `var _ PaymentGateway = (*StripeGateway)(nil)` before any test ran.

**Next**: Phase 2 (T007–T015) — the back-office `PoolVerifier`, the append-only refund repository, and
the `SUM`-under-lock ceiling. ⚠ T007 is the slice's one structural change and the highest-risk piece:
`core-api` has accepted only customer tokens until now.

---

## Dependencies

```
Phase 1 (Setup) ─▶ Phase 2 (Foundational, BLOCKING: verifier + records + ceiling)
                        │
                        ├─▶ Phase 3  US1 (P1)  staff refunds          ── money starts moving
                        │        │
                        │        └─▶ Phase 4  US4 (P1)  the failure path
                        │                 │
                        │                 ├─▶ Phase 5  US2 (P1)  cancellation + FR-016a prose
                        │                 └─▶ Phase 6  US5 (P2)  customer visibility
                        │
                        ├─▶ Phase 7  US3 (P2)  customer requests   ── needs Phase 2 only
                        └─▶ Phase 8  US6 (P3)  shop exit           ── needs Phase 2 only
                                          │
                                          └─▶ Phase 9 (Polish)
```

- **US4 gates US5**, deliberately. Customer-facing refund state must not ship before the platform can
  learn a refund failed.
- **US2 depends on US1** — a cancellation *is* a full refund (R3), so it reuses the whole issuing path.
- **US3 and US6 are independent of everything but Phase 2** and can be built in parallel by others.
- **T055 (the policy correction) must ship with T054**, or the published document still lies.

## Parallel execution examples

- **Phase 2**: T012–T015 are four independent proofs once T010/T011 land.
- **Phase 3**: T022–T026 are five independent test files; T030–T032 (console) run alongside T027–T029
  (cold-path reads) — different repositories entirely.
- **Phase 6**: T060 (web) and T061 (mobile) touch no shared file.
- **Phase 9**: T079–T089 are all `[P]`.

## Implementation strategy

**MVP = Phases 1 + 2 + 3 + 4.** Not just US1: shipping the ability to refund *without* the ability to
learn a refund failed would put the platform in a worse position than today, because it would start
making a promise it cannot verify. US1 and US4 are one deliverable.

**Then Phase 5 (US2)** — the cancellation control the published policy already claims exists, shipped
together with the correction to that policy.

**Then Phase 6 (US5)** — makes the money legible and removes the support contacts the feature was
supposed to prevent.

**Phases 7 and 8 are the cut line.** US3 improves where a request lands; US6 removes a stuck state.
Dropping either invalidates nothing above it.
