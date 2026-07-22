# Research: Checkout Shipping & Billing Addresses (023)

Phase 0 decisions. The three product forks (new spec; "same as shipping" toggle default-ON with
divergence; shop sees shipping only) were settled with the operator before the spec; this records the
technical decisions the plan rests on.

---

## R1 — Represent billing as a nullable snapshot; `NULL` = "same as shipping"

**Decision**: add `public."order".billing_address jsonb` **NULLABLE**. `NULL` means "billing is the same
as shipping"; a value is an immutable snapshot of a divergent billing address. The receipt reads billing as
`COALESCE(billing_address, delivery_address)`.

**Rationale**: the common case (billing = shipping) stores nothing extra and duplicates no data; FR-016
("Billing: same as shipping" text) is `billing_address IS NULL`; FR-013 (toggle back ON discards the
divergent choice) is "write NULL". It cannot drift out of sync with shipping because there is nothing to
sync — when same, there is no second copy.

**Alternatives considered**:
- `billing_address NOT NULL` + a `billing_same_as_shipping boolean`. Rejected — duplicates the shipping
  snapshot on every order for no gain, and adds a flag that can contradict the data.
- A separate `order_billing_address` table. Rejected — a one-to-one immutable snapshot is a column, not a
  table; it would add a join to every receipt read.

## R2 — Keep `delivery_address` as the shipping snapshot (do not rename)

**Decision**: the existing `delivery_address` **is** the shipping address. Do not rename it to
`shipping_address`.

**Rationale**: `delivery_address` is read by core-api orders, edge-api/shop fulfilment, both clients, and
the generated `CommerceDto`. A rename churns all of them for a cosmetic label. "Shipping" is formalised in
DTO field docs and UI copy; the column and its jsonb shape are untouched — which also means 019/020/021
readers need no change for shipping.

**Alternatives considered**: rename + backfill. Rejected — high blast radius, zero behaviour gain.

## R3 — Enforce the shop boundary by column separation + a guard test, not runtime redaction

**Decision**: billing lives in its **own** column. The shop fulfilment repository already `SELECT`s only
`o.delivery_address` from the order (`apis/edge-api/shop/src/fulfillments/repository.ts`), so billing is
unreachable from every shop query and payload. FR-018 is locked by a **guard test** asserting no
shop-facing SQL string or DTO field names `billing`.

**Rationale**: separation-of-columns makes the leak *structurally impossible* rather than relying on a
redaction step that a future edit could forget. A test that greps the shop fulfilment SQL/mappers for
"billing" fails loudly if anyone ever joins it in. Cheaper and stronger than runtime filtering.

**Alternatives considered**: select the whole order row and redact billing in the mapper. Rejected — one
forgotten field leaks PII to a fulfilment node; the boundary should not depend on remembering to redact.

## R4 — New-address-at-checkout reuses the cold-path address-book create

**Decision**: "Add a new address" at checkout calls the **same** cold-path write as the Address Book
(022, `POST /customer/v1/addresses`); the returned address **id** is then used as the shipping (or
billing) selection in the hot-path intent.

**Rationale**: one address-write path (cold, 022), reused. The hot-path intent only ever receives an
address **id** and snapshots it by reading `public.customer_address` directly (as checkout already does),
so a just-created address is immediately visible to the same-DB read. Consistent with 022's routing.

**Alternatives considered**: a hot-path "create address during checkout" endpoint. Rejected — duplicates
the address-write logic and re-splits address management across paths (the mistake 022 corrected).

## R5 — Billing is a snapshot, not a saved "billing address" type

**Decision**: `customer_address` gains **no** billing concept. The customer picks or enters an ordinary
saved address; the order snapshots it as `billing_address`.

**Rationale**: keeps the address book single-purpose (delivery addresses the customer manages) and the
order self-contained (immutable snapshots). Matches the spec's Key Entities.

## R6 — Stripe `billing_details` wiring is a recorded follow-up

**Decision**: this slice records the billing address on the **order** (platform receipt/invoice). It does
**not** change how the PaymentIntent is created; sending `billing_details` to Stripe is a follow-up.

**Rationale**: the spec says Stripe mechanics are unchanged except that billing on the order is now
explicit. The amount and idempotency are untouched; adding `billing_details` later is additive and
behaviour-neutral. Recorded so it is not silently dropped.

## R7 — Checkout address section is a list/picker (Principle V), reusing 022

**Decision**: the checkout address UI is a **selected-address summary + a picker list** of saved addresses
+ an "add new" that opens the 022 shared responsive form (dialog/drawer web; bottom sheet mobile). Billing
is the same picker behind a "same as shipping" toggle. No cards.

**Rationale**: Principle V (no cards; native-feel) and Principle II (reuse the design-system `ResponsiveModal`
+ the 022 saved-address list rather than a checkout-only form). The current bare `AddressForm` is replaced.

**Alternatives considered**: keep the checkout-only inline form. Rejected — it was the deferred 022
reconciliation this slice exists to do.
