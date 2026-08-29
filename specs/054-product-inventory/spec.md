# Feature Specification: Product Inventory (Shop-Managed Stock)

**Feature Branch**: `054-product-inventory`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "next we need to implement G2 from ORDER-FLOW-GAPS.md. do a deep dive on G2 and start it" — refined in session: "we do not need very advanced inventory system. we need moderate level inventory, that shop can manage. (and if shop ask admin to do it, admin should also be able to do management)"

---

## Why this exists

**Nothing on this platform knows how much of anything a shop has.** A product is either offered or
not offered; there is no quantity anywhere. The register records it as gap **G2**, and after 053 it is
the **top item** in the suggested sequencing, because it is the root cause of the shortfall → refund →
support chain that gap G3 and most of Tier 2 hang off.

Three consequences are live today:

1. **Overselling is unbounded.** A shopper can buy 20 of something a shop has 2 of. The only quantity
   constraint on the platform is a per-line policy cap (99 by default), which is a *policy* ceiling and
   says nothing about availability.
2. **The platform discovers the problem hours later, from a person.** The sole discovery mechanism is a
   picker standing at an empty shelf, recording a shortfall.
3. **That discovery has nowhere to go.** The customer has already been charged in full, the order total
   is never adjusted, and the storefront tells them to "contact support and we'll sort it out". With no
   stock model, shortfall is not an edge case — it is the *normal* way the platform learns it oversold.

The one manual lever that exists today is a product-level "make unavailable" switch, all-or-nothing per
product. A shop with two units left has exactly two options: keep selling without limit, or withdraw the
product entirely. Neither is true.

This slice gives a shop a stock count it can maintain, makes availability tell the truth, and stops the
oversell at the moment before money moves.

---

## Clarifications

### Session 2026-08-29

- Q: How fresh must stock be on the browse surfaces? → A: Tiered — listings/rails/search may be stale up to 60s; the product detail page is live; cart and checkout are authoritative and always re-check.
- Q: When a payment lands for more units than the shop has, how does the shop find out? → A: The pick progress rows are created at payment with the deficit already marked unavailable, so the picker sees the line flagged on opening the order and can gather it anyway if the shelf disagrees.
- Q: May a shopper be told the exact number available? → A: Yes, but only in the refusal that limits them ("only 2 available"). No count is shown anywhere else and no persistent low-stock badge is added; shop identity and shop count stay hidden.
- Q: Where does the low-stock threshold come from? → A: A shop-wide default set once by the shop, overridable per product.
- Q: How far do back-office powers extend? → A: Full parity with the shop — turning tracking on or off, setting counts and setting thresholds — every action attributed and visible to the shop.

**Post-plan corrections (analysis pass, same day)** — both applied to the earliest affected artifact
per Principle I rather than patched downstream:

- **SC-004** implied a reporting capability nobody had scoped. Narrowed to a measurement over pick
  records the platform already keeps, with the baseline captured **before** deployment.
- **FR-007** listed example reasons ("sale", "back-office adjustment") that did not match the closed
  set the design settled on, and conflated *who acted* with *why*. Both corrected.

## Scope, deliberately moderate

This is a **shop-managed stock count**, not a warehouse management system. The operator's direction is
explicit: moderate, shop-managed, with back-office staff able to manage it on a shop's behalf when asked.

**In scope**

- A per-product stock count, owned and maintained by the shop that owns the product.
- Stock tracking that is **opt-in per product** — a product that is not tracked behaves exactly as it
  does today.
- Availability that accounts for stock everywhere the platform already decides whether a product can be
  bought — storefront, product page, search, cart, saved items — through **one shared rule**.
- A refusal at the two moments that matter: adding to a cart, and creating the payment.
- A stock reduction when an order is paid, and a correction when a picker finds the shelf disagrees.
- A low-stock threshold and an at-a-glance list of what needs restocking.
- An append-only movement history: every change, who made it, and why.
- Back-office staff able to view and adjust any shop's stock, attributed to them.

**Out of scope** — each named so it is not mistaken for an oversight:

- **Reservations / holds during checkout.** A count is reduced when an order is *paid*, not when a
  shopper starts checking out. The oversell window narrows from "unbounded" to "between two payments
  that land at the same instant"; it does not close entirely. See Assumption A6.
- **The money half of a shortfall (G3).** Refunds, partial refunds and order-total adjustment remain
  unbuilt. This slice makes shortfalls *rarer* and *visible earlier*; it does not pay anybody back.
- **Substitutions.** ⚠ The published Food Safety notice already tells customers *"You can decline
  substitutions at checkout"* and describes what happens when a substitute is chosen. **No substitution
  capability exists anywhere on the platform, and this slice does not add one.** Recorded here as a
  live prose-vs-product contradiction so a later slice owns it (see Dependencies).
- **Restoring stock on cancellation.** No cancellation capability exists (Tier 2). When one lands it
  must return stock; the movement history is designed so it can.
- Supplier management, purchase orders, automatic reordering, cost prices or stock valuation.
- Multiple storage locations within one shop, batch or lot numbers, expiry-date tracking, serial numbers.
- Formal stock-take / cycle-count workflows. A shop corrects a count by setting it.
- Cross-shop stock visibility for customers, or any customer-facing signal of *which* shop holds stock —
  shops are hidden internal fulfilment nodes and stay hidden.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop keeps a true count of what it has (Priority: P1)

A shop operator opens a product in their console, turns on stock tracking, and enters how many they
have. When a delivery arrives they add to the count; when they find breakage they reduce it, choosing a
reason. Every change is recorded against their name. Products they do not want to count — because supply
is effectively unlimited, or because they are not ready to maintain a number — are simply left untracked
and behave exactly as they do today.

**Why this priority**: Nothing else in this slice can exist without a number to read. It is also the
whole of the operator's request, and it is independently useful the moment it ships: a shop can see and
maintain its own counts even before the storefront reacts to them.

**Independent Test**: Turn on tracking for one product, set a count, adjust it up and down, and confirm
the value and the full history of changes read back correctly on both shop surfaces. Leave a second
product untracked and confirm it is unchanged in every respect.

**Acceptance Scenarios**:

1. **Given** a product with tracking off, **When** the operator turns tracking on and enters a count,
   **Then** the product shows that count and the change is recorded with the operator's identity, the
   time, and the reason.
2. **Given** a tracked product with 12 units, **When** the operator records receiving 24 more,
   **Then** the count reads 36 and both movements appear in the history, newest first.
3. **Given** a tracked product with 3 units, **When** the operator corrects it to 1 with the reason
   "damaged", **Then** the count reads 1 and the movement records the reason.
4. **Given** a tracked product, **When** the operator turns tracking off, **Then** the product becomes
   available without limit again, the change is recorded, and the previous history is retained.
5. **Given** a product belonging to another shop, **When** an operator attempts to view or change its
   stock, **Then** the attempt is refused and reveals nothing about that product.
6. **Given** an operator enters a negative count or a value that is not a whole number, **When** they
   submit, **Then** it is refused with a message naming the problem, and no movement is recorded.

---

### User Story 2 - A shopper is never sold something that isn't there (Priority: P1)

A shopper browsing the store sees a product that has run out marked as unavailable rather than silently
missing. If they try to add more of something than the shop has, they are told how many they can have
rather than being refused with no explanation. If stock runs out between filling their cart and paying,
the cart says so before they reach the payment screen, and the payable amount reflects only what can
actually be supplied.

**Why this priority**: This is the requirement the gap register is actually about. P1 alongside Story 1
because a count nobody enforces is decoration, and because the harm being prevented — charging someone
in full for something that does not exist — happens at this exact seam.

**Independent Test**: With one product tracked at 2 units, attempt to add 5 to a cart, then reduce the
shop's count to 0 with the cart still open, and confirm the cart, the payable total and the checkout
gate all reflect it before any payment is attempted.

**Acceptance Scenarios**:

1. **Given** a tracked product with 0 units, **When** a shopper views the store, a category, a search
   result or the product page, **Then** the product is shown as unavailable to buy, and the reason is
   distinguishable from "no longer sold".
2. **Given** a tracked product with 2 units, **When** a shopper tries to add 5 to their cart, **Then**
   the request is refused with a message stating how many are available, and the cart is unchanged.
3. **Given** a shopper holds 3 of a product in their cart and the shop reduces the count to 1,
   **When** the shopper next views their cart, **Then** the line is flagged, the payable amount counts
   only 1, and the shopper is told what changed.
4. **Given** a cart in which every line has run out, **When** the shopper attempts to check out,
   **Then** checkout is refused with a reason they can act on, and no payment is created.
5. **Given** a cart containing one available line and one that has run out, **When** the shopper checks
   out, **Then** payment is created for the available line only and the shopper is told what was left
   behind before they pay.
6. **Given** an untracked product, **When** a shopper adds any quantity up to the existing per-line
   policy cap, **Then** behaviour is identical to today in every respect.
7. **Given** a shopper has saved a product that has since run out, **When** they open their saved list,
   **Then** it reads as temporarily out of stock — something to wait for — and not as withdrawn.

---

### User Story 3 - Stock stays true as orders flow through (Priority: P2)

When an order is paid, the counts of the products in it go down without anyone doing anything. When a
picker gathers the order and finds fewer on the shelf than the count claimed, recording that shortfall
also corrects the count, so the next shopper is not sold the same phantom unit. Every one of these
movements is in the history, attributed to the order or the pick that caused it.

**Why this priority**: P2 because Stories 1 and 2 already deliver the operator's ask and stop the
oversell. This is what keeps the number true over time without a person maintaining it by hand — without
it, counts drift within days and the shop stops trusting them.

**Independent Test**: Place and pay for an order containing a tracked product, confirm the count falls by
the ordered quantity and the movement cites the order; then record a shortfall on the pick and confirm
the count is corrected and the movement cites the pick.

**Acceptance Scenarios**:

1. **Given** a tracked product with 10 units and a paid order for 3, **When** the order becomes paid,
   **Then** the count reads 7 and a movement records the order that caused it.
2. **Given** the same order is finalised more than once (a repeated payment confirmation), **When** it
   is processed again, **Then** the count is unchanged — the reduction happens exactly once.
3. **Given** two orders for the last unit of a product are paid at the same moment, **When** both are
   finalised, **Then** the count never goes below zero, both orders are recorded, and the losing order's
   line is already flagged as short when the shop opens it — rather than being discovered at the shelf.
4. **Given** a picker records that only 1 of 3 ordered units could be found, **When** they submit,
   **Then** the shop's count for that product is corrected to reflect the shelf and a movement records
   the pick as the cause.
5. **Given** an untracked product in a paid order, **When** the order is finalised, **Then** no movement
   is recorded and nothing about the product changes.
6. **Given** a paid order for a product whose count has since been set by hand, **When** the movements
   are read, **Then** the sequence of movements accounts for the difference between the opening and
   current count with no unexplained gap.

---

### User Story 4 - Back-office staff manage stock on a shop's behalf (Priority: P2)

A shop calls support because they cannot get to a tablet, or because a count is wrong and they need it
fixed now. A back-office staff member finds the shop, finds the product, and sets the count — and the
history shows plainly that it was back-office who did it, not the shop.

**Why this priority**: Explicitly requested. P2 rather than P1 because the shop's own management (Story
1) is the primary path and this is the assisted one; it is only useful once Story 1 exists.

**Independent Test**: As a back-office staff member, adjust the stock of a product belonging to a shop,
then confirm from the shop's own console that the new count and an attributed movement are both visible.

**Acceptance Scenarios**:

1. **Given** a back-office staff member with sufficient permission, **When** they set a product's count,
   **Then** the count changes and the movement is attributed to them and marked as a back-office action.
2. **Given** the same staff member, **When** they turn tracking off for a product at the shop's request,
   **Then** the product becomes available without limit, and the change is recorded against their name
   and marked as a back-office action.
3. **Given** a shop operator, **When** they read the product's history, **Then** they can see that
   back-office made the change and what reason was given.
4. **Given** a back-office staff member without sufficient permission, **When** they attempt to change a
   count, **Then** they are refused, and the refusal does not depend on which shop or product it was.
5. **Given** any active back-office staff member, **When** they view a product's stock and history,
   **Then** they can read it — viewing is not restricted to those who may change it.

---

### User Story 5 - A shop sees what needs restocking before a customer does (Priority: P3)

A shop sets a threshold on a product — "tell me when this drops to 5" — and their console shows a list
of everything at or below its threshold, and everything that has hit zero, so restocking is a decision
made from a list rather than from a customer complaint.

**Why this priority**: P3. Genuinely valuable and cheap once Stories 1 and 3 exist, but the slice is
correct and complete without it. Cuttable under pressure.

**Independent Test**: Set a threshold above a product's current count and confirm the product appears in
the low-stock list on both shop surfaces; raise the count above the threshold and confirm it leaves.

**Acceptance Scenarios**:

1. **Given** a tracked product with 4 units and a threshold of 5, **When** the operator opens the
   low-stock list, **Then** the product appears in it.
2. **Given** a tracked product at 0 units, **When** the operator opens the low-stock list, **Then** it
   appears and is distinguished from those merely running low.
3. **Given** the shop has set a default threshold of 5 and a product carries none of its own, **When**
   that product falls to 4, **Then** it appears in the low-stock list.
4. **Given** the shop default is 5 and a product carries its own threshold of 20, **When** the product
   falls to 12, **Then** it appears in the low-stock list — the product's own threshold wins.
5. **Given** neither a shop default nor a product threshold is set, **When** the product reaches 0,
   **Then** it still appears as out of stock — a missing threshold never hides an empty shelf.
6. **Given** an untracked product, **When** the low-stock list is opened, **Then** it never appears.

---

### Edge Cases

- **A count is set below what is already in unpaid carts.** Carts are not promises. The count is
  accepted as entered; affected carts are corrected the next time they are read (Story 2, scenario 3).
- **A product is tracked, then untracked, then tracked again.** The earlier history survives; the count
  entered on re-tracking is authoritative from that moment and is recorded as a movement.
- **Tracking is turned on with no count supplied.** Refused — turning on tracking without a number would
  make the product instantly unbuyable with no operator intent behind it.
- **A tracked product is at 0 and the operator publishes it.** Publishing succeeds; the product is
  listed and shown as out of stock. Availability and lifecycle are separate decisions.
- **Two operators at the same shop adjust the same product at the same instant.** Both movements are
  recorded and the resulting count reflects both; neither is silently lost.
- **A shopper's cart holds a product that becomes untracked.** The line stops being limited by stock and
  the flag clears.
- **An order is paid for a product that was deleted or archived between add and payment.** The existing
  behaviour governs; stock changes nothing about it.
- **A picker records finding *more* than the order needed.** Only what the order needed can be gathered;
  a surplus on the shelf is corrected through an ordinary stock adjustment, not through a pick.
- **The last unit is sold while a shopper is on the payment screen.** They may still complete payment
  for a quantity the shop no longer has (see Assumption A6). The line is flagged short at the moment of
  payment, so the shop sees it on opening the order rather than discovering it at the shelf.
- **A line flagged short at payment turns out to be on the shelf.** The picker gathers it normally and
  the flag clears; the count was understated, and the pick is what corrects it (FR-023).
- **Stock is read while the count is being changed.** A shopper never sees a negative count, and never
  sees a count that no adjustment produced.

---

## Requirements *(mandatory)*

### Functional Requirements

**Stock as a fact**

- **FR-001**: A product MUST be able to carry a whole-number count of units the owning shop currently
  has, which MUST never be negative.
- **FR-002**: Stock tracking MUST be opt-in per product. A product that is not tracked MUST behave in
  every respect as it does today, including being addable and buyable up to the existing per-line policy
  cap.
- **FR-003**: Turning tracking on MUST require a count to be supplied in the same action.
- **FR-004**: Stock MUST belong to the shop that owns the product. No shop may read or change another
  shop's stock, and a refusal MUST NOT disclose whether the product exists.
- **FR-005**: A shop MUST be able to set one low-stock threshold for its whole catalogue, and any
  product MUST be able to carry its own threshold instead. A product's own threshold, where set, wins.
  Thresholds are meaningful only while a product is tracked.
- **FR-005a**: Where a shop has set no default and a product carries no threshold of its own, no product
  counts as running low — but a product at zero is still reported as out of stock (FR-029).

**Managing stock**

- **FR-006**: A shop operator MUST be able to set a product's count to an exact value, and MUST be able
  to record an increase or decrease relative to the current value.
- **FR-007**: Every change to a count MUST record who made it, when, the value before and after, and a
  reason drawn from a **fixed, closed set**: stock received, a correction, damage, expiry, an order
  being paid, a pick shortfall, and tracking being turned on or off. Who made it — a shop operator,
  back-office, or the platform itself — is recorded separately from why, so that an assisted change is
  distinguishable from a shop's own without inventing a reason for it (FR-027).
- **FR-008**: The record of changes MUST be append-only. A movement, once written, is never edited or
  deleted, and the current count MUST always be explicable from the movements.
- **FR-009**: An operator MUST be able to read a product's movement history, most recent first.
- **FR-010**: Both shop roles MUST be able to manage stock, consistent with the platform's existing
  shop-floor model where the append-only record is the accountability control rather than a role gate.
- **FR-011**: Concurrent changes to one product MUST all be recorded, and the resulting count MUST
  reflect all of them.

**Availability**

- **FR-012**: Whether a product can be bought MUST be decided by **one rule**, defined once and used by
  every surface and every read that asks the question — storefront listings, product pages, search,
  cart, saved items and checkout. Two implementations of this rule MUST NOT exist.
- **FR-013**: A tracked product at zero MUST be treated as unavailable to buy, while remaining listed
  and visible.
- **FR-014**: An out-of-stock product MUST be distinguishable by the shopper from a product that is no
  longer sold — the first is something to wait for, the second is not.
- **FR-015**: No customer-facing surface may disclose which shop holds the stock, or how many shops hold
  a product. The unit count MUST NOT be shown anywhere a shopper is merely browsing — no persistent
  low-stock badge, no count on a tile, a listing or the product page.
- **FR-015b**: The refusal in FR-016 is the sole permitted exception, and there it is required, not
  optional: the cap already discloses that bound, so withholding the number removes only the shopper's
  ability to act on it.
- **FR-015a**: Availability MUST be current at three tiers. Listings, rails and search results MAY
  reflect a stock change up to 60 seconds late. The product detail page MUST reflect it as soon as it
  is made. The cart and the payment gate are authoritative and MUST re-check at the moment they act,
  never trusting a value carried from an earlier read.

**Buying**

- **FR-016**: Adding a tracked product to a cart, or changing its quantity, MUST be refused when the
  requested quantity exceeds what is available, and the refusal MUST state how many are available.
- **FR-017**: When a cart is read and a tracked line exceeds available stock, the line MUST be flagged,
  the payable amount MUST count only what is available, and the shopper MUST be told what changed.
- **FR-018**: Creating a payment MUST re-check availability at that moment, against the same rule as
  FR-012, and MUST NOT rely on a check made earlier in the session.
- **FR-019**: A cart in which no line can be supplied MUST NOT be able to reach payment, and MUST say
  why in terms the shopper can act on.
- **FR-020**: The amount a shopper is asked to pay MUST only ever cover quantities the platform believes
  are available at the moment the payment is created.

**Orders and fulfilment**

- **FR-021**: When an order becomes paid, the count of every tracked product in it MUST be reduced by
  the quantity ordered, in the same operation that records the payment, and MUST NOT be reduced again if
  that operation is repeated.
- **FR-022**: A reduction MUST NOT take a count below zero. Where the ordered quantity exceeds the
  count, the count MUST go to zero and the difference MUST be recorded as a shortfall against the
  affected order line at that moment, before picking begins, using the same shortfall representation a
  picker writes — never a second one meaning the same thing.
- **FR-022a**: A shortfall recorded at payment MUST be visible to the shop when it opens the order,
  flagged on the affected line, and MUST remain correctable: if the item is on the shelf after all, the
  picker gathers it and the flag clears, exactly as it would for any other line.
- **FR-023**: Recording that a picker could not find some of an ordered quantity MUST correct the
  product's count to reflect the shelf, and the movement MUST cite the pick as its cause.
- **FR-024**: Untracked products MUST produce no movements at any point in the order lifecycle.

**Back-office**

- **FR-025**: Any active back-office staff member MUST be able to view any shop's product stock and
  movement history.
- **FR-026**: Back-office staff at the appropriate permission level MUST be able to take every stock
  action a shop operator can — turning tracking on or off, setting a count, setting a threshold, and
  setting the shop-wide default — on the shop's behalf, and MUST supply a reason.
- **FR-027**: A back-office change MUST be attributed to the individual who made it and MUST be visibly
  distinguishable from a shop's own change, on the shop's own surfaces.
- **FR-028**: A back-office staff member without the required permission MUST be refused uniformly,
  regardless of shop or product.

**Visibility**

- **FR-029**: A shop MUST be able to see, in one place, every tracked product that is at or below its
  effective threshold — its own if set, otherwise the shop-wide default — and every tracked product at
  zero, with the two distinguished.
- **FR-030**: Stock and its history MUST be visible on **both** shop surfaces at parity, consistent with
  the platform's standing rule that the shop audience's two surfaces are kept at parity.

### Key Entities

- **Product stock** — the count a shop currently has of one product, whether that product is tracked at
  all, and an optional per-product threshold below which it counts as running low. One per product;
  belongs to the product's owning shop.
- **Shop stock settings** — the shop-wide default low-stock threshold, used by every tracked product
  that does not carry one of its own. One per shop.
- **Stock movement** — one append-only record of a change: the product, the value before and after, the
  reason, who or what caused it (an operator, a back-office staff member, a paid order, or a pick), and
  when. The current count is always explicable from these.
- **Availability rule** — the single definition of whether a product can be bought right now, combining
  the existing product lifecycle state with stock. Not stored; defined once and consumed everywhere.

---

## Success Criteria *(mandatory)*

- **SC-001**: A shop operator can turn on tracking, enter a count, and see it reflected on the
  storefront within one page refresh, without help from anyone else.
- **SC-002**: A shopper cannot complete a payment for more units of a tracked product than the shop
  holds, in **100%** of attempts across the cart, quantity-change and checkout paths.
- **SC-003**: With one unit remaining and two shoppers paying simultaneously, no count ever reads below
  zero, and the shop is notified of the shortfall before picking begins in 100% of cases.
- **SC-004**: For a shop that maintains its counts, the proportion of picks that end in a shortfall
  falls measurably against a baseline captured before this feature is switched on. ⚠ Measured by
  querying the pick records the platform already keeps — **no reporting screen is in scope**, and the
  baseline must be captured before deployment or the comparison is unmakeable afterwards.
- **SC-005**: For any product, the movement history fully accounts for the difference between its
  opening and current count, with no unexplained difference.
- **SC-006**: A product that has never had tracking turned on is indistinguishable from its pre-slice
  behaviour on every customer surface — confirmed by comparison, not assertion.
- **SC-007**: A back-office staff member can correct a shop's count in under 2 minutes from opening the
  console, and the shop can see who did it and why.
- **SC-008**: A shop operator can identify everything needing restock in a single view, in under 30
  seconds, without reading each product.
- **SC-009**: No customer-facing response, page or notification discloses shop identity or the number of
  shops, and no browse surface carries a stock count — verified by sweeping the responses of every
  customer surface. The FR-016 refusal is the sole place a count may appear.
- **SC-010**: An out-of-stock product and a withdrawn product are correctly told apart by 5 of 5
  observers shown only the customer-facing wording.
- **SC-011**: A stock change reaches the product detail page immediately and every listing, rail and
  search result within 60 seconds; the cart and the payment gate reflect it on their very next
  action, with no staleness window at all.
- **SC-012**: The availability rule exists in exactly one place — demonstrated by changing it once and
  observing every surface change together.

---

## Assumptions

- **A1 — Stock attaches to a product, not to a (product, shop) pair.** Products on this platform are
  already shop-owned: one row per shop-authored product, with shop ownership as the isolation key. Two
  shops selling the same thing are already two products. No separate per-shop inventory join is needed,
  and introducing one would be a second ownership model competing with the existing one.
- **A2 — Tracking is opt-in, and untracked means unlimited.** The alternative — every product tracked,
  with a count required — would turn the entire existing catalogue out-of-stock the moment it shipped,
  and would force a number onto shops not ready to maintain one. Opt-in makes the change non-breaking
  and lets a shop adopt it product by product.
- **A3 — Stock does not replace the existing "make unavailable" switch.** That switch is a deliberate
  operator decision to stop selling something; zero stock is a fact about the shelf. They answer
  different questions and both remain. Availability requires *both* to permit the sale.
- **A4 — A cart is not a promise, so nothing is held for one.** A shopper filling a cart reserves
  nothing. This matches the platform's existing treatment of price and availability in carts, where the
  cart is re-priced and re-validated on read and again at payment.
- **A5 — The payment moment is the gate.** Availability is checked when the payment is created, which
  is the last point before money moves and the last point at which refusing costs the shopper nothing
  but a message.
- **A6 — A residual oversell window is accepted and made visible rather than closed.** Between creating
  a payment and that payment succeeding, another shopper can take the last unit. Closing this needs
  reservations with expiry and a sweep to release them, and the platform has no sweep for abandoned
  checkouts at all today. Instead the deficit is recorded at payment and raised to the shop as a
  shortfall immediately — moving discovery from "a picker at a shelf, hours later" to "the moment the
  order arrives". Reservations are named as a future slice, not a silent omission.
- **A7 — Both shop roles may manage stock.** This follows the platform's existing shop-floor model,
  where both shop roles have full access to fulfilment actions and an append-only event record is the
  sole accountability control. A role gate here would be inconsistent with the surface it sits on.
- **A8 — Back-office changing stock follows the console's existing two-tier permission model:** viewing
  open to any active staff member including customer-service staff, changing restricted to the higher
  tier, decided from the platform's own staff record rather than from a token claim. Within that higher
  tier the powers are the shop's own, in full — the assisted path exists for when a shop cannot act, and
  a support call that cannot do the thing being asked for is not an assisted path. The control is
  attribution and visibility (FR-027), not a narrower set of actions.
- **A9 — A pick shortfall corrects stock rather than raising a separate discrepancy for approval.** The
  shelf is the truth, and a correction queue nobody works is worse than no queue.
- **A10 — An out-of-stock product stays listed.** Removing it would break saved lists, shared links and
  search results, and would erase the platform's ability to say "this is coming back" — a distinction
  the saved-items feature already draws and depends on.
- **A11 — Counts are whole units.** The catalogue is priced per item, not by weight; a weight-priced
  product is not modelled anywhere on the platform today.
- **A12 — Reduction happens at paid, not at order creation.** Orders awaiting payment linger
  indefinitely today with nothing to sweep them; reducing stock at creation would let abandoned
  checkouts consume a shop's inventory permanently.

---

## Dependencies

- **Shop product catalogue** — stock attaches to the existing shop-owned product, its lifecycle states
  and its shop-isolation rule. No change to what a product *is*.
- **Shop fulfilment / picking** — the existing shortfall recording is the correction path in Story 3.
  This slice reads and extends that seam; it does not replace it.
- **The paid transition** — the single transaction that turns an order paid and fans it out to shops is
  where the reduction belongs. It is the strongest part of the platform and this slice must not weaken
  it: the reduction must be idempotent, must not be able to fail the transaction, and must not add a
  dependency on anything outside the database.
- **Both shop surfaces** — the shop console and the shop mobile app both already display an "Inventory —
  coming soon" placeholder on a product. This slice is what those two placeholders were reserved for.
- **Back-office console** — the shop management area is the natural home for the assisted path.

**Recorded, not owned by this slice:**

- **G3 — the money path for a shortfall.** Still open. Fewer shortfalls, discovered earlier, is progress
  toward it and not a substitute for it.
- **⚠ Substitutions.** The platform's published Food Safety notice tells customers they can decline
  substitutions at checkout and describes the consequences of accepting one. **No such capability
  exists.** This slice does not create the contradiction and does not resolve it; it must be resolved by
  a slice that either builds substitutions or corrects the prose, because a published legal document
  currently describes behaviour the product does not have.
- **Cancellation and refunds** must return stock when they land. The movement record is shaped to accept
  that cause without change.
- **Reservations with expiry**, and the abandoned-checkout sweep they would depend on.
