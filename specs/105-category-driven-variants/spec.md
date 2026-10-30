# Feature Specification: Variants Only From Category Attributes

**Feature Branch**: `105-category-driven-variants`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Variants only from category attributes. Today a product's variant options come from two places: the attributes its category offers as options (Flavour, Scent, Colour, Shoe size…, managed by staff in Categories & attributes), and a built-in "Pack size" option every product can use whatever its category. The built-in one is fixed by the platform, appears even where it makes no sense (clothing), and confuses shops because it looks like a category attribute but isn't one. Change: a product's variants are defined ONLY by the options its category offers; the platform has no fixed or built-in option. Each variant keeps its own net quantity (e.g. 500 g, 1 L, 6 each) as an ordinary per-variant fact used for unit pricing, not as an option shoppers choose by. Also remove the seeded "Size" (clothing size, XXS–4XL) attribute from the attribute library entirely, with its values and its attachments to clothing, activewear, hats, workwear and helmet categories — staff will add the attributes they want themselves. Existing products whose variants use the built-in Pack size option are deleted (dev test data only; no production data exists). Applies to every surface that creates, edits, reviews, imports, shows or sells variants."

## Background

Since 101 a product sits in one category, and the category decides its form: the details asked for and the
attributes a product may be sold in several of ("variant options" — Flavour, Scent, Colour, Shoe size…). Staff
manage that list in back-office › Categories & attributes.

Alongside it, the platform kept one option of its own: **Pack size** (500 g, 1 kg…). Every product in every
category can use it, it is not in the attribute library, staff cannot see, change or withdraw it, and it sits at
the top of the shop's option list even for clothing. Shops read it as a category attribute and are confused when
it behaves differently (its values are typed, not chosen; it carries the pack's quantity for unit pricing).

The starting attribute library also seeded a clothing **Size** (XXS–4XL) that nobody asked for. Its name collides
with Pack size and with the old "sizes" wording, so a shop sees "Size" in Details and "Pack size" in Options and
cannot tell them apart.

This feature makes the category the only source of variant options, and clears the seeded clothing Size so staff
start from the attributes they choose.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop's variant options are exactly its category's (Priority: P1)

A shop adds a product with variants. The options it can choose between are the ones the product's category offers
— no more. A body wash in a category that offers Scent can be sold by Scent; a T-shirt in a category that offers
Colour can be sold by Colour; nothing the platform adds on its own appears.

**Why this priority**: It is the change itself: one source of truth for what a product can vary by, owned by staff.

**Independent Test**: Choose a category that offers one option attribute (e.g. Flavour). In the product editor's
Variants & prices step, choose "With variants" and open "Add an option": only Flavour is listed. Choose a category
that offers none: the shop is told the category has no options and cannot add variants.

**Acceptance Scenarios**:

1. **Given** a category that offers Flavour and Colour as options, **When** the shop adds an option, **Then** the
   list holds Flavour and Colour and nothing else.
2. **Given** a category that offers no option attributes, **When** the shop opens Variants & prices, **Then**
   "With variants" cannot be chosen and says the category has no options, and the product is sold as one item.
3. **Given** a product with two options from its category, **When** the shop saves it, **Then** every variant is
   one combination of those options' values, each with its own price, codes and stock — as today.
4. **Given** staff later stop offering an option in a category, **When** a shop opens an existing product that
   uses it, **Then** the product keeps selling as it is, and the shop is told the option is no longer offered
   (as today for any withdrawn option).

---

### User Story 2 - Each variant keeps its own net quantity for unit pricing (Priority: P1)

A shop selling a yoghurt in 500 g and 1 kg still gets "$0.92 / 100 g" beside each price. The quantity in the pack
is a fact the shop enters for each variant (or for the one product), not an option shoppers choose by.

**Why this priority**: Unit pricing must keep working once Pack size stops being an option, or grocery products
lose the comparison shoppers rely on.

**Independent Test**: Create a product with two variants (from a category option), give each a net quantity
(500 g, 1 kg) and set unit price "Per 100 g"; each variant shows its own unit price in the form, on review and on
the storefront.

**Acceptance Scenarios**:

1. **Given** a product with no variants, **When** the shop enters a net quantity and a unit-price basis, **Then**
   the unit price appears beside the price everywhere it is shown.
2. **Given** a product with variants, **When** the shop enters a net quantity for each variant, **Then** each
   variant's unit price is worked out from its own quantity.
3. **Given** a variant with no net quantity, **When** a unit-price basis is set, **Then** that variant shows no
   unit price and the form says which variants still need a quantity — it never invents one.

---

### User Story 3 - The seeded clothing Size is gone (Priority: P2)

Staff open Categories & attributes and no longer find the seeded "Size" (XXS–4XL); the clothing, activewear,
hat, workwear and bike-helmet categories no longer ask for it. Shops creating products there are not asked for a
size unless staff add an attribute for it.

**Why this priority**: It removes the visible source of the confusion; staff then add the attributes they choose.

**Independent Test**: After the change, the attribute library holds no clothing Size and none of the seven
categories that carried it shows it in its form.

**Acceptance Scenarios**:

1. **Given** the change is in place, **When** staff list the attribute library, **Then** there is no clothing Size
   and none of its nine values.
2. **Given** a product in Women's clothing, **When** the shop opens the Details step, **Then** no Size field is
   asked for.

---

### User Story 4 - Every surface follows (Priority: P2)

Everything that reviews, imports, shows or sells variants works from category options only: back-office's product
form and product review, CSV import, the storefront, the customer website's and app's variant pickers, carts,
orders, labels and documents that name a variant.

**Why this priority**: A leftover Pack size anywhere (an import column, a picker that expects it, a review panel)
is the same confusion in another place.

**Independent Test**: Walk one product with category-option variants from creation through review, import,
storefront, cart, order and its documents; nothing mentions Pack size, and the variant is named by its option
values everywhere.

**Acceptance Scenarios**:

1. **Given** a CSV import file, **When** a row sets variant options, **Then** it may name only options the row's
   category offers; a pack-size column, if present, is refused with a message naming the column.
2. **Given** a shopper on the storefront, **When** they choose a variant, **Then** they choose by the category's
   options only, and each variant's unit price (if any) shows beside its price.
3. **Given** an order line or a document for a variant, **When** it names the variant, **Then** it uses the option
   values chosen (e.g. "Strawberry"), as today.

---

### Edge Cases

- **A product's category offers no options**: it is sold as one item; the editor does not offer "With variants".
- **A product moves to a category that does not offer one of its options**: the move is refused while the
  product sells variants by that option, with a message naming the option (moving would orphan the variants).
- **Products that use the built-in Pack size today** (dev test data only): they are deleted with the change,
  including their variants, stock and media — there is no production data to keep.
- **Products that use clothing Size** (as an option or a detail): deleted with the change, the same way, so no
  product is left naming an attribute that no longer exists.
- **Products among those that already have orders**: order history cannot be deleted, so such a product is kept
  with its first variant only (the others are removed, as when a shop stops selling a variant) and no options;
  its orders, labels and documents keep the variant's name as written at the time.
- **Variants with the same option values**: still refused, as today.
- **A shop wants to sell by a quantity** (500 g / 1 kg): staff add a category attribute for it (e.g. their own
  "Pack size" list); the shop then chooses from it like any other option and also enters each variant's net
  quantity for unit pricing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A product's variant options MUST come only from the attributes its category offers as options; the
  platform MUST NOT offer any option of its own.
- **FR-002**: The built-in Pack size option MUST be removed from every surface: product creation and editing in
  both consoles, product review, CSV import (template, parsing and messages), the storefront, the customer website
  and app variant pickers, and any shared rules and wording that mention it.
- **FR-003**: Every variant, and a product without variants, MUST keep an optional net quantity (an amount and a
  unit: g, kg, mL, L, each) entered by the shop, used only for unit pricing.
- **FR-004**: Unit pricing MUST stay a product-level choice (per 100 g, per kg, per 100 mL, per litre, each, or
  none) and MUST be worked out from each variant's own net quantity; a variant without a quantity shows no unit
  price.
- **FR-005**: The product editor's Variants & prices step MUST list, under "Add an option", only the category's
  option attributes, each with a few of its values as a hint; when the category offers none, "With variants" MUST
  be unavailable with a sentence saying so.
- **FR-006**: The variants list MUST show each variant's net quantity in its codes-and-shipping details, beside
  barcode, the shop's own code and packed weight.
- **FR-007**: The seeded clothing Size attribute, its nine values and its attachments to the seven categories MUST
  be removed from the attribute library.
- **FR-008**: Products whose variants use the built-in Pack size option, and products that use clothing Size, MUST
  be deleted as part of the change, with their variants, stock, media and shop links — except products that already
  have orders, which MUST be kept with their first variant only and no options; records that already copied a
  variant's name (order lines, labels, documents) MUST keep their copy.
- **FR-009**: Moving a product to a category that does not offer one of the options its variants use MUST be
  refused, naming the option.
- **FR-010**: Order lines, labels, manifests and documents MUST keep naming a variant by its option values, as
  today.
- **FR-011**: Wording on the shop and back-office product screens touched by this change MUST say "variant", not
  "size", where it means a variant.

### Key Entities

- **Category option attribute**: an attribute from the library that a category offers as a variant option (e.g.
  Flavour), with a fixed list of values staff manage. The only thing a product can vary by.
- **Product option**: one of a product's (at most two) chosen category option attributes, with the values it is
  sold in.
- **Variant**: one combination of option values; holds its own price, was-price, codes, packed weight, stock and
  — new as an ordinary fact — its net quantity.
- **Net quantity**: the amount in one pack (amount + unit), per variant or for the product, used only to work out
  a unit price.
- **Unit-price basis**: the product's choice of how a unit price is shown (per 100 g, per kg, …, or none).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every category, the options a shop can add are exactly the category's option attributes — zero
  options appear that staff did not attach.
- **SC-002**: No screen, import template, message or document mentions "Pack size" as an option after the change.
- **SC-003**: Every product with a net quantity and a unit-price basis shows a correct unit price for each of its
  variants on the form, on review and on the storefront.
- **SC-004**: The attribute library holds no clothing Size, and no product references it.
- **SC-005**: A shop can create a product with variants from a category option in one pass through the editor,
  without meeting an option or field it cannot place.

## Assumptions

- Dev holds test data only; deleting products that use Pack size or clothing Size loses nothing that must be kept.
- Staff, not the platform, decide whether a category sells by quantity: if they want "500 g / 1 kg" as a choice,
  they add their own attribute for it (with its list of values) and attach it. The shop then also enters each
  variant's net quantity for unit pricing — the option is what shoppers choose by, the net quantity is a fact.
- The other seeded option attributes (Flavour, Scent, Colour, Nappy size, Bed size, Storage, Kids, Shoe size (AU),
  Ink colour) stay; staff can withdraw them themselves.
- The limit of two options per product and fifty variants stays as it is.
- The wider renaming of "sizes" to "variants" on screens this change does not touch (stock, the product page's
  panels) is out of scope and can follow separately.
