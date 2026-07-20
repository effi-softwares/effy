# Feature Specification: Customer Commerce Flow (Browse → Cart → Checkout → Order)

**Feature Branch**: `019-customer-commerce-flow`

**Created**: 2026-07-18

**Status**: ✅ **SIGNED OFF — 2026-07-20** (operator sign-off; complete with two documented
carry-forwards, see § Sign-off below)

**Input**: User description: "Complete the customer mobile app and customer web app: (1) auth screen if not implemented, (2) home page with banners / horizontal scrolling lists / featured & recently-viewed products / carousel / search bar / tags / badges / product cards, (3) product detail page with images, add-to-cart and save-as-favorite, (4) search page with infinite scroll, filters, badges, (5) cart with a checkout button, (6) checkout that places an order with Stripe as the payment gateway (implemented on both mobile and web), (7) a receipt after the order is placed, (8) routing the order into the respective shops — one order can contain items from multiple shops. Follow eBay and Uber Eats for UI/UX and features. Deliver the full end-to-end flow. Stripe sandbox keys can go in env / secrets files. Use core-api for the APIs."

---

## Overview

This slice makes Effy's storefront **actually sell**. Today the two customer surfaces (the public web
storefront and the KMP mobile app) have a foundation only: sign-in/sign-up, a guest-first navigation
shell, an empty Home, and placeholder Browse/Search/Checkout screens. The product catalog exists as
data (shop-authored products, prices, images, categories, attributes) but no customer has ever been
able to see a product, add it to a cart, or place an order.

This feature delivers the **complete purchase journey, end to end, at parity on both customer
surfaces**: discover products on a merchandised Home, open a rich product page, build a cart that may
span multiple hidden fulfillment shops, check out with a delivery address, pay through the platform's
payment provider, receive a receipt, and have the single order **fan out to the correct shops** for
fulfillment — because in Effy one order can contain items from more than one shop and each shop must
receive only its own items.

Authentication already exists on both surfaces and is **reused, not rebuilt**; this slice only adds
the commerce-triggered moments where identity is demanded (placing an order, saving a favorite).

---

## Clarifications

### Session 2026-07-18

- Q: When an order is placed, how far does this slice take the multi-shop fan-out? → A: **Records + event only** — create one per-shop fulfillment record per involved shop and emit the order-placed event to the platform's event backbone; surfacing incoming orders inside the shop apps is a separate later slice.
- Q: Where does the shopper's cart live before checkout? → A: **Hybrid** — a guest cart is kept device-local and is promoted to a server-side cart (keyed to the customer) on sign-in, merging with any existing server cart.
- Q: How is the delivery fee calculated, including for multi-shop orders? → A: **Flat per-order fee** — one fixed delivery fee per order regardless of how many shops it spans; a single fee line on the receipt.
- Q: When is the customer's card charged? → A: **Capture immediately at placement** — authorize and capture in one step when the order is placed; the receipt shows "paid". Refund/cancel is a later slice.

---

## User Scenarios & Testing *(mandatory)*

> **Parity is mandatory.** Every user story below MUST be delivered on **both** the customer web
> storefront and the customer mobile app, with equivalent capability and a native-feeling experience on
> each. A story is not "done" until both surfaces satisfy its acceptance scenarios. Reference platforms
> for look, feel, and feature shape are **Uber Eats** (food discovery, menus, tiles, cart, delivery
> checkout) and **eBay** (rich product pages, item attributes, multi-seller cart, search + filters),
> food-first, adapted to Effy's single-brand, hidden-fulfillment model.

### User Story 1 - Discover products on a merchandised Home (Priority: P1)

A shopper opens Effy (signed in or as a guest) and lands on a Home experience that invites browsing:
a hero banner/promotional carousel at the top, a prominent search entry, category/tag chips, and
several horizontally scrolling product rails — e.g. "Featured", "On sale", "New", curated
category rails, and (once they have looked at products) a "Recently viewed" rail. Each product appears
as a card showing its image, name, price, any sale/other badges, and an add affordance.

**Why this priority**: Discovery is the entrance to every sale. Without a Home that surfaces real
products, nothing downstream can be reached or demonstrated. It is the smallest slice that turns the
storefront from "empty shelves" into a shoppable catalog, and it is fully valuable on its own (a
shopper can browse the brand's range).

**Independent Test**: With catalog data present, open Home as a guest on each surface and confirm the
banner/carousel, search entry, category chips, and multiple horizontally scrolling rails of real
product cards render, each card showing image, name, price, and correct badges; tapping a card opens
the product. No account required.

**Acceptance Scenarios**:

1. **Given** the catalog contains active products across several categories, **When** a guest opens
   Home, **Then** they see a promotional banner/carousel, a search entry, category/tag chips, and at
   least the "Featured", a category rail, and an "On sale" rail, each populated with product cards
   showing image, name, price, and any applicable badge.
2. **Given** a product is discounted (has a compare-at price), **When** it appears in any rail,
   **Then** its card shows a sale badge and both the current and the struck-through original price.
3. **Given** a shopper has previously viewed products in this session/on this device, **When** they
   return to Home, **Then** a "Recently viewed" rail shows those products most-recent-first.
4. **Given** a product is unavailable (not active), **When** Home is composed, **Then** that product
   does not appear in any rail.
5. **Given** a rail contains more products than fit on screen, **When** the shopper swipes it
   horizontally, **Then** it scrolls smoothly and reveals more product cards.

---

### User Story 2 - Inspect a product and add it to the cart (Priority: P1)

From any product card, the shopper opens a product detail page showing an image gallery, name, brand,
price (and sale price where applicable), a rich description, and the product's attributes/item
specifics (e.g. dietary labels, allergens, weight) as clearly grouped detail rows — never as tiled
metric cards. From this page they can choose a quantity, add the product to their cart, and save it as
a favorite. A cart indicator reflects the addition.

**Why this priority**: The product page is where the buying decision is made and where the cart
begins. It is the necessary bridge between discovery (US1) and purchase (US3), and delivers value on
its own (a shopper can evaluate a product in full detail and collect it).

**Independent Test**: Open a product from Home on each surface; confirm the gallery, price, sale
handling, description, and attribute detail rows render; change the quantity; add to cart and see the
cart count increase and the item present in the cart; save the product as a favorite (signing in if
prompted) and see it reflected in favorites.

**Acceptance Scenarios**:

1. **Given** a product with multiple images, **When** the shopper opens its page, **Then** they see an
   image gallery they can swipe/step through, with the primary image first.
2. **Given** a product with attributes (e.g. allergens, dietary labels, net weight), **When** the page
   renders, **Then** those attributes appear as grouped, labeled detail rows/sections (or tabs), not as
   card tiles or top-of-page metric cards.
3. **Given** a shopper on a product page, **When** they choose a quantity and tap "Add to cart",
   **Then** the item (with that quantity) is added to their cart and the cart indicator updates.
4. **Given** a guest on a product page, **When** they tap "Save as favorite", **Then** they are
   prompted to sign in and, on success, the product is saved to their favorites and they are returned
   to the product page.
5. **Given** a signed-in shopper, **When** they tap "Save as favorite", **Then** the product is added
   to their favorites without leaving the page, and the affordance shows the saved state.
6. **Given** a product is unavailable, **When** its page is opened, **Then** availability is clearly
   communicated and the add-to-cart affordance is disabled.

---

### User Story 3 - Review the cart, check out, pay, and receive a receipt (Priority: P1)

The shopper opens their cart, reviews line items (image, name, unit price, quantity, per-line
subtotal), adjusts quantities or removes items, and sees an order summary (item total, delivery fee,
grand total). When the cart spans more than one shop, the cart is clearly grouped by fulfillment
grouping without exposing shop identities as brands. Tapping **Checkout** takes the shopper — signing
in if they are a guest — to a checkout where they confirm a delivery address, review the total, and
pay through the platform's payment provider. On successful payment an **order is placed** and a
**receipt/confirmation** is shown with the order reference, items, delivery address, amount paid, and
payment status. The single placed order is routed to the **respective shops** for fulfillment.

**Why this priority**: This is the revenue path — the whole point of the feature. It is the money
moment the user explicitly asked to reach ("the full complete flow … end … placing an order"). It is
independently testable end-to-end once US1/US2 provide a populated cart.

**Independent Test**: With items in the cart (including items from two different shops), open the cart
on each surface, adjust a quantity, proceed to checkout, sign in if guest, enter/confirm a delivery
address, pay with the payment provider's test card, and confirm: an order is created, a receipt is
shown with the correct totals and reference, and the order is recorded against each involved shop with
only that shop's items.

**Acceptance Scenarios**:

1. **Given** a cart with several items, **When** the shopper opens it, **Then** each line shows image,
   name, unit price, quantity and line subtotal, and an order summary shows item total, delivery fee,
   and grand total.
2. **Given** a cart line, **When** the shopper changes its quantity or removes it, **Then** the line,
   the cart count, and all totals update accordingly.
3. **Given** a guest with a non-empty cart, **When** they tap "Checkout", **Then** they are asked to
   sign in and, on success, are returned to checkout with their cart intact.
4. **Given** a signed-in shopper at checkout, **When** they have no saved delivery address, **Then**
   they are required to provide one before payment can proceed; a saved address may be selected.
5. **Given** a valid delivery address and a reviewed total, **When** the shopper pays with a valid
   (test) payment method, **Then** payment succeeds, an order is placed, and a receipt/confirmation is
   shown with order reference, line items, delivery address, amount paid, and a paid status.
6. **Given** a payment attempt is declined or fails, **When** the shopper submits it, **Then** no order
   is placed, a clear error is shown, and the shopper can retry or change payment method with their
   cart and address preserved.
7. **Given** a placed order containing items from two different shops, **When** the order is recorded,
   **Then** each shop receives a fulfillment record containing **only** its own items, and the customer
   still sees a **single** order and a **single** receipt.
8. **Given** a placed order, **When** the shopper submits the same checkout again (e.g. double-tap or a
   retried network request), **Then** a duplicate order and a duplicate charge are **not** created.
9. **Given** a shopper completes an order, **When** the receipt is shown, **Then** the cart is emptied.

---

### User Story 4 - Search products with filters and infinite scroll (Priority: P2)

Tapping the search entry opens a search experience. As the shopper types a query they get results
(matching name, brand, and description), presented as product cards/rows in an **infinitely scrolling**
list that loads more as they reach the end. They can refine with filters (e.g. category, price range,
sale-only, dietary/attribute facets) shown as chips/badges, and clear or combine them. Results reflect
only available products.

**Why this priority**: Search is how shoppers with intent find a specific product, and it materially
improves conversion — but the store is already shoppable via Home (US1), so it ranks below the core
browse→buy spine.

**Independent Test**: Open search on each surface, type a query and confirm relevant results appear;
scroll to the bottom and confirm more results load without a page change; apply a category and a
price/sale filter and confirm results narrow accordingly and active filters are shown as removable
chips; open a result and confirm it is the product page from US2.

**Acceptance Scenarios**:

1. **Given** the shopper opens search and types a query, **When** results return, **Then** matching
   available products are shown as cards/rows with image, name, price, and badges.
2. **Given** a results list longer than one screen, **When** the shopper scrolls to the end, **Then**
   the next batch loads automatically and appends, without navigating away.
3. **Given** results are shown, **When** the shopper applies one or more filters (category, price
   range, sale-only, an attribute facet), **Then** results narrow to match and each active filter
   appears as a removable chip.
4. **Given** active filters, **When** the shopper clears a filter, **Then** results widen accordingly.
5. **Given** a query with no matches, **When** results return, **Then** a clear empty state is shown
   with a way to broaden the search.

---

### User Story 5 - Track orders and re-open receipts (Priority: P2)

A signed-in shopper opens their Orders area and sees their past orders, most-recent-first, each showing
its reference, date, item count, total, and current status. Opening an order re-shows the full
receipt/detail (items, delivery address, amount paid, per-shop fulfillment status where meaningful).

**Why this priority**: Post-purchase visibility is expected of any store and reduces support load, but
it is not required to complete a first purchase, so it ranks after the buy spine.

**Independent Test**: As a shopper who has placed at least one order, open Orders on each surface,
confirm the order list renders with reference/date/total/status, open one, and confirm the full receipt
is shown.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper with past orders, **When** they open Orders, **Then** their orders are
   listed most-recent-first with reference, date, item count, total, and status.
2. **Given** the shopper opens an order, **When** its detail loads, **Then** the full receipt is shown
   (items, delivery address, amount paid, status).
3. **Given** a guest, **When** they open Orders, **Then** they are prompted to sign in (per the
   existing deferred-sign-in behavior) and, on success, see their orders.

---

### User Story 6 - Manage favorites and recently-viewed (Priority: P3)

A shopper can revisit products they saved as favorites and products they recently viewed. Favorites are
kept for signed-in shoppers across devices; recently-viewed reflects the shopper's own recent activity.
From either list they can open the product or add it to the cart, and they can remove a favorite.

**Why this priority**: A convenience and re-engagement layer built on US2's save action; valuable but
not on the critical path to a first purchase.

**Independent Test**: Save two products as favorites and view a few products; open the favorites list
and the recently-viewed rail/list on each surface; confirm saved products appear (and persist across a
fresh sign-in), recently-viewed reflects recent activity, and both allow opening or adding to cart;
remove a favorite and confirm it disappears.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper who saved favorites, **When** they open favorites, **Then** the saved
   products are listed and each can be opened or added to cart.
2. **Given** a favorite, **When** the shopper removes it, **Then** it is removed from the list and
   reflects as un-saved on the product page.
3. **Given** a shopper who saved favorites on one device, **When** they sign in on another, **Then**
   the same favorites are present.
4. **Given** a shopper who recently viewed products, **When** they open recently-viewed, **Then** those
   products appear most-recent-first.

---

### Edge Cases

- **Item becomes unavailable between add-to-cart and checkout**: the cart flags the affected line, the
  shopper is told, and it is excluded from the payable total (they cannot pay for an unavailable item).
- **Price changes between add-to-cart and checkout**: the current authoritative price is used and the
  change is surfaced before payment so the shopper is never charged a stale amount without notice.
- **Empty cart**: checkout cannot be initiated; the cart shows an empty state with a route back to
  browsing.
- **Multi-shop cart**: item totals account for each fulfillment grouping, but the delivery fee is a
  **single flat per-order amount** (not per shop); the shopper still perceives one cart, one order, one
  payment, one receipt.
- **Guest → sign-in cart merge**: a cart built as a guest is preserved (or merged with any existing
  cart) after signing in during checkout, with no items silently lost or duplicated.
- **Payment interruption / network loss mid-checkout**: the flow fails safe — either a fully placed &
  paid order or no order and no charge; on reconnect the shopper can see the true outcome and is not
  double-charged.
- **Duplicate submission / retries**: repeated checkout submissions for the same cart do not create
  duplicate orders or charges (idempotent placement).
- **Delivery address outside a serviceable area / missing address**: checkout blocks payment until a
  usable delivery address is provided; if serviceability is unknown, the reasonable default is to accept
  any complete address (serviceability zones are out of scope for this slice).
- **Product images missing or slow**: cards and galleries show a stable placeholder rather than a
  broken image or layout shift.
- **Catalog/back-end unavailable**: Home, search, product, cart, and checkout each degrade to a clear,
  retryable error state rather than a blank or broken screen.
- **Currency**: all amounts are shown and charged in the single platform currency; mixed currencies are
  not possible in this slice.
- **Very large cart / long result lists**: quantities are bounded to a sane maximum per line; long lists
  page/scroll without degrading responsiveness.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Home & discovery (US1)

- **FR-001**: The customer Home MUST present a merchandised storefront containing a promotional
  banner/hero carousel, a prominent search entry, browseable category/tag chips, and multiple
  horizontally scrolling product rails.
- **FR-002**: Home MUST include, at minimum, a "Featured" rail, at least one category-based rail, and an
  "On sale" rail (products with a discount), each populated from real, available catalog data.
- **FR-003**: Home MUST include a "Recently viewed" rail reflecting products the shopper has recently
  opened, ordered most-recent-first, and omit it gracefully when there is no history.
- **FR-004**: Every product card MUST show the product image (or a stable placeholder), name, current
  price, and applicable badges (e.g. "On sale", "New"); a discounted product MUST show both the current
  price and the struck-through original.
- **FR-005**: Only **available** products (active catalog status) MUST appear in Home rails; unavailable
  or non-active products MUST be excluded.
- **FR-006**: Tapping a product card anywhere MUST open that product's detail page; tapping the search
  entry MUST open search; tapping a category/tag chip MUST open a filtered browse/search view for that
  category/tag.

#### Product detail (US2)

- **FR-007**: The product detail page MUST show an image gallery (primary image first) the shopper can
  step through, the product name, brand, current price (and the original price plus a sale badge when
  discounted), and the full description.
- **FR-008**: The product page MUST present the product's attributes / item specifics as grouped,
  labeled detail rows or sections/tabs — and MUST NOT lay them out as card tiles or top-of-page metric
  cards (per the platform's no-card design doctrine).
- **FR-009**: The shopper MUST be able to choose a quantity (within a sane bound) and add the product to
  their cart from the product page; the cart indicator MUST reflect the addition.
- **FR-010**: The shopper MUST be able to save/un-save a product as a favorite from the product page;
  saving as a guest MUST trigger sign-in and, on success, complete the save and return the shopper to
  the product.
- **FR-011**: When a product is unavailable, the page MUST clearly communicate this and disable
  add-to-cart.
- **FR-012**: Opening a product MUST record it into the shopper's recently-viewed history.

#### Search & filtering (US4)

- **FR-013**: The shopper MUST be able to search products by a free-text query that matches at least
  product name, brand, and description, returning only available products.
- **FR-014**: Search results MUST load incrementally with infinite scroll — additional results append
  automatically as the shopper nears the end, without a full page change.
- **FR-015**: The shopper MUST be able to refine results with filters including at least category, price
  range, and sale-only, plus at least one attribute facet (e.g. dietary label); active filters MUST be
  shown as removable chips and MUST be combinable and individually clearable.
- **FR-016**: Search MUST present a clear empty state when a query/filter combination yields no results,
  offering a way to broaden the search.
- **FR-017**: Search and category/tag browse facets MUST be expressed as query parameters (not as part
  of the shareable content path) so that public discovery pages remain cacheable and crawler-friendly on
  the web surface. *(Web-specific; the mobile surface has no equivalent SEO obligation.)*

#### Cart (US3)

- **FR-018**: The cart MUST list each line with product image, name, unit price, quantity, and per-line
  subtotal, and MUST show an order summary with item total, a **single flat per-order delivery fee**, and
  grand total. The delivery fee is one fixed amount per order regardless of how many shops the order
  spans (it is not multiplied per shop).
- **FR-019**: The shopper MUST be able to change a line's quantity and remove a line; the cart count and
  all totals MUST update immediately and consistently.
- **FR-020**: A cart MAY contain items from more than one shop; when it does, the cart MUST group lines
  by fulfillment grouping **without** exposing shop identities as customer-visible brands (shops are
  hidden fulfillment nodes).
- **FR-021**: The cart MUST persist for the shopper using a **hybrid** model: a guest cart is kept
  **device-local** and survives within the device session; on sign-in it is **promoted to a server-side
  cart** keyed to the customer, **merged** with any existing server cart (no items lost or duplicated).
  Once signed in, the server-side cart is authoritative and available whenever the customer is
  authenticated. Cross-device guest carts are not required.
- **FR-022**: The cart MUST re-validate availability and price against authoritative catalog data before
  checkout, surfacing any item that became unavailable and any price that changed, and MUST NOT allow
  paying for an unavailable item.
- **FR-023**: Checkout MUST NOT be initiable from an empty cart.

#### Checkout, payment & order placement (US3)

- **FR-024**: Initiating checkout MUST require an authenticated customer; a guest MUST be routed through
  the existing sign-in flow and returned to checkout with cart intact. A barred customer MUST be refused
  regardless of a valid credential.
- **FR-025**: Checkout MUST collect (or let the shopper select a saved) delivery address, and MUST NOT
  allow payment to proceed without a usable delivery address.
- **FR-026**: Checkout MUST show the shopper the authoritative order total (items + delivery fee) before
  payment, reflecting any re-validated price changes.
- **FR-027**: The shopper MUST be able to pay through the platform's integrated payment provider on both
  surfaces; payment MUST be collected securely such that raw payment-card details never pass through
  Effy's own storage or logs.
- **FR-028**: On successful payment, the system MUST place exactly **one** order for the whole cart,
  capturing the items, quantities, per-item and total amounts, the delivery address, the paying
  customer, and the payment outcome.
- **FR-029**: Order placement MUST be **idempotent** for a given checkout attempt: repeated or retried
  submissions MUST NOT create duplicate orders or duplicate charges.
- **FR-030**: On a failed/declined payment, the system MUST NOT place an order, MUST show a clear
  actionable error, and MUST let the shopper retry or change method with cart and address preserved.
- **FR-031**: Order placement MUST be **atomic with payment**, and payment MUST be **captured
  immediately at placement** (authorize and capture in one step, not a deferred capture) — the end state
  is always either a placed, paid (captured) order or no order and no captured charge; a partial state
  MUST NOT be left visible to the shopper.
- **FR-032**: On success the cart MUST be emptied and the shopper taken to the receipt/confirmation.

#### Multi-shop fulfillment fan-out (US3)

- **FR-033**: A placed order that contains items from multiple shops MUST be split so that **each shop
  receives a fulfillment record containing only its own items** (quantities and amounts), while the
  customer continues to see a single order. In this slice the fan-out consists of **persisting the
  per-shop fulfillment records and emitting the order-placed event** to the platform's event backbone;
  **surfacing these orders inside the shop apps (shop-web / shop-mobile) is out of scope** and handled by
  a later fulfillment slice.
- **FR-034**: Assignment of each item to a shop MUST be derived from authoritative catalog ownership
  (the shop that owns the product), never from customer input.
- **FR-035**: The fan-out MUST be reliable and not duplicated — each shop's fulfillment portion is
  created exactly once per order even under retries.
- **FR-036**: Each shop's fulfillment portion MUST carry enough context to fulfill it (its items,
  quantities, the delivery address, and the order reference) while **not** exposing other shops' items
  or the customer's payment details.

#### Receipt & order history (US3, US5)

- **FR-037**: After a successful order the system MUST show a receipt/confirmation containing the order
  reference, the ordered items and quantities, the delivery address, the amount paid, the payment
  status, and the order date.
- **FR-038**: A signed-in shopper MUST be able to view their past orders most-recent-first, each showing
  reference, date, item count, total, and status, and MUST be able to re-open any order to see its full
  receipt/detail.
- **FR-039**: Order and receipt amounts MUST reconcile exactly with what was charged (no rounding or
  currency drift between summary, charge, and receipt).

#### Favorites & recently-viewed (US6)

- **FR-040**: A signed-in shopper's favorites MUST persist server-side and be available across devices;
  the shopper MUST be able to list, open, add-to-cart from, and remove favorites.
- **FR-041**: Recently-viewed MUST reflect the shopper's own recent product views most-recent-first and
  be available on Home and in the shopper's own space; it MUST function for guests within a device
  session.

#### Cross-cutting

- **FR-042**: Authentication MUST reuse the existing customer sign-in / sign-up / OTP / password /
  federated flows on each surface; this slice MUST NOT introduce a parallel auth mechanism. The only
  new auth surface is the commerce-triggered sign-in prompt (at checkout and at save-favorite), using
  the existing deferred-sign-in / return-to-intent behavior.
- **FR-043**: All customer-facing prices, product data, and imagery MUST come from the authoritative
  catalog; the customer surfaces MUST NOT hand-maintain a separate copy of catalog data.
- **FR-044**: Both customer surfaces MUST deliver every P1/P2/P3 story at **parity** of capability, each
  feeling native to its platform, and MUST share one source of truth for the data contracts exchanged
  with the backend (no per-surface redefinition of the same shapes).
- **FR-045**: Every new customer-facing flow (discovery, product view, add-to-cart, search, checkout,
  payment, order placement) MUST emit the platform's product-analytics events and the backend MUST emit
  operational metrics, with **no PII beyond the authenticated subject id** and card data never logged.
- **FR-046**: All amounts MUST be handled and displayed in the single platform currency, formatted
  consistently on both surfaces.

### Key Entities *(include if feature involves data)*

- **Product (existing, read-only here)**: a shop-owned catalog item with name, brand, price, optional
  discount (compare-at) price, description, attributes/item-specifics, images, category, and an
  availability status. Owned by exactly one shop. The customer surfaces read it; they never author it.
- **Shop (existing)**: a hidden internal fulfillment node that owns products and receives fulfillment
  portions of orders. Never surfaced to customers as a brand.
- **Customer (existing)**: the authenticated shopper (identified by their stable account subject), the
  owner of a cart, favorites, addresses, and orders; may be `active` or `barred`.
- **Cart**: a shopper's in-progress collection of line items prior to ordering; belongs to a customer
  (or a guest session that later merges into a customer); holds cart lines and derived totals.
- **Cart line**: a product + quantity within a cart, carrying enough to display and re-validate (product
  reference, captured display info, and the current authoritative price at read time).
- **Delivery address**: a customer-provided shipping/delivery destination used at checkout; a customer
  may have several and select one; at least one is required to place an order.
- **Order**: a single placed purchase for a customer, capturing the ordered items, quantities, amounts
  (item total, delivery fee, grand total), the delivery address, the payment outcome, an order
  reference, a status, and a timestamp. One order per successful checkout, even across multiple shops.
- **Order item**: a line within an order (product reference + captured name/price + quantity +
  subtotal), each attributable to the shop that owns the product.
- **Shop fulfillment (per-shop order portion)**: the slice of an order routed to one shop, containing
  only that shop's order items plus the delivery context and order reference; created exactly once per
  (order, shop).
- **Payment**: the record of the charge for an order — amount, currency, provider reference, and status
  (e.g. requires-action / succeeded / failed) — linked to the order; raw card data is never stored.
- **Favorite**: a saved (customer, product) pairing, persisted for signed-in shoppers.
- **Recently-viewed entry**: a (shopper, product, viewed-at) record reflecting recent product views;
  device-local for guests.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new shopper can go from opening Home to a **placed, paid order with a receipt** on
  either surface in a single uninterrupted session, using only in-app navigation (no external steps
  beyond signing in and entering payment).
- **SC-002**: On Home, at least **90%** of visible product cards render their image (or a stable
  placeholder) and correct price/badges with no broken images or layout shift on first paint.
- **SC-003**: A shopper can complete checkout — from opening a populated cart to seeing the receipt — in
  **under 3 minutes** and **no more than 5 taps/steps** beyond entering payment and address details.
- **SC-004**: Product search returns relevant results for a typical query in **under 1 second** for
  **95%** of searches on representative catalog data, and infinite scroll appends the next batch without
  a perceptible full-screen reload.
- **SC-005**: For an order containing items from **N** distinct shops, the system produces **exactly N**
  shop fulfillment portions, each containing **only** that shop's items, and the customer sees **exactly
  one** order and **one** receipt whose totals equal the sum of the shop portions.
- **SC-006**: Re-submitting the same checkout (double-tap or retried request) results in **exactly one**
  order and **exactly one** charge — zero duplicate orders or charges across repeated submissions.
- **SC-007**: A declined or interrupted payment results in **zero** placed orders and **zero** captured
  charges, and the shopper can retry with their cart and address fully preserved.
- **SC-008**: Receipt totals, the amount charged, and the order-history total for the same order match
  **to the cent**, in the single platform currency, on both surfaces.
- **SC-009**: A guest who builds a cart and then signs in at checkout keeps **100%** of their cart items
  (none lost, none duplicated).
- **SC-010**: Every P1/P2/P3 user story is demonstrably satisfied on **both** the web storefront and the
  mobile app, verified against these acceptance scenarios on each.
- **SC-011**: A signed-in shopper's favorites are present after signing out and back in (and on a second
  device), and recently-viewed reflects the last products they opened.
- **SC-012**: No customer payment-card data appears in any Effy log, store, or analytics event; product
  analytics carries no PII beyond the authenticated subject id.

---

## Assumptions

- **Auth is already built and is reused.** Sign-in, sign-up, email-OTP, password, federated sign-in, and
  the guest-first deferred-sign-in / return-to-intent behavior exist on both surfaces (from prior
  slices). This feature adds no new authentication screens — only the commerce moments that invoke the
  existing sign-in (checkout, save-favorite). If any gap is found, it is closed by reusing the existing
  mechanism, not by a new one.
- **The product catalog already exists as data** (shop-authored products, prices in the single platform
  currency, discounts via a compare-at price, descriptions, attributes/item-specifics, images, and a
  category taxonomy). This slice **reads** that catalog for customers; it does not add catalog authoring.
- **Commerce runs on the platform's hot path.** Per the platform's binding routing law, all customer
  commerce (catalog reads, search, cart, order, payment) is served by the hot-path backend, which today
  runs locally (its cloud go-live is a separate slice). The address is configuration, so the same code
  targets a cloud deployment later with no change. Customer profile/account remains on the cold path.
- **Payment provider is Stripe in sandbox/test mode** for this slice. The publishable key is embedded in
  the clients; the secret (and any webhook signing secret) lives only in the backend's secret store and
  never on a device or in web client code. Real/live payments and payout/settlement to shops are out of
  scope.
- **No per-unit inventory/stock model exists**, and none is added here: **availability is derived from a
  product's catalog status** (active = available). Quantity-level stock, overselling protection, and
  variant/option matrices (size/color with independent price and stock) are out of scope and are a later
  slice.
- **Delivery is modeled simply**: a delivery address is required at checkout and a **single flat
  per-order delivery fee** is applied (not multiplied per shop). Delivery scheduling (time slots), live
  driver tracking, tips, serviceability zones, and pickup are **out of scope**.
- **One payment per order.** A multi-shop cart is paid for in a **single** charge to Effy (the single
  brand); the fan-out to shops is internal and does not create multiple customer-facing charges.
- **Order status is minimal** in this slice (placed/paid, and a simple fulfillment-received state per
  shop). Rich order lifecycle (accepted → picked → dispatched → delivered), driver assignment, and
  customer notifications beyond the on-screen receipt are out of scope (later fulfillment/notifications
  slices), though the event that hands an order to shops is emitted here.
- **Recently-viewed** is device-local for guests; server-side sync for signed-in shoppers is desirable
  but MAY be limited to the current device if a lightweight approach is chosen — the acceptance criteria
  only require it to reflect the shopper's recent activity.
- **Home merchandising is catalog-derived**, not a full CMS: rails such as Featured / On-sale / New /
  category rails are composed from catalog data (e.g. discounted products, newest products, category
  membership); a rich back-office campaign/banner manager is out of scope, so the hero banner/carousel
  uses a minimal, simple promotional source.
- **The customer never sees or chooses a shop.** Grouping in a multi-shop cart is presented as
  fulfillment grouping only; shop names/identities are never surfaced as brands.

## Dependencies

- The existing **product catalog** (products, prices, discounts, attributes, media, categories) and its
  **image storage** (customer surfaces need read access to product images).
- The existing **customer account/identity** (the checkout actor, `active`/`barred` status) and the
  existing **shop** records (fulfillment ownership of products, hidden from customers).
- The existing **customer authentication** on both surfaces and the shared **data-contract** package
  that both surfaces (and the mobile code-generation) consume as the single source of truth.
- The **payment provider (Stripe)** account and sandbox keys, provided by the operator into the
  appropriate env/secret files; the backend secret store for the Stripe secret and webhook secret.
- The platform's **event backbone** (for handing a placed order to the correct shops) and the
  **observability/analytics** paths (metrics, product analytics) that every new flow must feed.
- The hot-path backend runtime for local end-to-end verification (its cloud deployment is a separate,
  later slice and is not a blocker for building and demonstrating this flow locally).

---

## Sign-off (2026-07-20)

Operator sign-off. The customer commerce journey is **built and verified across all three surfaces**:
`browse → search → product → cart → checkout → Stripe pay → receipt → multi-shop fan-out`.

### Delivered
- **Backend (net-new on the Go hot path)** — `storefront` (home rails, product detail, `pg_trgm` search
  with keyset pagination), `cart` (server cart + guest merge, re-price, unavailable-exclusion, flat
  delivery fee), `addresses`, `checkout` (server-authoritative amount, deterministic-idempotency
  PaymentIntent, signature-verified webhook finalizer), `orders`, `favorites`. New platform packages:
  `money` (integer cents), `pricing`, `events` (transactional outbox), `customeridentity`, `media`.
- **Web** (`customer-web`) — merchandised Home, product page, search (infinite scroll), cart, Stripe
  Payment Element checkout, webhook-authoritative receipt, order history, favourites.
- **Mobile** (`customer-mobile`) — the same flow in KMP/Compose (Clean-Arch + MVVM), `PaymentDriver`
  capability, Home back stack, Coil3 product images.
- **Data** — one forward-only migration `20260719120000_customer_commerce.sql` (10 tables).

### Verification performed
| Layer | Evidence |
|---|---|
| core-api | `go build` + `go vet` + `gofmt` + `go test` green (storefront/cart/checkout/money/…) |
| customer-web | `pnpm typecheck` + **63 Vitest** + `pnpm build` — all commerce routes `◐ PPR`; Stripe kept out of the guest bundle |
| customer-mobile | iOS Kotlin/Native compile + **all `commonTest` green** |
| **SC-005 multi-shop fan-out** | **Proven against the live dev schema** with real two-shop data: 3 order lines / 2 shops → exactly 2 `shop_fulfillment` rows, each holding only its own shop's items; Σ shop subtotals == order subtotal ($45.00); 4 items ordered == 4 fanned. Executed in a rolled-back transaction. |
| **SC-006 idempotency** | Fan-out re-run (webhook redelivery) inserted **0** rows |
| Secrets/PII | Sweep clean — no card data anywhere (Stripe Elements/PaymentSheet own it), no `sk_`/`whsec_` literals |
| Seed data | 2 shops, 38 active products, 92 images (Openverse CC → S3, presign-verified) |

### ⚠ Carry-forwards (known, accepted at sign-off)
These are **not** done and are carried into follow-up work — recorded so they are not mistaken for complete:

1. **Android card payment is a placeholder.** `AndroidPaymentDriver` returns a "use web checkout"
   failure. The real Stripe Android **PaymentSheet** needs the SDK + Activity-scoped
   `ActivityResultRegistry` wiring (tasks **T003 / T006 / T054**). iOS has the real Swift-bridge path
   coded (compile-verified, not device-run); **web checkout is fully live**.
2. **No live end-to-end purchase has been executed.** SC-001/SC-002 (a real paid order) remain proven
   only at the layer below — the fan-out and idempotency are verified against the real schema, and the
   Stripe integration is unit-verified with a `PaymentGateway` fake, but no actual payment has flowed
   through Stripe → webhook → finalizer. Requires the `stripe listen` tunnel + a test-card checkout.

Also outstanding: Playwright E2E (**T053/T060/T066/T070**) and `FULL=1` testcontainers repo tests.
`core-api` remains **local-Docker only** — cloud go-live tracks the hot path's own deployment slice.

**Final task tally: 68 done · 5 partial · 4 outstanding (of 77)** — all remaining items are
operator/device-gated or the carry-forwards above.
