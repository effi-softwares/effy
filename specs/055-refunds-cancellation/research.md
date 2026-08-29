# Phase 0 Research — 055 Refunds & Cancellation

**Date**: 2026-08-29 · **Spec**: [spec.md](./spec.md)

Decisions taken against the code at `054-product-inventory` (deployed), plus the payment provider's own
documentation. Where a finding contradicts something the spec or the register assumes, it is recorded as
a correction rather than quietly absorbed.

---

## R1 — ⚠ The architectural question this slice turns on: where does a refund get issued?

**Decision**: **`core-api` gains a back-office pool verifier and an admin route group.** The back-office
console calls `core-api` directly for the refund action, and continues to call `edge-api/orders` for
reading the order.

**The constraint.** The Stripe secret key lives in `core-api` and only there — 019 made that an explicit
success criterion (SC-012), and it is the platform's most sensitive secret. A refund is a call to the
payment provider, so whatever issues one must hold that key.

**Why a back-office verifier in `core-api` is allowed, and not a violation of Principle IV.** The
principle forbids an **auth proxy** — "backends do not forward or broker authentication on behalf of
another" — and requires per-pool validation with a pinned issuer. `core-api` validating a back-office
token *itself*, against the back-office pool's own issuer and client ids, is exactly the sanctioned
shape. `internal/platform/auth` already carries `AudienceBackOffice = "back-office"` as a constant; the
verifier type is per-pool by construction (`NewPoolVerifier(audience, region, poolID, clientIDs...)`)
and nothing about it assumes the customer pool. ⚠ Today `main.go:109` constructs **only** the customer
verifier — this slice adds a second, it does not weaken the first. A token issued for one pool remains
structurally rejected by a route scoped to another.

**Alternatives considered:**
- **`edge-api/orders` calls `core-api` service-to-service.** ⚠ Rejected on Principle IV: that is
  precisely the auth-brokering the constitution names. It would also mean either sharing a service
  credential or forwarding the operator's token — the second being the proxy pattern by definition.
- **Give the cold path its own Stripe secret.** Rejected: it duplicates the platform's most dangerous
  secret into a second runtime and a second IAM surface, to save one verifier.
- **An outbox: the console writes a refund intent, a `core-api` worker drains it.** Rejected, and the
  reason is a requirement rather than taste. **FR-005f** says a staff member must be able to tell
  *whether the money went*. An outbox makes the operator's click return before anything has been
  attempted, so the console can only ever say "we'll try" — which is a different and worse answer than
  "submitted, awaiting the bank". ⚠ Note this is NOT the same as FR-007's asynchrony: "submitted and
  waiting for the provider" is a fact about the bank; "queued and not yet attempted" is a fact about us.

**Cost accepted**: the back-office origin must be added to `core-api`'s CORS allowlist
(`main.go:194`, `cfg.CORS.AllowedOrigins`), and the console now talks to two hosts. `customer-web`
already does exactly this, so the pattern exists.

---

## R2 — The refund lifecycle is a state machine, not a call

**Decision**: model the provider's own refund states rather than a boolean, and drive them from the
existing signed-webhook endpoint.

**From the provider's documentation** (`stripe docs /refunds`), the facts that shape the design:

| Fact | Consequence for this slice |
|---|---|
| A refund goes `pending → succeeded`, and can end `failed`, `requires_action` or `canceled` | FR-007: submitted ≠ refunded. The order must not claim money was returned until confirmed. |
| A bank can **reject a refund up to 30 days later**, with a `failure_reason` | ⚠ FR-009 and US4. This is the case a naive integration never learns about. |
| Dedicated events: `refund.created`, `refund.updated`, **`refund.failed`**, `charge.refunded` | The webhook path already exists and is signature-verified; this adds event types, not a mechanism. |
| Multiple partial refunds per charge, capped at the charge total | FR-002/FR-003a. The ceiling is the provider's too — but ours must be enforced first, because our refusal can explain itself and theirs cannot. |
| Refunds draw on the account's **available balance**; an insufficient balance holds a card refund pending | ⚠ An operational failure mode with no code path: it looks like a slow refund. Worth an alert, not a feature. |
| **Processing fees are not returned** on a refunded payment | A6/FR-011: Effy's cost, never deducted from the customer. |
| Refunds shortly after a charge appear as a **reversal** — the original charge drops off the statement, no separate credit | ⚠ FR-026's honesty problem: a customer may see *nothing* rather than a credit and reasonably think it failed. The wording must not promise "you will see a refund on your statement". |
| `reason` is a closed set: `duplicate`, `fraudulent`, `requested_by_customer` | ⚠ See R5 — ours is a different vocabulary and must not be conflated with theirs. |

**⚠ `fraudulent` is not an ordinary choice.** The documentation is explicit that marking a refund
fraudulent "will add the associated card and email to your block list". That is a consequence for a
person beyond this order, decided in a console with no review step. It is excluded from the operator's
reason set entirely (spec A7).

---

## R3 — ⚠ There is no free cancellation, and the published policy implies there is

**Decision**: a cancellation is implemented as a full refund. There is no separate provider operation.

`stripegateway.go:36` sets `CaptureMethod: automatic` — the money is captured the moment the payment
succeeds. The provider's cancel operation applies only to an **uncaptured** PaymentIntent, a state no
Effy order ever occupies. So "cancel this order" is, mechanically, "refund all of it", and it costs
Effy the processing fee.

**Alternative considered and rejected: switching to manual capture** so that an early cancellation is
genuinely free. It would mean holding an authorisation and capturing later — which changes the payment
model for *every* order to optimise the minority that get cancelled, introduces authorisation expiry as
a new failure mode on the happy path, and would have to be reconciled with 052's receipt and 054's
stock deduction, both of which key off the paid transition. Not worth it for a fee.

**⚠ The consequence for prose, and it is in scope**: FR-016a. The published policy says an order may be
cancelled "before it is dispatched" and that customers should "use the app". A2 narrows the window to
"before any shop begins preparing", and the app control does not exist until this slice ships.

---

## R4 — Path split (Principle III)

| Work | Path | Why |
|---|---|---|
| Issuing a refund; recording it; the provider call | **Hot** (`core-api`) | It holds the payment secret and the order's financial record, and the operator needs a synchronous answer (R1, FR-005f). |
| Provider webhooks (`refund.*`) | **Hot** (`core-api`) | The signature-verified endpoint already exists there — the sanctioned webhook exception in ARCHITECTURE.md. |
| Customer cancellation; customer refund request; customer's view of refunds | **Hot** (`core-api`) | Customer commerce is the hot path by the routing law 011 FR-028 set, and cancellation *is* a refund. |
| Back-office reading an order, its refunds, requests and proposals | **Cold** (`edge-api/orders`) | 053 built the console's read path there and it already carries the shortfall. Reads move no money. |
| Shop marking a portion unfulfillable (US6) | **Cold** (`edge-api/shop`) | The fulfilment state machine lives there; the action moves no money (FR-031). |

⚠ **The console therefore calls two hosts**: `edge-api/orders` to read, `core-api` to act. That is the
honest consequence of "money lives where the secret lives" and is preferable to either duplicating the
secret or brokering auth.

---

## R5 — ⚠ Two reason vocabularies, deliberately not merged

**Decision**: Effy's refund reasons are its own closed set, mapped to the provider's on the way out.

The provider offers exactly three (`duplicate`, `fraudulent`, `requested_by_customer`) and they describe
a *payments* concern. The business needs to distinguish **an item never supplied** from **an item that
arrived unusable** from **a cancelled order** from **a goodwill gesture** — four causes with different
operational meanings, all of which map to the provider's `requested_by_customer`.

⚠ Storing only the provider's value would make the platform's own reporting useless ("why do we refund?"
would answer "because customers asked"), and storing only ours would leave the provider's dashboard
uninformative. Both are recorded; ours is the one anything reads. `fraudulent` is never sent (R2).

---

## R6 — Two enums must widen, and both were built expecting this

- **`public.stock_movement.reason`** (054) gains a refund member. 054's data-model deliberately wrote:
  *"⚠ `reason` deliberately has no `cancellation` or `refund` member. Neither capability exists… The
  CHECK grows when the slice that needs it lands."* This is that slice. FR-030's stock return is a
  values change on a mechanism already built.
- **`public.shop_fulfillment.status`** gains a terminal member for US6 — the exit the gap register
  records it lacking. ⚠ The third widening of that CHECK: **019 → 020 → the `delivered` state
  migration**. (Not 053 — that slice deliberately added no state, on the grounds that a package in a
  carrier's van and one on the hub floor are the same fact to a shopper.) The pattern is established:
  **widen, never replace**, so no data migration and no rewrite of the fan-out.

---

## R7 — What "the order's own truth" means (FR-022, FR-024)

**Decision**: refunded totals are **derived from the refund records**, not stored on the order as a
running balance.

**Rationale**: 027 settled this exact question for promotional redemptions and the reasoning transfers
directly — *"`redemptionCount` is COUNTED from `promo_redemption` on every read, never stored — a counter
and the rows can disagree, and then nobody knows which is true."* A refunded-to-date column and the
refund rows are two representations of one fact; the moment they diverge, the platform cannot say what
was refunded. The ceiling check in FR-002 is then a `SUM` inside the writing transaction under a lock,
which is also what makes it correct under concurrency (SC-002).

**⚠ And it is what makes FR-024 automatic**: the original receipt keeps its own numbers because nothing
overwrites them. A refund is a later row, not an edit.

---

## R8 — Stock return, and where it must not guess (FR-030)

**Decision**: stock returns **only** for an item-derived refund on a shop portion that has not been
collected, and only for a tracked product.

The distinction A9 draws is real and the platform already records it: a portion still `pending`/
`received`/`picking` has not left the shop, so a refunded unit is still on the shelf; one that is
`collected` or later has physically gone, and refunding it because it arrived spoiled does not put
anything back. ⚠ A goodwill refund returns nothing — it names no items, so there is nothing to return,
and inferring items from an amount would be inventing stock.

---

## R9 — Telemetry (Principle VII, and the item `/speckit-clarify` left Outstanding)

**Decision**: four counters and two alerts, following 054's shape.

- `effy_refunds_issued_total{kind}` — item-derived vs goodwill.
- `effy_refund_outcome_total{outcome}` — `succeeded` | `failed` | `submission_refused`.
- `effy_refund_submit_retries_total` — the ambiguous-failure retry path (FR-005d).
- `effy_order_cancellations_total{by}` — `customer` | `back_office`.

**Alerts**: a sustained `outcome="failed"` rate (money the platform believes it returned and did not),
and any refund stuck in `submitted` beyond a bounded age — the shape an insufficient-balance hold takes
(R2), which otherwise looks like nothing at all.

⚠ **They go to `infra/observability/alerts/055-refunds-cancellation.yml`, written and inert**, the same
as 054: the Prometheus stack described in ARCHITECTURE.md still does not exist and nothing scrapes
`core-api`'s `/metrics`. Recorded as a deviation in Complexity Tracking rather than passed silently.
No customer-facing analytics event: a refund is not a funnel step.

---

## R10 — Money arithmetic

Amounts cross the wire as 2-dp decimal strings and are computed in **integer cents** via
`internal/platform/money` (`ParseCents` / `FormatCents`) — the platform's rule since 019, and what the
provider's API expects anyway (an integer in the smallest currency unit).

⚠ **The ceiling is the paid amount, not the order total.** They differ: `grand_total_amount` is what the
order came to, and what the customer actually paid is on the payment. Refunding against the order total
would, on any future partial-payment or adjusted order, refund money that never arrived.

---

## R11 — Two contradictions in the surrounding system, recorded not fixed

1. **⚠ The published policy offers "refund **or** replacement" for damaged goods.** Only the refund arm
   exists after this slice. 045 owns the prose; a replacement flow is a different product. FR-016a puts
   only the *cancellation* wording in scope, deliberately — fixing prose about a capability nobody is
   building would be worse than leaving it flagged.
2. **⚠ Substitutions remain promised and unbuilt** — the Food Safety notice tells customers they may
   decline substitutions at checkout and are "not charged for a substitute you do not accept". Flagged
   during 054, still open. This slice builds the refund path such a feature would eventually settle
   against, which is progress toward it and not a fix for it.
