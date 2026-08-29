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

- [ ] T001 Write the forward-only Goose migration `db/migrations/<timestamp>_refunds_cancellation.sql` — `public.refund`, `public.refund_line`, `public.refund_request`, `public.refund_request_item`, `public.refund_proposal_dismissal`, per [data-model.md](./data-model.md) §1–4. `COMMENT ON` every table and column.
- [ ] T002 In the same migration, widen two existing CHECKs ([data-model.md](./data-model.md) §6): `public.stock_movement.reason` gains `refund` — 054 wrote *"the CHECK grows when the slice that needs it lands"* — and `public.shop_fulfillment.status` gains a terminal `unfulfillable`. ⚠ **Widen, never replace** (the third widening of that status CHECK): no data migration, no rewrite of the fan-out.
- [ ] T003 ⚠ Add the constraints that make invalid states unrepresentable rather than merely refused: `refund.ON DELETE RESTRICT` (a record of money must not vanish with its order), `UNIQUE(idempotency_key)`, `UNIQUE(provider_refund_id)`, the goodwill-needs-a-note CHECK, and the **partial unique index** `refund_request(order_id) WHERE status='open'` (FR-005r4).
- [ ] T004 [P] Add the refund DTOs to `packages/shared-types/src/refund.ts` and export them, per [contracts/refunds-api.contract.md](./contracts/refunds-api.contract.md). ⚠ Use `WireInt` for every integer (027 R13 — 054's first draft generated `Double` and only reading the Kotlin back caught it).
- [ ] T005 [P] Register the refund DTOs in the customer and shop Kotlin generators, run both `contract:gen` scripts, commit the regenerated output.
- [ ] T006 ⚠ Extend `PaymentGateway` in `apis/core-api/internal/features/checkout/gateway.go` with `CreateRefund` and refund-event parsing, implemented in `stripegateway.go` on the **existing** client. Not a second way of talking to the provider (Principle VI).

---

## Phase 2: Foundational (BLOCKING — no user story starts until this is done)

**Purpose**: the records, the derived totals, the ceiling and the back-office identity — with **nothing
able to issue a refund yet**. Everything here is provably inert.

- [ ] T007 ⚠ Add a **back-office `PoolVerifier`** in `apis/core-api/cmd/core-api/main.go` alongside the customer one, and an `/v1/admin` route group behind it. ⚠ This is the slice's one structural change and [research.md](./research.md) R1 is why: per-pool validation with a pinned issuer is the shape Principle IV sanctions; the rejected alternative — the cold path forwarding an operator's token — is the auth-brokering it forbids by name.
- [ ] T008 Add a back-office staff gate reading `admin.staff` (not the `cognito:groups` claim): **write = admin/manager** (FR-019). ⚠ Reading lives on the cold path, where `csa` can do it (FR-020).
- [ ] T009 [P] **NEGATIVE PROOF (quickstart §2e)** — a **customer** token is refused by an `/v1/admin` route. ⚠ `core-api` accepted only customer tokens until today; this is new attack surface on the service that holds the payment secret. **The reverse direction is T053a**, in Phase 5, because the customer route it needs does not exist until then.
- [ ] T010 `apis/core-api/internal/features/refunds/repository.go` — the append-only refund writes and the **derived** totals. ⚠ No `refunded_amount` column exists and none is added ([research.md](./research.md) R7, 027's counted-not-stored rule): a counter and the rows can disagree, and then nobody knows which is true.
- [ ] T011 ⚠ The ceiling, as a `SUM` **inside the writing transaction under a row lock** — never a read-then-write. Two staff refunding at once is the case it exists for. ⚠ The ceiling is `payment.amount`, **not** `order.grand_total_amount` ([research.md](./research.md) R10): they can differ, and the wrong one refunds money that never arrived.
- [ ] T012 [P] ⚠ Exclude `submitting` from every total and from the ceiling (FR-005e). Until the provider has it, no money is on its way — counting it would let a refund that was never accepted reduce what can be refunded.
- [ ] T013 [P] **Container-backed proof (SC-002)**: two concurrent refunds against one order never exceed what was paid. ⚠ `docker info` first — 052 lost a session's exactly-once proofs to a silent skip.
- [ ] T014 [P] **NEGATIVE PROOF (quickstart §2a)**: remove the lock from the ceiling and confirm T013 fails.
- [ ] T015 [P] **NEGATIVE PROOF (quickstart §2h)**: add a stored `refunded_amount`, let it drift from the rows, and confirm the two disagree — the reason R7 chose derivation.

**Checkpoint**: refunds can be recorded and totalled; nothing can move money.

---

## Phase 3: User Story 1 — Staff refund an order that went wrong (P1)

**Goal**: a staff member can return money, in whole or in part, with a reason and an audit trail.

**Independent test**: take a paid order with a recorded shortfall, refund the affected line from the
console, and confirm the money is returned, the total reflects it, and the action is attributed.

- [ ] T016 [US1] `refunds/service.go` — the two kinds (FR-003). ⚠ **Item-derived amounts are COMPUTED from the selected lines and an `amount` in the request is REJECTED, not ignored** (A7a): if the client could send one, it and the lines could disagree, and the record would claim a refund covered items it did not.
- [ ] T017 [US1] Goodwill refunds: a free amount with a **mandatory note** (FR-003c). It exists so the honest case for an untied amount — a late delivery — does not have to borrow a line and put a false statement in the audit trail.
- [ ] T018 [US1] Per-line ceiling (FR-003a): `SUM(quantity)` across a product's refund lines vs `order_item.quantity`. The same unit cannot be refunded twice.
- [ ] T019 [US1] ⚠ The **derived** idempotency key (FR-005) — from the order, the lines and the action, never random. It is both our uniqueness constraint and the key sent to the provider, so an ambiguous retry cannot create a second refund *there* either.
- [ ] T020 [US1] Map Effy's reason vocabulary to the provider's on the way out ([research.md](./research.md) R5). ⚠ **`fraudulent` is never sent** — the provider's own documentation says it blocklists the payer's card and email, a consequence for a person beyond this order, decided in a console with no review step.
- [ ] T021 [US1] `refunds/handler.go` — `POST /v1/admin/orders/{orderId}/refunds`, behind the T008 gate.
- [ ] T022 [P] [US1] Service tests: the computed amount, a rejected client amount, goodwill without a note, over-ceiling with the remaining amount stated, a line already fully refunded.
- [ ] T022a [P] [US1] Test (**FR-011**): the amount sent to the provider equals the derived or entered amount **exactly** — nothing subtracted for the processing fee. ⚠ The fee is Effy's cost, and deducting it would breach the consumer guarantees the published policy itself invokes.
- [ ] T023 [P] [US1] **Container-backed proof (SC-003)**: the same refund submitted twice returns the money once.
- [ ] T024 [P] [US1] **NEGATIVE PROOF (quickstart §2b)**: make the idempotency key random and confirm T023 fails.
- [ ] T025a [P] [US1] **NEGATIVE PROOF (quickstart §2i)**: add a destination field to the refund request and confirm it would let a caller redirect another person's money — the reason FR-006/A4 forbid one. Revert.
- [ ] T025 [P] [US1] **NEGATIVE PROOF (quickstart §2d)**: accept an `amount` on an item-derived request and confirm the lines and amount can then disagree.
- [ ] T026 [P] [US1] Test: a `csa` is refused every write, identically whichever order is named (FR-019/FR-021); an `admin` succeeds.
- [ ] T027 [US1] `apis/edge-api/orders/src/` — return refunds on the order read (FR-020), and an **awaiting-a-decision** filter on the list (FR-004c). ⚠ Cold path: `edge-api/admin` is at 434/500 CloudFormation resources with `versionFunctions:false` spent; `orders` has room.
- [ ] T028 [US1] Derive **proposed refunds** from shortfalls with no covering refund line (FR-004a), plus the dismissal row that suppresses one (FR-004b). ⚠ **No proposals table** ([data-model.md](./data-model.md) §4): a proposal is a view of other facts, and storing it means it can go stale when a picker corrects a quantity — recording only the *exception* keeps the happy path derived.
- [ ] T029 [P] [US1] Test: a shortfall edited three times yields **one** proposal, not three (FR-004b).
- [ ] T030 [US1] `apps/back-office/src/features/orders/` — issue a refund, dismiss a proposal, read the history. Detail rows and a table, **no cards** (Principle V).
- [ ] T031 [US1] ⚠ The refund control must not be triggerable by accident — it moves money. A confirmation step naming the amount and what it covers.
- [ ] T032 [P] [US1] Console tests. ⚠ Assert on behaviour, not class names (052's `MethodList.test.tsx` asserted nothing for weeks), and read the refusal off the **plain object** the api-client throws (053's defect; 054 fixed the `fields`/`errors` mapping it depended on).

**Checkpoint**: money can be returned. Nothing yet knows whether it arrived.

---

## Phase 4: User Story 4 — A refund that does not arrive is not silently lost (P1)

**Goal**: the platform learns when a refund fails, and stops claiming money was returned.

⚠ **Built before anything customer-facing.** A refund is asynchronous: the bank can reject it **up to 30
days later**. A platform that records success at submission will tell customers their money is on its
way and never find out it was wrong.

**Independent test**: issue a refund, force the provider to report a later failure, and confirm the
order stops claiming the money was returned and the failure is visible to staff.

- [ ] T033 [US4] The five-state machine ([data-model.md](./data-model.md) §7). ⚠ `submitting`/`submitted` and `failed`/`refused` are separate because each pair answers a different question: has the provider got it, and could retrying ever help.
- [ ] T034 [US4] `refunds/webhook.go` — handle `refund.updated`, `refund.failed`, `charge.refunded` on the **existing** signature-verified endpoint (the sanctioned webhook exception).
- [ ] T035 [US4] Idempotent processing against the existing `stripe_event` dedup table (FR-010).
- [ ] T036 [US4] ⚠ An event for a refund the platform does not recognise is **recorded, not discarded** (FR-010). A refund issued from the provider's own dashboard is a real thing that happens, and dropping it leaves the order claiming money it no longer holds.
- [ ] T037 [US4] ⚠ Classify a submission failure before retrying (FR-005d): **ambiguous** (timeout, unreachable) retries under the SAME idempotency key, bounded, then escalates; **definite** is never retried — retrying a decision cannot change it — and the provider's own reason is surfaced to staff.
- [ ] T038 [US4] FR-005f: a staff member can tell **whether the money went** from the order screen alone. That is the only question anyone asks about a refund; a state that cannot answer it is not a state.
- [ ] T039 [P] [US4] Tests: submitted-not-refunded; a later success; a later failure clearing the claim; a redelivered event changing state at most once; an unknown refund recorded.
- [ ] T040 [P] [US4] **Container-backed proof (SC-006a)**: with the provider unreachable, no number of retries produces more than one refund.
- [ ] T041 [P] [US4] **NEGATIVE PROOF (quickstart §2c)**: count `submitting` toward the total and confirm a not-yet-accepted refund wrongly reduces the ceiling.
- [ ] T042 [P] [US4] Test: a definite refusal is **not** retried, and its reason reaches staff verbatim.

---

## Phase 5: User Story 2 — A customer asks to cancel an order (P1)

**Goal**: a shopper can cancel before anyone starts picking, and the published policy stops lying.

**Independent test**: cancel an unpicked order and confirm the full amount returns and no shop is left
holding work; then confirm a picked order offers no control and says why.

- [ ] T043 [US2] ⚠ Cancellation **is** a full refund ([research.md](./research.md) R3): `CaptureMethod: automatic` means the money is already captured, so the provider's cancel operation never applies to an Effy order. Implement it as one, reusing everything above.
- [ ] T044 [US2] `POST /v1/orders/{orderId}/cancel` — customer pool. Permitted only while **no shop has begun preparing** (FR-012, A2).
- [ ] T045 [US2] Return the **entire** amount including delivery (FR-013). ⚠ Unlike a partial refund, which does not — the delivery happened (A10).
- [ ] T046 [US2] Withdraw every shop portion so nobody picks a cancelled order, recorded (FR-014).
- [ ] T047 [US2] ⚠ Cancelling and being picked are **mutually exclusive** (FR-017) — a guarded transition, not a check-then-write.
- [ ] T048 [US2] `POST /v1/admin/orders/{orderId}/cancel` — staff may cancel at any pre-delivery stage (FR-018), because a phone call arrives after the customer's own control has closed.
- [ ] T049 [US2] `order.status = 'canceled'`. ⚠ Permitted by the CHECK since 019 and **never written** — this is its first writer, which is why the gap register could say "nothing in the codebase ever writes it."
- [ ] T050 [US2] Server-derived `cancellable` on the order DTO. ⚠ The client must **never** compute it from a stage — that is the `summarizeFulfillment` mistake 052 deleted.
- [ ] T051 [P] [US2] **Container-backed proof**: two simultaneous cancels refund once and cancel once (FR-017).
- [ ] T052 [P] [US2] Test: a picked order refuses customer cancellation but permits staff cancellation.
- [ ] T053 [P] [US2] Test: "not yours" and "no such order" are **byte-identical** refusals (FR-016).
- [ ] T053a [P] [US2] **NEGATIVE PROOF (quickstart §2f)** — a **back-office** token is refused by `POST /v1/orders/{orderId}/cancel`. The other half of T009: the isolation must hold in both directions, and this is the first phase in which the customer route exists to test it against.
- [ ] T054 [US2] `apps/customer-web` and `apps/customer-mobile` — the cancel control, present only when `cancellable`. ⚠ The wording when absent must not imply the order can never be cancelled; staff still can.
- [ ] T055 [US2] ⚠ **FR-016a — SUPERSEDE THE PUBLISHED POLICY.** Author `packages/legal-content/src/documents/refunds-returns/v2.md` with `status: current` and a new `effectiveDate`, and mark `v1.md` `status: superseded`. It currently says an order may be cancelled *"before it is dispatched"* (looser than A2) and *"to cancel, use the app"* (untrue until this ships).
  - ⚠ **A NEW VERSION, NOT AN EDIT.** The 045 system is version-file based precisely so a document a customer has already read keeps its text and its date. Rewriting `v1.md` in place would change, with no record, a policy people relied on — and the version history the storefront renders would show one document that has always said whatever it says today.
  - ⚠ **This is a task, not an observation.** A live legal document outliving the product it describes is the defect. Ships in the same change as T054, or the policy still lies.
- [ ] T055a [US2] ⚠ **Regenerate and commit the derived legal artifacts**: `pnpm --filter @effy/legal-content legal:gen`, then commit `src/generated/documents.ts` **and** the mobile `LegalContent.kt`. **Without this the whole workspace suite goes RED** — `@effy/legal-content`'s `test` script runs `check.mjs` first, which fails with *"drift: src/generated/documents.ts is stale"*. ⚠ A red suite that looks like a regression is how a correct change gets reverted.
- [ ] T056 [P] [US2] **SC-010a**: read the corrected policy against the built behaviour — not against this spec — and confirm no sentence describes a capability the product lacks.

---

## Phase 6: User Story 5 — The customer can see what happened to their money (P2)

**Goal**: a shopper can answer "where is my money" without contacting anyone.

**Independent test**: refund part of an order and confirm both customer surfaces show the refund, the
revised total, and honest timing.

- [ ] T057 [US5] Extend the customer `OrderDTO` with `refunds`, `refundedTotal`, `amountPaidAfterRefunds`, and a **derived `fullyRefunded`** (FR-023). ⚠ Derived from the totals, not a stored flag, and reaching it piece by piece must look identical to reaching it in one act. ⚠ **The receipt is unchanged** (FR-024) — what was charged is a historical record; a refund is a later event shown alongside it, never folded into it.
- [ ] T058 [US5] ⚠ Map five internal states to **three** customer-facing ones (`on_its_way` / `completed` / `there_was_a_problem`). A shopper cannot act on the difference between `submitting` and `submitted`, and `refused` vs `failed` is our problem.
- [ ] T059 [US5] ⚠ **No provider `failureReason` reaches a customer** — "your bank rejected the refund" is staff information, and surfacing it invites a shopper to argue with a message they cannot act on.
- [ ] T060 [P] [US5] `apps/customer-web/app/(account)/orders/[id]/` — the refund block, and nothing at all when there are no refunds (FR-028).
- [ ] T061 [P] [US5] `apps/customer-mobile` — the same, at parity.
- [ ] T062 [US5] ⚠ Timing wording (FR-026) — **reuse the published policy's own sentence** ("usually processed within a few business days, though the time to appear depends on your bank") rather than writing a second one, so the two cannot drift. It must **not** promise a credit line: a refund issued soon after payment may appear as a **reversal**, with the original charge simply vanishing and no separate credit ([research.md](./research.md) R2). A customer told to look for a credit will not find one.
- [ ] T063 [US5] ⚠ **The numbers must add up.** 051 and 052 both shipped a receipt whose lines did not, and a refund adds a second set of figures to the same document. Test the arithmetic on both surfaces.
- [ ] T064 [US5] The 12th email template — refund confirmation, naming the amount and order (FR-027).
- [ ] T065 [P] [US5] **SC-011**: an order with no refunds is byte-identical to its pre-slice self on every customer surface.
- [ ] T066 [P] [US5] **SC-009**: sweep every customer response and email for shop identity, shop count, or a provider failure reason.

---

## Phase 7: User Story 3 — A customer asks for a refund (P2)

**Goal**: the ask lands attached to the order instead of in a generic inbox.

**Independent test**: raise a request from both surfaces, confirm it reaches back-office attached to
that order, and confirm the customer is told the outcome.

- [ ] T067 [US3] `POST /v1/orders/{orderId}/refund-requests` — items and a message. ⚠ **It moves no money and must not read as a decision** (FR-005r); a request form that withdrew money would be exactly the wrong thing to build.
- [ ] T068 [US3] One open request per order, enforced by the **partial unique index** from T003 — not a check-then-write two taps can slip between (FR-005r4).
- [ ] T069 [P] [US3] `POST /v1/admin/refund-requests/{id}/decline` and closing a request when a refund is issued against it (FR-005r2).
- [ ] T069a [P] [US3] Show the outcome **on the order** (FR-005r3). ⚠ A decline is deliberately **not** emailed: an unsolicited "we said no" invites a reply into something that is not a conversation, and the order screen is where the shopper is already looking.
- [ ] T070 [P] [US3] Surface the request on the order in `edge-api/orders`, in the customer's own words.
- [ ] T071 [P] [US3] `apps/customer-web` + `apps/customer-mobile` — raise a request from the order. ⚠ Replaces "Get help" pointing at the generic 046 feedback form **with no order reference attached**.
- [ ] T072 [P] [US3] Tests: no money moves; a duplicate is refused as already open; the outcome reaches the customer; "not yours" is indistinguishable from "no such order".

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
