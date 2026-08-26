# Quickstart: Order Lifecycle Completion (053)

How to prove this feature works. Every step is runnable; nothing here is asserted from reading code.

**⚠ Read first**: the single most important walk in this document is §4 — taking a **standard** order all
the way to finished. That path has never completed on this platform, so it is the one thing no existing
test can have been covering.

---

## 1. Prerequisites

- The migration committed, then `make db-up ENV=dev` (003's commit-guard).
- `make core-run` for the hot path, or the deployed `core-api.dev.effyshopping.com`.
- The new service deployed: `make edge-deploy SERVICE=orders ENV=dev`.
- Also redeployed, because each carries a change: `SERVICE=driver`, `SERVICE=customer`,
  `SERVICE=notifications`.
- A back-office account in each of the three roles — `admin`, `manager`, `csa` — to walk FR-015 from
  both sides.
- ⚠ **Docker must be up.** The container-backed tests are exactly the ones that prove idempotency and
  the refusal paths; 052 shipped with all of them skipped because Docker was down all session.

## 2. Before you build — the measurement that decides the structure

```bash
cd apis/edge-api/admin && npx serverless package --stage dev
python3 -c "import json;t=json.load(open('.serverless/cloudformation-template-update-stack.json'));print(len(t['Resources']))"
```

Record the number. Research R7 assumes it is close enough to 500 to justify a separate service. **If it
is comfortably under**, the split is still defensible on domain grounds — but say so from the measurement
rather than from the estimate.

## 3. Machine gates

```bash
pnpm -r typecheck && pnpm -r test          # every package must report; count them (029's lesson)
cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...
make email-check                            # the new order-delivered template, both budgets
make lint                                   # terraform validate + fmt
```

**Prove the stage correction by reverting it.** Put `ready_for_pickup` back to rank 2 and confirm a test
fails naming the shop-shelf case. A correction that passes both ways is not covered.

**Prove the authz promotion changed nothing.** `admin`'s existing feedback tests must pass **unmodified**
after `isActiveStaff` moves to `@effy/edge-shared` (the 028 proof).

## 4. ⚠ The walk that matters — a standard order, end to end

1. Place an order on customer-web choosing **standard** delivery. Pay with a Stripe test card.
2. Confirm the receipt and that the customer sees **Confirmed**.
3. In shop-web, advance the portion to **ready for pickup**.
4. **→ Check the customer's order now.** It must say **packing**, NOT "on the way" (FR-016, SC-008).
   Check **both** customer-web and customer-mobile — they must agree (FR-017).
5. In driver-mobile: go on duty, take the collection run, collect the package, check in at the hub.
   The check-in must report it in the **standard** column.
6. **→ Check the customer's order.** Now it must say **on the way**.
7. In back-office → Orders: find the order by its `EFY-…` reference. Open it.
8. Record the **handover**, deliberately **with no carrier reference**. It must save cleanly and appear
   complete — no warning, no empty-field styling, nothing that reads as unfinished (FR-003, SC-009).
9. Record the **arrival**.
10. **→ Check the customer's order on both surfaces.** **Delivered.** ✅ *This has never happened before.*
11. Confirm the customer received the arrival **email** — including on an account with no device token
    registered (FR-019, SC-004). Confirm the email names **no shop and no package count** (FR-021).
12. Immediately request account closure for that customer. The order must **not** block it (FR-023,
    SC-005).

## 5. Refusals and idempotency — the negative half

| Walk | Expect |
|---|---|
| Record the same arrival **five times** | Exactly one arrival, one push, one email; `arrivedAt` unchanged from the first (FR-005, SC-007). |
| Record an arrival for a package with **no handover** | Refused, naming the missing handover (FR-006). |
| Record an arrival for a package still at the shop | Refused. |
| Two staff record the same arrival **simultaneously** | Exactly one of each. Run it concurrently, not sequentially. |
| Sign in as **`csa`** → try to record a handover or arrival | Refused (FR-015). |
| Sign in as **`csa`** → find and read an order | Allowed (FR-015). |
| Sign in with a **customer** token → call any `/orders/v1/*` route | 401 at the gateway (Principle IV). |
| A **shop** token → same | 401. |
| Hand over a **same-day** package | Refused — it does not take a carrier handoff. |

## 6. The mixed order (FR-007, SC-002)

Place one order that fans out to **two** shops where one package is same-day-eligible and one is not.

- When only the same-day one has arrived, the order must **not** be finished.
- When both have, it must be.
- ⚠ At no point may any customer-facing view or message reveal that there were **two** packages or which
  shops they came from (FR-021, SC-006). Check the order page, the arrival email, and the push copy.

## 7. Attribution (FR-008, SC-010)

Complete one **same-day** order through driver proof and one **standard** order through the console, then
confirm both have a `package_arrival` row and that the two `source` values differ. If the same-day one is
missing, research R6's extension to the driver path was not done and SC-010 is false.

## 8. Console inspection — the part tests cannot do

⚠ 039 shipped four live defects with a fully green suite. Look at the console yourself:

- **No cards.** No metric row at the top, no bordered boxes tiling the detail (Principle V).
- Light **and** dark, and at a narrow window.
- The order history reads as *when / what / who*, scannable top to bottom.
- An order with no handover yet, and one with a handover but no reference, both look **normal** — this
  is the visual half of SC-009 and no assertion can see it.

## 9. Telemetry

Confirm at `/metrics` and in Grafana: `order_arrival_recorded_total{source}`,
`carrier_handoff_recorded_total{has_reference}`, `order_completed_total`,
`notification_email_send_failed_total{type}`. **`order_completed_total` moving off zero is the single
number this feature exists to produce.** Confirm the send-failure alert fires by causing one.
