# Feature Specification: Product Variants with Variant-Based Stock and Pricing

**Feature Branch**: `098-product-variants`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Product Variants with Variant-Based Stock and Pricing. Today every product is one sellable item with one price, one SKU/barcode, one stock count and one weight, so a shop must list "Rice 500 g" and "Rice 1 kg" as unrelated products and a shopper cannot choose a size or flavour on one product page. Introduce basic variants (industry-standard, kept simple) … The database will be cleaned and started fresh, so no migration of existing products is needed — implement the model correctly from scratch."

## Why this feature exists

A product on Effy today is exactly one sellable thing: one price, one stock code, one barcode, one
stock count, one weight. Groceries are not sold that way. The same rice comes in 500 g and 1 kg; the
same yoghurt comes in Plain and Strawberry; the same cola comes as a can and a bottle. Today a shop
has to list each as an unrelated product, so:

- a shopper looking at "Basmati Rice 1 kg" has no idea a 500 g bag exists, and search returns a pile
  of near-duplicates instead of one product with a choice;
- nothing tells the shopper which size is better value;
- every shared detail (description, pictures, ingredients, category) is typed and approved once per
  size, and drifts.

Every reference platform (Shopify, eBay, WooCommerce, the major grocery storefronts) solves this the
same way: a **product** carries what is shared, and its **variants** — one per combination of up to a
few **options** such as Size or Flavour — are what is actually bought, each with its own price,
stock code, barcode, stock count, weight and picture. Australian online grocery shoppers also expect
a **unit price** ("$0.42 / 100 g") beside every price so sizes can be compared.

This feature introduces that model, kept deliberately basic. The platform's data is being reset, so
it is designed correctly from the start rather than retrofitted.

## Clarifications

### Session 2026-10-22 (planning)

- Q: "From" price — lowest in-stock or lowest active variant? → A: lowest **active** variant (FR-013), so
  listing prices and price sorting do not move when one size sells out.
- Q: Are the heart and lists per product or per variant? → A: one per **product**, remembering the
  chosen variant (FR-015a) — the heart on a listing tile has no variant to name.
- Q: Barcode match while picking? → A: there is no scan-to-pick today; pick lines carry the variant's
  barcode (FR-022).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop lists one product in several sizes or flavours, and Effy approves it once (Priority: P1)

A shop operator creates "Basmati Rice", describes it once, adds pictures once, and adds an option
"Size" with the values 500 g, 1 kg and 5 kg. The console lays out one row per size, where the
operator enters each size's own price, stock code, barcode, weight and pack quantity. The operator
submits the product. An Effy admin opens it in the review queue, sees the product and every variant
with its price, sets the product's one margin, sees the price each variant will sell at, and
approves. All three sizes go on sale together under one product.

A shop selling something that comes in only one form (a loaf of bread) defines no options; the
product has exactly one variant and the console shows a single price/stock form, not a grid.

**Why this priority**: Nothing else in this feature can be seen or bought until a product with
variants can be created and approved.

**Independent Test**: In the shop console, create a product with one option and three values,
fill each variant row, submit; in back-office approve with a margin; confirm the product and its
three variants are live with the expected customer prices.

**Acceptance Scenarios**:

1. **Given** a new product with no options, **When** the operator saves it, **Then** it has exactly
   one variant and the console shows one set of price/stock/code fields.
2. **Given** a product, **When** the operator adds an option "Size" with values 500 g, 1 kg, 5 kg,
   **Then** the console offers one variant per value, each needing its own price.
3. **Given** a product with two options (Size: 500 g, 1 kg; Flavour: Plain, Spiced), **When** the
   operator builds variants, **Then** they may keep all four combinations or only the ones they sell
   (e.g. Plain 500 g, Plain 1 kg, Spiced 500 g), and no two variants may have the same combination.
4. **Given** an operator tries to add a third option, **Then** it is refused with a clear message.
5. **Given** an operator enters a stock code or barcode already used by another variant of their
   shop, **Then** it is refused naming the field.
6. **Given** a variant with no price, **When** the operator submits the product, **Then** submission
   is refused and the variant is pointed to.
7. **Given** a submitted product with three variants, **When** an admin approves with a margin of
   10%, **Then** each variant's customer price is its own shop price plus 10%, and the admin saw
   all three resulting prices before approving.
8. **Given** a submitted product, **When** an admin approves without setting a margin, **Then**
   approval is refused (as today).

---

### User Story 2 - A shopper chooses a size or flavour and buys exactly that (Priority: P1)

A shopper searching "rice" sees "Basmati Rice" once, priced "From $3.20". On the product page the
1 kg is pre-selected because it is the first size in stock; the 5 kg is shown but marked sold out.
Choosing 500 g changes the price, the unit price, the picture (if the shop gave it one) and the
"Add to cart" target. The shopper adds 2 × 1 kg and 1 × 500 g; the cart shows two lines, each named
with its size. The order, receipt and order history all say "Basmati Rice — 1 kg" and keep the price
it was sold at.

The same experience exists on the customer website and the customer mobile app.

**Why this priority**: This is the value of the feature — shoppers find one product and choose.

**Independent Test**: With a live product of three variants (one out of stock), browse, open the
product page, switch variants, add two different variants to the cart, pay, and read the order on
both customer surfaces.

**Acceptance Scenarios**:

1. **Given** a product whose active variants differ in price, **When** it appears in a listing,
   search result, aisle or home rail, **Then** it shows "From" the lowest active variant's price.
2. **Given** all active variants share one price, **Then** the listing shows that price without
   "From".
3. **Given** a product page is opened with no variant named, **Then** the first variant in the shop's
   order that can be bought is selected; if none can, the first variant is selected and shown as sold
   out.
4. **Given** a variant is out of stock, **Then** its option value is still shown, marked unavailable,
   and cannot be added to the cart.
5. **Given** a variant has been deactivated by the shop, **Then** it is not shown to shoppers at all.
6. **Given** two options, **When** the shopper picks a value of one, **Then** values of the other that
   have no variant in combination with it are shown as unavailable.
7. **Given** the shopper selects a variant, **Then** the price, compare-at ("was") price, unit price,
   stock state and picture shown are that variant's; a variant with no picture of its own shows the
   product's pictures.
8. **Given** a link that names a variant, **When** it is opened, **Then** the page opens on that
   variant; sharing the page while a variant is selected shares a link to that variant.
9. **Given** the shopper adds two different variants of one product, **Then** the cart holds two lines,
   each labelled with its option values (e.g. "1 kg", "Spiced / 500 g").
10. **Given** an order is placed, **Then** each order line keeps the product name, variant label and
    unit price it was sold at, unchanged by any later edit of the product or variant.
11. **Given** a product with a single variant, **Then** no selector is shown anywhere and it behaves
    as a plain product.
12. **Given** a shopper searches a variant's stock code or barcode, **Then** the product is found and
    opens on that variant.

---

### User Story 3 - Stock is counted per variant (Priority: P1)

A shop tracks stock for each size separately. When an order for 2 × 1 kg is paid, only the 1 kg
count goes down. When the 5 kg runs out, only the 5 kg becomes unavailable; the product stays on sale
with its other sizes. The shop's restock list names the variant that is running low. When every
variant is out, the product is shown as out of stock.

**Why this priority**: Selling a size the shop does not have is the defect 054 closed for products;
without per-variant stock, variants would reopen it.

**Independent Test**: Track stock on two of three variants, buy one of them down to zero, confirm
only that variant becomes unavailable, that its history records the sale, and that the restock list
shows it.

**Acceptance Scenarios**:

1. **Given** a variant with tracking off, **Then** it can be bought in any quantity (as an untracked
   product can today).
2. **Given** a tracked variant with 3 on hand, **When** a shopper tries to put 5 in the cart, **Then**
   the quantity is limited to 3 and they are told why.
3. **Given** a tracked variant, **When** an order containing it is paid, **Then** that variant's count
   falls by the quantity sold and a history entry records the order; other variants are untouched.
4. **Given** a picker marks a variant line short, **Then** that variant's count is set to zero with a
   history entry, as for products today.
5. **Given** an item refund on an order portion not yet collected, **Then** stock is returned to the
   variant that was sold, as for products today.
6. **Given** a variant at or below its low-stock threshold (its own, else the shop's default), **Then**
   it appears on the shop's restock list and the shop's attention list, named with its variant label.
7. **Given** every active variant of a product is out of stock, **Then** listings show the product as
   out of stock and home rails leave it out (the current rule for an out-of-stock product).
8. **Given** an Effy admin, **Then** they can view and correct a variant's stock and history for any
   shop, as they can for products today.
9. **Given** a stock count, threshold or tracking change, **Then** it takes effect immediately and
   does not wait for product approval (as today).

---

### User Story 4 - Shoppers can compare sizes by unit price (Priority: P2)

Each variant can state its pack quantity — 500 g, 1 kg, 1.25 L, 6 each. The product states how it is
compared (per 100 g, per kg, per 100 ml, per L, or each). Wherever a variant's price is shown to a
shopper, the unit price is shown with it: "$3.20 · $0.64 / 100 g". A shopper can see at a glance that
the 1 kg is better value than the 500 g.

**Why this priority**: Pack sizes are the main use of variants in grocery, and unit price is how
shoppers choose between them. Australian rules expect it from online grocery retailers. It is not
needed to sell, so it follows the P1 stories.

**Independent Test**: Give a product a comparison basis and each variant a pack quantity, and
confirm the correct unit price appears beside each price on listings, product page, cart and both
customer surfaces.

**Acceptance Scenarios**:

1. **Given** a product compared "per 100 g" and a variant of 500 g priced $3.20, **Then** the unit
   price shown is "$0.64 / 100 g".
2. **Given** a variant stated in kg on a product compared per 100 g (or g on one compared per kg),
   **Then** the quantity is converted and the unit price is correct.
3. **Given** a variant whose pack unit cannot be converted to the product's comparison basis (e.g. ml
   on a product compared per kg), **Then** the shop console refuses it.
4. **Given** a variant with no pack quantity, **Then** no unit price is shown for it, and nothing else
   changes.
5. **Given** a listing showing "From $X", **Then** the unit price shown is that of the variant whose
   price is shown.
6. **Given** a promotion lowers a variant's price, **Then** the unit price shown follows the price the
   shopper will pay.

---

### User Story 5 - Everyone who handles an order sees which variant it is (Priority: P2)

The shop's order screen, its pick list and its printed package labels, the hub, drivers' manifests,
back-office order views, the customer's receipt and emails all show each line as product name plus
variant label ("Basmati Rice — 1 kg"). A picker never has to guess which size to take.

**Why this priority**: Without it the wrong size is picked. It depends on US1–US3 existing.

**Independent Test**: Place an order containing two variants of one product and read the line on
every screen and document that lists order lines.

**Acceptance Scenarios**:

1. **Given** an order with "Basmati Rice — 1 kg" and "Basmati Rice — 500 g", **Then** the shop's order
   detail and pick list show two distinct lines, each with its variant label, stock code and barcode.
2. **Given** a pick line, **Then** it shows the barcode of the variant sold, not merely of the product.
3. **Given** a receipt, confirmation email, delivery note, tax invoice or order history, **Then** each
   line shows the variant label it was sold with.
4. **Given** a single-variant product, **Then** lines show the product name only, with no empty label.

---

### User Story 6 - A shop changes its variants after the product is on sale (Priority: P3)

The shop adds a 2 kg size, raises the 500 g price, and stops selling the 5 kg. Adding the size and
changing the price are proposed changes that Effy reviews, as edits to an approved product are
today; the product keeps selling as it was until they are approved. Stopping the 5 kg takes effect
immediately — a shop must never have to wait for approval to stop selling something.

**Why this priority**: Needed for a live catalogue but not for the first sale.

**Independent Test**: On a live product, add a variant, change a price, and deactivate a variant;
confirm the deactivation is immediate and the other two wait for approval and then apply.

**Acceptance Scenarios**:

1. **Given** a live product, **When** the shop adds a variant, adds or renames an option value, or
   changes a variant's price, compare-at price, stock code, barcode, weight, pack quantity or picture,
   **Then** it becomes part of the product's pending change and shoppers keep seeing the approved
   version.
2. **Given** a pending change, **When** an admin reviews it, **Then** they see each variant added,
   removed or changed, with old and new values and the resulting customer prices.
3. **Given** a live variant, **When** the shop deactivates it, **Then** it stops being sold
   immediately; reactivating a previously approved variant is also immediate.
4. **Given** a product's last active variant, **When** the shop tries to deactivate it, **Then** they
   are told to make the product unavailable instead.
5. **Given** a variant that has been sold, **When** the shop removes it, **Then** it is no longer
   offered, and every past order, receipt and stock history entry still shows it as it was.
6. **Given** a variant in a shopper's cart that is deactivated or removed, **Then** the cart line is
   shown as no longer available and cannot be checked out, as for an unavailable product today.

---

### Edge Cases

- **The variant a shopper saved or listed is removed**: the saved item or list entry shows the product
  and says that choice is no longer available; it is never silently swapped to another variant.
- **Price changes while in the cart**: handled per variant exactly as for products today (the shopper
  is told and pays the current price).
- **Two shoppers buy the last unit of a variant**: same accepted behaviour as 054 — the count never
  goes below zero and the short line is flagged to the shop at once.
- **All variants deactivated or removed**: impossible by FR-019; the product is made unavailable
  instead.
- **Option renamed after sales**: past orders keep the label they were sold with.
- **Option value with no variant**: not shown to shoppers.
- **Pack quantity of zero or negative**: refused.
- **Promotion targeting a product**: applies to every variant of it; a minimum-quantity or
  buy-X promotion counts units across the product's variants together.
- **A variant's shop price changes but the product's margin does not**: customer price follows on
  approval of the change.
- **Delivery fee weight**: uses each variant's own weight; a variant with no weight entered is treated
  as the platform's assumed weight is today.

## Requirements *(mandatory)*

### Functional Requirements

**The model**

- **FR-001**: A product MUST hold the details shared by all its forms: name, short and long
  description, brand, category, product type and its attributes, picture gallery, tax (GST) status,
  temperature class, comparison basis for unit pricing, approval state and margin.
- **FR-002**: A product MUST have at least one variant. A product MUST be able to define zero, one or
  two options, each with a name (e.g. "Size") and an ordered list of values (e.g. "500 g", "1 kg").
- **FR-003**: A variant MUST be one combination of one value per option of its product; no two
  variants of a product may share a combination. A product with no options has exactly one variant.
  The shop chooses which combinations exist; not every combination must be a variant.
- **FR-004**: A variant MUST carry: its option values, stock code (optional, unique within the shop),
  barcode (optional), shop price (required), compare-at price (optional), customer price (derived,
  FR-010), stock tracking, stock on hand and low-stock threshold, weight, pack quantity and unit
  (optional), an optional picture chosen from the product's gallery, active/inactive state, and a
  display order.
- **FR-005**: Every variant MUST have a label made of its option values in option order (e.g. "Spiced
  / 500 g"); a single-variant product with no options has no label.
- **FR-006**: Limits: at most 2 options per product, at most 20 values per option, at most 50 variants
  per product. Exceeding a limit MUST be refused with a clear message.

**Shop console (shop-web)**

- **FR-007**: A shop operator MUST be able to define options and their values, see the possible
  combinations, choose which become variants, and edit every variant's fields in one grid; reorder
  variants and option values.
- **FR-008**: A product with no options MUST be edited as a single form with no grid.
- **FR-009**: Creating a product with its variants, and later adding/removing variants or changing
  option names, option values, prices, compare-at prices, stock codes, barcodes, weights, pack
  quantities or variant pictures, MUST go through Effy's existing product approval (submission for a
  new product; pending change for a live one). Stock, tracking and thresholds MUST NOT need approval.
  Deactivating and reactivating an approved variant MUST take effect immediately.

**Approval and price**

- **FR-010**: The margin MUST be set once per product at approval (percentage or fixed amount, as
  today) and applied to every variant: a variant's customer price = its shop price plus the margin;
  likewise for its compare-at price.
- **FR-011**: The admin reviewing a product or a pending change MUST see every variant with its shop
  price and the resulting customer price, and for a change, each variant added, removed or changed
  with old and new values.

**Shopper surfaces (customer website and customer mobile app, at parity)**

- **FR-012**: A product MUST appear once in listings, search, aisles, home rails, saved items and lists
  — never once per variant.
- **FR-013**: Listings MUST show the lowest price among the product's active variants, prefixed "From"
  when active variants' prices differ. (Active, not "in stock": the listed price and price sorting must
  not jump each time a size sells out. An out-of-stock product still shows the out-of-stock state.)
- **FR-014**: The product page MUST show an option selector when the product has options; open on the
  variant named in the link, else the first purchasable variant in display order, else the first
  active variant; show inactive variants nowhere; show out-of-stock values as unavailable and not
  addable; and update price, compare-at price, unit price, stock state, picture and link as the
  selection changes.
- **FR-015**: Cart lines, saved-for-later lines, orders, order lines, receipts and emails MUST identify
  a variant. Adding two variants of a product MUST make two lines. An order line MUST keep the product
  name, variant label and unit price as sold.
- **FR-015a**: A saved item (the heart) and a list entry stay ONE per product, and MUST remember the
  variant the shopper had selected when saving (the product's shown variant when saved from a
  listing). Saving again with another variant selected updates the remembered variant. Adding a saved
  item or list entry to the cart adds the remembered variant; if that variant is no longer offered, the
  shopper is told and chooses again.
- **FR-016**: Search by a variant's stock code or barcode MUST find its product and open it on that
  variant.

**Unit pricing**

- **FR-017**: A product MAY state a comparison basis (per 100 g, per kg, per 100 ml, per L, each). A
  variant MAY state its pack quantity in a unit compatible with that basis (g or kg for weight bases,
  ml or L for volume bases, a count for "each"). The shop console MUST refuse an incompatible unit or a
  quantity of zero or less.
- **FR-018**: Wherever a shopper sees a variant's price — listing, product page, cart, checkout — the
  unit price MUST be shown beside it when the variant has a pack quantity, computed from the price the
  shopper will pay, rounded to the nearest cent, and shown with its basis ("$0.64 / 100 g").

**Stock**

- **FR-019**: Stock tracking, count, threshold, history, deduction at payment, pick shortfall, refund
  return, the restock list, the attention list and the back-office correction MUST work per variant
  with the same rules products follow today. A product's last active variant MUST NOT be deactivated
  or removed.
- **FR-020**: A variant MUST be purchasable only when its product is on sale, the variant is active,
  and it is untracked or has stock. A product MUST count as available when at least one of its
  variants is purchasable.

**Fulfilment and documents**

- **FR-021**: Every screen and document that lists order lines — shop order detail and pick list,
  package labels, hub and driver manifests, back-office order views, delivery note, tax invoice,
  receipt, confirmation and other order emails — MUST show the variant label beside the product name.
  The shop's pick view MUST also show each line's stock code and barcode.
- **FR-022**: Each pick line MUST carry the barcode sold, so a shop can check the item in hand against
  it. (Scan-to-pick does not exist on the platform today and is not added by this feature; when it is,
  it matches the variant's barcode.)

**Other features**

- **FR-023**: Promotions MUST continue to target products; a promotion on a product applies to all its
  variants, and quantity conditions count units across the product's variants.
- **FR-024**: The delivery fee's basket weight MUST use each variant's weight.
- **FR-025**: Shop sales figures that are per product MUST continue to be per product (summing its
  variants); any view of individual items sold MUST name the variant.
- **FR-026**: Product pages MUST expose each variant's price and availability to search engines in the
  form search engines read for product variants.

### Key Entities

- **Product**: What a shopper recognises as one thing ("Basmati Rice"). Owned by one shop. Holds the
  shared details (FR-001), its options, its margin and approval state, and one or more variants.
- **Option**: A dimension the product varies by ("Size", "Flavour"). Up to two per product, ordered,
  each with ordered values.
- **Option value**: One choice within an option ("1 kg", "Spiced").
- **Variant**: The thing that is bought, priced and counted — one combination of option values, with
  its own codes, prices, stock, weight, pack quantity, picture, state and order.
- **Stock history entry**: Unchanged in meaning; now about one variant.
- **Cart line / order line / saved item / list entry**: Now name a variant. An order line keeps its
  product name, variant label and price as sold.
- **Pending product change**: Unchanged in meaning; now also carries variant and option changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shop operator can create a product with one option and five values and submit it for
  approval in under 5 minutes.
- **SC-002**: A shopper can choose a variant and add it to the cart from the product page in at most
  2 taps or clicks after the page opens.
- **SC-003**: In a test of orders containing multiple variants of the same product, 100% of order
  lines on every shop, hub, driver, back-office and customer screen and document show the correct
  variant label.
- **SC-004**: Two concurrent payments for the last unit of a variant never leave its count below zero,
  and every stock change of a variant is accounted for in its history (the current count always equals
  the sum of its history).
- **SC-005**: A search for a product with several variants returns it once, not once per variant.
- **SC-006**: For every variant with a pack quantity, the unit price shown matches a hand calculation
  to the cent on both customer surfaces.
- **SC-007**: Selling out one variant never makes another variant of the same product unavailable.
- **SC-008**: The customer website and the customer mobile app show the same variants, labels, prices,
  unit prices and availability for the same product at the same time.

## Assumptions

- **Fresh start**: the operator will reset the platform's data; no existing products, carts, orders,
  saved items or stock history need to be carried over. The model is designed as if variants had
  always existed.
- **Margin per product**: one margin per product, applied to all variants (decision recorded
  2026-10-22). Per-variant margins are out of scope.
- **Unit pricing is in scope** (decision recorded 2026-10-22).
- **Shop mobile app** is stopped (2026-10-21) and gets nothing from this feature; the shop audience is
  shop-web only.
- **Customer surfaces at parity**: customer-web and the customer mobile app both ship this feature.
- **Driver app**: shows the variant label on lines it already lists; no other driver change.
- **Inactive vs out of stock**: an inactive variant is hidden from shoppers; an out-of-stock one is
  shown as unavailable.
- **Pictures**: a variant's picture is one of the product's gallery pictures; there is no separate
  per-variant gallery.
- **Tax and temperature** stay at product level — every variant of a product shares them.
- **Out of scope**: add-on modifiers (toppings, extras), sell-by-weight with price adjustment after
  picking, bundles and multipacks as one listing, more than two options, per-variant promotions or
  margins, per-variant descriptions, and variant-level back-in-stock alerts.
