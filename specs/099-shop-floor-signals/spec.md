# Feature Specification: Shop Floor Signals - Collection, Pick Order, Availability and Quality

**Feature Branch**: `099-shop-floor-signals`

**Created**: 2026-10-24

**Status**: Signed off by the operator, 2026-10-24

**Input**: User description: "Shop console: collection, pick order, availability and quality. The redesigned shop console (docs/shop-web-redesign-brief.md §11, canvas docs/reference-screens/Effy Shop Console Redesign) marks four things "Needs backend". (1) Next collection: shop staff see when the next Effy collection run reaches their shop, which of their orders go on it (ready vs still picking), and whether a driver is on the way - on Today, the Orders queue and an order's page ("Ready by 12:30 · collected on the 12:30 run · driver on the way"); a courier pickup shows its own time. (2) Pick in walking order: an order's lines are grouped Ambient · Chilled · Frozen with cold items last, using each item's temperature class. (3) Availability: one quick screen listing every size the shop sells with its stock count and an on-sale switch, so staff can take a size off sale in one tap (off sale stays immediate, no review). (4) Quality on Insights: found rate, can't-supply rate and average time from paid to ready, for the selected range. A shop still never sees delivery money, windows or other shops; it is told only "Effy driver" or "Courier"."

## Context

The shop console was redesigned on 2026-10-24 (the "Effy Shop Console Redesign" canvas). Four parts of
that design were drawn with a dashed "Needs backend" marker because the console is not yet told the
facts they show. Everything else in the redesign is already built. This feature supplies those four
facts and shows them where the design puts them. It changes nothing a customer, a driver or
back-office sees.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know when the next collection comes (Priority: P1)

A shop worker at the packing bench needs to know how long they have. Today, the Orders queue and an
order's page say when Effy's next collection run reaches this shop, how many of this shop's orders are
due on it (how many are ready and how many are still being picked), and whether a driver has set off.
An order going with an Effy driver says which run collects it ("Ready by 12:30 · collected on the 12:30
run"). An order a courier collects from the shop keeps showing the courier's own pickup time instead.

**Why this priority**: Missing a run makes an order late for the customer and costs a driver a wasted
stop. It is the question staff ask most often, and today the console cannot answer it.

**Independent Test**: With a collection schedule configured and two paid Effy-driver orders at a shop -
one ready, one being picked - open Today: it shows the next run's time, "1 ready · 1 still picking",
and each order's page names that run.

**Acceptance Scenarios**:

1. **Given** a shop with orders due on the 12:30 run, **When** a worker opens Today, **Then** a "Next
   collection" panel shows "12:30 pm", "Effy driver", how many of those orders are ready and how many
   are still being picked, and a progress bar of ready over due.
2. **Given** a driver has been given the 12:30 run but has not set off, **When** the panel is shown,
   **Then** it says a driver is assigned; **once** the driver has set off toward the shops, it says
   "Driver on the way".
3. **Given** an order going with an Effy driver, **When** a worker opens it, **Then** its summary reads
   "Ready by {time} · collected on the {time} run".
4. **Given** an order a courier collects from the shop, **When** a worker opens it or sees it in the
   queue, **Then** it shows the courier's pickup time and never an Effy run.
5. **Given** no collection run is left today for this shop, **When** Today is shown, **Then** the
   panel says when the next run is (the next working day) or that none is scheduled, never a blank.
6. **Given** a run is collected (its driver has picked up from this shop), **When** the panel next
   updates, **Then** it moves on to the following run without anyone refreshing the page.

---

### User Story 2 - Pick in walking order (Priority: P2)

A picker works through an order from the shelves to the fridge to the freezer. On an order's page the
pick list is grouped Ambient, then Chilled, then Frozen, with a one-line hint on each group ("pick
first", "pick last, straight into the chilled bag"), so cold items spend the least time out.

**Why this priority**: It saves walking and protects cold goods, but an ungrouped list still works.

**Independent Test**: Open an order with a dry, a chilled and a frozen item: the lines appear under
three group headings in that order, and ticking, adjusting and scanning work exactly as before.

**Acceptance Scenarios**:

1. **Given** an order with items of all three temperatures, **When** the pick list is shown, **Then**
   its lines are grouped Ambient, Chilled, Frozen in that order, each group under its heading.
2. **Given** an order whose items are all one temperature, **When** the pick list is shown, **Then**
   it shows that one group (no empty headings).
3. **Given** an item whose temperature is not known, **When** the pick list is shown, **Then** it is
   listed under Ambient.
4. **Given** the printed pick list, **When** it is printed, **Then** it uses the same grouping.

---

### User Story 3 - Take a size off sale in one tap (Priority: P2)

When the shelf runs out, staff need to stop customers ordering it at once. Catalog gains an
**Availability** view: every size the shop sells, one row each - product, size, stock on hand (or "Not
counted"), and an on-sale switch. It opens on the sizes that need a look (out of stock or running low). Switching a size off takes it off sale immediately, without Effy's
review, exactly as the product page already does. Staff can search it and switch between Needs a look, Out of stock, Low
stock, Off sale and Everything.

**Why this priority**: Off sale already exists one product at a time; this makes it fast on a busy
floor.

**Independent Test**: Open Availability, find a size by name, switch it off: it is off sale at once,
the product page agrees, and the customer storefront no longer offers it.

**Acceptance Scenarios**:

1. **Given** a shop with products in several sizes, **When** a worker opens Availability, **Then**
   every on-sale and off-sale size of every live or unavailable product is listed with its stock.
2. **Given** a size on sale, **When** the worker switches it off, **Then** it is off sale immediately
   and stays off until someone switches it back on.
3. **Given** the last size on sale of a product, **When** the worker tries to switch it off, **Then**
   the switch is refused with the reason ("The last size on sale - make the product unavailable
   instead") and a way to the product.
4. **Given** a draft, in-review or archived product, **When** Availability is shown, **Then** it is
   not listed (it is not on sale to change).
5. **Given** a worker types part of a name, code or barcode, **When** they search, **Then** only
   matching sizes are listed.
6. **Given** a second person changes a size, **When** the first person's Availability view is open,
   **Then** it shows the change without being refreshed.

---

### User Story 4 - See how well the shop fulfils (Priority: P3)

A shop manager wants to know whether the shop is getting better at supplying what customers order.
Insights shows three quality figures for the selected range (today, last 7 days, last 30 days), each
compared with the previous period in the same way as the other figures: **Found rate** (the share of
ordered units the shop supplied), **Can't-supply rate** (the share of orders the shop could not supply
at all), and **Average time to ready** (from payment to marked ready).

**Why this priority**: Useful for improving, not needed to get today's orders out.

**Independent Test**: For a range with ten units ordered and nine supplied, one of five orders marked
can't supply, and known ready times, Insights shows 90%, 20% and the right average.

**Acceptance Scenarios**:

1. **Given** a range with fulfilled orders, **When** Insights is shown, **Then** the three figures
   appear in the figures strip with their comparison to the previous period.
2. **Given** a range with no orders, **When** Insights is shown, **Then** each figure reads "-" with
   "No orders in this window yet", never 0% or 100%.
3. **Given** an order the customer cancelled, **When** the figures are worked out, **Then** it counts
   in none of them (the shop was not asked to supply it).
4. **Given** an order not yet ready, **When** the average time to ready is worked out, **Then** it is
   left out until it is ready.

### Edge Cases

- A shop with no collection schedule configured: the panel says "No collection runs are set up for
  your shop yet - Effy will add them", not a time.
- An order paid after the last run that can reach it today: it names the next working day's run.
- A run reassigned to another driver, or unassigned again: the "on the way" line follows the current
  state.
- An order moved between Effy driver and Courier by back-office: it switches between run and courier
  pickup on its next update.
- An order with items in a temperature the bag counts disagree with: the pick list grouping is by
  item, and bags are unchanged.
- Availability with hundreds of sizes: it stays usable (searchable, paged or virtualised); switching
  one never reloads the whole list.
- Switching a size off while a customer is checking out: the platform's existing off-sale rule
  applies; this feature adds no new rule.
- A shop with one product sold in one size: that size's switch is refused as "the last size on sale".
- Quality figures for "today" early in the morning: they show "-" until something has happened.
- Staff role: every figure and the Availability switches are available to both shop roles, as the
  product page's switch already is.

## Requirements *(mandatory)*

### Functional Requirements

**Next collection**

- **FR-001**: The console MUST show the next Effy collection run due to reach this shop: its time in
  the shop's local time, and that it is an Effy driver.
- **FR-002**: The console MUST show how many of this shop's orders are due on that run, split into
  ready and still being picked, and a progress indication of ready over due.
- **FR-003**: The console MUST say whether a driver is assigned to that run and whether the driver has
  set off ("Driver on the way"); it MUST NOT show the driver's location, route or other stops.
- **FR-004**: Each Effy-driver order MUST show the run expected to collect it ("collected on the 12:30
  run") on its page, in the Orders queue and in Today's live orders.
- **FR-005**: An order a courier collects from the shop MUST show the courier's pickup time and MUST
  NOT be counted on, or shown against, an Effy run.
- **FR-006**: When no run is left today the console MUST name the next one and its day; when none is
  configured it MUST say so in one sentence.
- **FR-007**: The collection facts MUST update on screen when they change (an order becomes ready, a
  driver sets off, a run is collected) without the page being refreshed and without the console asking
  on a timer.
- **FR-008**: The shop MUST be told only "Effy driver" or "Courier" about who collects - never a
  delivery window, a delivery speed, a delivery fee, another shop or a customer's delivery time.

**Pick order**

- **FR-009**: Each line of an order MUST carry its item's temperature: Ambient, Chilled or Frozen.
  An item whose temperature is unknown MUST be treated as Ambient.
- **FR-010**: The pick list on an order's page MUST group lines Ambient, Chilled, Frozen, in that
  order, each group with its heading and a one-line hint; groups with no lines MUST NOT be shown.
- **FR-011**: The printed pick list MUST use the same grouping and order.
- **FR-012**: Grouping MUST NOT change how lines are picked, adjusted, scanned or counted.

**Availability**

- **FR-013**: Catalog MUST offer an Availability view listing every size of every product that is
  live or unavailable: product name, size, the shop's code, stock on hand (or "Not counted", or "Out
  of stock"), and an on-sale switch.
- **FR-014**: Switching a size off MUST take it off sale immediately, without Effy's review; switching
  it on MUST put it back on sale immediately. This MUST be the same rule the product page applies.
- **FR-015**: Switching off the last size on sale of a product MUST be refused with the reason and a
  link to the product.
- **FR-016**: The view MUST be searchable by product name, size, the shop's code and barcode, and
  MUST offer the views "Needs a look" (out of stock or low, the default), "Out of stock", "Low stock",
  "Off sale" and "Everything", each with its count.
- **FR-017**: The view MUST reflect changes made elsewhere (another person, the product page, stock
  received) without being refreshed and without asking on a timer.
- **FR-018**: Each switch MUST be recorded with who made it and when, as off/on sale changes already
  are.

**Quality on Insights**

- **FR-019**: Insights MUST show Found rate: units supplied divided by units ordered, over orders in
  the range that the shop finished (ready, collected, delivered or can't supply).
- **FR-020**: Insights MUST show Can't-supply rate: orders marked can't supply divided by orders the
  shop finished in the range.
- **FR-021**: Insights MUST show Average time to ready: the mean time from payment to marked ready,
  over orders that became ready in the range.
- **FR-022**: Orders the customer cancelled MUST be left out of all three figures.
- **FR-023**: Each figure MUST be compared with the previous period in the way the existing figures
  are, with its direction in words or a glyph, never by colour alone; an empty range MUST read "-".
- **FR-024**: The figures MUST cover this shop's own items only, never another shop's.

### Key Entities

- **Collection run**: a scheduled time an Effy driver collects from shops and takes their packages to
  the hub. For a shop: its time, its day, whether a driver is assigned, whether the driver has set off,
  and whether it has collected from this shop.
- **Order's collection**: for an Effy-driver order, the run expected to collect it; for a courier
  order, the courier's pickup time.
- **Line temperature**: Ambient, Chilled or Frozen, taken from the item.
- **Sellable size**: a size of a live or unavailable product, with its stock and on-sale state.
- **Quality figures**: found rate, can't-supply rate and average time to ready for a shop over a range,
  with the previous period's values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shop worker can tell when the next collection is and how many orders are ready for it
  within 5 seconds of opening Today, without opening another screen.
- **SC-002**: In a walk-through of 20 orders, every Effy-driver order names the same run on Today, in
  the queue and on its page, and no courier order names an Effy run.
- **SC-003**: Collection facts on screen change within 10 seconds of the underlying change (an order
  ready, a driver setting off, a run collected), with no page refresh.
- **SC-004**: A worker can find a size and take it off sale in under 15 seconds from the Catalog page,
  and it is gone from the customer storefront the next time a customer looks.
- **SC-005**: For a test range with known orders, all three quality figures match a hand count exactly.
- **SC-006**: No shop screen shows a delivery window, delivery speed, delivery fee, driver location,
  another shop or a customer's delivery time (checked by the existing wording checks and a review of
  every new screen).

## Assumptions

- The collection schedule and driver assignment already exist (collection runs, driver work
  assignment); this feature only tells shops about them. Back-office configures runs as it does today.
- "Driver on the way" means the driver has started the collection run; no live location or arrival
  estimate is shown (the platform tracks no positions).
- The driver's name is not shown to the shop; the shop is told "Effy driver".
- Item temperature classes already exist for products (driver manifests use them); "normal" is shown
  to shops as "Ambient".
- Availability lists sizes, not products, because stock and on-sale are kept per size.
- Off sale and on sale keep today's rule: immediate, no review, at least one size must stay on sale.
- The quality figures use the same range and comparison basis as the existing Insights figures.
- The "Late" limit on waiting orders and the shop's "pause" or "busy" mode are out of scope (the brief
  leaves the limit to the operator and does not adopt pause).
- Camera scanning already exists in the console and is not part of this feature.
