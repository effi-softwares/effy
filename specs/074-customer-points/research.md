# Research: Customer Points (store credit)

**Feature**: 074-customer-points · **Date**: 2026-10-08 · **Spec**: [spec.md](spec.md)

Every decision below was taken against the code on `dev` after 073. File references are to that
state.

---

## R1 — The ledger: append-only entries, consumption by allocation, the balance derived

**Decision.** Three append-only tables, and a fourth row per customer that exists only to be locked:

| Table | Role |
|---|---|
| `points_entry` | One change to a balance: a **credit** (positive, carries `expires_at`) or a **debit** (negative). Never updated, never deleted. |
| `points_allocation` | Which credit lots a debit consumed, and how many points from each (FIFO by `expires_at`, then `created_at`). Never updated, never deleted. |
| `points_account` | One row per customer, created on first use. `SELECT … FOR UPDATE` on it serialises every change to that customer's points. |

A credit entry is a **lot**. A lot's remaining points = its points − Σ allocations against it. The
usable balance = Σ remaining of lots whose `expires_at` is in the future − points held by live
checkout holds (R3). It is computed by **one SQL function**, `public.points_usable(customer_id,
at, except_order)`, and read nowhere else (the `round_opens_at` discipline from 072).

**Rationale.**
- FR-003 forbids editing history. A mutable `remaining_points` column on the credit row would be an
  edit. Allocations keep both the history and the FIFO bookkeeping append-only.
- FR-004 / SC-001: a stored balance column can disagree with the rows; a derived one cannot. 055
  made the same call for refunds (`COUNTS_AGAINST_CEILING` — "counted from the rows, never stored").
- A per-customer lock row, not the `customer` row: the customer row is written by profile edits,
  device registration and closure, and those must not queue behind a checkout.

**Alternatives rejected.**
- *Running balance column* — fast reads, but two sources for one fact; this repo has shipped defects
  through exactly that shape.
- *Mutable lot `remaining` column* — simpler FIFO, but violates FR-003 and loses the audit of which
  debit took which points.

---

## R2 — Expiry is derived; a daily sweep only writes the history line

**Decision.** A lot stops counting the instant `expires_at` passes, because `points_usable` filters
on it. A scheduled sweep (daily) writes an `expired` debit entry, with allocations, for each lot that
has expired with points remaining — **only so the history shows it** (Story 4, scenario 1).

`expires_at` = **00:00 Australia/Melbourne on the day after** (credit date in Melbourne + the expiry
period in months). Points credited on 8 Oct 2026 with a 12-month period are usable through 8 Oct
2027 and stop at midnight starting 9 Oct 2027.

**Rationale.** A sweep that is late, fails or is never deployed can then never make an expired point
spendable — the same "a lapsed hold is not swept, it simply stops counting" rule 069 used for slot
holds. Midnight in the operating timezone matches how a customer reads "expires 8 Oct 2027".

**Alternative rejected.** *Expiry only by sweep* — a missed run lets a customer spend expired points
and then the ledger has to claw them back.

---

## R3 — Points are HELD at the payment-intent call and SPENT inside the paid transaction

**Decision.** Mirrors 069's slot hold exactly:

1. `createIntent` (commerce) takes the customer's account lock, checks `points_usable` (excluding this
   order's own hold, so a refresh is not refused by itself), and writes `points_hold(order_id,
   points, state='held', held_until = now + hold_minutes)`. A retry replaces the order's own hold.
2. `finalizeSucceeded` (`@effy/edge-shared/payments`, the one place an order becomes paid) gains a
   step that turns the hold into a `spent` debit entry with FIFO allocations, under the account lock,
   and marks the hold `spent`.
3. `finalizeFailed` and cancellation of an unpaid order mark the hold `released`.
4. A lapsed hold is **not swept**: `points_usable` ignores holds whose `held_until` has passed.

**The late payer.** If payment lands after the hold lapsed and the points were meanwhile spent or
debited, the paid step spends what is still usable, records the gap on the order
(`points_shortfall_amount`), emits `PointsHoldShortfall` (alarmed), and **the order stands** — the
customer was shown and charged a card amount on the understanding the points would cover the rest
(spec edge case: "Effy absorbs the shortfall"). The balance never goes negative.

**Rationale.** The client confirms payment with the provider directly, so the intent call is the last
moment the server can refuse before money moves (069 research R3). Spending only at paid means an
abandoned checkout costs nothing.

**`hold_minutes`** defaults to **30**, longer than the slot hold (10): the risk of a lapsed points hold
is a shortfall Effy absorbs, not an oversold window, so erring long is cheaper.

---

## R4 — Amount authority: the order total does not change; the card pays total − points

**Decision.**
- `order.grand_total_amount` keeps its meaning — goods − discount + delivery. Points are a **means of
  payment** (FR-018), so prices, promotions, delivery fee and GST are untouched.
- New order columns record the points side: `points_used`, `points_cents_per_point` (snapshot of the
  setting), `points_value_amount` (= points × cents per point).
- `payment.amount` = **card amount** = grand total − points value. The payment-intent idempotency key
  already covers the amount, so changing the points chosen gets a new intent, as a changed basket does.
- The intent request carries `pointsToUse` (integer). The server clamps nothing silently: more than
  usable → `409 points_balance_changed` with the current usable figure; more than the order total →
  `422 points_exceed_total`.
- **Card minimum.** The provider cannot charge less than **A$0.50**. A card remainder strictly between
  0 and 50 cents is refused with `422 points_card_remainder_too_small` carrying `maxPoints` — the most
  points that leave a chargeable card amount — and the client offers "Use N points". Never a surcharge.
- **Points-only orders** (card amount = 0): no payment intent is created. Checkout writes `payment`
  with `provider = 'points'`, `amount = 0`, `stripe_payment_intent_id = NULL`, and runs
  `finalizeSucceeded` directly in the same request. The response carries `paidWithPoints: true` and no
  client secret; clients go straight to the confirmation screen. `payment.provider` has no CHECK and
  the intent column is nullable — no schema change.

**Rationale.** 070 FR-014: the amount is decided in one place. Keeping the grand total intact keeps
every receipt, refund line price and insight report correct without a second "total before points".

**Alternative rejected.** *Points as a discount line* — FR-018 forbids it, and it would reduce the GST
base on the tax invoice, which is wrong for a means of payment.

---

## R5 — Refunds split by cumulative proportion; points return when the card part is accepted

**Decision.**
- A refund's `amount` stays the **total value** returned (line-derived or goodwill, as 055). Two new
  columns say how it is made up: `card_amount` and `points_returned` (+ `points_value_amount`).
  Pre-074 rows have `card_amount NULL`, read as "all card".
- **The ceiling** becomes *what was paid in total* = `payment.amount` + `order.points_value_amount`,
  still under the payment row lock, still counting refunds per `COUNTS_AGAINST_CEILING`.
- **The split is cumulative**, so rounding never drifts across partial refunds:

  ```
  G  = card paid + points value            (cents)
  T  = total refunded so far, including this refund
  pointsCum(T) = floor( T × pointsValue / G / centsPerPoint )   (whole points)
  this refund's points = pointsCum(T) − points already returned
  this refund's card   = this refund's amount − points × centsPerPoint
  ```
  When the last cent is refunded, T = G, so points returned = points used and card returned = card
  paid exactly (FR-019, SC-005). Rounding favours card by under one point's value on intermediate
  refunds — never above the card paid, which a clamp asserts.
- **Only the card part goes to the provider.** A refund with a card part of 0 is never submitted: it
  is inserted as `succeeded` with `settled_at = now()`.
- **When points come back.** The `returned` credit entry is written in the same transaction as the
  refund reaching `submitted` (or being inserted `succeeded` when card-free), and is unique per refund.
  `markSubmitted` therefore becomes a small transaction; the reconciler goes through the same function,
  so a stalled refund that later lands returns its points exactly once. A **refused** refund returns no
  points (nothing was returned at all); a refund the bank later **fails** keeps its returned points —
  the failure concerns card money staff must resolve, and points are independent of it.
- Returned points are a new lot with a **fresh full expiry** (FR-020).
- Refunds issued in the provider's dashboard (`recordUnattributedRefund`) are card-only by definition.

**Rationale.** 055's rules (record first, then submit; ceiling under lock; state machine in SQL)
carry over unchanged; points are added beside the card, never in place of it.

---

## R6 — Service placement

| Capability | Service | Because |
|---|---|---|
| The points rules (credit, debit, hold, spend, return, expire, forfeit, usable) | **`@effy/edge-shared/points`** (new export) | Used by `customer`, `commerce`, `orders` and the paid transaction in `@effy/edge-shared/payments`. A rule has one implementation (Principle III). |
| Customer balance + history reads | `customer` | Customer audience, account domain. |
| Points at checkout (quote, intent, points-only placement) | `commerce` | Owns checkout and payment. |
| Back-office customer lookup, credit, debit, settings | `orders` | Back-office audience; the order console and refunds are where customer care already happens. |
| Expiry sweep + expiry warnings (scheduled) | `customer` | Account domain; no route, a schedule — as `commerce` runs `refund-reconcile-scheduled`. |
| Ledger reconciliation (scheduled, hourly) | `customer` | Same. |

No new service. `orders` gains 7 routes (≈35 resources) — well under the 500 cap.

---

## R7 — Live updates: a new kind, `points`, and a fourth customer builder

**Decision.** Add `points` to `LIVE_KINDS` (`packages/shared-types/src/live.ts`) and to the Kotlin
mirror (`packages/mobile-kit/common/live/LiveKind.kt`). Widen the customer variant of `LiveChange` to
`kind: "orders" | "points"` and the ops variant with `"points"`. Every points change announces after
commit through **one** function, `announcePoints(customerSub)` in `shared/src/points/announce.ts`.

`customer-announce.guard.test.ts` gains that file in `ALLOWED`, and its variant assertion becomes
`kind: "orders" | "points"`. **Why that is safe**: the guard exists so no update to a customer can
reveal a shop (071 FR-024). A points change is decided from the customer's ledger alone and carries
only the word `points`; no shop is involved in any points rule.

---

## R8 — Notifications: two new types, email and push through the existing path

**Decision.**
- `notification_request.type` CHECK gains `points_credited` and `points_expiring`.
- `points_credited` → push + email (`points-credited.mjml`); `points_expiring` → email only
  (`points-expiring.mjml`). Added to `EMAIL_TEMPLATES` in `notifications/src/worker/email-sender.ts`;
  push copy in `worker/copy.ts`.
- Payload stays routing-only (050 FR-021): `entityId` = the credit entry id (or, for expiry, the
  `points_expiry_notice` id). The sender resolves points, value, reason words and expiry at send time;
  the address is snapshotted at enqueue, as 052/053 do.
- Debits, spending and returns are **not** messaged (FR-011): a refund already sends `order-refunded`,
  which gains a line saying how much came back as points.
- Dedupe: `points_credited:<sub>:<entryId>`; `points_expiring:<sub>:<expiryDate>` — one warning per
  customer per expiry date (SC-007), however many lots expire that day.

---

## R9 — Roles and the agent limit come from the staff record

**Decision.** Reuse `orders/src/lib/guard.ts`: `requireStaff` (any active staff incl. csa) for reads;
credit is open to csa **with** the limit; debit and settings writes use `requireWriter`
(admin/manager) — settings additionally require `admin` via `hasStaffRole`. Every decision is from
`admin.staff`, never the token claim (Principle IV). The limit is per credit (spec Assumption).

---

## R10 — Account closure: warn now, forfeit when closure becomes final

**Decision.** `GET /customer/v1/closure` gains `pointsHeld` so web and mobile can warn before the
customer confirms (FR-024, first half). The forfeiture itself is `points.forfeit(customerId)` in the
shared module, **called where a closure becomes final** — which today is the not-yet-built erasure
worker (`docs/next-implementation-candidates.md` item 3). Until that worker exists, a closed account's
points simply cannot be used (the customer cannot sign in) and a restored account finds them intact.

**Rationale.** Forfeiting at the closure request would have to be undone on restore, which means an
un-forfeit entry and a second question about expiry. Waiting for finality avoids both.

**Recorded dependency.** The erasure worker MUST call `points.forfeit`. Added to its candidate entry.

---

## R11 — Reason vocabulary

| Kind | Reason codes (Effy's words → customer's words) |
|---|---|
| staff credit | `late_delivery` "Sorry your order was late" · `missing_item` "For an item that didn't arrive" · `quality_issue` "For an item that wasn't right" · `goodwill` "A thank-you from Effy" · `correction` "Balance correction" · `other` (note required; customer sees "From Effy") |
| staff debit | `credited_in_error` · `correction` · `other` (note required) — customer sees "Balance correction" |
| automatic credit | `courier_override_compensation` (080) "Your delivery changed" — the list is closed; a new flow adds a code |
| spent / returned / expired / forfeited | fixed words: "Used on order EFY-…", "Returned from order EFY-…", "Expired", "Account closed" |

The staff note is **internal**; the customer never sees it.

---

## R12 — Legal and tax

- Points are **promotional credit given free**, not a purchased gift card, so the 3-year minimum
  expiry for gift cards (Australian Consumer Law, from 2019) is assumed not to apply. Points terms are
  added to `packages/legal-content` and **must pass legal review before go-live** (045's system).
- GST: points are a means of payment, so the tax amount on the order is unchanged. The receipt shows
  "Paid with points" as a payment line, never a discount.

---

## R13 — Telemetry

| Kind | Name | Notes |
|---|---|---|
| PostHog | `points_viewed` | web + mobile points page |
| PostHog | `checkout_points_toggled` `{on}` | |
| PostHog | `checkout_paid_with_points` `{share: "part" \| "all"}` | no amounts (taxonomy rule) |
| Metric | `PointsCredited` `{author: staff \| system}` | |
| Metric | `PointsSpent`, `PointsReturned`, `PointsExpired` | counts of entries |
| Metric | `PointsOnlyOrders` | |
| Metric | `PointsHoldShortfall` | **alarm ≥ 1 in 5 min** |
| Metric | `PointsInvariantViolations` | emitted every reconciliation run, zero included; **alarm ≥ 1** |
| Metric | `PointsBalanceRefusals` `{reason}` | intent refused: balance changed, remainder too small |

Alarms in `infra/envs/dev/commerce-alarms.tf` beside `RefundsStuck`, delivered to the alerts topic.

---

## Unknowns

None remaining. Defaults the operator has not seen are listed in the spec's Assumptions (agent limit
2,000 points; fresh expiry on returned points; forfeiture at final closure; not a gift card).
