# Feature Specification: Checkout Shipping & Billing Addresses

**Feature Branch**: `023-checkout-shipping-billing`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Upgrade the checkout address experience and give every order a distinct
shipping and billing address."

## Overview

Two connected capabilities, delivered on both customer surfaces at parity:

1. **Rich checkout address selection** — reconcile checkout to the first-class Address Book (022).
   Checkout pre-selects the customer's default address, lets them switch to another saved address, or
   enter a new one (which is saved to their address book).
2. **Shipping + billing address per order** — every order carries a **shipping** address (the main one,
   where it's delivered) and a **billing** address (payment/invoice). Billing defaults to *exactly* the
   shipping address; the customer may opt to give a different billing address. Both are **snapshotted**
   onto the order at placement, immutable thereafter.

The order-fulfilment side (020) must carry both addresses through the order model but expose the
**shipping address only** to the shop/operator — the **billing address MUST NEVER reach the shop**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checkout pre-selects my default address (Priority: P1)

At checkout, a returning customer with saved addresses sees their **default** address already selected
as the delivery (shipping) address, with the amount and delivery already reflecting it — they don't
re-enter anything. A customer with no saved address is prompted to add one.

**Why this priority**: This is the everyday path; today checkout shows a bare add-address form even when
the customer already has saved addresses. Removing that friction is the core value and unblocks the rest.

**Independent Test**: With a signed-in customer who has ≥1 saved address (one default), open checkout —
the default is pre-selected and shown; proceed to pay without touching the address.

**Acceptance Scenarios**:

1. **Given** a customer with a default saved address, **When** they open checkout, **Then** the default
   address is pre-selected as the shipping address and shown in full.
2. **Given** a customer with saved addresses but (hypothetically) none marked default, **When** they open
   checkout, **Then** a saved address is selected deterministically (the most recently used/created) and
   shown, and they can change it.
3. **Given** a customer with **no** saved address, **When** they open checkout, **Then** they are prompted
   to add one and cannot pay until a shipping address is set.

---

### User Story 2 - Change the shipping address at checkout (Priority: P1)

The customer wants this order delivered somewhere other than their default. At checkout they open a
picker of their saved addresses and choose a different one; the order's shipping address, delivery
options, and amount update to the chosen address.

**Why this priority**: "Send it to work / to a friend" is a first-class, common need; without it the
pre-selection of US1 is a dead end for anyone shipping somewhere non-default.

**Independent Test**: At checkout, open the address picker, select a non-default saved address → it
becomes the selected shipping address and the delivery/amount reflect it.

**Acceptance Scenarios**:

1. **Given** a customer with ≥2 saved addresses at checkout, **When** they open the picker and select a
   different one, **Then** it becomes the shipping address and the receipt/summary reflects it.
2. **Given** a re-priced delivery depends on the destination, **When** the shipping address changes,
   **Then** delivery options and the payable amount are recomputed for the new address before payment.
3. **Given** the customer changed the shipping address only for this order, **When** the order is placed,
   **Then** their **default** saved address is unchanged (a per-order choice, not a default change).

---

### User Story 3 - Enter a new address during checkout (Priority: P1)

The customer has no suitable saved address, so they add a new one **without leaving checkout**, using
the same responsive add-address form as the Address Book. The new address is saved to their book and
selected for this order.

**Why this priority**: A first-time or new-destination purchase must not force a detour to the account
page; this is the on-ramp for customers who haven't curated an address book yet.

**Independent Test**: At checkout, choose "add a new address", fill the responsive form, save → it
appears selected as the shipping address and is present later in the Address Book.

**Acceptance Scenarios**:

1. **Given** a customer at checkout, **When** they choose to add a new address and submit a valid one,
   **Then** it is saved to their address book, selected as the shipping address, and checkout continues.
2. **Given** the add-address form has invalid/missing required fields, **When** they submit, **Then** a
   field-level error is shown and nothing is saved.
3. **Given** the customer is the first-ever address for this customer, **When** it is saved, **Then** it
   becomes their default (consistent with the Address Book's first-address rule).

---

### User Story 4 - Billing defaults to shipping, but can differ (Priority: P1)

Every order records a billing address for payment/invoice. By default it is **exactly** the shipping
address, shown by a "Billing address same as shipping" toggle that is **ON** by default. When the
customer turns it OFF, they pick another saved address or enter a new one for billing — using the same
picker/new-address experience as shipping.

**Why this priority**: The order isn't complete without a billing address, and the "same as shipping"
default keeps the common case one glance. Divergent billing is a real need (gift delivery, company
billing) and must be possible from day one per the product decision.

**Independent Test**: At checkout with the toggle ON, place an order → billing equals shipping on the
receipt. Turn the toggle OFF, choose a different billing address, place → the receipt shows a distinct
billing address.

**Acceptance Scenarios**:

1. **Given** the "same as shipping" toggle is ON (default), **When** the order is placed, **Then** the
   billing address recorded on the order equals the shipping address.
2. **Given** the toggle is turned OFF, **When** the customer selects/enters a different billing address
   and places the order, **Then** the billing address on the order is the chosen one and the shipping
   address is unaffected.
3. **Given** the toggle is ON and the customer then changes the **shipping** address, **When** they place
   the order, **Then** the billing address follows the new shipping address (still "same as").
4. **Given** the toggle is OFF with no billing address chosen, **When** they try to pay, **Then** they are
   blocked until a billing address is set.

---

### User Story 5 - Receipt & order history show both addresses (Priority: P2)

After placing an order, the customer sees both the shipping and billing addresses on the receipt and in
order history. When the two are identical, the billing line reads "Billing: same as shipping" rather
than repeating the full address.

**Why this priority**: Confirmation and record-keeping; important for trust but not blocking the
purchase itself.

**Independent Test**: Place an order (same billing) → receipt shows shipping in full and "Billing: same
as shipping". Place another with divergent billing → receipt shows both addresses in full.

**Acceptance Scenarios**:

1. **Given** an order placed with billing = shipping, **When** the customer views the receipt or order
   history, **Then** the shipping address is shown in full and billing reads "same as shipping".
2. **Given** an order placed with a distinct billing address, **When** the customer views the receipt,
   **Then** both the shipping and billing addresses are shown in full.
3. **Given** the customer later edits or deletes the saved address used on a past order, **When** they
   re-open that order, **Then** its shipping and billing addresses are unchanged (immutable snapshot).

---

### User Story 6 - The shop sees the shipping address only, never billing (Priority: P1)

The order-fulfilment side (020) carries both addresses in the order model, but every shop/operator
surface exposes the **shipping (delivery) address only**. The billing address is payment/invoice data
and is never sent to, rendered by, or reachable from any shop-facing view or endpoint.

**Why this priority**: This is a hard privacy/hidden-fulfilment boundary; getting it wrong leaks a
customer's billing details to a fulfilment node. It must hold from the moment orders carry two
addresses.

**Independent Test**: Place an order with a distinct billing address; on both shop surfaces (shop-web +
shop-mobile) and in the shop fulfilment API responses, confirm the shipping address is present (where
the shop is entitled to it) and the billing address appears **nowhere**.

**Acceptance Scenarios**:

1. **Given** an order with divergent shipping and billing addresses, **When** the shop views/opens the
   fulfilment for its portion, **Then** only the shipping (delivery) address is available and the billing
   address is absent from the payload and the UI.
2. **Given** a shop-facing fulfilment API response, **When** it is inspected directly, **Then** it
   contains no billing address field or value under any name.
3. **Given** the existing hidden-fulfilment rules (no seller identity, no billing to shop), **When** this
   slice ships, **Then** those rules still hold — the shop gains nothing beyond the shipping address it
   already needs for handoff.

---

### Edge Cases

- **No saved address at checkout** — the customer must add one before paying; there is no "guest" order
  without an address.
- **Shipping address changes after billing was set to "same"** — billing continues to mirror shipping
  while the toggle is ON; it only "freezes" to a distinct value when the customer turns the toggle OFF
  and chooses one.
- **Billing toggle OFF then back ON** — billing reverts to mirroring the current shipping address; any
  separately chosen billing selection is discarded for that order.
- **A saved address used on an order is later edited/deleted** — the order's snapshots are unaffected
  (immutability), on both shipping and billing.
- **Selected saved address becomes unavailable/invalid between selection and payment** (e.g. deleted on
  another device) — checkout surfaces a clear prompt to re-select before payment; the order is not placed
  against a missing address.
- **An all-undeliverable / unserviceable shipping address** (021 serviceability) — blocks at checkout as
  it does today; billing choice does not affect serviceability.
- **Order placed** — the shipping and billing snapshots are fixed; nothing downstream (fulfilment,
  receipt) may mutate them.

## Requirements *(mandatory)*

### Functional Requirements

**Checkout address selection (US1–US3)**

- **FR-001**: At checkout, the system MUST pre-select the customer's **default** saved address as the
  shipping address and display it in full.
- **FR-002**: When the customer has saved addresses but none is marked default, the system MUST select one
  deterministically (most recently used/created) and allow the customer to change it.
- **FR-003**: The system MUST let the customer **switch** the shipping address to any of their saved
  addresses via a picker over the saved list.
- **FR-004**: The system MUST let the customer **add a new address during checkout**, using the same
  responsive add-address experience as the Address Book (dialog on large screens / drawer on small
  screens on web; bottom sheet on mobile); the new address MUST be saved to their address book and
  selected for the order.
- **FR-005**: When the shipping address changes, the system MUST recompute delivery options and the
  payable amount for the new destination **before** payment is authorised.
- **FR-006**: Changing the shipping address for an order MUST NOT change the customer's default saved
  address (it is a per-order choice).
- **FR-007**: The system MUST prevent payment when no shipping address is selected.

**Billing address (US4)**

- **FR-008**: Every order MUST record a **shipping** address and a **billing** address.
- **FR-009**: The billing address MUST default to **exactly** the shipping address, surfaced as a
  "Billing address same as shipping" control that is **ON by default**.
- **FR-010**: While "same as shipping" is ON, the billing address MUST track the currently selected
  shipping address (including after a shipping change).
- **FR-011**: When the customer turns "same as shipping" OFF, the system MUST let them select a different
  saved address or enter a new one for billing, using the same picker/new-address experience as shipping.
- **FR-012**: The system MUST prevent payment when "same as shipping" is OFF and no billing address is
  set.
- **FR-013**: Turning "same as shipping" back ON MUST restore billing to mirror the shipping address and
  discard any separately chosen billing address for that order.

**Snapshots & immutability (US5)**

- **FR-014**: At placement, the system MUST **snapshot** both the shipping and billing addresses onto the
  order as immutable copies (the same snapshot guarantee the existing delivery address already has).
- **FR-015**: Editing or deleting a saved address MUST NOT alter the shipping or billing address recorded
  on any already-placed order.
- **FR-016**: The receipt and order history MUST show the shipping address in full, and the billing
  address in full when it differs; when identical, the billing line MUST read "same as shipping".

**Shop/fulfilment boundary (US6)**

- **FR-017**: The order-fulfilment model (020) MUST carry both addresses, but every shop/operator surface
  and every shop-facing fulfilment response MUST expose the **shipping (delivery) address only**.
- **FR-018**: The **billing address MUST NEVER** be sent to, rendered by, stored in, or reachable from any
  shop-facing view, API response, or operator fulfilment record.
- **FR-019**: The existing hidden-fulfilment guarantees MUST continue to hold — the shop gains no
  information beyond the shipping address it already requires.

**Cross-cutting**

- **FR-020**: Both customer surfaces (customer-web and customer-mobile) MUST offer this behaviour at
  parity.
- **FR-021**: A customer MUST only see and select their own saved addresses; identity is never taken from
  client input.
- **FR-022**: Address selection MUST NOT use card layouts (a list/picker), consistent with the platform's
  layout doctrine.

### Key Entities *(include if feature involves data)*

- **Order (existing, extended)**: an immutable record of a placed purchase. Already carries a **shipping**
  (delivery) address snapshot; now also carries a **billing** address snapshot. Both are point-in-time
  copies, not references to saved addresses.
- **Saved address (existing, reused — 022 Address Book)**: the customer's managed delivery addresses.
  Read at checkout to pre-select/switch; a new one added at checkout is written here. Never altered by
  order placement.
- **Shop fulfilment (existing — 020, extended in exposure)**: the shop's view of its portion of an order.
  Gains access to the order's **shipping** address for handoff; the billing address is out of its reach by
  construction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A returning customer with a default address can reach the pay step **without entering or
  editing any address** (0 address fields typed) on both surfaces.
- **SC-002**: A customer can change the shipping address at checkout and see delivery/amount reflect the
  new destination before paying, in under 30 seconds.
- **SC-003**: A customer can add a new address at checkout in one flow (no navigation away), and it is
  present in their Address Book afterwards.
- **SC-004**: 100% of placed orders record both a shipping and a billing address; with the default toggle
  ON, billing equals shipping on 100% of those orders.
- **SC-005**: A customer can place an order with a **distinct** billing address, and the receipt shows both
  addresses correctly.
- **SC-006**: Editing/deleting a saved address after an order leaves that order's shipping and billing
  addresses **unchanged** (100% immutability).
- **SC-007**: Across **every** shop-facing surface and fulfilment API response, the billing address appears
  **zero** times for an order with divergent billing; the shipping address remains available where the
  shop is entitled to it.
- **SC-008**: Both customer surfaces satisfy the same acceptance scenarios (parity).
- **SC-009**: No address PII beyond what each audience is entitled to appears in analytics/telemetry (no
  billing address to the shop, no address fields in customer analytics events).

## Assumptions

- **The Address Book (022) is the source of saved addresses.** Checkout reads and (for new entries) writes
  through the same saved-address capability; this slice does not introduce a separate address store.
- **The existing order delivery-address snapshot is the shipping address.** "Shipping" formalises what the
  order already captures; the new work is the **billing** snapshot alongside it.
- **Billing address is a snapshot, not a saved "billing address" type.** There are no separate billing
  address records; the customer picks/enters an ordinary address and the order snapshots it as billing.
- **Stripe/payment mechanics are unchanged** apart from the order now recording an explicit billing
  address; no new payment methods, no change to how the amount is authorised beyond re-pricing on shipping
  change (already a checkout behaviour).
- **Serviceability/delivery pricing (021)** keys off the **shipping** address only; billing never affects
  delivery.
- **The shop never needed billing** — this slice makes that explicit and enforces it; it does not remove
  any information the shop legitimately has today.
- **No guest checkout** — placing an order requires a signed-in customer with at least one address (the
  existing model).
