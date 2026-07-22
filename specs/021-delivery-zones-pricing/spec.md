# Feature Specification: Delivery Zones & Pricing

**Feature Branch**: `021-delivery-zones-pricing`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "021 - delivery zones. Melbourne-based platform. Melbourne-area customers can
get same-day delivery for a price and can choose a later date; outside Melbourne only multi-day; outside
any serviced area, no delivery. Never reveal whether our own drivers or a third party deliver. Manage
shipping fees, whether we ship to an area, the fees, the methods available, and the time to ship per geo
area. **Multi-shop split delivery (AliExpress / Daraz model): when a cart holds items from several shops
in different locations, each shop becomes a separate delivery with its own shipping price and delivery
time; internally each routes to its shop; the customer still places ONE order and pays ONCE, but sees a
clear breakdown of how items and shipping are calculated per part of the order.**"

---

## Overview

Today Effy charges **one flat $5.00 delivery fee** on every order, everywhere, no matter where the
customer lives, where the goods come from, or how fast they want it (`pricing.DeliveryFeeCents = 500`,
hardcoded). That was the right placeholder to ship 019's checkout — and it is now the single biggest
thing standing between Effy and a real delivery proposition.

This slice makes delivery **geographic, per-shop, and tiered.** Two facts drive it:

1. **Effy is Melbourne-based, and shops sit in different locations.** How fast and how cheaply an item
   can reach a customer depends on the distance from *the shop holding it* to *the customer's address*.
2. **A cart can hold items from several shops.** Following the AliExpress / Daraz model, each shop's
   items become **a separate delivery** — its own shipping price, its own delivery time — because each
   shop is a different origin. Internally each part routes to its own shop as a distinct unit of work.

The customer experience stays simple and singular: **one order, one payment, one receipt.** But instead
of an opaque flat fee, the customer sees an **honest, anonymised breakdown** — "this part of your order
arrives Tuesday for $5; that part arrives Thursday for $7" — so they understand what they are paying for
and when each part lands. And two rules are absolute:

- **Shops are never revealed.** The breakdown is by **package**, never by shop. No shop name, no shop
  location, no origin suburb — only the items, the price, and the arrival time of each package. This is
  the same hidden-fulfilment doctrine that governs the rest of the platform; the AliExpress *split* is
  adopted, the AliExpress *seller identity* is not.
- **The customer never learns who carries a delivery.** Own driver, contracted courier — that distinction
  does not exist in the product. The customer buys, per package, a **service level and a price**.

### Why this is the right next slice

020 gave each shop's fulfilment portion a "ready-by" promise, but with one flat delivery option that
promise is uniform and meaningless — every order looks equally urgent. This slice gives each portion a
**real, independent** promise (same-day vs multi-day, computed from that shop's distance to the
customer), which is exactly what 020's per-portion queue ordering was built to consume — with no
shop-side rework. It also replaces the last hardcoded lie in the customer's purchase: the fee.

---

## User Scenarios & Testing *(mandatory)*

> **Surfaces.** The customer-facing half ships on **both** customer surfaces — `apps/customer-web` and
> `apps/customer-mobile` — at parity. The management half is a **back-office** capability. Reference
> platforms: **AliExpress / Daraz** for the multi-shop split-delivery breakdown and per-part shipping,
> and **Uber Eats** for service tiers, times, and fees — adapted to Effy's single-brand, hidden-shop
> model (the split is shown; the sellers are not).

### User Story 1 - A customer sees real, per-package delivery options for their address (Priority: P1)

At checkout, once the customer chooses a delivery address, the order is presented as **one or more
packages** — one per shop fulfilling it, but shown **anonymously**. For each package the customer sees
the items it contains, the delivery methods Effy can offer *for that package to that address* (a package
coming from a Melbourne shop can offer same-day; one from further out offers only multi-day), each
method's **price** and **arrival time**. The customer sets **one delivery preference** (e.g. fastest or
cheapest) that applies to every package by default, and may **override** the method on any individual
package. The order total sums the item prices and every package's effective shipping. Nothing names a
shop, a shop's location, or who will carry any package.

**Why this priority**: This is the whole customer-facing value — honest, per-part delivery choice. It is
independently valuable the moment it ships.

**Independent Test**: Build a cart with items from two shops (one Melbourne-metro, one further out),
check out to a Melbourne address, and confirm two packages appear anonymously — the metro package
offering same-day + later options, the other only multi-day — each with prices and arrival times; confirm
the total sums items + both packages' shipping; confirm no shop name or location appears anywhere.

**Acceptance Scenarios**:

1. **Given** a cart with items from two shops, **When** the customer reaches the delivery step, **Then**
   the order is shown as two packages, each listing its items, its available methods, and each method's
   price and arrival time — with **no** shop identity or location shown.
2. **Given** a package sourced from a Melbourne-metro shop delivering to a Melbourne address, **When** its
   options are shown, **Then** same-day is offered alongside at least one later option.
3. **Given** a package sourced from a shop that cannot same-day the address, **When** its options are
   shown, **Then** only multi-day option(s) are offered.
4. **Given** the customer sets one delivery preference, **When** the packages render, **Then** each
   package defaults to that preference (or the closest available option), shown per package.
5. **Given** the default preference is applied, **When** the customer overrides the method on one package,
   **Then** only that package changes and the total re-sums; the other packages keep the default.
6. **Given** the effective per-package methods, **When** the summary updates, **Then** the total delivery
   fee equals the sum of the packages' effective fees, and the grand total reflects it.
7. **Given** any package or method is displayed, **When** the customer views it, **Then** nothing reveals
   the shop, its location, or who will deliver it.
8. **Given** a single-shop order, **When** the customer checks out, **Then** they see exactly one package
   (the breakdown degrades gracefully to one part — no artificial "package 1 of 1" noise).

---

### User Story 2 - A customer cannot order a package Effy can't deliver (Priority: P1)

If a package cannot be delivered to the chosen address — the shop holding those items does not serve that
destination — Effy **automatically sets those items aside** with a clear notice naming the affected
items (never a shop), and the customer must **explicitly confirm** proceeding without them before
payment. The set-aside items are never charged and never placed; the customer may instead change the
address to make them deliverable. Because an order can span several shops, this is a routine partial case,
not a dead end. Browsing and cart stay open — the check happens only at the delivery step.

**Why this priority**: Taking payment for a delivery Effy cannot make is the worst outcome — refunds are
out of scope, so an undeliverable paid package is a real liability. This must be airtight, and it is more
subtle than before because one order can be partly deliverable.

**Independent Test**: Cart items from two shops; choose an address one shop can serve and the other
cannot; confirm the deliverable package proceeds while the undeliverable one is clearly flagged and blocks
payment until resolved; confirm the resolution path works; confirm no shop is named.

**Acceptance Scenarios**:

1. **Given** a cart and no address, **When** the customer browses and views the cart, **Then** nothing
   about serviceability blocks them.
2. **Given** a chosen address that **no** shop in the cart can serve, **When** the customer tries to
   proceed, **Then** they are stopped with a clear, non-technical explanation and cannot pay.
3. **Given** a chosen address that **some** but not all packages can reach, **When** the customer reaches
   the delivery step, **Then** the undeliverable items are automatically set aside with a clear notice,
   and the customer must **explicitly confirm** proceeding without them before payment.
4. **Given** items have been set aside, **When** the customer confirms and pays, **Then** only the
   deliverable packages are placed and charged; the set-aside items are neither placed nor charged.
5. **Given** items are set aside for an unreachable address, **When** the customer instead changes to an
   address that can reach them, **Then** those items are restored to the order and re-quoted.
6. **Given** any serviceability notice, **When** it is shown, **Then** it names the affected **items**,
   not a shop, a location, or an internal rule.

---

### User Story 3 - The price the customer sees is the price they pay, forever (Priority: P1)

Every package's delivery fee is computed by Effy from that package's origin shop, the customer's address,
and the chosen method — never taken from the customer's device. What the customer sees when choosing is
what they are charged. At placement, **each package's** chosen method, fee, and promised window are
**frozen onto that package's record**, and the order's total delivery fee is the sum. A later change to
Effy's rates never alters an already-placed order — the receipt is a historical record, not a live
recomputation.

**Why this priority**: This is the money-path integrity of the slice, now multiplied across packages. A
fee that can drift between display, charge, and receipt — on any package — is a billing defect. It must
be server-decided and snapshotted per package, exactly as the delivery address already is per order.

**Independent Test**: Place a two-package order; note each package's fee and window and the summed total;
change one method's rate in management; re-open the historical order and confirm every recorded fee,
window, and the total are unchanged. Submit a manipulated per-package fee from the client and confirm it
is ignored.

**Acceptance Scenarios**:

1. **Given** selected methods with shown per-package fees, **When** the order is placed and paid, **Then**
   the total delivery amount charged equals the sum of the shown package fees, to the cent.
2. **Given** a placed order, **When** Effy later changes any method's price or window, **Then** every
   package's recorded fee and window, and the order total, are unchanged.
3. **Given** a client submits a per-package fee or method that disagrees with Effy's computation, **When**
   the order is priced, **Then** Effy's computed values are used and the client's are ignored.
4. **Given** a placed order, **When** the receipt is viewed, **Then** it shows, per package, the chosen
   method, its fee, and its promised window as recorded at placement — plus the summed total.

---

### User Story 4 - Back-office manages coverage, shops' locations, and rates (Priority: P2)

Back-office staff define the delivery map: the serviced **areas** (as postcode sets), **each shop's
location** (which determines the legs it can serve and how they price), which **methods** are offered for
a given **(origin zone → destination zone)** pair, the **price** of each, and the **time** each takes. Changes take
effect for **new** quotes only; historical orders are untouched. A shop with no location, an area with no
methods, or a destination in no area all mean "not serviceable" — safe, explicit states, never errors.

**Why this priority**: Coverage, shop locations, and rates will change, and doing that without code
changes or migrations is what makes the feature operable. The full editing UI is in scope for this slice
(chosen 2026-07-21). But it ranks below the customer path, which can be exercised against a first
configuration.

**Independent Test**: As back-office staff, set a shop's location, define an area and its methods/prices/
times, and confirm a new checkout from that shop to that area reflects it; then remove the shop's
location and confirm its packages become undeliverable for new orders while historical orders are
untouched.

**Acceptance Scenarios**:

1. **Given** back-office staff, **When** they set a shop's location and define areas with methods, prices,
   and times, **Then** a subsequent customer quote reflects the configuration for that shop→address leg.
2. **Given** a change to a method's price or time, **When** it is saved, **Then** new quotes use it and
   already-placed orders are unaffected.
3. **Given** a shop with no location, an area with no methods, or a destination in no area, **When** a
   customer checks out, **Then** the affected package is treated as undeliverable (US2), not as an error.
4. **Given** any management action, **When** it changes coverage, a shop's location, or pricing, **Then**
   who performed it and when is recorded (auditable).

---

### User Story 5 - Each shop's ready-by promise becomes real and independent (Priority: P2)

Because every package now carries a real delivery method and window computed from its own shop's distance
to the customer, each shop's fulfilment portion gets its **own independent ready-by** — a same-day
package's shop is genuinely more urgent than a multi-day package's shop, even within the same customer
order. This is the direct payoff of 020's per-shop promise seam: the shop side needs **no rework**, only
real per-portion data flowing in.

**Why this priority**: Largely automatic (020 built the seam for exactly this) and not required for the
customer to buy delivery, so it ranks after the customer and management paths.

**Independent Test**: Place an order whose two packages have different service levels; confirm each shop's
queue reflects its own ready-by, and the same-day shop ranks its portion more urgently than the multi-day
shop ranks its portion — with no shop-side code change beyond the data it already renders.

**Acceptance Scenarios**:

1. **Given** an order with a same-day package and a multi-day package for different shops, **When** each
   operator views their queue, **Then** each portion's ready-by reflects its own package's promise, and
   020's promise-based ordering prioritises the same-day portion.
2. **Given** any portion, **When** the shop views it, **Then** the promised readiness reflects the
   customer's chosen method for that package, and still reveals nothing about who delivers.

---

### Edge Cases

- **Destination in no configured area, or origin shop has no location** → that package is undeliverable
  (US2); never an error, never a silent flat fee.
- **Partly-serviceable order** (some packages deliverable, one not) → undeliverable items are auto-set-
  aside with a notice; the customer must explicitly confirm proceeding without them; set-aside items are
  never placed or charged, and no order is ever placed with an item silently dropped.
- **Every item in the cart is undeliverable to the address** → there is nothing to confirm-proceed on;
  the customer is blocked entirely (US2 scenario 2) until they change the address.
- **Same-day chosen after the daily cutoff** → same-day is withdrawn for that package; the earliest still-
  valid option is shown instead.
- **Address changed after methods were chosen** → every package re-quotes for the new address; a stale
  per-package fee from the old address must never be charged.
- **Rate changed between quote and placement** → re-confirmed server-side at placement per package; the
  customer is never charged more than last shown without seeing the new amount first.
- **Two packages with very different arrival times** → shown honestly per package; the order is not gated
  on the slowest package unless the customer's chosen methods make it so.
- **Management withdraws a method mid-checkout** → placement re-validates; a withdrawn per-package method
  cannot be purchased.
- **Single-shop order** → exactly one package; the breakdown must not add artificial multi-package noise.
- **Malicious client sends a zero/negative per-package fee, or reassigns items to a cheaper package** →
  ignored; server recomputes per package from the true shop origins and its own rates.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Per-package serviceability & options (US1, US2)

- **FR-001**: The system MUST group an order's items into **packages, one per fulfilling shop**, and
  present them to the customer **anonymously** — no shop name, code, or location, ever.
- **FR-002**: For each package the system MUST determine, from the package's origin shop and the delivery
  address, whether Effy can deliver it and which methods are available, each with a price and arrival
  time / window.
- **FR-003**: A package from a Melbourne-metro shop to a Melbourne-metro address MUST be able to offer
  same-day plus a later option; a package whose shop cannot same-day the address MUST offer only multi-day
  options.
- **FR-004**: A package that cannot be delivered to the address MUST be clearly flagged before payment,
  identifying the affected **items** (never a shop), and MUST NOT expose internal coverage rules.
- **FR-005**: Serviceability MUST be evaluated only at the delivery step — browsing and cart MUST remain
  open and unblocked (guest-first).
- **FR-005a**: The **cart** MUST group items into anonymous packages (one per fulfilling shop) from the
  start, before any address is chosen — showing the split and the items, but **no** shop identity,
  location, price, or window (those appear at the delivery step once an address exists).
- **FR-006**: Changing the delivery address MUST re-derive every package's methods, prices, and windows.
- **FR-006a**: The customer MUST be able to set **one order-level delivery preference** applied to every
  package by default, and to **override** the method on any individual package; the effective per-package
  method is what is priced and snapshotted.
- **FR-006b**: When some (but not all) packages are undeliverable to the address, the system MUST
  automatically set the affected items aside and require the customer's **explicit confirmation** to
  proceed without them; set-aside items MUST NOT be placed or charged, and MUST be restorable by choosing
  an address that can reach them.
- **FR-006c**: When **every** item is undeliverable to the address, the customer MUST be blocked entirely
  (there is nothing to proceed with) until they change the address.
- **FR-007**: A single-shop order MUST present as exactly one package without artificial multi-package
  framing.

#### Price integrity (US3)

- **FR-008**: Each package's delivery fee MUST be computed by Effy from the package's origin shop, the
  destination, and the chosen method — never accepted from client input.
- **FR-009**: The per-package fees shown when the customer chooses MUST equal the fees charged, to the
  cent; the order's total delivery fee MUST equal the sum of the chosen packages' fees.
- **FR-010**: At placement, **each package's** chosen method, fee, and promised window MUST be snapshotted
  onto that package's record, so later rate changes never alter a historical order.
- **FR-011**: A quote MUST be captured server-side with a bounded **validity window**; within it, the
  shown per-package prices and windows MUST be honored at placement even if rates change underneath.
- **FR-011a**: If the quote's validity window has expired, or any package became unavailable or its
  same-day lapsed past cutoff during checkout, the customer MUST re-quote and see the new amount(s) before
  being charged. The honored fee is always the server's captured quote, never a client-supplied value.
- **FR-012**: The customer MUST NOT be able to place an order containing a package whose method is
  unavailable for its address (including a method withdrawn mid-checkout).
- **FR-012a**: Order finalization MUST be **atomic** — the paid-transition, every package's per-portion
  delivery snapshot, and every shop fulfilment portion commit in one transaction; any failure rolls the
  whole finalization back and the payment webhook retries (extending 019's single-transaction fan-out).
  A paid order MUST NEVER be left with a missing package or a package with no shop portion.

#### Management (US4)

- **FR-013**: Back-office staff MUST be able to set **each shop's location** (which determines the legs it
  can serve and their pricing).
- **FR-014**: Back-office staff MUST be able to define serviced areas as postcode sets and assign
  postcodes to areas.
- **FR-015**: Back-office staff MUST be able to define, per **(origin zone → destination zone)** pair,
  which methods are offered, each with a price and an arrival time / window. Availability of same-day
  vs multi-day for a package follows from its (origin zone → destination zone) pair, not from the shop
  identity.
- **FR-016**: Configuration changes MUST affect only **new** quotes and orders; historical orders MUST be
  untouched.
- **FR-017**: A shop with no location, an area with no methods, or a destination in no area MUST be
  treated as undeliverable (a safe explicit state), never as an error or a silent default fee.
- **FR-018**: Coverage, shop-location, and pricing changes MUST be attributable (who, when) for audit.

#### Hidden shop & hidden carrier (cross-cutting, binding)

- **FR-019**: No surface, quote, package, order record, or receipt MUST reveal or imply the **shop** or
  its **location** behind any package. The split into packages is shown; the sellers are not.
- **FR-020**: No surface MUST reveal or imply **who** performs a delivery (Effy driver vs third party).
  The customer buys, per package, a service level and a price.

#### Shop promise (US5)

- **FR-021**: Each package's chosen method MUST carry a delivery window/time that becomes **that shop's
  portion's** promised readiness, feeding 020's per-portion ready-by with no shop-side rework.
- **FR-021a**: The shop operator MUST see, on their portion, the **service level and ready-by** (e.g.
  "same-day — ready by 2pm") — enough to prioritise and pack — but MUST NOT see the delivery **fee**
  (a payment amount 020 walls off) nor **who** delivers.
- **FR-022**: The promised readiness surfaced to a shop MUST reveal nothing about who delivers.

#### Money & currency (cross-cutting)

- **FR-023**: All amounts MUST be in the platform currency (AUD) and reconcile exactly: item subtotal +
  the summed per-package delivery fees = the amount charged and the receipt total.
- **FR-024**: The flat platform delivery fee MUST be fully replaced — no order or package may fall back to
  a hardcoded flat fee.

### Key Entities *(include if data involved)*

- **Serviced area (delivery zone)**: a named region defined by a set of AU postcodes. A postcode belongs
  to at most one area; a postcode in none is undeliverable.
- **Shop location (new)**: each fulfilling shop's own place — a postcode that resolves to an **origin
  zone** — which determines which destination zones it can reach and how those legs price and time.
  `public.shop` has none today (007 made it deliberately locationless); this feature adds it. Never
  exposed to customers.
- **Delivery method / service level**: same-day, scheduled (a chosen later date), or standard multi-day.
  Availability is per **(origin zone → destination zone)** pair; it says nothing about who carries it.
- **Rate / offering**: the per **(origin zone → destination zone, method)** definition that makes a
  method real — its price and its arrival time / window. Absence of an offering for a package's
  (origin zone → destination zone) pair = not deliverable by that method (or at all). Keyed on zone
  *pairs*, not on individual shops, so the table stays small.
- **Package (per-shop shipment)**: the customer-facing, **anonymised** unit — the items from one shop, its
  available/chosen method, its fee, and its arrival window. One order has one package per fulfilling shop.
- **Delivery quote**: the set of packages, each with its methods/prices/windows, computed for a specific
  address at checkout and captured server-side with a **bounded validity window**. Within the window the
  captured prices are honored at placement; on expiry the customer re-quotes. Not a charge until the
  order is placed.
- **Per-package delivery snapshot**: the chosen method, fee, and promised window frozen onto **each
  shop's portion** at placement — the historical truth, mirroring the immutable delivery-address snapshot.
- **Cutoff**: the time-of-day condition governing whether same-day is still offerable for a package.
- **Existing, reused / extended**: the customer's **delivery address** (019); the **order** and its
  `delivery_fee_amount` (019 — becomes the sum of package fees); the **shop_fulfillment portion** (020 —
  gains its own delivery method, fee, and ready-by); the shop **ready-by promise** seam (020).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a multi-shop cart, each package is offered exactly the methods valid for its own shop→
  address leg (Melbourne-metro package → same-day available; farther package → multi-day only;
  unreachable package → blocked) in **100%** of attempts.
- **SC-002**: Each package's shown fee equals its charged fee and its receipt fee to the cent, and the
  order total equals the sum of package fees — **zero** drift, in **100%** of orders.
- **SC-003**: Changing a method's price or window leaves **100%** of already-placed orders' per-package
  fees, windows, and totals unchanged.
- **SC-004**: A client-submitted per-package fee, method, or item-to-package reassignment that disagrees
  with Effy's computation is ignored in **100%** of cases; server-computed values win.
- **SC-005**: **Zero** orders are ever placed containing a package Effy cannot deliver to the address.
- **SC-006**: **Zero** occurrences of a shop's identity or location being revealed on any customer surface,
  quote, package, order, or receipt.
- **SC-007**: **Zero** occurrences of a carrier (own-driver vs third-party) being revealed or implied
  anywhere.
- **SC-008**: Browsing and cart remain fully open with no address — serviceability blocks **only** at the
  delivery step; the storefront's guest bundle / crawlability is unaffected.
- **SC-009**: For an order with a same-day package and a multi-day package for different shops, each
  shop's portion carries its own ready-by and the same-day portion ranks more urgently in its queue — with
  **no** shop-side code change beyond data.
- **SC-010**: **Zero** orders or packages fall back to a flat/hardcoded delivery fee.
- **SC-011**: A single-shop order presents as exactly one package (no artificial multi-package framing).
- **SC-011a**: In a partly-serviceable order, **100%** of set-aside items are excluded from both the
  placed order and the charge, and the customer explicitly confirmed before payment — **zero** silent
  drops and **zero** charges for undeliverable items.
- **SC-011b**: Setting one delivery preference applies it to every package with **zero** additional
  actions; overriding one package changes only that package's fee and window.
- **SC-011c**: **Zero** paid orders are ever left partially finalized — every paid order has all its
  packages, each with a snapshot and a shop portion, or none (the finalization rolled back and retried).
- **SC-012**: The customer delivery experience is demonstrably satisfied on **both** `customer-web` and
  `customer-mobile`.
- **SC-013**: Back-office staff can set a shop's location, make an area (un)serviceable, and change a
  price, and a new checkout reflects it — without a code change or database migration.

---

## Clarifications

### Session 2026-07-21 (b)

- Q: **What delivery information does the shop operator see on their portion?** → **A: SERVICE LEVEL +
  READY-BY, NOT THE FEE, NOT THE CARRIER.** The shop sees the chosen service level and its ready-by
  deadline (e.g. "same-day — ready by 2pm") — enough to prioritise and pack correctly — but MUST NOT see
  the customer's delivery fee (a payment amount 020 deliberately walls off from the shop surface) nor who
  carries it (FR-020/FR-022). This extends 020's per-portion ready-by with the service level; no other
  020 shop-side rework is needed.
- Q: **Where does the split into packages first appear — cart, or only at checkout?** → **A:
  PACKAGE-AWARE CART.** The cart groups items into **anonymous packages** (one per fulfilling shop) from
  the start, before any address, so the customer understands the multi-delivery reality early (the
  AliExpress/Daraz experience). The grouping is a read of each product's existing shop association — no
  new data. Prices and windows are still absent until an address is chosen at the delivery step; the cart
  shows the split and the items, never a shop name, location, or a fee. This keeps serviceability at
  checkout only (guest-first) while making the split visible upfront.
- Q: **How is a quote carried from display to payment, given a rate change or same-day cutoff can lapse
  mid-checkout?** → **A: SHORT-LIVED QUOTE VALIDITY WINDOW.** A quote is captured server-side with a
  bounded validity (a few minutes); within it the shown per-package prices and windows are honored at
  placement even if rates change underneath. If the window expires, or a package became unavailable / its
  same-day lapsed past cutoff, the customer MUST re-quote and see the new amounts before paying. The
  client never supplies the fee; the honored price is the server's captured quote, not anything the
  device sends (SC-002/SC-004). The exact validity duration is configuration.
- Q: **Is a multi-package order finalized atomically, or per package?** → **A: ATOMIC.** The paid-
  transition, every package's per-portion delivery snapshot, and every shop fulfilment portion MUST
  commit in a single transaction; any failure rolls the whole finalization back and the payment webhook
  retries. This extends 019's existing fan-out (paid-transition + all `shop_fulfillment` rows + outbox in
  one tx) rather than inventing a per-package path. A customer who made one payment MUST NEVER see a
  receipt missing a package they paid for, nor a package with no shop working it.
- Q: **How is a shop→customer leg priced and gated — what is the rate table keyed on?** → **A:
  ORIGIN-ZONE × DESTINATION-ZONE.** Each shop belongs to an **origin zone** (derived from its location's
  postcode); methods, prices, and times are defined **per (origin zone → destination zone)** pair. A
  package is serviceable only where an offering exists for its (origin zone → the customer's destination
  zone). Same-day exists only where the pair is metro→metro (or as configured). This keeps the rate table
  small — one set of offerings per zone-pair, not per shop — while expressing why two shops price and
  arrive differently to the same customer. A shop with no location, or a zone-pair with no offering, is
  undeliverable (FR-017).

### Session 2026-07-21

- Q: **Does a multi-shop order get one order-level promised window, or per-shop delivery?** →
  **A: PER-SHOP SPLIT DELIVERY (AliExpress / Daraz model).** Each shop's items are a separate delivery
  with its own shipping price and delivery time, because shops sit in different locations. The customer
  still places **one order and pays once**, but sees an **anonymised per-package breakdown** (items +
  shipping + arrival time per package — never a shop name or location). Each shop's portion therefore
  carries its own **independent** ready-by, which is exactly what 020's per-portion queue consumes. This
  adds a **shop location** (shops have none today) and makes the order's delivery fee the **sum** of
  per-package fees, each snapshotted per portion.
- Q: **Full back-office management UI now, or seed-first?** → **A: Option A — the full back-office
  management UI ships in this slice** (create/edit areas, postcode assignments, shop locations, methods,
  prices, windows), matching 009's shop-management pattern.
- Q: **Scheduled delivery — pick a specific date, or a derived window?** → **A: BOTH.** The customer
  picks a service level per package; same-day and standard multi-day show a **derived window** ("today",
  "in 2–3 days"); a **scheduled** method additionally lets the customer pick a **specific date** from the
  available dates. Whichever they pick is snapshotted onto that package.
- Q: **When part of a multi-shop order can't be delivered to the address, what happens?** *(surfaced by
  the per-shop answer above)* → **A: AUTO-EXCLUDE WITH NOTICE + EXPLICIT CONFIRM.** Undeliverable items
  are automatically set aside with a clear, non-technical notice naming the affected **items** (never a
  shop), and the customer MUST explicitly confirm proceeding without them before payment. The excluded
  items are never charged and never placed. The customer may instead change the address to make them
  deliverable. The order is never silently placed with items dropped, and never silently charged for an
  undeliverable item.
- Q: **Does the customer choose a delivery method per package, or one service-level preference for the
  whole order?** *(surfaced by the per-shop answer above)* → **A: ONE DEFAULT PREFERENCE WITH PER-PACKAGE
  OVERRIDE.** The customer sets one order-level preference (e.g. "fastest" / "cheapest" / a service level)
  that is applied to each package's available options and shown per package; they may then **override**
  the method on any individual package. One decision by default, full control when wanted. The
  effective per-package method is what gets priced and snapshotted (US3).

---

## Assumptions

Recorded as reasonable defaults so the spec is buildable; each can be overridden in `/speckit-clarify`.

- **Zones are AU postcode lists** (operator decision, 2026-07-20): serviced areas are postcode sets — no
  geocoding dependency, no external latency on the quote path, trivially auditable, and both the shop
  origin and the customer destination resolve to areas by postcode.
- **Pricing is per (origin, destination, method).** A package's fee and window come from its shop's
  location, the customer's area, and the chosen method — the model that makes different shops in one order
  price and arrive differently.
- **One order, one payment** (operator decision): the customer places a single order and pays once even
  across multiple shops/packages; the split is presentational + internal, never a second checkout.
- **Anonymised packages** (hidden-fulfilment, binding): the customer sees packages, never shops. Showing
  "your order arrives in 2 parts" is permitted; naming or locating a shop is not.
- **Unserviceable is checked at checkout only** (operator decision, 2026-07-20): browsing/cart stay
  guest-first and crawlable.
- **021 ships after 020** (operator decision): 020 already consumes the per-shop promise as a read-only
  seam (uniform until now), so nothing in 020 breaks before this lands.
- **Same-day has a daily cutoff** (configuration, not a constant): after it, same-day is withdrawn for
  new packages and the earliest later option is shown.
- **Single country / currency**: AU postcodes, AUD, Melbourne-based.
- **No live carrier-rate integration**: prices/windows are Effy's own configured values, not fetched from
  a courier API (that would add an external dependency and risk leaking a carrier).
- **No delivery tracking or driver assignment**: separate driver slices; this feature stops at pricing
  the promise and recording it per package.

## Dependencies

- **019 customer commerce flow** (signed off) — the delivery address, the order, `delivery_fee_amount`
  (becomes the summed total), and the checkout this extends. Its `DeliveryFeeCents = 500` is replaced.
- **020 shop order fulfilment** (signed off) — the `shop_fulfillment` per-shop portion (gains its own
  delivery method, fee, and ready-by), the per-portion promise seam, and the queue ordering that gains
  real meaning here.
- **007 shop foundation** — `public.shop`, which this extends with a **location** (it has none today).
- **009 back-office shop management** — the pattern and surface for the management UI (cold-path admin
  CRUD, record-backed auth), reused rather than reinvented.
- The checkout flow on **both** customer surfaces, extended with the per-package breakdown, the
  serviceability gate, and method selection.

## Out of Scope

- Driver assignment, dispatch, routing, live delivery tracking, or ETAs beyond the promised window.
- Any modelling or display of **who** performs a delivery (FR-020), or of **which shop / where** a package
  comes from (FR-019).
- Live/real-time carrier rate shopping or courier API integration.
- Refunds or fee adjustments after placement (per-package fees are snapshotted and final; refunds are
  their own slice — and note this compounds with 020's unresolved shortfall obligation).
- International delivery, multi-currency, customs, or non-AU addresses.
- Free-delivery thresholds, promo codes, or delivery discounts (a promotions slice).
- Per-item or weight/dimension-based shipping — pricing is per (origin, destination, method), not per
  parcel weight.
- Combining packages from multiple shops into one physical shipment (consolidation) — each shop is its own
  delivery here.
- Time-slot booking with capacity limits — methods and windows are offered, not capacity-booked slots.
