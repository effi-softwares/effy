# Sign-off: 053 — Order Lifecycle Completion

**Date**: 2026-08-27 · **Status**: 🚧 **74/88 — CODE-COMPLETE + MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.**

The 14 open tasks are the operator's: five deploy steps and seven live walks, plus two verifications
that need a deployed gateway.

---

## What was built

An order can now **finish**. Before this, a standard package stopped at the hub and nothing could
record it going further — so most orders never terminated, the customer was told "on the way"
indefinitely, and the delivered notification could not fire on the majority path.

| Piece | Where |
|---|---|
| `carrier_handoff` + `package_arrival`, `notification_request.channel` | one migration |
| Back-office **Orders** console (list + detail, handover + arrival) | new `apis/edge-api/orders` + `apps/back-office/src/features/orders` |
| Arrival email for shoppers with no app | `order-delivered` template + worker channel fan-out |
| Progress correction (`ready_for_pickup` → packing) | one line in `core-api/.../orders/stage.go` |
| Closure correction | one predicate in `edge-api/customer/src/closure/repo.ts` |

---

## Verified (machine)

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | **18/18** (was 17 — the new service reports) |
| `pnpm -r test` | **18/18** |
| `edge-orders` | **31** tests, **20 container-backed** ⚠ **Docker was UP** |
| `edge-customer` | **200** (closure container proves both directions) |
| `edge-notifications` | **28** |
| `email-kit` | **81** · `make email-check` **11 templates** |
| `back-office` | **89** (was 79) |
| Go | build/vet/gofmt clean; `orders` + `checkout` green |
| `terraform validate` / `fmt` | clean |
| `brand-check`, `tokens:check` | clean; **`tokens:check` unchanged** — this feature added no design token |
| Secret/PII sweep, build-artifact tracking | clean |

### Three things proven by breaking them

1. **The stage correction** — restoring `ready_for_pickup: 2` fails **3 tests**, naming the shop-shelf
   case. A correction that passes both ways is not covered.
2. **The console↔Go drift guard** — drifting the TypeScript rank map fails with
   `status "ready_for_pickup" disagrees with stage.go`. The guard reads the Go source, so it catches a
   change on either side.
3. **The authz extraction** — admin's **199** feedback tests pass **unmodified** after `isActiveStaff`
   moved to `@effy/edge-shared`. If a test had to change, the behaviour did (the 028 proof).

---

## ⚠ Four pre-existing defects found and fixed

1. **The account-closure blocker was wrong in BOTH directions.** `f.status <> 'collected'` meant a
   **delivered** order blocked closure until the 7-day backstop, while an order **genuinely in transit**
   did not block at all. Written before the delivery lifecycle existed, with a comment promising it
   would "become correct automatically when the delivery lifecycle lands" — 049 landed it with a
   *different* terminal state, and a predicate pinned to a literal value cannot notice that the
   vocabulary moved. **The register that opened this feature only caught half of it.**
2. **A mixed order announced itself delivered while half of it was still out.** The driver service
   enqueued `order_delivered` deduped on the **drop** id, and a drop covers only an order's *same-day*
   packages. Now one shared rollup both writers call.
3. **Every same-day arrival was unattributable.** Arrival was evidenced only by `proof_of_delivery`;
   without extending the driver path, SC-010 would have been false on the day it shipped — for the only
   kind of arrival the platform had ever recorded.
4. **An unconfigured FCM halted the entire drain.** Correct while the outbox carried push only; with
   email on it, a push misconfiguration would silently suppress the one message a web-only shopper gets.

---

## Settled decisions (do not re-litigate)

- **No customer-facing tracking reference** (FR-022). References are per-package and packages are
  per-shop, so listing them discloses how many shops served the order — an invariant held since 007.
  Recorded for staff. ⚠ Revisit **when a real carrier contract exists**, not before.
- **Recording an arrival is admin/manager only** (FR-015). With no carrier signal it is an *assertion*
  about a package nobody saw, and it finishes a financial record and emails the customer.
- **No new `shop_fulfillment` status** (R3). The handoff row's existence is the fact.
- **A separate service**, on the measured 434/500 CloudFormation count (T001).

---

## ⚠ Open — 14 tasks, all operator

**Deploy (T077–T081)** — commit + `make db-up ENV=dev`; `make edge-deploy SERVICE=orders`, then
`driver`, `customer`, `notifications`; `core-image-push` + `core-deploy` **before pushing to `dev`**
(047 recorded that the reverse order briefly broke dev checkout); `make apply ENV=dev` for one new alarm.

**Walks (T082–T088)** — [quickstart.md](quickstart.md). ⚠ **§4 is the one that matters: a standard order
taken end-to-end to `delivered`. That has never happened on this platform.**

**Needs a deployed gateway (T022, T060)** — the customer/shop-token 401 negatives, and comparing the
progress wording on web against the app.

---

## ⚠ Carried forward, and named so it is not mistaken for covered

- **A failed same-day delivery still strands its order.** The drop is marked failed, the package stays
  `collected`, the customer is told nothing. **After this slice it is the ONLY remaining way an order
  gets permanently stuck** — it inherits G1's place at the top of
  [ORDER-FLOW-GAPS.md](../../ORDER-FLOW-GAPS.md).
- **Recording arrivals is manual and nothing chases it.** This makes completion *possible*, not
  automatic. `OrderCompleted` (`Effy/Orders`) is the metric that will say whether it is happening.
- **`order_ready` / `order_out_for_delivery` are still push-only.** The channel mechanism exists; using
  it for them is a values change, deliberately out of scope.
- **Nothing that moves money** — refunds, cancellation, returns — and **no inventory**. Both remain open
  in the register; inventory (G2) is now the top item.

### ⚠ Pre-existing red gates — verified NOT caused by this slice

- Go **`internal/platform/delivery`** container tests fail (`z.sameday_eligible does not exist`).
  **Confirmed identical at clean HEAD** by stashing this work and re-running.
- Go **`internal/features/saveditems`** fails (`public.delivery_pricing_rule does not exist`) — already
  recorded in CLAUDE.md under 033.
- **`make check-no-phantm`** fails on prose in specs **042/045/050**, where the banned address appears
  *as the value being prohibited*. No file from this slice is among the hits.

### ⚠ And the thing no gate covers

**Nobody has looked at any of this.** 039 shipped four live defects with a fully green suite, because
layout, contrast and hierarchy are not properties a DOM assertion can see — and the order console is a
brand-new surface with a no-cards rule that is easy to satisfy in code and fail on screen.
[quickstart.md](quickstart.md) §8 is that walk.
