# Customer Order Flow — Gap Register

**Audited 2026-08-26** against the code (not the specs) at branch `052-order-confirmation-invoice`.
Scope: everything between a customer discovering a product and their order being complete.

> **UPDATE 2026-08-26 — [053-order-lifecycle-completion](specs/053-order-lifecycle-completion/) closes
> G1, G6 and G7, and part of G5.** Code-complete and machine-verified; **not deployed**. Marked inline
> below. ⚠ After 053, the **failed same-day delivery** (Tier 2) is the ONLY remaining way an order gets
> permanently stuck — it inherits G1's place as the top structural gap.

Every claim below cites the file that proves it. Where a gap is a *deferral already recorded in a
comment*, that comment is quoted — the point is that the deferral was never picked up.

---

## The flow as actually built

```
browse → product → cart → address → delivery quote → PaymentIntent → Stripe
  → webhook finalize → per-shop fan-out → shop pick → driver collect → hub check-in
  → same-day drop → delivered
```

The **paid transition** — `apis/core-api/internal/features/checkout/store.go:468` `FinalizeSucceeded` —
is the strongest part of the platform. One transaction performs: the status-guarded
`pending_payment → paid`, the per-shop `shop_fulfillment` fan-out, the 047 package-delivery copy, the
`shop_new_order` push intents, the `order.placed` outbox append, the customer `order_paid` push intent,
the `receipt_dispatch` enqueue, the payment status flip, the promo redemption, and the cart empty.
Idempotent, with an independent database-level guarantee behind each step.

**Nothing in this register is about that transaction.** Every gap is *after payment*.

---

## Tier 1 — the flow cannot complete

### ~~G1. Standard delivery has no terminal state~~ — ✅ CLOSED by 053 (not deployed)

`apis/edge-api/driver/src/hubcheckin/repository.ts:4` splits collected packages and records that standard
ones "stay `collected` and are handed to the external carrier at the dock." There is no carrier record,
no consignment/tracking reference, no carrier webhook, and no manual close-out anywhere in the codebase.

The **only** writer of `shop_fulfillment.status = 'delivered'` is
`apis/edge-api/driver/src/delivery/repository.ts:223`, reachable only from a `delivery_task` — and
`apis/edge-api/driver/src/delivery/assignment.ts:35` creates delivery tasks **only** where
`opd.method = 'same_day'`.

**Consequence.** Every standard package stops at `collected`, permanently. Via the rank map in
`apis/core-api/internal/features/orders/stage.go`, `collected` scores 2 → the customer's derived stage
is **`on_the_way` forever**. The `order_delivered` push never fires. Standard is the *default* method
(same-day requires a zone eligibility flag **and** a pre-cutoff order under 047), so this is the
majority path.

**Shape of the fix.** A carrier-handoff record keyed on `shop_fulfillment`, a terminal transition that
does not depend on an Effy driver, and a customer-visible reference. Until then no standard order in
the system can ever be complete.

> ✅ **Built by 053**, with one deviation: **the customer-visible reference was deliberately dropped.**
> References are per-package and packages are per-shop, so showing them would disclose how many shops
> served the order — an invariant the platform has held since 007. The reference is recorded for staff
> so support can chase a carrier on the customer's behalf. Revisit when a real carrier contract lands.
> 053 also found that G5's premise was half-wrong in the platform's favour and half-wrong against it —
> see below.

### ~~G2. There is no inventory model — anywhere~~ — 🚧 CLOSED by 054 (not deployed, not committed)

`public.product` (`db/migrations/20260716092105_product_catalog.sql:86`) carries `status`
(`draft | active | unavailable | archived`) and nothing else. No stock count, no reservation, no
decrement at finalize. A repo-wide search for stock/inventory/on_hand/reserved returns only prose.

`db/migrations/20260710050004_shop_staff_rbac.sql:22` states it outright:

> `public.shop` … Deliberately minimal: no address, hours, capacity, **or inventory** — those arrive
> with the slice that needs them.

That slice was never written. The only quantity constraint on the platform is
`cartpolicy.MaxLineQuantity` (`apis/core-api/internal/features/cart/service.go:115`), which is a
per-line **policy cap**, not availability.

**Consequence.** Overselling is unbounded. A shopper can buy 20 of something the shop has 2 of, and the
sole discovery mechanism is a picker finding an empty shelf hours later — which routes straight into G3.

> 🚧 **Built by 054** ([specs/054-product-inventory/](specs/054-product-inventory/)), with three things
> worth knowing:
>
> * **Tracking is OPT-IN per product.** An untracked product behaves exactly as before, so nothing in
>   the existing catalogue changes until a shop chooses to count it. That is what makes this shippable
>   without a data migration — and it means **G2 is only closed for products a shop actually tracks**.
> * **⚠ A residual oversell window is ACCEPTED, not closed** (spec A6). Stock is reduced when an order
>   is PAID, not held during checkout, so between creating a payment and that payment succeeding another
>   shopper can take the last unit. Reservations with expiry would close it and need an
>   abandoned-checkout sweep the platform does not have (Tier 4). Instead the deficit is recorded at
>   payment and the pick line is **pre-flagged before picking begins**, moving discovery from "a picker
>   at a shelf, hours later" to "the moment the order arrives".
> * **G3 IS STILL OPEN, and 054 does not touch it.** Fewer shortfalls, found earlier, is progress
>   toward the money half — not a substitute for it. A shopper who is oversold is still charged in
>   full, and there is still no refund capability on the platform.
>
> ✅ **SC-003 is proven** — two concurrent payments for the last unit, against real PostgreSQL: the
> count never reads below zero, and removing the floor makes the second payment violate the CHECK
> constraint. ⚠ **NOT DEPLOYED, NOT COMMITTED, and no screen has been looked at by a person.**

### G3. Shortfall has no money path

`apis/edge-api/shop/src/functions/fulfillment-item-v1-patch.ts:5`:

> … something they will not receive, and that debt is left queryable for **a later refunds slice**.

The customer is charged in full. `apps/customer-web/app/(account)/orders/[id]/page.tsx:132` shows an
"Unavailable" panel ending in *"Contact support about this order and we'll sort it out."* The order
total is never adjusted, and **no refund capability exists on the platform** — no Stripe refund call,
no `refund` table, no back-office action.

G2 makes this the *expected* outcome rather than an edge case: with no stock model, shortfall is the
normal way the platform learns it oversold.

---

## Tier 2 — post-purchase capabilities that do not exist

| Missing | Evidence |
|---|---|
| **Customer order cancellation** | `public."order".status` CHECK includes `'canceled'` (`db/migrations/20260719120000_customer_commerce.sql`); nothing in the codebase ever writes it. No route, no UI, no console action. |
| **Refunds / returns** | No data model, no route, no provider call, no console. See G3. |
| **Order-scoped support** | `apps/customer-web/app/(account)/orders/[id]/page.tsx:94` — "Get help" links to `/feedback`, the generic 046 form. No order reference is attached and there is no thread. |
| **Failed-delivery visibility** ⚠ **now the top structural gap** | `apis/edge-api/driver/src/delivery/repository.ts` sets `delivery_task = 'failed'`. `shop_fulfillment` stays `collected`; no customer notification, no re-attempt scheduling, no customer-facing state. The shopper keeps seeing "on the way". **After 053 this is the only remaining way an order gets permanently stuck.** |
| **Shop rejection** | `shop_fulfillment.status` (`db/migrations/20260722160000_fulfillment_delivered_state.sql:10`) has no `cancelled`/`rejected` member. A shop that cannot fulfil its portion has no exit from the state machine. |

---

## Tier 3 — built but not wired, or correct when written and wrong now

### G4. `TrackOrderScreen` is dead code, and carries a competing stage vocabulary

`apps/customer-mobile/shared/src/commonMain/.../features/tracking/presentation/TrackOrderScreen.kt` —
168 lines, written against real 020 state, and **absent from `CustomerNavKey`**
(`core/nav/CustomerNavKey.kt`). The only reference outside the file itself is its own
`TrackOrderDisclosureTest`. No route, no call site.

It also defines its own `TrackStage` enum — a **second implementation of the progress rule**, competing
with 052's server-derived `Stage`. That is exactly what customer-web's `summarizeFulfillment` was
deleted for in 052.

**Decide one of two things:** wire it to the server-derived `stage` and delete `TrackStage`, or delete
the screen. Leaving it is how the two vocabularies silently diverge.

### G5. The mobile Notifications inbox is permanently empty

`features/notifications/presentation/NotificationsScreen.kt:40`:

> ⚠ FIXTURE-BACKED. The platform has no notifications capability — see `NotificationFixtures`, which
> returns an EMPTY list.

Since 050 the platform **does** write `notification_request` rows, but no customer-facing read API was
ever added (`apis/edge-api/customer/src` has no notifications domain). Push lands on the OS; the in-app
centre shows nothing, forever.

### ~~G6. `on_the_way` is claimed too early~~ — ✅ CLOSED by 053 (`ready_for_pickup` rank 2 → 1)

`apis/core-api/internal/features/orders/stage.go` gives `ready_for_pickup` rank 2 → `on_the_way`. Under
049's hub-and-spoke model that means *packed and sitting on a shop shelf, waiting for the next scheduled
collection run* — potentially the following day. `collected` also scores 2, and means *at the hub*,
which is likewise not en route to the customer.

The map was written in the 020 era, when `collected` meant "handed to a courier". The customer is now
told their shopping is on its way while it has not left the shop.

### ~~G7. A delivered order still blocks account closure~~ — ✅ CLOSED by 053

`apis/edge-api/customer/src/closure/repo.ts:83` uses `f.status <> 'collected'` as the in-transit term,
with the comment that it was included ahead of time so the block would

> become correct automatically when the delivery lifecycle lands, rather than needing to be found and
> rewritten then.

The delivery lifecycle landed in 049 with **`delivered`** as terminal, not `collected`. So a fully
delivered order still reads as in-transit and blocks closure until the `IN_TRANSIT_BLOCK_DAYS = 7`
backstop expires. One-line fix.

*(Same file, `findBlockingOrders` docblock: the Principle III rationale — "core-api HAS NO CLOUD DEPLOY
(local-Docker-only by platform decision)" — is stale since 040 deployed core-api. The exception may
still be the right call; the reason given for it is no longer true.)*

### G8. Internal vocabulary in customer-facing push

`apis/edge-api/notifications/src/worker/copy.ts:28` — `order_ready` body is *"Your order is ready for
handoff."* "Handoff" is fulfilment-internal language, and the event fires at a moment when nothing
customer-visible has happened (see G6).

---

## Tier 4 — checkout-side gaps

- **No guest checkout.** Guest browsing, guest cart (027) and guest saved items (033) are all supported,
  then `apps/customer-web/app/checkout/page.tsx:38` redirects a guest to sign-in. The wall sits at the
  highest-intent moment in the funnel, and it is the one place the guest-first design gives out.
- **No delivery instructions / drop-off preference.** `public.customer_address` has no such column and
  `checkout.IntentInput` (`apis/core-api/internal/features/checkout/service.go:192`) accepts none. The
  driver app has a contactless proof method with no customer preference driving it.
- **No abandoned-order sweep.** `pending_payment` orders linger indefinitely.
  `checkout/service.go:669` calls an extra abandoned pending order "harmless and sweepable" — nothing
  sweeps. They also block account closure (G7's first term) until `clears_at`.
- **Not a tax invoice.** Two independent gaps, both recorded in 052 R13: the **ABN is unsupplied**
  (operator input; the constitution forbids inferring it) and **per-item GST treatment is unmodelled**
  — basic food is GST-free in Australia, so a grocery basket is a mixed supply.

---

## Tier 5 — notification coverage

The email catalogue (`packages/email-kit/src/catalog.ts`) held exactly **one** order message:
`order-confirmation`. The other three lifecycle events — `order_ready`, `order_out_for_delivery`,
`order_delivered` — were **push-only** (`apis/edge-api/notifications/src/worker/copy.ts`).

> ✅ **Partly closed by 053**: `notification_request` gained a `channel` dimension and a new
> `order-delivered` template, so the **arrival** now reaches a shopper with no app. ⚠ `order_ready` and
> `order_out_for_delivery` are **still push-only** — a values change on the mechanism 053 built, left
> deliberately out of its scope.

**Consequence.** A web-only shopper — the whole `customer-web` audience, and the only surface with a
public URL — receives a receipt (once deployed) and then complete silence for the rest of the order's
life. iOS push is deferred entirely on the Apple Developer account blocker
(`docs/observability-apple-blockers.md`), so iOS app users are in the same position.

---

## Deployment reality

- **052 is committed but not deployed. No receipt has ever been sent.** The open operator steps are
  listed in `specs/052-order-confirmation-invoice/SIGNOFF.md`.
- **Push delivery has never been confirmed end-to-end** (050 carried it forward explicitly to be
  debugged against the order flow). Note that G1 means the `order_delivered` link of that chain
  *cannot* fire for a standard order at all — so debugging it needs a same-day order.
- Docker was down for the whole 052 session, so every container-backed test — including the
  exactly-once and resend-concurrency proofs — skipped.

---

## Suggested sequencing

> **Updated after 053.** Items 2 and 4 are done (code-complete, not deployed). **Inventory (G2) is now
> the top item**, and the failed same-day delivery has taken G1's old place as the structural blocker.

1. ~~**Inventory (G2)**~~ — 🚧 built by 054, not deployed. ⚠ **Its completion makes G3 more urgent, not
   less**: shortfalls become rarer and visible earlier, which means the ones that remain are the real
   ones, and there is still no way to give anybody their money back.
2. **Standard-delivery completion + carrier handoff (G1)** — without it no standard order can ever
   reach a terminal state, and the delivered notification is unreachable for the majority path.
3. **Refunds and cancellation (G3, Tier 2)** — the money half of the post-purchase story.
4. **G6 and G7 now, regardless** — both are one-line corrections to rules that were right when written
   and became wrong when a later slice changed the lifecycle underneath them.
