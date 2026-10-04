# Feature Specification: Driver Item Manifest & Temperature Classes

**Feature Branch**: `065-driver-item-manifest`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Driver order item details with temperature classes" — client feedback
round of October 2026, requirement R5 in
[docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md).

## Why this slice exists

**A driver carries goods they cannot see into, and nothing tells them which of those goods will
spoil.**

At a shop, the driver is shown a package and a count of the items inside it — not what the items
are. At the customer's door there is no item list at all: the driver hands over sealed packages
identified by an order reference. Two consequences follow:

1. **Cold goods are handled like shelf goods.** Effy sells frozen and chilled food. The platform
   already knows which products those are, and already uses that knowledge to choose a vehicle that
   can carry them. The one person physically loading the vehicle is never told. A bag of frozen
   goods can sit in the ambient compartment for a whole round and nobody finds out until the
   customer opens it.
2. **The driver cannot answer the customer's first question.** "Is everything here?" has no answer
   when the driver's screen shows a package count. If the shop could not supply an item, the driver
   does not know that either.

The client asked for this directly: drivers should see the complete list of items in an order, with
each item clearly identified as **Frozen**, **Chilled** or **Normal**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know what needs the cold compartment at pickup (Priority: P1)

A driver arrives at a shop on a collection run. Before lifting anything, they can see for each
package how many frozen, chilled and normal items it holds, and can open the package to see every
item by name, quantity and temperature class. They load frozen and chilled goods into the right
part of the vehicle.

**Why this priority**: Pickup is where the goods first enter Effy's custody and where the loading
decision is made. A mistake here lasts the whole journey, and it is the only point at which the
driver can still put a package in the right place.

**Independent Test**: Assign a driver a collection run containing a package with one frozen, one
chilled and one normal item. Confirm the stop shows the three-way summary without opening the
package, and that opening it lists all three items with their class.

**Acceptance Scenarios**:

1. **Given** a package holding frozen, chilled and normal items, **When** the driver views the shop
   stop, **Then** the package shows a summary count for each class that is present, without the
   driver opening it.
2. **Given** the same package, **When** the driver opens it, **Then** every item is listed with its
   name, quantity and class, with frozen items first, chilled second and normal last.
3. **Given** a package holding only normal items, **When** the driver views the stop, **Then** the
   summary says so and no cold-handling signal is shown.
4. **Given** a shop stop with several packages, **When** the driver views it, **Then** packages
   containing frozen or chilled items are distinguishable at a glance from those that do not.
5. **Given** a package bound for standard delivery that the driver only carries to the hub,
   **When** the driver views it at pickup, **Then** it shows the same item list and classes as a
   same-day package.

---

### User Story 2 - See what is being handed over at the door (Priority: P1)

A driver arrives at a customer's address on a same-day round. The drop shows every item being
delivered, with its class, so the driver can take the right packages out of the right compartment,
hand cold goods over first, and tell the customer what they are receiving.

**Why this priority**: Equal-first with US1. The client's request is about the order's items being
visible to the driver, and the drop is where an order is one thing again — packages from several
shops arrive together as one delivery.

**Independent Test**: Take a same-day drop made up of packages from two shops. Confirm the drop
lists every item across both packages with its class, shows a combined summary, and nowhere names
either shop.

**Acceptance Scenarios**:

1. **Given** a drop made of one package, **When** the driver opens the drop, **Then** every item in
   it is listed with name, quantity and class.
2. **Given** a drop made of packages collected from two shops, **When** the driver opens the drop,
   **Then** the items of both packages are listed, grouped by package, and no shop is identified.
3. **Given** a drop containing frozen or chilled items, **When** the driver views the round's list
   of drops, **Then** that drop carries the class summary without being opened.
4. **Given** any drop, **When** the driver views its items, **Then** no price, discount or order
   total appears anywhere.

---

### User Story 3 - The list matches the bag (Priority: P2)

A shop could not supply everything that was ordered. The driver's item list reflects what the shop
actually packed: an item that was not supplied is shown as not included, and an item supplied in a
smaller quantity shows the quantity that is in the bag.

**Why this priority**: A list that disagrees with the bag is worse than no list. It invites the
driver to tell a customer something is there when it is not, and it turns a known shortfall into an
apparent delivery error.

**Independent Test**: Have a shop mark one line unavailable and part-supply another, then mark the
package ready. Confirm the driver's list shows the first as not included and the second at the
supplied quantity, at both pickup and drop.

**Acceptance Scenarios**:

1. **Given** an item the shop marked unavailable, **When** the driver views the package, **Then**
   the item appears marked as not included and is excluded from the class summary.
2. **Given** an item the shop supplied in part, **When** the driver views the package, **Then** the
   quantity shown is the quantity supplied.
3. **Given** a package in which every item was supplied, **When** the driver views it, **Then**
   nothing is marked as not included.

---

### User Story 4 - What the driver is told does not change after purchase (Priority: P2)

A shop edits a product's storage requirement after an order containing it has been placed. The
driver carrying that order still sees the class the product had when the customer bought it.

**Why this priority**: The class describes goods that are already picked and packed. A later edit
to the catalogue describes future stock, not the bag in the van, and must not rewrite a record of
what was sold.

**Independent Test**: Place an order for a chilled product, change the product to normal, and
confirm the driver's list for that order still says chilled while a new order for the same product
says normal.

**Acceptance Scenarios**:

1. **Given** an order placed while a product was chilled, **When** the product is later changed to
   normal, **Then** the driver's list for that order still shows chilled.
2. **Given** the same change, **When** a new order is placed afterwards, **Then** the driver's list
   for the new order shows normal.

---

### Edge Cases

- **A product with no storage requirement recorded.** It is treated as Normal. This is the client's
  stated rule, and most non-food products have no storage requirement at all.
- **An order placed before this feature existed.** No class was recorded at purchase. The item is
  shown with its class stated as not recorded, never as Normal: claiming a frozen item is normal
  would be the exact harm this slice exists to prevent.
- **A package with many items.** The summary stays readable and the list scrolls; no item is
  dropped to make the list fit.
- **A very long product name.** It wraps or truncates without hiding the quantity or the class.
- **The same product on two lines of one order.** Each line is shown; quantities are not merged in
  a way that hides a part-supplied line.
- **A package in which nothing was supplied.** It is shown as holding no items rather than as an
  empty or broken list.
- **No connection at the shop or the door.** Items already loaded for the current round remain
  readable; the driver is never shown an empty list as though the package were empty.
- **Colour-blind driver, or bright sunlight on the screen.** The class is still readable, because
  it is carried by a word and an icon.
- **Large text setting.** The class label and quantity remain visible and unclipped.

## Requirements *(mandatory)*

### Functional Requirements

**Item list**

- **FR-001**: At a shop pickup, the driver MUST be able to see every item in each package they are
  collecting: the item's name, its quantity and its temperature class.
- **FR-002**: At a customer drop, the driver MUST be able to see every item in the packages being
  delivered at that drop, with the same three facts per item.
- **FR-003**: Where a drop is made of more than one package, items MUST be grouped by package so
  the driver can match the list to the physical packages.
- **FR-004**: The item list MUST be available for both same-day and standard packages at pickup.
- **FR-005**: No item ordered MUST be omitted from the list for reasons of space or length.

**Temperature class**

- **FR-006**: Every item MUST be shown with exactly one of three classes: **Frozen**, **Chilled**
  or **Normal**.
- **FR-007**: An item's class MUST be derived from the storage requirement recorded for its
  product: frozen is Frozen, chilled is Chilled, and ambient is Normal.
- **FR-008**: An item whose product has no storage requirement recorded MUST be shown as Normal.
- **FR-009**: An item's class MUST be recorded when the order is placed, and what the driver sees
  MUST come from that record, so that a later change to the product does not change it.
- **FR-010**: An item on an order placed before classes were recorded MUST be shown with its class
  stated as not recorded, and MUST NOT be shown as Normal.
- **FR-011**: The class MUST be conveyed by a word together with an icon. Colour MAY reinforce it
  but MUST NOT be the only thing distinguishing one class from another.
- **FR-012**: Within a package, items MUST be ordered frozen first, then chilled, then normal.

**Summary**

- **FR-013**: Each package MUST carry a summary of how many items of each class it holds, visible
  without opening the package.
- **FR-014**: Each drop MUST carry the same summary across all its packages, visible in the list of
  drops without opening the drop.
- **FR-015**: A class with no items MUST be left out of the summary rather than shown as zero.
- **FR-016**: The summary MUST count only items that are actually in the package.

**Agreement with what was packed**

- **FR-017**: An item the shop recorded as unavailable MUST be shown as not included.
- **FR-018**: An item the shop supplied in part MUST be shown with the quantity supplied.
- **FR-019**: A package in which nothing was supplied MUST be shown as holding no items.

**What the driver must not see**

- **FR-020**: The driver MUST NOT be shown any price, discount, fee or order total.
- **FR-021**: At a customer drop, the driver MUST NOT be shown the identity of any shop that
  supplied the goods.
- **FR-022**: The item list MUST be visible only to the driver the work is assigned to.

**Consistency**

- **FR-023**: The item list, classes and summaries MUST behave the same on both driver platforms.
- **FR-024**: The item list for the driver's current work MUST remain readable when the device has
  no connection.
- **FR-025**: A failure to load the item list MUST be shown as a failure the driver can retry, and
  MUST NOT be presented as an empty package.

### Key Entities *(include if feature involves data)*

- **Order line**: one product bought in one order, with its name and quantity as sold. Gains a
  temperature class recorded at purchase, which never changes afterwards.
- **Temperature class**: Frozen, Chilled or Normal, plus "not recorded" for lines sold before this
  feature. Derived once from the product's storage requirement.
- **Package**: one shop's portion of one order, as the driver carries it. Presents its lines, the
  outcome of picking for each, and a class summary.
- **Drop**: one customer delivery made of one or more packages. Presents the lines of all its
  packages and a combined class summary.
- **Pick outcome**: what the shop recorded for a line — supplied in full, supplied in part, or
  unavailable. Determines what the driver's list says is in the bag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an order containing one frozen, one chilled and one normal item, the driver sees
  three lines carrying three different class labels, at pickup and at the drop.
- **SC-002**: A driver can tell whether a package contains frozen or chilled goods in under 3
  seconds from arriving at the stop screen, without opening the package.
- **SC-003**: In a test of 20 packages with mixed contents, a driver sorts every package into the
  correct compartment using the screen alone.
- **SC-004**: With the screen shown in greyscale, a tester identifies the class of every item
  correctly.
- **SC-005**: For 100% of packages with a recorded shortfall, the driver's list agrees with what
  the shop recorded as supplied.
- **SC-006**: Changing a product's storage requirement changes the class shown for zero existing
  orders.
- **SC-007**: Across every driver screen, zero prices appear and zero shop identities appear on a
  customer drop.
- **SC-008**: Zero items sold before this feature are shown as Normal without that having been
  recorded.
- **SC-009**: The item list for a 30-item package opens in under 2 seconds on a typical mobile
  connection, and opens with no connection once the round has been loaded.
- **SC-010**: The same order shows the same items, classes and summary on both driver platforms.

## Assumptions

- **Drivers see items for standard packages too.** They collect those packages and carry them to
  the hub, so the loading decision applies to them equally. Their item list is shown at pickup; they
  have no customer drop in the driver app.
- **"Normal" is the client's word for ambient.** The product catalogue calls it ambient; drivers
  are shown Normal.
- **A missing storage requirement means Normal**, as the client stated. Making the storage
  requirement compulsory for more kinds of product is a catalogue rule and belongs to the
  product-approval slice.
- **The shop's picking record is the truth about what is in the bag.** The driver's list reports
  it; the driver does not re-check or correct it.
- **The summary counts order lines' quantities**, so "2 frozen" means two frozen units, matching
  how the existing item count is expressed.
- **Product names are shown as sold**, taken from the order rather than the current catalogue, for
  the same reason the class is.
- **The driver's work and the round it belongs to are as defined by the existing driver operation**
  (collection run, hub check-in, same-day delivery round). This slice adds to what those screens
  show and changes nothing about how work is assigned or completed.

## Out of Scope

- Photographs of items.
- Scanning or ticking off individual items at pickup or at the door.
- Recording or monitoring the temperature of goods or compartments.
- Letting the driver report a missing or damaged item against a specific line.
- Making the storage requirement compulsory for more product types.
- Showing temperature classes to customers, shops or back-office staff.
- Changing which vehicle or driver is assigned work on the basis of class; the planner already does
  this.
