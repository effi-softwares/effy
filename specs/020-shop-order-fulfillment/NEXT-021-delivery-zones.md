# Planned next slice: 021-delivery-zones-pricing

**Captured**: 2026-07-20, during 020's clarification. **Not yet spec'd** — run `/speckit-specify` when
020 is underway. This file exists so the decisions made here are not lost.

## Why it is its own slice

Raised while clarifying 020, but it is mostly **not** shop-side. It spans back-office (zone/rate
management), both customer surfaces (checkout), core-api (serviceability + quoting), and a migration that
changes the money path. 020's only stake is *consuming* the promise, which is already specified
(FR-001/001a/001b, FR-002/002a, FR-009/009a, SC-019…SC-021).

## What it must do

Effy is Melbourne-based. Serviceability, price, and speed vary by destination:

- **In Melbourne metro** — same-day delivery available, plus the option to choose a later date.
- **Outside Melbourne metro** — no same-day; multi-day only.
- **Outside any serviced zone** — cannot be delivered at all.

So it owns: delivery **zones**, the **service levels** available per zone, the **price** of each, the
**time/window** each implies, and **address serviceability**.

## Decisions already made (operator, 2026-07-20)

1. **Own slice, and amend 020 to consume the promise.** 021 ships *after* 020. 020 does not block on it —
   with one uniform promise, its queue ordering degrades to FIFO automatically (020 FR-001b).
2. **Zones are AU postcode lists.** Chosen over radius-from-a-point, PostGIS polygons, and suburb names.
   No geocoding dependency, no external latency or cost on the quote path, trivially auditable and
   editable in back-office, and customers already know their postcode. This is the single biggest cost
   saver in the slice.
3. **Unserviceable addresses are blocked at checkout only.** Browsing and cart stay open — the storefront
   must remain guest-first and crawlable (011's SSR/SEO model). Serviceability is evaluated when an
   address is chosen at checkout, with a clear explanation. Orders are never accepted for addresses the
   platform cannot serve.

## Binding constraint carried from 020

**The customer never learns who performs a delivery.** Platform driver vs third-party service is not
modelled, not stored, and not displayed — anywhere. The customer buys a *service level and a price*. This
is the same doctrine as hidden fulfilment shops, and 020 SC-021 already enforces it for its own surfaces.

## Known impact on existing code

- **Replaces `pricing.DeliveryFeeCents = 500`** (`apis/core-api/internal/platform/pricing/pricing.go`) —
  the flat per-order constant becomes a function of (zone × service level). `order.delivery_fee_amount`
  is already a per-order column, so the schema tolerates this; the quote path, cart totals, and receipt
  do not yet.
- **Checkout gains a serviceability gate and a method choice** on `customer-web` and `customer-mobile`.
- **Back-office gains zone/rate management** (cold path — ordinary admin CRUD).
- **Order must snapshot** the chosen service level, fee, and promised window at placement, the same way
  `delivery_address` is already snapshotted, so a later rate change never rewrites a historical receipt.

## Open questions for its `/speckit-specify`

- Does the customer choose a **date/window**, or only a service level with the window derived?
- Are zones and rates managed through a **back-office UI in this slice**, or seeded first and given a UI
  later?
- Is there a **cutoff time** for same-day (e.g. order before 2pm), and does it change the promise shown?
- Do **multiple shops** in one order each get their own ready-by deadline, or one order-level promise?
