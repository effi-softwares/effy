# 055-refunds-cancellation — Sign-off

**Date:** 2026-08-30
**Status:** 🚧 **CODE-COMPLETE + MACHINE-VERIFIED. NOT DEPLOYED, NOT COMMITTED, NOT WALKED BY A PERSON.**
**Tasks:** 90/106 — all six user stories and all of Phase 9's authoring. The 16 open are the operator
steps and the human walks, which the assistant does not run.

---

## What this closes

Gap **G3**. Before this slice, money could go **into** the platform and never come back out.
`public.refund` did not exist. `order.status = 'canceled'` had been permitted by a CHECK since 019 and
was **written by nothing** — 055 is its first writer. A shopper whose items never arrived was told
*"contact support about this order and we'll sort it out"* by a screen whose own source comment
admitted no money could move.

---

## ⚠ The one thing to read before deploying

**A refund is a state machine, not a call.** The provider accepting one means only that it was
*submitted*; the bank can reject it **up to thirty days later**. Everything in this slice is shaped by
that: five internal states, `submitted` never rendered as "refunded", a webhook that settles it, and
the ceiling counting `failed` so a bouncing retry cannot refund an order repeatedly.

**And nothing here has ever run against a real payment provider.** No refund has been issued, no
`refund.failed` has arrived. T097 is the walk that proves the platform does not lie about money, and it
has not happened.

---

## Machine-verified

| Gate | Result |
| --- | --- |
| `pnpm -r typecheck` | **19/19** |
| `pnpm -r test` | **1,813** tests, **17** reporting packages, exit 0 |
| Go build / vet / gofmt | clean |
| `core-api` refunds | **67** tests (container-backed: ceiling, concurrency, idempotency, settlement, cancellation, requests, stock) |
| `edge-api/orders` | **54** (container-backed, real migrations) |
| `edge-api/shop` | **192** |
| `edge-api/customer` | **203** (closure, container-backed) |
| `make email-check` | **12** templates |
| `cm-guard` · `sm-guard` · `brand-check` · `cm-tokens-check` | clean |
| customer-mobile / shop-mobile | iOS Kotlin compiles; Android host tests green |

### Negative proofs — 34, each executed by breaking the thing

Every claim below was verified by making it false and watching a named test fail, then restoring.

- **The ceiling**: removing `FOR UPDATE` → two concurrent refunds for the last unit both succeed.
  ⚠ The barrier had to sit **before** the lock; after it, the test deadlocks and proves nothing.
- **The ceiling's status set**: dropping `failed` from `refundedCents` → the console's drift guard
  fails by name. Adding `submitting` → a stalled refund wrongly reduces what can be returned.
  ⚠ The existing tests did **not** catch the second one; the assertion was written first.
- **The webhook**: restoring the `PaymentIntentID == ""` early return → 3 tests fail.
- **Cancellation**: removing the row lock → both concurrent cancels take effect.
- **Requests**: disabling the `23505` branch → the duplicate and the 8-way race both fail.
- **Isolation**: mounting the customer cancel route on the back-office verifier → fails by name.
- **The write gate**: adding `csa` to `WriteRoles`; commenting out `status = 'active'`.
- **Stock**: removing the collected check; removing the tracked check.
- **Closure**: reverting to `<> 'delivered'` → 2 tests fail.
- **Metrics**: mismatching a label name; putting `order_id` on a label.
- **Append-only**: an `UPDATE` touching `amount`; a `DELETE`.
- **The shop exit**: `collected` as a legal source; dropping the terminal states from the completed
  queue; removing the reason requirement (web, mobile, service).
- **Copy**: claiming a refund is complete in the email; promising a credit line; leaking the
  provider's reason; a refusal that says the order can never be cancelled.

---

## ⚠ Defects found — mine, and pre-existing

### Mine, caught before shipping

1. **⚠ Refund webhook events were discarded before they were deduped or dispatched.** `HandleWebhook`
   opened with `if evt.PaymentIntentID == "" { return nil }` — which is *every* `refund.*` event, since
   a refund event names a refund, not an intent. **Every test on both sides passed**, because each half
   was correct in isolation: `HandleRefundEvent` worked perfectly and was never called. Found by
   reading the code back. A bank rejecting a refund thirty days later would have reached a platform
   that had stopped listening — the exact failure US4 exists to prevent, reintroduced in the wiring.
2. **⚠ Neither customer surface carried `orderItemId`.** `order_item` has no uniqueness on
   (order, product), so a product id cannot identify a line — and passing one where the other is
   expected does **not error**: the server's join matches nothing and every item a shopper named in a
   refund request is **silently dropped**. Third outing of the same shape on this surface after
   `brand`, `badges` and (033) `productId`.
3. **Nothing retried an ambiguous submission failure.** The classification existed; the row sat in
   `submitting` forever with nobody looking.
4. **The idempotent-hit path reported a hardcoded `"submitting"`** — an operator clicking again on a
   refund that never got an answer was told the same reassuring thing as one whose refund succeeded.
5. **`admin.role` joined on a column that does not exist** (`role_id`; it is `role_key` on a text PK).
   Would have compiled, deployed, and refused every staff member at runtime.
6. **⚠ My own leak-sweep had a bug**: it asserted the refund email contains no `"shop"` — and failed,
   because the platform's own domain is `effyshopping.com`. A sweep that cannot survive the company's
   name is one that gets deleted rather than fixed.
7. **Two hand-written lists duplicating a type union** (`REQUESTABLE`, and the orders list's `awaiting`
   parse) — adding a value to the type left the route silently **rejecting** it. Both now derive from
   one source.
8. **A test-infrastructure defect**: shop-web's suite uses `mockClear` to keep per-test resolved
   values, so its last 403 rejection leaked into every test added after it.

### Pre-existing, found and fixed

- **⚠ `cm-contract-check` was already red at HEAD** (proven by stashing): 054 committed the TS `errors`
  field on `ProblemJSON` and never regenerated the Kotlin — exactly the drift that guard exists to
  catch, left red. Regenerating fixed it.
- **⚠ The published refunds policy was wrong in two ways** (FR-016a). It said an order could be
  cancelled *"before it is dispatched"* — far looser than the platform can honour — and *"to cancel,
  use the app"*, untrue until this shipped. **And the audit found a second lie**: it promised "refund
  **or replacement**" for missing/damaged/incorrect items, and the platform has **no replacement
  mechanism and no back-office order creation** — verified, not assumed. Superseded as `v2.md`.
- **⚠ The account-closure blocker was wrong a third time.** 053 fixed the *value* and kept the *shape*:
  a negation against one name still cannot notice the vocabulary moving, and it moved again. Both new
  terminal states satisfied `<> 'delivered'` and would have held a customer for seven days over a
  package nobody is carrying. Now the terminal states are named positively.
- **020's stale copy is gone.** "Contact support and we'll sort it out" was written when no money could
  move; the platform now proposes a refund for every recorded shortfall automatically.

---

## Decisions worth knowing

- ⚠ **`core-api` gained a second Cognito verifier** (back-office). This is per-pool validation against
  that pool's own issuer — the shape Principle IV sanctions — **not** the auth proxy it forbids. The
  rejected alternative was the cold path forwarding an operator's token, which is brokering by
  definition (research R1). Isolation is proven in **both** directions.
- ⚠ **Cancelling *is* refunding.** `CaptureMethod: automatic` means the money is captured at payment,
  so the provider's cancel operation never applies to an Effy order (research R3).
- ⚠ **Proposals are derived, never stored.** Only the *dismissal* — the human judgement — is a row.
  Third application of 027's counted-not-stored rule.
- ⚠ **`unfulfillable` and `withdrawn` are two states, deliberately.** One is a shop saying it cannot
  supply; the other is an order having been cancelled. Conflating them would tell a shop it failed at
  something nobody wanted, and make shop-reliability reporting count cancellations as shop failures.
- ⚠ **No provider failure reason ever reaches a customer** — the column is never even selected.
- ⚠ **A refund request moves no money, and that is proven** — the gateway is never called and no
  `public.refund` row is written.
- ⚠ **The receipt is unchanged by a refund** (FR-024). What was charged is a historical record; a
  document that rewrote itself could not be reconciled against a bank statement.
- ⚠ **Stock returns only where the platform can know it should**: item-derived, tracked, uncollected.
  Inventing stock is worse than not returning it — a count that is too high costs a customer their
  order at the shelf hours later, which is gap G2 again.

---

## ⚠ Not done

### Operator steps (T091–T095) — yours to run, in this order

1. **Commit the migration**, then `make db-up ENV=dev`.
2. ⚠ **`make apply ENV=dev` FIRST.** `core-api` needs the back-office pool id, its client ids, and the
   back-office origin in its CORS allowlist, or every console refund call fails at the pre-flight.
3. `make core-image-push ENV=dev && make core-deploy ENV=dev` — ⚠ **the `&&` matters**: on 2026-08-29 a
   failed push was followed by a deploy of a two-day-old image.
4. `make edge-deploy SERVICE=orders ENV=dev` and `SERVICE=shop ENV=dev`.
5. **Register the `refund.*` webhook events with Stripe** and confirm they reach the endpoint. Without
   this, no refund ever settles and every one stays "on its way" forever.

### The walks a suite cannot do (T096–T100)

- ⚠ **T097 is the most important open item in the slice**: force a real `refund.failed` and confirm the
  order stops claiming the money went back. It is the one that proves the platform does not lie.
- **T100 — look at it.** Both customer surfaces with a refund in each state; light, **dark**, large
  text; a failed refund legible with **no colour at all**; the console's money-moving control; and the
  refund email in a real client. ⚠ **039 shipped four live defects with a fully green suite** — layout,
  contrast and hierarchy are not properties a DOM assertion can see.

### Known and accepted

- **The alert rules are written and INERT** (`infra/observability/alerts/055-refunds-cancellation.yml`).
  No Prometheus stack exists; the file records the SQL to run instead. This slice inherits that gap.
- **⚠ Two pre-existing Go failures, verified unchanged at clean HEAD and NOT caused by this slice**:
  `features/saveditems` (`public.delivery_pricing_rule does not exist`) and `platform/delivery`
  (`sameday_eligible does not exist`). `make check-no-phantm` also still fails on 042/045/050 spec
  prose.
- **⚠ `OrderItemDTO.quantity` still generates as Kotlin `Double`** — the 027 R13 instance already
  tracked as a 054 carry-forward (T005a). Left rather than widening scope.
- **No replacements, no disputes, no substitutions, no shop cost attribution.** Recorded in
  `ORDER-FLOW-GAPS.md` so their absence is not read as coverage.
