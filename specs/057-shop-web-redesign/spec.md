# Feature Specification: Shop Console Redesign

**Feature Branch**: `057-shop-web-redesign`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "as the next spec i want to do a full rewamp of shop web application. here i have a cluade design created with another account. i want you to use it and implement them in the shop web app. this new design may have already have features and new features as well. so we need to consider them and if api needed to be implemented use the edage api to do that! (core api if only needed) first of all do a deep dive and understand. note that this new claude design have tokens for styling. use them. no need to stick with current ones. also You must use shadcn ui compoenent for all the places. Import target: Claude Design project 'Multi-theme console application', file `Effy Shop Console.dc.html`."

## Source Design — What Was Imported

A Claude Design mockup (`Effy Shop Console.dc.html`, project "Multi-theme console application") was read in full. It is a **generic e-commerce admin console** (in the visual style of Shopify/Linear-type shadcn dashboards) built for a fictional Swedish home-goods brand — SEK currency, 25%/12%/6% VAT bands, Swedish addresses, PostNord/DHL/Budbee carriers. It ships its own token set (light/dark shadcn-style CSS variables, Geist/Geist Mono typeface, 8px radius) and a component vocabulary of: sidebar nav + top header with global search, a dashboard (metric strip, revenue chart, "needs attention" list, latest-orders table), an orders queue (tabs, saved views, filters, bulk actions, sortable table, empty state, pagination), an order detail page (line items, payment/capture/refund, shipments with carrier + tracking, returns, internal notes, activity log, customer panel), a product catalog (list + 4-step create wizard + product detail with variants/media/pricing/inventory), a restock/purchase-ordering queue (supplier grouping, order quantities, cost totals), and a team/settings management screen (roster + shop toggles).

Several of its screens and actions map cleanly onto capabilities `apps/shop-web` already has (dashboard, product catalog, stock/low-stock, order pick queue) and are being **restyled and reorganized**. Others describe capabilities that either don't exist on the platform in that shape, or belong to a different subsystem than shop-web (Stripe payment capture is automatic per platform policy; shipping is Effy's own driver hub-and-spoke collection, not shop-chosen carriers/tracking numbers; there is no supplier/purchase-order/vendor-cost data model; staff/roster has so far been written only by back-office). Rather than silently reproducing or silently dropping these, each is resolved deliberately: **shop-initiated refunds reuse the platform's existing refund/cancellation pipeline** (055) rather than inventing a shop-local one; **supplier and purchase-order tracking is added as genuinely new, shop-scoped platform scope**; and **team management becomes a second, scope-limited write surface** onto the same staff records back-office already owns, not a parallel system of record. Order-line editing, payment capture, and carrier/tracking selection remain out of scope regardless, since the platform has nothing for those actions to trigger.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop operator's day starts on a live, redesigned dashboard (Priority: P1)

A shop manager or staff member signs in each shift and lands on the shop console's home screen. Instead of the current placeholder metrics ("—" values, illustrative-only chart), they see the new visual design applied to real numbers: how many packages need picking right now, how many are ready for pickup, and a short list of things that need attention (orders waiting longest, products below their restock threshold), each one tappable straight into the relevant screen.

**Why this priority**: This is the first screen every shift starts on, and it is currently the weakest (illustrative-only). It is also the cheapest way to prove the new visual system (chrome, typography, color tokens, spacing) is fully in place before it's carried into every other screen.

**Independent Test**: Sign in as a shop operator; the home screen renders with the new visual design and shows real (not placeholder) counts for pick queue and ready-for-pickup, and each "needs attention" row navigates to the order or product it names.

**Acceptance Scenarios**:

1. **Given** a shop with orders in the pick queue, **When** an operator opens the console, **Then** the dashboard shows the current count of orders awaiting pick and the count marked ready for pickup, styled with the new design tokens.
2. **Given** a product below its shop's restock threshold, **When** the operator views the dashboard, **Then** it appears in a "needs attention" list and clicking it opens that product's detail screen.
3. **Given** no orders are waiting and no products are low on stock, **When** the operator opens the console, **Then** the dashboard shows a calm empty/steady state rather than a blank or zeroed-out section.

---

### User Story 2 - Redesigned order queue and order detail, true to how Effy actually fulfils (Priority: P1)

A shop operator works the order queue throughout their shift: filtering to orders awaiting pick, opening one, seeing exactly what to pack, and advancing it through receive → picking → ready-for-pickup. The screen is rebuilt in the new visual language (tabs with live counts, saved views, sortable/filterable table, search, bulk "mark packed"-equivalent actions, a redesigned detail page with the pick list, activity history and customer/destination context) — but every action on it reflects Effy's real model: no carrier selection, no tracking-number entry, no "capture payment" button, because Effy drivers collect finished packages and Stripe capture already happened automatically.

**Why this priority**: This is the highest-frequency screen shop staff use, and it's also where the source design's assumptions diverge furthest from how Effy actually works — getting this screen's action set right matters more than any single visual detail.

**Independent Test**: Open the order queue, apply a filter/saved view, open an order, advance it through its lifecycle, and confirm the state change persists and is reflected back in the queue — with no action offered that the platform can't actually perform (e.g. no capture-payment control, no carrier/tracking fields).

**Acceptance Scenarios**:

1. **Given** orders in different fulfilment states, **When** an operator opens the order queue, **Then** they can filter by state, search by order/customer/SKU, and see accurate live counts per state tab.
2. **Given** an order awaiting pick, **When** the operator opens its detail page, **Then** they see the pick list, the destination and customer context relevant to their shop's portion of the order, and a clear next action appropriate to its current state.
3. **Given** an order the shop has finished picking, **When** the operator marks it ready, **Then** its status updates immediately in both the detail page and the queue list.
4. **Given** several orders selected at once, **When** the operator applies a bulk action, **Then** all selected orders advance together and the operator sees a confirmation of how many succeeded.

---

### User Story 3 - Redesigned catalog, product detail and stock/restock screens (Priority: P2)

A shop operator manages their catalog day to day: browsing/searching products, creating a new one, editing an existing one's details/pricing/media, and working the restock queue for anything running low — all restyled in the new design, using Effy's real product and stock model (tracked/untracked stock, on-hand counts, low-stock threshold) rather than the source design's supplier/vendor/purchase-order/margin bookkeeping, which the platform doesn't model.

**Why this priority**: Catalog and stock management is the second most frequent workflow after order fulfilment, and it's already substantially built — this is primarily a visual and information-architecture rework rather than new capability.

**Independent Test**: Browse the catalog in the new design, open a product, edit one of its fields, and confirm the change is saved and reflected in the list; separately, open the restock queue and confirm it lists exactly the products the shop's existing low-stock rule flags.

**Acceptance Scenarios**:

1. **Given** the shop's product catalog, **When** an operator searches or filters it, **Then** results update using the new table/list design with accurate stock and status indicators.
2. **Given** an existing product, **When** an operator opens its detail page, **Then** they can view and edit its details, pricing, media and stock rules through the redesigned screen.
3. **Given** products below their configured restock threshold, **When** an operator opens the restock queue, **Then** exactly those products are listed, each showing current on-hand count and a way to record newly received stock.

---

### User Story 4 - Consistent visual identity and responsive layout across the whole console (Priority: P2)

Every screen in the shop console — including ones not explicitly named above — is rebuilt on the imported design's tokens and shadcn component vocabulary (buttons, badges, inputs, tables, dialogs/sheets, tabs, toasts), with the existing Light/Dark/Follow-System theme control intact, and remains fully usable down to a tablet-width viewport (the shop-mobile app's documented primary device shape) as well as full desktop width.

**Why this priority**: A redesign that only covers three screens and leaves others visually inconsistent undermines the whole exercise; this story is what makes the rewamp feel complete rather than partial.

**Independent Test**: Navigate every screen in the shop console at both desktop and tablet viewport widths, in both Light and Dark appearance, and confirm a single consistent visual language (spacing, radius, color roles, component style) throughout, with no screen still showing the prior visual design.

**Acceptance Scenarios**:

1. **Given** any screen in the shop console, **When** it is viewed in Light or Dark mode, **Then** it uses the new token set consistently and remains legible (no low-contrast text, no leftover old-design colors or spacing).
2. **Given** the console open at a tablet-width viewport, **When** an operator navigates between screens, **Then** every primary action remains reachable and nothing is clipped or hidden.
3. **Given** an operator has chosen Dark mode, **When** they sign out and back in later, **Then** their appearance choice is remembered.

---

### User Story 5 - Shop operator can flag a fulfilment problem and request a refund or cancellation (Priority: P2)

A shop manager finds a problem while fulfilling an order — an item is damaged, missing from the shelf, or the order needs to be cancelled at the shop's discretion before it leaves — and can raise a refund or cancellation directly from the order detail screen, without redirecting the customer to support or waiting for back-office to notice. The request enters the platform's existing refund/cancellation pipeline (the same state machine and settlement path already used by the customer- and back-office-facing flows) rather than a shop-local approximation of one.

**Why this priority**: It closes a real gap — today a shop that discovers a problem mid-fulfilment has no way to act on it and must rely on the customer contacting support separately — but it is less frequent than the core pick/pack loop, so it ranks behind US1/US2.

**Independent Test**: From an order's detail page, initiate a refund with a reason; confirm the order's refund status advances through the platform's existing refund states (submitting → submitted, then settled or failed/refused) and that the same refund is visible from the customer- and back-office-facing views of that order.

**Acceptance Scenarios**:

1. **Given** an order the shop is fulfilling has a damaged or missing item discovered during picking, **When** a shop manager initiates a refund for the affected item(s), **Then** the request is recorded and enters the platform's refund pipeline with a shop-attributed reason.
2. **Given** a refund is in flight for an order, **When** anyone (customer, back office, or the shop) views that order, **Then** they see the same up-to-date refund status — the shop console does not maintain a separate, possibly-conflicting record of it.
3. **Given** a shop staff member without manager privileges, **When** they view an order, **Then** they can see refund/payment status but cannot initiate a refund or cancellation themselves.
4. **Given** an order the shop attempts to cancel, **When** the cancellation is submitted, **Then** it follows the same rule as the rest of the platform — cancelling a paid order is a refund, not a separate no-op — and the shop sees the same refund-in-progress status a customer-initiated cancellation would produce.

---

### User Story 6 - Shop operator manages suppliers and builds purchase orders for restocking (Priority: P3)

A shop manager tracks which supplier each product is sourced from, sees what to reorder grouped by supplier, builds a purchase order specifying quantities and the shop's purchase cost per unit, and marks it received — which updates the product's on-hand stock the same way manually recording received stock does today, but now with a paper trail of what was ordered, from whom, and at what cost.

**Why this priority**: It is genuinely new capability, not a reskin, and the design's least platform-native area — sequenced after the higher-frequency, already-proven workflows.

**Independent Test**: Create a supplier, assign it to a product, open the restock queue grouped by that supplier, build a purchase order with quantities and unit cost, mark it received, and confirm the product's on-hand stock increases by the received quantities with a stock movement record traceable to that purchase order.

**Acceptance Scenarios**:

1. **Given** a shop's products, **When** a manager assigns a supplier to a product, **Then** that product appears grouped under its supplier in the restock queue.
2. **Given** one or more low-stock products from the same supplier, **When** a manager builds a purchase order, **Then** they can set an order quantity and unit cost per line and see a running order total.
3. **Given** a submitted purchase order, **When** the manager marks it (fully or partially) received, **Then** the corresponding products' on-hand stock increases by the received quantity and the change is traceable to that purchase order.
4. **Given** a purchase order that is only partially received, **When** the manager views it, **Then** the outstanding (not-yet-received) quantity remains visible rather than the order silently closing.

---

### User Story 7 - Shop manager manages their own shop's team from the console (Priority: P3)

A shop manager invites a new staff member, assigns them a role (staff or manager) at their own shop, and deactivates someone who has left — all from the shop console, without needing back-office to do it on their behalf. This uses the same underlying staff records and roles back-office already manages; the shop console becomes a second, scope-limited place to write them, not a separate system.

**Why this priority**: It is genuinely new capability with real authorization design implications (a shop manager must not be able to touch another shop's staff, or grant platform-wide roles) — valuable, but the least urgent of the new capabilities.

**Independent Test**: As a shop manager, invite a new staff member to your own shop, confirm they can sign in and see only your shop's data; deactivate them and confirm their access is revoked immediately; confirm you cannot see or affect any other shop's roster.

**Acceptance Scenarios**:

1. **Given** a shop manager signed in to their shop, **When** they invite a new team member by email with a role, **Then** that person is provisioned as a passwordless shop-pool account scoped to that shop and role, matching how back-office provisions shop staff today.
2. **Given** an existing staff member at the manager's shop, **When** the manager changes their role or deactivates them, **Then** the change takes effect immediately and is reflected identically in back-office's view of the same roster.
3. **Given** a shop manager, **When** they view the team screen, **Then** they see only their own shop's roster and cannot view, invite, or edit staff at a different shop.
4. **Given** a shop staff member (non-manager), **When** they open the team screen, **Then** they see it in read-only form or it is hidden entirely, consistent with the platform's role-gated pattern elsewhere.

---

### Edge Cases

- What happens when the order queue or catalog search returns no matches? (Must show a clear empty state with a way to reset filters — as the source design already does — not a blank table.)
- What happens when a shop has zero products, zero orders, or nothing below its restock threshold? Each screen needs a genuine empty/steady state, not a zeroed-out version of the populated layout.
- What happens when a manager's shop is suspended or the manager's own status is deactivated mid-session? The existing backend gate must still deny access; the redesign must not weaken or bypass it.
- What happens on a very narrow (phone-width) browser window? The console's primary supported floor is tablet width (per the shop audience's tablet-first posture); phone-width behavior should degrade gracefully but is not a primary target.
- What happens when two operators act on the same order or product at nearly the same time (e.g. both try to advance the same order)? The existing concurrency/conflict handling must continue to apply; the new UI must surface a "changed by someone else" conflict rather than silently overwriting.
- What happens when an operator's role only grants read access? Actions the backend would refuse must not be presented as available (existing RBAC gate continues to govern, per the platform's fail-closed rule).
- What happens when a shop-initiated refund fails or is refused by the payment provider? The same failure/refusal states the rest of the platform already uses must be shown — never a shop-local "success" message papering over a real failure.
- What happens when a product is below its restock threshold but has no supplier assigned? It must still appear in the restock queue (in an "unassigned" grouping), not disappear for lacking a supplier.
- What happens when a shop manager tries to invite someone to a different shop, assign a role outside the shop pool's existing set, or deactivate the last remaining manager at their own shop? Each must be refused, with a clear reason.

## Requirements *(mandatory)*

### Functional Requirements

**Visual & component system**

- **FR-001**: The shop console MUST adopt the imported design's visual language (layout structure, spacing, radius, typography scale, and shadcn-style component vocabulary) across every screen, not a subset — see User Story 4.
- **FR-002**: Every interactive UI element (buttons, inputs, selects, checkboxes, badges/pills, tabs, tables, dialogs/side sheets, toasts, dropdowns) in the shop console MUST be built from the platform's shadcn UI component library, with no bespoke hand-rolled equivalents where a shadcn primitive covers the need.
- **FR-003**: The console MUST continue to support Light / Dark / Follow-System appearance, applying the new token set in both appearances, and MUST remain WCAG AA legible in both, consistent with the platform's existing accessibility bar.
- **FR-004**: The redesigned console's UI colors MUST stay within the platform's monochrome design law (a neutral ramp plus exactly the two existing semantic colors for error and success) — the source design's alternate accent-color options are a design-tool authoring aid, not a shipped feature; see Assumptions.
- **FR-005**: The console MUST remain fully operable at tablet-width viewports as well as desktop width, matching the shop audience's documented tablet-first posture; phone-width is a graceful-degradation target, not a primary one.

**Dashboard**

- **FR-006**: The dashboard MUST show real, live counts (not illustrative placeholders) for at least: orders currently awaiting pick, and orders marked ready for pickup, scoped to the signed-in operator's shop.
- **FR-007**: The dashboard MUST surface a "needs attention" list combining orders that have been waiting longest in an active state and products at or below their configured restock threshold, each item linking directly to the relevant order or product screen.
- **FR-008**: The dashboard MUST show a calm, explicit empty/steady state when there is nothing needing attention, rather than a zeroed-out or blank version of the populated layout.

**Order queue & order detail**

- **FR-009**: The order queue MUST let an operator filter by fulfilment state, search across order id/customer/SKU, and see per-state counts, using the shop's existing fulfilment lifecycle (received → picking → ready for pickup, plus the standing statuses) as its source of truth.
- **FR-010**: The order queue MUST support selecting multiple orders and applying a bulk state-advance action to all of them at once, with a summary of how many succeeded.
- **FR-011**: The order detail screen MUST show the pick list, current status, relevant destination/customer context, and an activity/history log, restyled in the new design.
- **FR-012**: The order detail screen MUST NOT present a payment-capture action, a carrier-selection field, or a tracking-number entry field — Effy's payment capture is automatic at checkout, and package movement past "ready for pickup" is Effy's own driver collection, not a shop-chosen carrier shipment.
- **FR-013**: The order detail and order queue screens MUST NOT offer order-line editing (adding/removing items, changing quantities/prices) or draft-order duplication — the platform does not support back-office- or shop-initiated order creation or editing of a placed order.
- **FR-014**: The order detail screen MUST let a shop manager (not shop staff) initiate a refund or cancellation against the order, capturing a reason, which enters the platform's existing refund/cancellation state machine (055) — the shop console MUST NOT implement a separate or shop-local refund mechanism.
- **FR-014a**: The order detail screen MUST display refund/cancellation status (submitting/submitted/failed/refused/settled) identically to how it is shown on the customer- and back-office-facing views of the same order, sourced from the same record — never a shop-local restatement that could disagree with it.
- **FR-014b**: A shop staff member without manager privileges MUST be able to view refund/payment status but MUST NOT be offered a refund/cancel action (fail-closed, matching the platform's existing pattern of restricting outward/financial actions to manager-level roles).

**Catalog, product detail & stock**

- **FR-015**: The catalog list, product detail, product creation flow, and stock/low-stock screens MUST be restyled in the new design while continuing to use the shop's existing product and stock model (tracked/untracked flag, stock-on-hand, low-stock threshold, receiving stock) as their data source.
- **FR-016**: The platform MUST gain a supplier concept, scoped per shop: a shop manager can record suppliers and assign a supplier to a product, and the restock queue groups low-stock products by their assigned supplier (with an "unassigned" grouping for products carrying none).
- **FR-017**: The restock queue MUST list exactly the products the shop's existing low-stock rule flags, show each one's current on-hand count, and let the operator record newly received stock against it (directly, or via a purchase order per FR-018).
- **FR-018**: A shop manager MUST be able to build a purchase order from one or more restock-queue lines, specifying an order quantity and the shop's unit purchase cost per line, see a computed order total, and mark the order fully or partially received; marking received MUST increase the corresponding products' stock-on-hand and create a stock movement record traceable to that purchase order.
- **FR-018a**: A purchase order MUST carry a status distinguishing at least draft, submitted, and (fully or partially) received, so a partially-received order's outstanding quantity remains visible rather than the order silently closing.
- **FR-018b**: A product's customer-facing price MUST remain unaffected by purchase-order unit cost — cost is shop-internal bookkeeping, not a pricing input for this redesign.

**Scope boundary with other subsystems**

- **FR-019**: A shop manager MUST be able to view, invite, edit the role of, and deactivate staff at their own shop from the shop console, using the same underlying staff/role records back-office manages — not a second, independent system of record.
- **FR-019a**: A shop manager MUST NOT be able to view or modify staff at any shop other than their own, assign a role outside the shop pool's existing role set (`shop_manager`/`shop_staff`), or perform any action that remains back-office-exclusive (creating a new shop, changing a shop's own status, reassigning staff between shops).
- **FR-019b**: A shop staff member without manager privileges MUST see their shop's team screen in read-only form, or have it hidden entirely — consistent with FR-014b's pattern.
- **FR-020**: New backend capability for supplier/purchase-order management and for shop-scoped team management MUST be served by the shop-scoped cold-path service (`apis/edge-api/shop`), consistent with the platform's existing dual-path routing rule. Shop-initiated refunds/cancellations MUST reuse the existing refund/cancellation state machine and settlement path exactly as built (055) rather than a new implementation; how the shop console's request reaches that existing pipeline — given the payment secret's current core-api-only placement (055) — is a planning-phase architecture decision, not a specification-level one.
- **FR-021**: Existing role-based access control (manager/staff gating, active-shop scoping, fail-closed denial) MUST continue to govern every screen and action in the redesigned console, extended — using the same existing gate and existing roles, not new ones — to also cover refund initiation (FR-014b) and team management (FR-019a/FR-019b).

### Key Entities

- **Shop Fulfilment (order, shop-scoped)**: An existing entity — the shop's portion of a customer order, with a status (received/picking/ready for pickup, etc.), pick items, and its own activity history. The redesign presents this differently but does not change what it represents.
- **Product**: An existing entity — a catalog item with details, media, pricing, category, and (if tracked) a stock-on-hand count and low-stock threshold. This redesign adds a supplier reference (FR-016) but no pricing-affecting fields (FR-018b).
- **Stock Movement**: An existing append-only record of stock changes (received, adjusted, sold), used to power the restock queue and stock history views; purchase-order receipts (FR-018) become a new source of these records.
- **Supplier** *(new)*: A shop-scoped record identifying who a product is sourced from — introduced by this redesign to power supplier-grouped restocking (FR-016).
- **Purchase Order** *(new)*: A shop-scoped record grouping one or more products from one supplier, with a per-line order quantity and unit cost, an order total, and a draft/submitted/received status (FR-018/FR-018a) — introduced by this redesign.
- **Refund / Cancellation Request**: An existing entity (055) — this redesign adds a new initiation surface (the shop console) but not a new mechanism; the state machine, settlement path, and system of record remain owned by the existing pipeline (FR-014).
- **Shop Staff / Roster**: An existing entity, historically written only by back-office; this redesign makes it writable from shop-web too, scoped to the acting manager's own shop (FR-019), remaining one shared system of record rather than a second one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every screen in the shop console renders using the new visual design (tokens, component vocabulary, layout structure) with zero screens still showing the prior visual design, confirmed by a full screen-by-screen visual review.
- **SC-002**: An operator can go from opening the dashboard to acting on the single most-urgent item (oldest order awaiting pick, or the lowest-stock product) in two clicks or fewer.
- **SC-003**: The order queue and catalog list both return filtered/searched results with no full-page reload, and remain responsive with realistic order/product volumes for a single shop.
- **SC-004**: The console remains fully usable — every primary action reachable, nothing clipped — at a tablet-width viewport as well as at desktop width.
- **SC-005**: Dark/Light/Follow-System appearance choice persists across sign-outs and remains WCAG AA legible in both appearances on every redesigned screen.
- **SC-006**: No screen in the redesigned console offers an action the platform cannot actually perform (verified against FR-012/FR-013/FR-014/FR-018b).
- **SC-007**: A shop manager can initiate a refund from an order's detail page, and the resulting status is identical, at every subsequent point, to what appears on the customer's and back-office's views of that same order.
- **SC-008**: A shop manager can go from an empty purchase order to a submitted one, and from "received" to updated stock-on-hand, without leaving the restock/purchase-order screen.
- **SC-009**: A shop manager can invite, edit the role of, or deactivate a staff member at their own shop in under a minute, and that change is visible from back-office's staff view immediately, with no extra sync step.
- **SC-010**: A shop manager cannot, through any shop console action, view or modify another shop's staff or refund/cancel an order outside their own shop's fulfilment scope (verified by a fail-closed negative test for each).

## Assumptions

- **Currency, tax and locale**: The source design's Swedish/SEK/VAT presentation is an artifact of its fictional example data, not a requirement. The redesigned console uses the platform's real currency, order-economics fields, and locale; no VAT/tax line is fabricated where the platform does not already compute one.
- **Payment model**: Stripe capture is automatic at checkout platform-wide (`CaptureMethod: automatic`); the redesign will not add a shop-facing "capture payment" action, since the platform has nothing for it to trigger — refunds (FR-014) are the only payment-adjacent action the shop console gains.
- **Shipping/carrier model**: Effy uses its own driver hub-and-spoke collection, not shop-chosen carriers with tracking numbers; the order detail screen's "fulfilment" section is reframed around handoff-to-driver-collection rather than shipment creation.
- **Design tokens over current tokens**: Per the request, the shop console's presentation layer adopts the imported design's token set (spacing, radius, structure, and — pending the plan phase's technical approach — typography) rather than reusing the shared `@effy/design-system` tokens verbatim. The two hard platform-wide constraints that survive regardless are: the monochrome accent rule (no brand hue) and the WCAG AA contrast bar. Whether this is implemented as an extension of the shared console-shell package (also used by back-office) or as a shop-web-local override is a planning-phase decision, not a specification-level one.
- **Theme-variant props are design-tool scaffolding**: The imported file's alternate accent-color options (e.g. non-neutral primaries) and density toggle are treated as authoring aids for previewing the design in the Claude Design tool, not as a user-facing feature to ship, because shipping a non-neutral accent would violate the platform's locked monochrome rule.
- **Order tagging is out of scope**: The source design's freeform order-tag feature has no backing field on the platform's order model and is not introduced by this redesign.
- **RBAC roles and sign-in are unchanged; what those roles are authorized to do is extended**: This redesign does not change who can sign in or what roles exist on the shop pool (still `shop_manager`/`shop_staff`) or how the active-shop/manager gate is decided. It does extend what those existing roles are authorized to do through that same gate — refund initiation and team-management writes are now manager-only actions the gate governs (FR-014b/FR-019a/FR-019b), the same way it already governs picking and stock actions.
- **Refund authorization defaults to manager-only**: Restricting shop-initiated refunds/cancellations to `shop_manager` (not `shop_staff`) is a reasonable default matching the platform's existing pattern of reserving outward/financial actions for manager-level roles (e.g. 046's reply-to-feedback, 053's order-console record actions); it is not itself confirmed by the source design and can be revisited in planning if broader access is wanted.
- **Supplier/purchase-order data is shop-scoped, not a shared platform directory**: Each shop manages its own supplier list and purchase orders, consistent with product/stock data already being shop-scoped — this redesign does not introduce a platform-wide vendor directory shared across shops.
- **Stripe-secret reachability is a planning-phase question**: Today the Stripe secret used for refund settlement lives only in `core-api` (055's back-office verifier addition being the one precedent for extending that reach). Exactly how a shop-console-initiated refund reaches that existing pipeline — a new verifier, a call through an existing service, or another shape — is left to the plan, not decided here (see FR-020).
