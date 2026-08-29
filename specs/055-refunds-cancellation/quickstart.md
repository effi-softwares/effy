# Quickstart — 055 Refunds & Cancellation

The validation walk. ⚠ **This slice moves real money.** A wrong pixel is a wrong pixel; a wrong refund
is someone's rent. Every proof below that involves an amount is container-backed or walked live — none
of it rests on a fake.

---

## Prerequisites

```bash
make db-status ENV=dev
docker info                     # ⚠ REQUIRED. 052 lost a whole session's exactly-once proofs to a
                                #   silent skip, and 054 nearly did. The ceiling and idempotency
                                #   proofs here are database properties; without Docker they SKIP.
make core-run                   # the hot path, which is where refunds live
./scripts/stripe-listen.sh      # forwards refund.* webhooks and syncs the signing secret
```

You need: a back-office `admin`/`manager` account, a back-office `csa` account (for the negative), a
customer account, and **a real paid test order** — refunds have nothing to act on otherwise.

---

## 1. Machine gates

```bash
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...
pnpm -r typecheck && pnpm -r test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-orders test
pnpm --filter @effy/shared-types contract:check
pnpm --filter @effy/shared-types shop-contract:check
cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64
# ⚠ shop-mobile too, if US6 was built (T076 changes it):
cd apps/shop-mobile && ./gradlew :shared:testAndroidHostTest :shared:compileTestKotlinIosSimulatorArm64
make sm-guard && make sm-tokens-check
make email-check && make brand-check
# ⚠ There is no `make legal-check` target; the legal drift guard is a package script
# and also rides `pnpm -r test`:
pnpm --filter @effy/legal-content legal:check
cd infra/envs/dev && terraform validate
```

⚠ **Two pre-existing red gates, verified at clean HEAD and NOT this slice's**: Go
`features/saveditems` (`public.delivery_pricing_rule does not exist`, recorded under 033) and
`platform/delivery` (`column z.sameday_eligible does not exist`). `make check-no-phantm` also fails on
042/045/050 prose. Confirm they are still exactly these before blaming this work.

---

## 2. The negative proofs — worth more than the suite

| # | Break this | Expect | Proves |
|---|---|---|---|
| 2a | Remove the `SUM`-under-lock from the ceiling | Concurrent refunds exceed what was paid | SC-002 is the lock, not the arithmetic |
| 2b | Make the idempotency key random instead of derived | The same action refunds twice | SC-003 |
| 2c | Count `submitting` toward the refunded total | A refund not yet accepted reduces the ceiling and shows to the customer | FR-005e |
| 2d | Accept an `amount` on an item-derived request | Lines and amount can disagree | FR-003 / A7a |
| 2e | Present a customer token to an admin refund route | Refused | Principle IV, the new verifier |
| 2f | Present a back-office token to `/v1/orders/{id}/cancel` | Refused | The isolation runs both ways |
| 2g | Drop the `refund_request` partial unique index | Two taps create two open requests | FR-005r4 |
| 2h | Store `refunded_amount` on the order and let it drift | Two sources disagree about what was refunded | Research R7 |
| 2i | Accept a destination on the refund request | A caller could redirect another person's money | FR-006 / A4 |

---

## 3. Staff refunds — US1 (SC-001, SC-002, SC-003, SC-007)

1. Open a paid order in the console. It shows what was paid and what remains refundable.
2. Refund one item. → money returns to the original method; the order records who, when, why, and which
   lines. **Time it: under 2 minutes** (SC-001).
3. Refund the same line again → refused, the same unit cannot be refunded twice (FR-003a).
4. Refund beyond what remains → refused, **stating the remaining amount** (FR-002).
5. Goodwill refund with no note → refused (FR-003c). With a note → succeeds, and reads as goodwill, not
   as covering items (FR-003b).
6. Submit the same refund twice fast (double-click) → **one refund** (SC-003).
7. As `csa`: reading the order and its refunds **works**; every issue attempt is **refused**, and the
   refusal is identical whichever order is named (FR-019/FR-021).

---

## 4. ⚠ The failure path — US4 (SC-006, SC-006a, SC-006b)

**This is the section most likely to be skipped and the one that matters most.** A refund that the
platform believes succeeded, and did not, is worse than no refund — the customer waits for money that
is never coming and nobody knows.

1. Issue a refund. Before the webhook arrives, read the order → it says **on its way**, not refunded
   (FR-007), and does **not** count toward the refunded total (FR-005e).
2. `stripe trigger refund.updated` → the order records it as completed and the customer is emailed.
3. ⚠ `stripe trigger refund.failed` → the order **stops claiming** the money was returned, the reason
   is recorded, and it is visible to staff as needing attention (FR-009).
4. Redeliver the same event → recorded state changes **at most once** (FR-010).
5. Send an event for a refund the platform has no record of (a refund issued from the Stripe dashboard)
   → **recorded, not discarded**, and no order is corrupted.
6. Point the gateway at an unreachable host and issue a refund → it retries under the **same**
   idempotency key; however many attempts, **at most one refund exists** (SC-006a).
7. Force a definite refusal → **not retried**, and a staff member can read the provider's own reason
   (FR-005d).
8. For any refund above: a staff member states whether the money went, **from the order screen alone,
   in under 10 seconds** (SC-006b).

---

## 5. Cancellation — US2 (SC-004, SC-005) and the prose (SC-010a)

1. Place an order. Before any shop opens it, cancel it as the customer → the **full** amount including
   delivery is returned (FR-013), the order reads cancelled, and every shop's portion is withdrawn.
2. Open the shop console → the withdrawn portion is **gone from the queue** (SC-005).
3. Place another order, have a shop start picking, then open it as the customer → **no cancel control**,
   and the wording says why without implying it can never be cancelled (FR-015).
4. As staff, cancel that same picked order → succeeds (FR-018).
5. Cancel an order that is not yours → the refusal is identical to one for an order that does not exist.
6. Two cancel attempts at once → refunded once, cancelled once (FR-017).
7. ⚠ **Read the published policy against the built behaviour** (SC-010a) — the NEW version (v2), with
   v1 marked superseded. Its cancellation wording must describe what the product does: not "before it
   is dispatched", and "use the app" must now be true. **This is a task, not an observation** (FR-016a).
8. ⚠ **Walk the policy's outcome table (SC-010), refund arm only.** Two of its four rows also offer a
   *replacement*, which this slice does not build — confirm the **refund** half of every row is
   achievable, and that the two replacement promises are recorded as still outstanding rather than
   quietly assumed done.

---

## 6. Proposals and requests — US1/US3 (SC-001a, SC-012)

1. Have a picker record a shortfall → the order appears in the console as **awaiting a decision**,
   without opening it (FR-004c), carrying a proposal with items and amount **already filled in** —
   and **no money has moved**.
2. Issue it → under 30 seconds (SC-001a). Or dismiss it → no money moves, and who/why is recorded.
3. Have the picker edit the shortfall twice → **one** proposal, not three (FR-004b).
4. As a customer, raise a refund request on a delivered order → reaches back-office **attached to that
   order** (SC-012), moves no money.
5. Raise a second request for the same items → told one is already open (FR-005r4).
6. Decline it → the customer is told the outcome.

---

## 7. What the customer sees — US5 (SC-008, SC-009, SC-011)

1. A partly refunded order on **customer-web and customer-mobile**: the amount, the date, and what they
   ultimately paid — and the numbers **add up** (051/052 shipped a receipt whose lines did not).
2. A refund in progress: says it is on its way with a realistic expectation, and does **not** imply it
   has arrived (FR-026). ⚠ It must not promise a credit line on their statement — a refund issued soon
   after payment may appear as a **reversal**, with the original charge simply disappearing (research
   R2).
3. A fully refunded order is identifiable as such (FR-023).
4. An order with **no** refunds shows nothing about refunds at all (FR-028) and is byte-identical to its
   pre-slice self (SC-011).
5. ⚠ Sweep every customer response and email for shop identity or shop count (SC-009, FR-029), and for
   a provider `failureReason` — that is staff information.
6. **SC-008**: show a refunded order to five people; all five correctly state how much came back and
   whether it has arrived.

---

## 8. Stock and the shop exit — US6 (FR-030, FR-031)

1. Refund an item on a portion **not yet collected**, for a tracked product → the count returns, with a
   `refund` movement.
2. Refund an item on a **collected** portion → the count does **not** move (research R8 — it is gone).
3. Goodwill refund → **no** stock movement at all (it names no items).
4. Mark a portion unfulfillable → it leaves the shop queue and reaches back-office as awaiting a
   decision, and **no money moves** (FR-031).
5. Try it on a collected portion → refused.

---

## 9. Telemetry (research R9)

`/metrics` exposes `effy_refunds_issued_total`, `effy_refund_outcome_total`,
`effy_refund_submit_retries_total`, `effy_order_cancellations_total`. Force a failed refund → the
`failed` counter moves. ⚠ Confirm no label carries an order id, a customer id or an amount.
⚠ The alert rules are **written and inert** — no Prometheus stack exists to load them.

---

## 10. ⚠ Look at it

039 shipped four live defects with a fully green suite, because layout, contrast and hierarchy are not
properties a DOM assertion can see. Before this is called done:

- The order screen on **customer-web and customer-mobile**, side by side, with a refund in each state.
- Light, **dark**, and large text. A failed refund must be legible **with no colour at all**.
- The console's refund action and its confirmation — ⚠ **this is a control that moves money, and it must
  not be possible to trigger it by accident.**
- The refund confirmation email, in a real client, in dark mode.

---

## Operator steps (not run by the assistant)

```bash
# 1. commit the migration first (003 commit-guard), then:
make db-up ENV=dev
# 2. ⚠ core-api BEFORE the consoles — Amplify auto-deploys on push to dev
make core-image-push ENV=dev && make core-deploy ENV=dev
make edge-deploy SERVICE=orders ENV=dev && make edge-deploy SERVICE=shop ENV=dev
# 3. the back-office origin must reach core-api's CORS allowlist, and the
#    back-office pool id/client ids must reach its config (research R1)
make apply ENV=dev
```
