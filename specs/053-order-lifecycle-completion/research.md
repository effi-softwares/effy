# Research: Order Lifecycle Completion (053)

**Date**: 2026-08-26 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Every decision below was checked against the code, not against the specs that describe it. Where a
prior slice's note turned out to be stale, that is recorded rather than quietly corrected.

---

## R1 — Path assignment (Principle III, mandatory)

**Decision**: four pieces, three paths, none of them new.

| Piece | Path | Why |
|---|---|---|
| Back-office order console: find, read, record handover, record arrival | **Cold** | Low-frequency internal operator work. Identical in kind to `shops`, `promotions`, `delivery`, `feedback`, `drivers`. |
| Customer order read + progress stage | **Hot** — already built | `core-api/internal/features/orders`. This feature adds **no** customer read surface; it changes one rule inside the existing one. |
| Account-closure blocking rule | **Cold** — already built | `edge-api/customer/src/closure`. One predicate. |
| Arrival notification (push + email) | **Cold** — already built | `edge-api/notifications` worker, on its existing schedule. |

**Rationale**: nothing here is latency-sensitive customer traffic, and nothing here is admin CRUD sitting
on the hot path. The one boundary crossing is recorded in R2.

**Alternatives considered**: putting the console reads on the hot path (rejected — `core-api` serves
customers; an operator console has no latency claim and would import back-office RBAC into the hot path).

---

## R2 — The cold path writes `shop_fulfillment`, which the hot path owns

**Decision**: accept it, as an already-established precedent rather than a new exception.

`shop_fulfillment` is created by `core-api`'s checkout finalize. It is already written from the cold path
in two places today: `apis/edge-api/shop/src/fulfillments/repository.ts` (the shop console advancing a
portion) and `apis/edge-api/driver/src/delivery/repository.ts:223` (the driver marking a portion
delivered). Recording an arrival from the back-office is the same act as the second of those, performed
by a different actor.

**⚠ Correction to a note in the codebase.** `edge-api/customer/src/closure/repo.ts` justifies its own
cross-path read with "calling `core-api` instead was rejected because it HAS NO CLOUD DEPLOY
(local-Docker-only by platform decision)". **That has been false since 040** — `core-api` is deployed and
live at `core-api.dev.effyshopping.com`. The exception may still be the right call on other grounds
(one narrow owned predicate, no order data projected into the account domain), but the reason recorded
for it is stale and should not be cited as precedent by this feature. Recorded in Complexity Tracking.

---

## R3 — Where the handover lives: a table, and **no new status**

**Decision**: a new `public.carrier_handoff` table, one row per package. **`shop_fulfillment.status`
gains no new member.** A package goes `collected → delivered`; the handover row's *existence* is the
precondition FR-006 checks.

**Rationale** — three reasons, in order of weight:

1. **A new status would buy nothing the customer sees.** A package in a carrier's van and a package on
   the hub floor are the same fact to a shopper: *on the way*. The customer-facing stage would map both
   to the same word, so the status would exist only to be mapped.
2. **It keeps the stage rank map auditable.** `orders/stage.go`'s map is being edited by this feature for
   exactly one reason (R4). Adding a member at the same time would mean two edits to one map in one
   slice, and a reviewer could no longer tell which was the correction.
3. **A status plus a table is two sources for one fact,** and they can disagree. The platform already
   uses existence-as-fact where the state machine does not need a step: `collection_task_issue` for a
   shortfall, `proof_of_delivery` alongside a `delivery_task`.

The operator's distinction — awaiting handover vs. handed over, awaiting arrival — is a **join**, not a
state. That is the correct place for it: it is a question the console asks, not a fact the order carries.

**Alternatives considered**: a `handed_over` status (rejected above); columns on `shop_fulfillment`
(rejected — the reference and the actor are handover facts, not package facts, and nullable columns
would make "no handover yet" and "handover with no reference" indistinguishable, which FR-003 forbids).

---

## R4 — The FR-016 correction is one line, and that is the whole point

**Decision**: in `apis/core-api/internal/features/orders/stage.go`, `ready_for_pickup` moves from
rank **2** to rank **1**. Nothing else in the map changes.

After the change: rank 1 (`received`, `picking`, `ready_for_pickup`) → **packing**; rank 2 (`collected`)
→ **on the way**; rank 3 (`delivered`) → **delivered**.

**Rationale**: `ready_for_pickup` means *packed and waiting at the shop for the next scheduled collection
round* — under the hub-and-spoke model settled in 049, that can be the following day. It has not left.
`collected` means a driver has it and the shop no longer does, which is genuinely departed.

**⚠ This is the payoff of 052's server-derived stage.** Because the rule lives in one place and both
customer surfaces render what the server sends, correcting it on the website and in the app is the same
one-line edit. Had 052 not deleted customer-web's `summarizeFulfillment`, this would have been two edits
that could disagree.

**Verification**: `stage_test.go` must be updated in the same change, and the correction must be provable
by reverting it — the old ranking must fail a test that names the shop-shelf case.

---

## R5 — The account-closure predicate is wrong in **two** directions, not one

**Decision**: `edge-api/customer/src/closure/repo.ts` — `f.status <> 'collected'` becomes
`f.status <> 'delivered'`.

**⚠ The register that opened this feature understated the bug.** The predicate is wrong twice:

| Package state | Reality | Today's predicate `<> 'collected'` | Correct |
|---|---|---|---|
| `delivered` | Arrived. Should not block. | `'delivered' <> 'collected'` is **true** → **blocks** ❌ | must not block |
| `collected` | At the hub, genuinely in transit. Should block. | `'collected' <> 'collected'` is **false** → **does not block** ❌ | must block |

So an arrived order blocks closure, and an in-transit one does not. Both are fixed by the same edit,
because `delivered` is the only terminal state.

The comment above it says the term was written early so the block would "become correct automatically
when the delivery lifecycle lands". The lifecycle landed in 049 with a **different terminal state** than
the one the predicate was written against. Worth recording as a pattern: a forward-written predicate
pinned to a *specific value* does not survive a vocabulary change — it fails silently and in both
directions.

---

## R6 — The arrival record, and why the driver path must write it too

**Decision**: a new `public.package_arrival` table, `UNIQUE (shop_fulfillment_id)`, carrying when it
arrived, who or what recorded it, and **how it was learned** (`driver_proof` | `staff_recorded` |
`carrier_signal`, the last reserved and unused).

**⚠ The existing driver delivery path must be extended to write this row.** Today a same-day arrival is
evidenced only by `proof_of_delivery` + `delivery_task.status='delivered'`. If only the new back-office
path writes `package_arrival`, then FR-008 and SC-010 ("every arrival can be attributed") are false for
every same-day order — the majority of arrivals the platform has actually recorded so far. This is scope
the spec implies and the register did not name.

**Rationale for `source` existing at all**: FR-009 requires a future carrier signal to take over the
recording job without the lifecycle being rebuilt. A column that already distinguishes *how we learned*
makes that a new value, not a new design — and it makes the eventual audit question ("which of these
arrivals did a human assert?") answerable.

**Alternatives considered**: reusing `proof_of_delivery` (rejected — it models *proof at the doorstep*:
a photo, a signature, a delivery code. A back-office record of a carrier's arrival has none of those, and
widening that table would make its every column nullable and its meaning vague).

---

## R7 — ⚠ A new edge service, because `admin` is at the CloudFormation limit

**Decision**: a new cold-path service **`apis/edge-api/orders`**, attached to the existing shared HTTP
API and referencing the **admin** pool's JWT authorizer by id from SSM. It is not a new pool, a new
gateway, or a new audience — it is a fourth attachment to the gateway A3 built for exactly this.

**Rationale** — the forcing constraint is **measured** (T001, 2026-08-26):

```
serverless package --stage dev  →  cloudformation-template-update-stack.json

TOTAL RESOURCES: 434 / 500          HEADROOM: 66
  77  AWS::Logs::LogGroup           75  AWS::ApiGatewayV2::Integration
  77  AWS::Lambda::Function         75  AWS::ApiGatewayV2::Route
  77  AWS::Lambda::Permission       48  AWS::CloudWatch::Alarm
```

- **A route costs ~5 resources** (log group + function + permission + integration + route), plus roughly
  0.6 of an alarm at admin's current ratio. This feature's ~6 routes are therefore **~30–34 resources**.
- Putting them in `admin` would land it at **~465/500**, leaving ~35 — about **one more feature** of
  runway, in the domain where **refunds, cancellation and returns are all queued behind this one**.
- The cheap mitigation is already spent: `versionFunctions: false` (serverless.yml line 35) was forced
  by 049 when the driver routes hit the ceiling. There is no second lever.

**Verdict**: the routes *would* fit today. They are still going in a separate service, because 66
resources of headroom is not room for a domain that is about to triple in size — and discovering that
mid-refunds means doing this split anyway, larger and under pressure.

⚠ The number above replaces this section's original estimate. It was taken, not inferred — 035's lesson
was that a config assumption nobody checked cost four env vars, no email at all, and a hundred passing
tests that missed it.

**Consequence for Principle II**: `feedback/authz.ts`'s `isActiveStaff` / role-gate pair is needed by
both services. It is **promoted to `@effy/edge-shared`** and both consume it — the 028 pattern, where
the proof the extraction changed nothing is that the existing service's tests pass unmodified.

**Alternatives considered**: adding the routes to `admin` (rejected on the measurement above); a
dedicated gateway (rejected — A3's whole point is one gateway, many services).

---

## R8 — One intent, two channels: `notification_request` gains a `channel`

**Decision**: add `channel` (`push` | `email`) and a nullable `recipient_email` snapshot to
`public.notification_request`. One event produces one row per channel. The notifications worker fans out
by channel; the email branch renders a new `order-delivered` template through `@effy/email-kit`.

**Scope boundary, stated so it is not exceeded**: this feature uses the email channel for
**`order_delivered` only**. The mechanism makes `order_ready` and `order_out_for_delivery` a *values*
change later; adding them here would be scope creep. `order_paid` already has an email — 052's receipt,
via `receipt_dispatch` — and must **not** gain a second one.

**Rationale**: telling a customer their order arrived is **one intent delivered on two channels**, not
two messages. Modelling it that way puts "does this person have the app?" at delivery time, where it
belongs, instead of at production time, where the arrival transition would have to know and care. It
also reuses the exactly-once `dedupe_key` that already works, the existing drain schedule, and the
existing `pending|sent|failed|skipped` vocabulary.

**⚠ Snapshot the address at enqueue, not at send** — 052's rule. A customer who later changes their
account email must not retroactively redirect a message about an order that has already arrived.

**Alternatives considered**:
- *A second reason on `receipt_dispatch`* (`reason='order_delivered'` plus a second partial unique
  index). Genuinely close, and smaller. Rejected because that table sends **the receipt** — it is named
  for it and 052 built its resend semantics around it. An arrival notice is not a receipt, and the
  cheapest change is not worth blurring what a table means.
- *A third outbox table.* Rejected — a third drain, a third schedule, a third set of retry semantics,
  for a message that already has an outbox with the right idempotency.

---

## R9 — Design reference (Principle V)

**Decision**: **eBay Seller Hub's order management** is the reference for the console — a filterable
order table, and an order detail built as sectioned rows with a chronological history. Uber Eats is the
reference for nothing here; the customer side gains no new screen.

**⚠ No cards, and this is a page that invites them.** An order detail is exactly where the
dashboard-card instinct fires — a "Payment" card, a "Delivery" card, a "Packages" card. Principle V
forbids it: sectioned pages, tables and detail rows. There is no metric row at the top.

**The order history is a list, not a timeline widget** — it reads as rows of *when, what, who*, which is
what an operator answering a customer needs to scan.

---

## R10 — Telemetry (Principle VII, mandatory for a user-facing flow)

**Metrics** (low-cardinality labels only, no PII):
- `order_arrival_recorded_total{source}` — the count that answers "is anyone actually closing these out?"
- `carrier_handoff_recorded_total{has_reference}` — proves FR-003's absent-reference case is real traffic.
- `order_completed_total` — orders reaching finished state. **The headline number this feature exists to
  move off zero.**
- `notification_email_send_failed_total{type}` — the delivered-email failure the worker must not swallow.

**Alert**: one on `notification_email_send_failed_total`. 038 and 046 both deferred their equivalents;
this one is not deferred, because an arrival email is the only message a web-only customer gets.

**Product analytics**: back-office is internal and PostHog is already on-by-default on the consoles (048).
No new customer-facing client event — the customer gains no new screen.

---

## R11 — What this feature deliberately does not fix

Named here so nothing downstream reads it as covered:

- **A failed same-day delivery still strands its order.** `driver/src/delivery/repository.ts:280` marks
  the `delivery_task` failed; the package stays `collected` and the customer is told nothing. After this
  feature ships it is the **only** remaining way an order gets stuck — worth its own slice, and worth
  reconsidering whether a failed drop should route into `carrier_handoff` as a re-attempt.
- **Nothing that moves money**, including the shortfall case where a customer has paid for goods they
  will not receive.
- **Stock and availability.**
- **A carrier contract.** Operator input; the constitution forbids inferring it.
