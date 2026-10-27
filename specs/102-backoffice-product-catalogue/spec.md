# Feature Specification: Back-Office Product Catalogue

**Feature Branch**: `102-backoffice-product-catalogue`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "In the back office, users should be able to see the product list for all
the shops we have, with a good UI in the relevant page, and back-office users can manage those products
as well." Operator decisions, 2026-10-27: Effy controls whether a product sells and at what margin, and
the shop keeps owning its product's content; Effy can hold a product off sale until Effy releases it; Effy
can create products for a shop, one at a time or from a bulk list the shop hands over.

## Why this slice exists

**Effy sells every product under its own name, and it can only see the ones waiting for it.**

Back-office today sees a product when it needs a decision: in the review queue, in "Margin not set", in
"Missing details". Once a product is approved it disappears from view. Three consequences follow:

1. **No one at Effy can answer "what are we selling?"** There is no place to look up a product a
   customer complains about, to see what one shop sells, or to find every chilled product in an aisle.
2. **Effy cannot stop a product.** If a product turns out to be wrong — recalled, mislabelled, priced
   wildly — the only person who can take it off sale is the shop. Effy's name is on it; Effy has no
   switch.
3. **Shops that cannot type their catalogue cannot sell.** A shop joining Effy often has a list of
   hundreds of products in a spreadsheet and asks Effy to set them up. Today the only way in is the
   shop typing each product into its own console.

### Decisions already made (operator, 2026-10-27)

- **The shop owns its product's content.** Name, description, pictures and details stay the shop's to
  change, through the existing change review. Effy does not rewrite an existing product.
- **Effy owns whether a product sells and at what margin.** Effy can hold a product off sale, set its
  margin, set where else it is shown, put one size on or off sale and adjust stock.
- **A hold lasts until Effy releases it.** It never expires on its own, and the shop cannot undo it.
- **Effy can create products for a shop**, one at a time or by importing a list the shop provides.
  Those products belong to the shop, exactly as if the shop had made them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every product in one place (Priority: P1)

A back-office staff member opens **Products**. They see every product of every shop in one list: its
picture, name, brand, shop, category, number of sizes, the shop price, the customer price, the margin,
where it stands (on sale, in review, held, …) and whether it is low on stock. They search by name or
code, narrow to one shop or one aisle, filter by state, and sort. They open a product and see everything
about it.

**Why this priority**: It is what was asked for first, and every other story acts on a product found
here. It is useful alone: support staff can answer "what is this product?" the day it ships.

**Independent Test**: With products from three shops in several states, open Products; confirm every
product appears once, the counts per state add up to the total, and each filter and search narrows the
list correctly. Open one product and confirm every section is filled.

**Acceptance Scenarios**:

1. **Given** products in several shops, **When** staff open Products, **Then** every product of every
   shop is listed, newest change first, with the shop it belongs to on each row.
2. **Given** the list, **When** staff type part of a product's name, its size code (SKU) or its
   barcode, **Then** only matching products are shown.
3. **Given** the list, **When** staff choose an aisle, **Then** products filed in that aisle and in any
   aisle below it are shown.
4. **Given** the list, **When** staff choose a state tab — All, On sale, In review, Change pending, Held
   by Effy, Off sale, Draft, Archived — **Then** only products in that state are shown, and each tab
   shows how many products it holds under the current search and filters.
5. **Given** the list, **When** staff filter by shop, storage (room temperature, chilled, frozen),
   margin set or not set, missing required details, or low stock, **Then** the filters combine.
6. **Given** a filtered, sorted list, **When** staff copy the page address and open it elsewhere,
   **Then** the same filters, sort and tab are shown.
7. **Given** a product, **When** staff open it, **Then** they see its overview (pictures, name, brand,
   descriptions, shop, home aisle and also-shown-in aisles, storage, GST, 18+ label, state), each size
   with its codes, shop price, customer price, weight, stock and on-sale state, its details, and its
   history.
8. **Given** a shop's page in back-office, **When** staff follow its products link, **Then** Products
   opens filtered to that shop.
9. **Given** a customer-service staff member, **When** they open Products or a product, **Then** they
   see everything and are offered no action that changes anything.

---

### User Story 2 - Effy holds a product off sale (Priority: P1)

A product is found to be wrong. An admin or manager opens it, chooses **Hold**, and writes why. The
product leaves the storefront at once. The shop sees "Held by Effy" with the reason and is told. The
shop cannot put it back on sale. When the problem is fixed, staff **Release** it and it returns to the
state it was in before.

**Why this priority**: Equal-first. It is the one control Effy is missing entirely, and the reason
"manage" was asked for.

**Independent Test**: Hold a product that is on sale; confirm a customer can no longer find, open or
buy it, the shop sees the reason and cannot put it back on sale, and the hold shows in the product's
history. Release it; confirm it is on sale again.

**Acceptance Scenarios**:

1. **Given** a product on sale, **When** staff hold it, **Then** a reason is required, and once held a
   customer cannot find it, open it by its link, or add it to a cart.
2. **Given** a held product already in a customer's cart, **When** the customer checks out, **Then**
   it is treated exactly like a product the shop took off sale.
3. **Given** a held product, **When** the shop opens it, **Then** it sees "Held by Effy" and the
   reason, shown as from Effy, not from a named person.
4. **Given** a held product, **When** the shop tries to put it, or any of its sizes, on sale by any
   means, **Then** it cannot, and is told the product is held by Effy.
5. **Given** a held product, **When** the shop edits its content, **Then** the edit goes through the
   usual change review, and approving that change does not release the hold.
6. **Given** a held product, **When** staff release it, **Then** it returns to the state it had when it
   was held (on sale, off sale or draft), and the shop is told.
7. **Given** a hold or a release, **When** it is made, **Then** the shop is notified in its console and
   by its notification channel, and the product's history records who did it, when and why.
8. **Given** a product held for any length of time, **When** no one releases it, **Then** it stays held.

---

### User Story 3 - Effy creates a product for a shop (Priority: P2)

A shop asks Effy to add a product it cannot set up itself. An admin or manager chooses **New product**,
picks the shop, and fills in the same form a shop uses: home aisle, name, descriptions, pictures, the
aisle's details, sizes and prices. The product is created for that shop, recorded as created by Effy.

**Why this priority**: It unblocks shops that need help, but no product already on sale depends on it.

**Independent Test**: Create a product for a shop from back-office; confirm the shop sees it among its
own products, marked as created by Effy, and that it follows the same rules (required details, a main
picture, sizes and prices) as a product the shop made.

**Acceptance Scenarios**:

1. **Given** an active shop, **When** staff create a product for it, **Then** the product belongs to
   that shop and appears in the shop's console as its own.
2. **Given** the form, **When** staff choose an aisle that has aisles below it, **Then** they are asked
   to choose one with none below (the same rule shops have).
3. **Given** a product missing a required detail or a main picture, **When** staff try to finish it,
   **Then** they are told what is missing, exactly as a shop would be.
4. **Given** a product Effy created, **When** staff finish it, **Then** it is approved as made — its
   margin is required at creation — and goes on sale as soon as it is complete (every required detail
   and a main picture); it never enters the review queue. *(Operator, 2026-10-27.)*
4a. **Given** an Effy-created product that is not yet complete, **When** staff open it, **Then** they
   can finish it (add pictures, fill any detail); the moment it first goes on sale its content becomes
   the shop's like any other product's, and later content changes go through the shop's change review.
5. **Given** a product Effy created, **When** anyone looks at its history, **Then** it says Effy created
   it, who and when.
6. **Given** a shop that is not active, **When** staff try to create a product for it, **Then** they
   cannot.

---

### User Story 4 - Effy imports a shop's product list (Priority: P2)

A shop sends Effy a spreadsheet of its products. Staff choose the shop, download Effy's import template,
fill or paste the shop's list into it, and upload it. Before anything is created, every row is checked
and shown: which rows are ready, and for each row that is not, exactly what is wrong. Staff fix the file
and upload it again, or leave the bad rows out, and then create the ready ones in one step.

**Why this priority**: The bulk path is what makes onboarding a shop with hundreds of products
practical, but it builds on Story 3's rules.

**Independent Test**: Upload a list of 50 rows for a shop with 5 deliberately wrong rows; confirm the
check lists exactly those 5 with a reason each and creates nothing. Create the 45 ready rows; confirm
45 products exist for that shop, each recorded as created by Effy from that import.

**Acceptance Scenarios**:

1. **Given** the import screen, **When** staff download the template, **Then** it explains each column,
   including how to give the aisle, the details and several sizes of one product.
2. **Given** an uploaded list, **When** it is checked, **Then** nothing is created yet, and every row is
   shown as ready or not ready with each problem named (unknown aisle, aisle with aisles below it,
   missing required detail, a value that does not fit its detail, a bad price, a duplicate code, …).
3. **Given** several rows that are sizes of one product, **When** the list is checked, **Then** they are
   shown and created as one product with those sizes.
4. **Given** a checked list, **When** staff create it, **Then** only ready rows are created, the rest
   are left out, and staff see how many were created and which were left out.
5. **Given** a list where a size code or barcode already exists in that shop, **When** it is checked,
   **Then** that row is not ready and names the existing product.
6. **Given** a row, **When** it gives picture links, **Then** the pictures are fetched and the first is
   the main picture; a link that cannot be fetched or is not a picture makes that row not ready. A row
   with no picture links is ready, and its product is created complete except for pictures — off sale
   until staff add a main picture on its page, then on sale. *(Operator, 2026-10-27.)*
7. **Given** an import, **When** it finishes, **Then** a record of it remains — who ran it, for which
   shop, when, how many rows were created and left out — and each product it created links back to it.
8. **Given** the same file uploaded twice by mistake, **When** the second is checked, **Then** every row
   already created is shown as a duplicate and nothing is created twice.

---

### User Story 5 - Effy's other controls, one product or many (Priority: P2)

From the list or a product's page, an admin or manager sets the margin, sets the aisles a product is
also shown in, puts one size on or off sale and adjusts a size's stock. From the list they select
several products and hold, release or set the margin for all of them at once.

**Why this priority**: Each of these exists somewhere in back-office already, scattered; gathering them
on the product makes the list a place to work, not only to look.

**Independent Test**: Select ten products in the list and set a margin; confirm all ten change, each
records it in its history, and the customer price shown updates. Put one size of a product off sale;
confirm customers can still buy its other sizes.

**Acceptance Scenarios**:

1. **Given** a product, **When** staff set its margin on the list or the product page, **Then** the
   customer price of every size updates and the change is recorded.
2. **Given** several selected products, **When** staff set one margin for all, **Then** every product
   takes it, and products that could not take it are listed with a reason; the rest still change.
3. **Given** several selected products, **When** staff hold them with one reason, or release them,
   **Then** each behaves as in Story 2, and each shop is told once about its own products.
4. **Given** a product, **When** staff set its also-shown-in aisles, **Then** the same rules apply as in
   product review today.
5. **Given** a size, **When** staff put it off sale, **Then** customers cannot buy that size and can
   still buy the others; putting it back on sale is refused while the product is held.
6. **Given** a size the shop tracks stock for, **When** staff adjust its stock, **Then** the change is
   recorded as made by Effy.
7. **Given** any of these actions, **When** the product changed while staff were looking at it, **Then**
   the action is refused and staff see the current product, rather than overwriting what they did not
   see.

---

### Edge Cases

- A product with a pending change: the list shows the live product and marks the change pending;
  opening it links to the change in product review rather than repeating the review here.
- A product held while it is in review: it stays held when approved, and goes on sale only when
  released.
- A shop that is suspended or removed: its products still appear, marked with the shop's state, and
  cannot be released onto sale while the shop is not active.
- An archived product: it is listed under Archived only, and cannot be held or released.
- Bulk actions on a selection that spans many shops: each shop is told only about its own products.
- A size code searched that belongs to a removed size: the product is still found, with that size shown
  as removed.
- Very large catalogues: searching, filtering and paging stay quick at tens of thousands of products.
- An import file in the wrong format, empty, or larger than the limit: refused with one clear sentence,
  nothing checked or created.
- An import created while the aisle tree changes between check and create: a row whose aisle is no
  longer valid is left out at create time and listed with the reason.
- A shop sees nothing new about other shops: holds, imports and Effy-created products are visible to
  the shop only for its own products.

## Requirements *(mandatory)*

### Functional Requirements

**Seeing products**

- **FR-001**: Back-office MUST offer one list of every product of every shop, reachable from the
  Catalogue section of its navigation.
- **FR-002**: Each row MUST show the product's main picture, name, brand, shop, home aisle, number of
  sizes, lowest shop price ("from" when sizes differ), lowest customer price, margin (or "not set"),
  state, and a low-stock flag.
- **FR-003**: Staff MUST be able to search by product name, a size's code (SKU) or a size's barcode.
- **FR-004**: Staff MUST be able to filter by shop, aisle (including every aisle below it), state,
  storage, margin set or not set, missing required details and low stock, in any combination.
- **FR-005**: The list MUST offer state tabs — All, On sale, In review, Change pending, Held by Effy,
  Off sale, Draft, Archived — each showing its count under the current search and filters.
- **FR-006**: Staff MUST be able to sort by name, customer price, shop and last change.
- **FR-007**: The list's search, filters, tab and sort MUST be reproduced by the page's address.
- **FR-008**: A product's page MUST show its overview, every size (codes, shop price, customer price,
  weight, stock, on-sale state), its details, its aisles, and its history: creation (by the shop or by
  Effy), review decisions, holds and releases, margin and placement changes, size and stock changes by
  Effy, with who, when and why.
- **FR-009**: Each shop's page in back-office MUST link to the list filtered to that shop.
- **FR-010**: Customer-service staff MUST be able to see every product and MUST NOT be able to change
  anything. Admins and managers MUST be able to use every action in this feature.

**Holding a product**

- **FR-011**: Staff MUST be able to hold a product with a required written reason; a held product MUST
  NOT be findable, viewable or purchasable by customers.
- **FR-012**: While a product is held, the shop MUST NOT be able to put the product or any of its sizes
  on sale, by any route.
- **FR-013**: A hold MUST last until staff release it; it MUST NOT expire.
- **FR-014**: Releasing a hold MUST return the product to the state it had when held.
- **FR-015**: The shop MUST see "Held by Effy" and the reason on the product, attributed to Effy and not
  to a person, and MUST be notified of each hold and release through its console and its notification
  channel.
- **FR-016**: Approving a shop's change to a held product MUST NOT release the hold.

**Creating products for a shop**

- **FR-017**: Staff MUST be able to create a product for any active shop using the same form and the
  same rules as a shop's own product.
- **FR-018**: A product Effy creates MUST belong to the chosen shop, appear among the shop's own
  products, and be recorded as created by Effy (who and when).
- **FR-019**: An Effy-created product MUST be approved as made, with a margin required at creation, and
  MUST go on sale as soon as it is complete (required details and a main picture), without entering the
  review queue. Until it first goes on sale, staff MAY complete its content; after that its content is
  the shop's.

**Importing a list**

- **FR-020**: Staff MUST be able to download an import template that explains every column, including
  the aisle, details and several sizes of one product.
- **FR-021**: Staff MUST be able to upload a filled list for one chosen shop and see every row checked
  before anything is created, with every problem named per row.
- **FR-022**: Staff MUST be able to create the ready rows in one step, leaving the rest out, and MUST see
  how many were created and which were left out and why.
- **FR-023**: A row whose size code or barcode already exists in that shop MUST NOT be created; the same
  file uploaded twice MUST NOT create anything twice.
- **FR-024**: An import row MAY give picture links; each link MUST be fetched and checked at check
  time (a bad link makes the row not ready). A product imported without pictures MUST stay off sale
  until a main picture is added.
- **FR-025**: Every import MUST be kept as a record (who, which shop, when, rows created and left out),
  and each product it created MUST link to it.

**Other controls**

- **FR-026**: Staff MUST be able to set a product's margin from the list and from its page, and set one
  margin for several selected products at once.
- **FR-027**: Staff MUST be able to hold or release several selected products at once with one reason.
- **FR-028**: A bulk action MUST change every product it can and list each one it could not, with a
  reason.
- **FR-029**: Staff MUST be able to set a product's also-shown-in aisles, put one size on or off sale,
  and adjust a tracked size's stock, from the product's page.
- **FR-030**: Every action that changes a product MUST be refused if the product changed since staff
  last saw it, and show them the current product.
- **FR-031**: Every staff action in this feature MUST be recorded with who, when and, where one is
  given, why.
- **FR-032**: Screens showing products — the back-office list and product page, and the shop's own
  products — MUST reflect a change made elsewhere without being reloaded by hand.
- **FR-033**: A shop MUST NOT learn anything about another shop's products, holds or imports through
  this feature.

### Key Entities

- **Product** (existing): one shop's product — content the shop owns, sizes, prices, aisles, state.
  Gains who created it (the shop or Effy) and, while held, its hold.
- **Hold**: Effy taking a product off sale — reason, who, when, the state it had before; ends with a
  release (who, when). A product has at most one current hold; past holds remain in its history.
- **Product import**: one uploaded list for one shop — who ran it, when, its rows, each row's result
  (created, left out and why), and the products it created.
- **Staff action record**: an entry in a product's history for each change Effy made to it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can find any product, from any shop, by name, size code or barcode in under 10
  seconds from opening Products.
- **SC-002**: The list answers a search or filter change in under 1 second at 50,000 products.
- **SC-003**: A held product is gone from every customer surface within 1 minute of the hold, and the
  shop is told within 1 minute.
- **SC-004**: No route lets a shop put a held product, or any of its sizes, back on sale (0 of the
  shop's ways to change a product's or a size's sale state succeeds while it is held).
- **SC-005**: A list of 500 rows is checked in under 1 minute, and every row that is not ready names at
  least one specific problem.
- **SC-006**: Onboarding a shop's catalogue of 200 products takes staff under 1 hour from receiving the
  shop's list, against a full day of typing today.
- **SC-007**: Customer-service staff complete product lookups for support tickets without asking an
  admin, and can change nothing (0 actions offered to them).

## Assumptions

- **Who may do what**: admin and manager have every action; customer-service staff (csa) view only.
- **Content stays the shop's**: Effy does not edit an existing product's name, descriptions, pictures or
  details; shops change those through the existing change review (067). A wrong product is held, and
  the shop is asked to fix it.
- **Margin, aisles, size on/off sale and stock** use the same rules they use today in product review,
  the shop's console and stock management; this feature gathers them, it does not change them.
- **The import is one shop per file**, at most 500 rows per file, in a common spreadsheet format; one
  row per size, grouped into a product by a column the template names.
- **Effy-created and imported products are the shop's in every way** — the shop sees them, may change
  them through the usual review, and fulfils their orders.
- **A suspended or removed shop's products** stay off sale as they are today; this feature does not
  change what a shop's state does to its products.
- **Live updates** use the platform's existing change channel; no screen refreshes on a timer.
- **Depends on** the category-driven catalogue (101) for aisles, details and the details form, product
  variants (098) for sizes, and product approval and margin (067) for review and margin.
