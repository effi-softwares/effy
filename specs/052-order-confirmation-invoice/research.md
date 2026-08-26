# Research: 052 — Order Confirmation & Emailed Receipt

**Date**: 2026-08-26 · **Spec**: [spec.md](./spec.md)

Everything below was checked against the codebase, not recalled. Where a finding contradicts an
assumption made in the spec or the design canvas, it is marked ⚠ and the correction is stated.

---

## R1 — Which path serves what (Principle III)

**Decision**: three responsibilities, two paths, split by the doctrine rather than by convenience.

| Responsibility | Path | Why |
|---|---|---|
| Read the receipt (`GET /v1/orders/{id}`) | **Hot** — `apis/core-api/internal/features/orders` | Already there. A customer read on the checkout completion path is exactly what the hot path exists for, and the page is rendered server-side on every load. |
| Send the receipt email on payment | **Cold** — `apis/edge-api/notifications` | Async, off every user path, low frequency, and it is email work. The 050 worker already runs on a schedule against an outbox. |
| Resend the receipt on request | **Cold** — `apis/edge-api/customer` | A low-frequency customer action whose entire job is to enqueue an email. Exactly 046's feedback-reply shape. |

**Rejected**: putting the resend endpoint on the hot path. It would be the only Go route whose work
is "write one row so a Lambda can send an email", and it would need SES credentials in `core-api`
purely to satisfy a synchronous send that should not be synchronous.

**Rejected**: sending the email inline in the finalize transaction. 027 already recorded that the
finalize path was timing out at ~14 round trips to Sydney RDS. An SES call inside it would make a
payment's success depend on a mail service being up.

---

## R2 — Where the email dispatch record lives

**Decision**: a **new table `public.receipt_dispatch`**, drained by a **new scheduled function inside
the existing `edge-api/notifications` service**. No new service.

**Rejected — reusing `public.notification_request` (050)**, which was the obvious first answer. Three
concrete mismatches:

1. Its `type` column carries a `CHECK` constraint listing six push types, and its table comment
   states it is the push outbox. Adding an email type widens a constraint whose purpose is to keep
   that vocabulary closed.
2. Its `payload` column is contractually **no-PII** ("never a name/address/total") because a push
   payload traverses FCM. A receipt email is the opposite: it is entirely PII by nature.
3. ⚠ **Its dedupe would forbid the feature's own resend.** `dedupe_key` is
   `"<type>:<recipient_sub>:<entityId>"` and `UNIQUE` — which is precisely what makes push
   exactly-once, and precisely what makes a second, deliberate send of the same receipt impossible.

`receipt_dispatch` gets exactly-once for the automatic send from a **partial unique index** on
`(order_id) WHERE reason = 'order_paid'`, while leaving `reason = 'customer_request'` rows
unconstrained so a resend is representable. That is the same "one guarantee per genuine rule" shape
`promo_redemption.order_id` uses.

**Reused unchanged**: the drain mechanics — `FOR UPDATE SKIP LOCKED`, attempt counting, a status
enum of `pending → sent | failed | skipped`, and the fail-open "not configured → leave pending"
posture (050 FR-027). The worker's `drainOnce` is already dependency-injected and unit-tested with
fakes; the receipt drain is a sibling with the same shape.

---

## R3 — The payment method summary (FR-006)

**Finding**: nothing stores it. `public.payment` holds only `provider`, `stripe_payment_intent_id`,
`amount`, `currency`, `status`. The receipt cannot say "Visa ending 4242" from any existing column.

**Finding**: 051 already established the vocabulary and the no-card-data rule — `PaymentMethodDTO`
in `packages/shared-types/src/payment.ts` carries `brand` + `last4` and its header states `last4` is
the only part of a card number permitted to leave the provider. This slice reuses that vocabulary
rather than inventing a second one.

**Decision**: add `method_type`, `method_brand`, `method_last4` (all nullable) to `public.payment`,
populated **best-effort AFTER the finalize transaction commits**, from a PaymentIntent retrieve with
`latest_charge.payment_method_details` expanded.

**⚠ Why after, not inside.** The webhook event's `data.object` is the PaymentIntent and its
`latest_charge` is an **id string, not an expanded object** — so this needs an extra Stripe API call.
Putting a network round trip inside the finalize transaction would let a slow Stripe strand a paid
order, which is 027's defect deliberately reintroduced. Outside, the worst case is a receipt with no
payment-method line, which the design degrades to cleanly.

**Consequence to state plainly**: the method line is **absent on every pre-052 order** and on any
order where the follow-up call failed. That is data, not a gap — the same shape as
`email_delivery_event.template_id` being NULL for pre-038 mail.

---

## R4 — ⚠ THE DELIVERY PROMISE IS DATE-GRANULAR, AND THE DESIGN OVERSTATED IT

**Finding**: `public.order_package_delivery.promised_from` and `.promised_to` are **`date`**
(migration `20260822001858_delivery_shipping_engine.sql:205-206`), and `DeliveryOptionDTO` types them
as `promisedFrom: string | null // ISO date (yyyy-mm-dd)`.

**⚠ The design canvas drew "Today, 5:00 – 8:00 pm".** The platform has no delivery time window and no
way to derive one. Shipping that copy would print a promise the business has not made and cannot keep,
on the one document a customer treats as a record.

**Decision**: the receipt states a **date or date range** — "Arriving today", "Arriving tomorrow",
"Arriving Wed 26 – Thu 27 Aug" — never a time. The design is corrected accordingly.

**Also found**: `shop_fulfillment.promised_ready_at` is a **ready-by at the fulfilment node**, not a
customer arrival time, and its column comment says so. It must not be shown to the customer, both
because it means something else and because it is fulfilment structure (FR-009).

A real time window is a delivery-tracking capability, not a receipt one. Recorded as out of scope.

---

## R5 — Deriving the customer-facing stage (FR-008)

**Decision**: derive **server-side**, in one pure Go function, and put the result on the DTO as a
closed vocabulary. Clients render it; no client computes it.

Mapping from the existing `shop_fulfillment.status` values across **all** portions of the order:

| All-portion condition | Customer stage |
|---|---|
| every portion `pending` | `confirmed` |
| any portion `received` or `picking` | `packing` |
| every portion at least `ready_for_pickup` | `on_the_way` |
| every portion `delivered` | `delivered` |

**⚠ Why server-side is not a preference.** 029 shipped a banner target that two surfaces read
differently, and 033 shipped an `available` flag that meant two things. A four-state progress
indicator derived independently in TypeScript and in Kotlin is the same defect waiting to happen, and
the failure is silent — both surfaces render *something*.

**⚠ It is a rollup, not a max.** A two-shop order where one portion is delivered and the other is
still being picked is **`packing`**, not `delivered`. The customer has not received their order.

---

## R6 — Resend rate limiting (FR-028)

**Decision**: an **atomic count-inside-the-INSERT**, never check-then-write:

```
INSERT INTO public.receipt_dispatch (...)
SELECT ... WHERE (SELECT count(*) FROM public.receipt_dispatch
                  WHERE order_id = $1 AND reason = 'customer_request'
                    AND created_at > now() - interval '...') < $limit
```

Zero rows affected → refused, and **no email is enqueued**, which is what FR-028 requires.

**⚠ This is 039's newsletter lesson, applied without being re-learned.** That slice recorded the
check-then-write race explicitly; 046 then used the atomic form. Doing it any other way here lets two
concurrent taps both pass the check.

**Not applicable**: 046's hashed-source-IP limiting. This route is authenticated and scoped to one
order, so the natural key is `(order_id)` — no IP, and therefore no PII to hash.

---

## R7 — The web page has no byte budget, and that is a finding

**Finding**: `apps/customer-web/scripts/bundle-budget.mjs` gates **guest routes only** (`/`,
`/search`, `/product/[id]`, `/cart`, `/legal/*`, …). `/checkout/complete` is **not in the list** and
must not be added — it is authenticated, and it lives outside the `(shop)` route group, so neither
the 174 KB budget nor the `aws-amplify`/`radix-ui`/`vaul` dependency-cruiser quarantine applies.

**Consequence**: this page has design headroom the storefront pages do not. It is still a server
component by default; the redesign introduces **no client component at all** — every element is
static markup over server-fetched data.

---

## R8 — The email template exists, and its variables are wrong

**Finding**: `order-confirmation` has been in `packages/email-kit` since 038 as the deliberate
"data-heavy proof", with **no call site** (FR-062 there). Its declared variables are
`orderNumber, deliveryEstimate, items{name,quantity,lineTotal}, subtotal, deliveryFee, total,
deliveryAddress, orderUrl`.

Against this spec it is missing: the placed timestamp, **unit price per line**, the discount and its
code, the payment-method summary, the billing treatment, the stage, the seller identity block, and
the document-status sentence.

**Decision**: rewrite the template and widen its catalogue entry, **keeping the id**.

**⚠ Keeping the id is safe here specifically because the message has never been sent.** The
catalogue states an id is permanent once shipped, because it is written into delivery records and
renaming orphans historical rows. There are no such rows: nothing has ever called this template. A
new id would be the wrong move — it would strand the artifact and the guards already built for it.

**Also**: `onSendFailure` stays `swallow` and the entry stays `transactional`. Both are already
correct and both are load-bearing — swallow because the order is already paid and a throw would
contradict a true fact (FR-023), transactional because the discriminated union in the catalogue makes
an unsubscribe link on it a **compile error** (FR-024).

---

## R9 — Unit price is already on the wire

**Finding**: `OrderItemDTO` **already declares `unitPriceAmount`**, and
`orders.Repository.Items` already selects `unit_price_amount`. The web receipt simply never rendered
it, and the mobile `Receipt` domain model drops it.

So FR-003's unit-price half is a **client-side change on both surfaces**, not a backend one. This is
the same shape as 033's finding that the mobile mapper discarded `brand`/`badges` the backend was
already sending.

**Still needed from the backend**: the product image. `public.order_item` carries no image — by
design, since it is a purchase snapshot. The image comes from `public.product_media` via
`product_id`, and `order_item.product_id` has `ON DELETE RESTRICT`, so the product row always still
exists. A `LEFT JOIN` to the primary media is safe; a missing image renders the placeholder tile,
because imagery here is decoration and never a carrier of meaning.

---

## R10 — Telemetry (Principle VII)

**Finding**: PostHog **is** initialised on customer-web as of 050 — the long-running "declared five
events, ships one" carry-forward from 039 is closed, and `apps/customer-web/lib/telemetry.ts` has an
established typed taxonomy. Events declared here will actually fire.

**Decision**:

- **Product events**: `receipt_viewed` (surface, stage), `receipt_resend_requested`,
  `receipt_resend_refused` (reason). No amount, no address, no email — the taxonomy's existing
  discipline (051 records a payment *family*, never a provider decline code) applies unchanged.
- **Metrics**: the drain emits counters by outcome (`sent` / `failed` / `skipped`), the same shape
  050's drain summary already returns.
- **Alarm**: sustained receipt-send failure. ⚠ 038 and 046 both **deferred** their send-failure
  alarm with the rationale "the service already logs it". Deferring a third time would make the
  pattern the rule; this slice's whole premise is that a missing receipt is invisible to everyone
  until a customer complains, so the alarm is in scope.

---

## R11 — Two Principle V questions, both answerable

**The bordered containers are not card layouts.** Principle V bans cards "unless a card is
demonstrably the right pattern for that specific content". A receipt is a **document**; the border is
the edge of the paper, and the totals panel is a totals block. There are no metric cards, no summary
cards at the top of the page, and no tiled content. The banned pattern is a dashboard aesthetic, and
this is its opposite. Recorded, per the principle's own requirement.

**The amber status colour is a genuine third hue and needs an exception.** Principle V permits
exactly two semantic colours and forbids a third as a UI colour. `#b45309` / `#f0a04b` for the
same-day badge is a third. It is recorded in Complexity Tracking with the bounds 039's FR-005a
established, and SC-010 makes the bounds mechanically checkable rather than promised.

**⚠ One design detail is what keeps it inside the *rest* of Principle V.** `--success` has no
foreground pair on purpose — it clears 3:1 for a non-text indicator and fails 4.5:1 for text. So the
badge is a **tinted pill with a coloured dot and a ramp-coloured label**: the hue is never text, and
the label carries the meaning with the colour removed.

---

## R12 — The web content column (FR-018a)

**Finding**: the storefront defines one `@utility container` in `apps/customer-web/app/globals.css:54`
— `width:100%` · `margin-inline:auto` · `max-width:80rem` · `padding-inline` 16px, 24px at `sm` — and
its comment records that it exists because the four decisions had been written out **24 times**.

**Finding**: `/checkout/complete` uses `mx-auto w-full max-w-2xl px-4 py-10 sm:px-6` — that exact
antipattern at a different width. So does `app/(account)/orders/[id]/page.tsx`, **which renders the
same receipt document reached from order history**.

**Finding**: `app/(account)/saved/page.tsx:24` records the convention — `container` for lists and
product content, `max-w-2xl` for "forms and settings, where a narrow measure is correct".

**Decision**: both pages move to `container`. 80rem is far wider than 672px, so the layout is
**designed for the width**: a two-column desktop arrangement, document left, a rail right for the
promise, progress and actions. A single column at 80rem would put the width of the page between an
item's name and its price.

**⚠ Both pages, or neither.** Moving only the checkout one makes the identical document render at two
different widths depending on how the customer arrived at it.

---

## R13 — What stands between this and a compliant tax invoice (FR-034)

Researched against the ATO's own guidance before any of the above.

A tax invoice for a taxable sale under $1,000 must carry: the seller's identity, the **seller's
ABN**, the date issued, a description of the items including quantity and price, **the GST amount
payable** (or the statement "Total price includes GST" **only where GST is exactly 1/11 of the
total**), and **the extent to which each sale is a taxable sale**. Above $1,000 it must also carry
the buyer's identity or ABN. One must be issued within 28 days of a request.

The receipt in this slice already satisfies: seller identity, date, item description with quantity
and price, buyer identity (the delivery recipient), and the totals.

**Two prerequisites remain, and neither is engineering work in this slice:**

1. **The ABN is unsupplied.** `packages/legal-content/src/identifiers.json` holds the fail-loud
   placeholder `[ABN]`, alongside `[LEGAL_ENTITY_NAME]` and `[REGISTERED_ADDRESS]`. The constitution's
   Real-World Identifiers section forbids inferring it. **Operator input.**
2. **Per-item GST treatment is unmodelled.** There is no tax column anywhere in `db/migrations/`, and
   no taxable/GST-free flag on `public.product`. ⚠ This is not a small gap for a grocer: **basic food
   is GST-free in Australia**, so an Effy basket is a *mixed supply*. The 1/11 shorthand is therefore
   **false for most Effy orders**, and the "extent to which each sale is taxable" requirement cannot
   be met from data that does not exist.

Until both land, the document states what it is (FR-032) and the tax fields are **absent, not
placeholder** (FR-031). The layout reserves their position (FR-033) so supplying them is a
configuration-and-data change, not a redesign.
