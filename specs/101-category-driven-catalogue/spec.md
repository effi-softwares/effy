# Feature Specification: Category-Driven Catalogue

**Feature Branch**: `101-category-driven-catalogue`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Category-driven product catalogue: replace product types with one category tree that decides each product's details form. Clean rebuild — no legacy support; every existing product, product type, category and attribute is discarded and the catalogue starts fresh. Effy sells everything a general retailer does (like Walmart) … (1) one category tree, up to 5 levels, managed by back-office; (2) a product has exactly one home category, a leaf, plus back-office-only extra placements; (3) an attribute library defined once; (4) attributes attached to categories as Required / Recommended / Optional, inherited down the tree, tightened or hidden by a child; (5) storage, GST status and age-restricted are fixed product facts with category defaults; (6) expiry, manufacture, packed date and batch are stock, never product details; (7) the shop's type step is removed and the category picker suggests, searches and browses leaves; (8) per-variant details and variant options from the library, delivered in this feature; (9) storefront filters per category, web and app at parity; (10) a complete general-retailer seed across all departments; (11) clean rebuild, no compatibility."

## Why this feature exists

Today a product has two classifications that know nothing about each other:

- a **product type** (four of them: Prepared Food, Packaged Grocery, Beverage, Household) that decides
  which details the shop's form asks for, and nothing else;
- a **category** (twelve, two levels) that decides where shoppers find it.

That arrangement fails a business that sells everything a general retailer sells:

- A shop is asked to choose a "type" before anything else — a word shoppers never see and shops do
  not think in — and four types cannot describe a phone charger, a dog food, a shampoo and a
  nappy pack.
- Nothing keeps type and category consistent: a "Household" product can sit in "Bakery".
- The categories mix ideas: "Frozen" and "Chilled" are storage states, not aisles; "Beverages" is
  both a type and a category.
- **Storage — which decides whether a parcel rides cold — is an optional detail**, so a product left
  blank is treated as room temperature. A frozen meal can travel warm.
- Every choice-type detail becomes a storefront filter everywhere, relevant or not.
- Since product variants (098), one product can come in flavours with different ingredients or
  allergens, and there is nowhere to say so; option names ("Size", "Flavour") are free text per
  product and drift.

Every reference platform that onboards sellers through a form (eBay, Shopify, Google's product
taxonomy, the large regional marketplaces) solves this the same way: **one category tree, a product
filed in exactly one leaf, and the leaf's inherited set of details *is* the form** — each detail marked
required, recommended or optional, drawn from **one shared library** so the same detail is the same
filter everywhere. Extra shelf placement is a separate, curated act that never changes the form. This
feature adopts that model. The platform has no real users yet, so the catalogue is rebuilt from
scratch rather than migrated.

## Clarifications

### Session 2026-10-26 (operator, before specification)

- Q: One category and several sub-categories per product? → A: **One home category, which must be a
  leaf**; extra "also shown in" placements are back-office-only and never change the form (industry
  standard; several form-deciding categories would make the form, breadcrumb and filters ambiguous).
- Q: Extra placements in this feature or later? → A: In this feature — nothing from the old catalogue
  constrains scope; build the right model now.
- Q: May a child category hide an attribute it inherits? → A: Yes (do what is best).
- Q: Age-restricted products? → A: Yes, as a fixed product fact with category defaults and an 18+
  label; age verification itself is a later feature (do what is best).
- Q: Per-variant details and library-backed variant options — later phase? → A: **Delivered in this
  feature**, as later-priority stories; not postponed.
- Q: Keep anything of the old model? → A: No. Clean rebuild, no legacy support; existing products,
  types, categories and attributes are discarded.

### Session 2026-10-26 (after /speckit-analyze, operator approved the recommendations)

- Q: What happens to a retired category's children? → A: A category cannot be retired while it has
  **active** children (staff retire bottom-up). Restoring a category under a parent that is now home to
  products asks where those products move, like adding a sub-category (FR-004, FR-005).
- Q: Which food is GST-free by default? → A: Fruit & Vegetables, Meat & Seafood, Dairy, Eggs & Fridge,
  Bakery (bread and rolls) and Pantry staples default GST-free. Snacks & Confectionery, soft drinks and
  other sweetened drinks, Ready Meals & Deli, Liquor and every non-food department default taxable.
  Age-restricted defaults to no everywhere except Liquor (yes). The operator confirms the GST mapping
  with their accountant before go-live; staff can change any default without a release.
- Q: Values of an attribute the new category hides, on re-categorise? → A: Dropped, like any detail
  the new leaf does not ask for. Only a **staff** hide on the product's own leaf keeps values (so
  un-hiding restores them).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff build the category tree (Priority: P1)

A back-office manager opens **Categories** and sees the whole tree: departments at the top, each
expandable to its sub-categories, down to five levels. They add a sub-category under "Dairy, Eggs & Fridge",
rename one, drag one to a new place among its siblings or under a new parent, give a department a
picture for the storefront, and retire one that is no longer used. Every category shows how many
products are filed in it and beneath it.

**Why this priority**: Nothing else works without the tree: the form, the shop's picker, the
storefront's aisles and filters all hang from it.

**Independent Test**: Starting from the seeded tree, a manager creates a five-level branch, moves a
leaf to another department, reorders siblings and retires an unused category; the storefront aisles
and the shop's picker reflect each change without a release.

**Acceptance Scenarios**:

1. **Given** a category at level 5, **When** a manager tries to add a sub-category beneath it,
   **Then** it is refused and the tree is unchanged, with a message saying the tree is five levels deep
   at most.
2. **Given** a manager drags a branch under a new parent, **When** the move would put any category in
   the branch below level 5, or under itself, **Then** the move is refused.
3. **Given** a leaf category that is the home of products, **When** a manager adds a sub-category to
   it, **Then** they must choose which of its new sub-categories those products move to, and the change
   is made together or not at all — a product is never left filed in a category that has children.
4. **Given** a category that is the home of any non-archived product, **When** a manager tries to
   retire it, **Then** it is refused, naming how many products must be moved first.
5. **Given** a retired category, **Then** it no longer appears on the storefront or in the shop's
   picker, any extra placements into it are removed, and a manager can restore it.
6. **Given** a category with active sub-categories, **When** a manager tries to retire it, **Then** it
   is refused until its sub-categories are retired or moved.
7. **Given** a retired category whose parent has since become home to products, **When** a manager
   restores it, **Then** they must agree that those products move into the restored category, or the
   restore is refused.
8. **Given** a customer-service agent (read-only staff), **Then** they can see the tree but every
   change is refused.

---

### User Story 2 - Staff define attributes once and attach them to categories (Priority: P1)

A manager opens the **Attribute library** and defines "Allergens": a multiple-choice detail with the
values Milk, Eggs, Peanuts, Tree nuts, Soy, Wheat (gluten), Fish, Shellfish, Sesame, Lupin; shown to
customers; a storefront filter. They define "Net capacity" as a number with the volume units mL and L,
and "Warranty" as a number in months. Then, on **Pantry**, they attach Allergens as
**Required**; on **Fruit & Vegetables › Fresh Fruit** they hide it as not relevant; on **Electronics** they
attach Warranty as **Recommended**. On any leaf, a **Preview** shows the exact form a shop will see,
with each detail labelled where it came from ("from Pantry").

**Why this priority**: The library and attachments are the form. Without them a shop can list a
product but nothing about it can be required, filtered or shown consistently.

**Independent Test**: Define three attributes, attach them at department level, tighten one and hide
one on a sub-category, and confirm the preview of two different leaves shows the expected fields, levels
and sources.

**Acceptance Scenarios**:

1. **Given** an attribute is attached to a department as Optional, **When** a sub-category beneath
   marks it Required, **Then** every leaf under that sub-category asks for it as required, and leaves
   elsewhere in the department still ask for it as optional.
2. **Given** an attribute is attached to a parent as Required, **When** a child tries to loosen it to
   Optional, **Then** it is refused — a child may only tighten (Optional → Recommended → Required) or
   hide.
3. **Given** an attribute is hidden on a category, **Then** neither that category nor anything beneath
   it asks for it, unless a deeper category attaches it again.
4. **Given** an attribute used by any product, **When** a manager tries to retire it, change its input
   type or unit family, or remove a value products use, **Then** it is refused, naming how many products
   use it.
5. **Given** a manager attaches a new Required attribute to a category that already has products on
   sale, **Then** those products stay on sale, are flagged to their shop and to staff as "missing
   required details", and the next edit or submission of each must supply it.
6. **Given** two attributes attached on the same leaf (one inherited, one its own) share a section
   heading, **Then** the shop's form shows them together under that heading, in the staff-chosen order.

---

### User Story 3 - A shop lists a product by naming it and choosing where it belongs (Priority: P1)

A shop operator clicks **Add product**. The first step asks for the product's **name** and its
**category**. They type "Greek yoghurt 1kg" and the picker immediately suggests *Dairy, Eggs & Fridge ›
Yoghurt › Greek & Natural Yoghurt*. They could instead search all categories ("charger" → *Electronics ›
Phones & Accessories › Chargers & Cables*), browse column by column from a department down to a leaf,
or pick from the categories their shop used recently. Only a leaf can be chosen; the chosen path stays
visible. They continue through sizes & prices and a picture to **Details** — a form built from that
leaf: grouped into sections, required details marked, recommended ones nudged with "helps shoppers find
this", a unit beside each number. Storage, GST and age-restricted arrive pre-set from the category, and
they can change them. They submit for review.

**Why this priority**: This is the reason for the feature: a shop lists any product without ever
meeting the word "type", and every approved product carries the details its category requires.

**Independent Test**: List one product each in three departments (a food, an electrical item, a pet
product) and confirm each Details step asks exactly the fields its leaf's preview shows, refuses
submission while a required detail is empty, and pre-sets the operational facts from the category.

**Acceptance Scenarios**:

1. **Given** the add-product flow, **Then** there is no product-type step; the steps are Name &
   category → Sizes & prices → Image → Details → Review.
2. **Given** an operator types a product name, **When** words in it match a leaf's name or one of its
   staff-maintained synonyms, **Then** up to five leaves are suggested, best match first, each shown with
   its full path.
3. **Given** the operator browses, **When** they pick a category that has sub-categories, **Then** it
   opens the next column instead of being chosen.
4. **Given** a required detail is empty, **When** the operator tries to submit, **Then** submission is
   refused and the field is pointed out; a recommended detail left empty does not block.
5. **Given** a number detail with units g and kg, **When** the operator enters "1.5" and picks kg,
   **Then** it is kept as entered and shown to customers as entered, and filters and comparisons treat it
   as 1500 g.
6. **Given** a draft with details entered, **When** the operator changes the category, **Then** they are
   warned which entered details the new category does not ask for and will be dropped, before the change
   is made; operational facts they had changed by hand are kept, the rest take the new category's
   defaults.
7. **Given** an approved product, **When** the shop changes its category or an operational fact,
   **Then** the change goes through Effy review like any other edit, and the reviewer sees old and new
   side by side.
8. **Given** the Details form, **Then** it never asks for expiry date, manufacture date, packed date or
   batch/lot.

---

### User Story 4 - Operational facts are always set, defaulted by the category (Priority: P1)

Every product has three facts the platform acts on, outside the attribute library: **storage** (frozen,
chilled or room temperature), **GST status** (taxable or GST-free) and **age-restricted (18+)**. Each
category may set a default for each, inherited by everything beneath it unless a deeper category sets
its own. "Frozen" defaults storage to frozen; "Fruit & Vegetables" defaults GST-free; "Liquor" defaults
age-restricted. A product takes its leaf's defaults when it is created; the shop may change them; an
approved product cannot be on sale without all three.

**Why this priority**: Storage decides whether a parcel rides cold and is checked at the hub; GST
decides tax documents. Today storage can be blank and defaults to room temperature. These must never be
missing.

**Independent Test**: Create products under Frozen, Fruit & Vegetables and Liquor; confirm each starts with
the category's defaults, that a changed value is shown to the reviewer as differing from the category
default, and that cold-chain handling and tax documents follow the product's values.

**Acceptance Scenarios**:

1. **Given** a leaf with no default of its own, **Then** it takes the nearest ancestor's default;
   **given** no ancestor sets one, **Then** the shop must choose before submitting.
2. **Given** a shop changes a fact away from its category default, **Then** the reviewer sees it marked
   "differs from category default".
3. **Given** an age-restricted product, **Then** customers see an "18+" label on its tile, its page, in
   the cart and at checkout.
4. **Given** a frozen or chilled product in an order, **Then** every driver, hub and packing step that
   handles temperature today treats it accordingly — there is no case where a product's storage is
   unknown.

---

### User Story 5 - Shoppers filter each aisle by what matters there (Priority: P2)

A shopper opens *Pet › Dogs › Dog Food* and sees filters for Life stage, Breed size, Flavour and Dietary
needs — not Allergens for humans or Screen size. On *Electronics › Phones & Accessories › Chargers &
Cables* they see Connector type, Power output and Brand. Searching "shampoo" shows the filters that
apply to the results found. Each filter lists only values that products in view actually have, with how
many. A product page shows its customer-visible details in their sections. The customer website and the
customer app behave the same.

**Why this priority**: Shoppers gain once there are products; the shop and staff stories must exist
first.

**Independent Test**: With products seeded in two unrelated leaves, open each aisle on web and in the
app and confirm the filters differ, list only present values with correct counts, and that internal-only
details never appear.

**Acceptance Scenarios**:

1. **Given** an aisle page, **Then** its filters are the filterable attributes that apply to the leaves
   in view and that at least one product in view has a value for.
2. **Given** a shopper picks two values of one filter, **Then** products with either are shown; picking
   values in two filters shows products matching both.
3. **Given** a number attribute marked filterable (e.g. Screen size), **Then** it filters by range.
4. **Given** an attribute marked internal-only, **Then** it never reaches a customer surface.
5. **Given** a product placed by staff in an extra category, **Then** it appears in that aisle as well
   as its home, its breadcrumb always shows its home, and it is counted once in search results.

---

### User Story 6 - Details that differ by size or flavour are entered per variant (Priority: P2)

A shop lists a yoghurt in Strawberry and Mango. Ingredients and Allergens are attributes staff marked
"may differ per variant", so in Details the shop chooses, for each, **Same for all** or **Differs by
variant** and enters a value per variant where it differs. A shopper choosing Mango on the product page
sees Mango's ingredients and allergens. Filtering by "no milk" finds the product if any of its
available variants has no milk, and shows that variant first.

**Why this priority**: Required by the operator in this feature. It builds on stories 2 and 3 and on
variants (098).

**Independent Test**: List one product with two variants whose allergens differ; confirm the product
page switches values with the variant, a required per-variant detail is required for every active
variant, and filters match per variant.

**Acceptance Scenarios**:

1. **Given** an attribute not marked "may differ per variant", **Then** it is entered once per product.
2. **Given** a required attribute set to "Differs by variant", **When** any active variant lacks a
   value, **Then** submission is refused, naming the variant.
3. **Given** a product with a single variant, **Then** the shop is not asked to choose same-or-differs.
4. **Given** a shopper switches variant on the product page, **Then** per-variant details change with
   it on web and in the app.

---

### User Story 7 - Variant options come from the library (Priority: P2)

When a shop adds options to a product, it no longer types an option name and its values. It picks from
the options its category allows — Flavour, Colour, Scent, Pack size, Clothing size… — and picks values
from that option's list. "Pack size" values are the pack quantities the shop already enters per variant
(500 g, 1 kg), so they are never typed twice. Because an option is an attribute, choosing Colour = Red
for a variant also makes Red that variant's Colour for filters and the product page.

**Why this priority**: Required by the operator in this feature. It keeps option names and values
consistent across every shop and makes them filterable.

**Independent Test**: List two products from different shops in the same leaf with a Colour option;
confirm both offer the same option name and values, and that the Colour filter on the aisle finds both
by variant.

**Acceptance Scenarios**:

1. **Given** a leaf, **Then** the options a shop may add are the attributes attached to it (directly or
   inherited) that staff marked "can be a variant option"; at most two options per product (as today).
2. **Given** an option's value is missing from its list, **Then** the shop cannot type a new one; the
   form says to ask Effy, and staff can add the value to the library, after which it is available to
   every shop.
3. **Given** the Pack size option, **Then** each variant's option value is shown from its pack quantity
   and unit, and two variants with the same pack size are refused as duplicates.
4. **Given** a variant's Colour is Red by option, **Then** the Colour attribute is not asked separately
   for that product.

---

### User Story 8 - Staff place products in extra aisles and review the new details (Priority: P3)

A merchandiser places a sparkling water, filed in *Drinks › Water › Sparkling Water*, also in *Party &
Entertaining › Mixers*. A reviewer approving a new product sees its full category path, every detail
with its level, recommended details left empty, and operational facts that differ from the category
default.

**Why this priority**: Valuable curation and review polish; the catalogue works without them.

**Independent Test**: Add and remove an extra placement and see the aisle change; review a submission
with an overridden storage value and an empty recommended detail and see both flagged.

**Acceptance Scenarios**:

1. **Given** an extra placement, **Then** it can only be a leaf, it never changes the product's form or
   operational facts, and shops neither set nor see it.
2. **Given** a product has more than five extra placements, **When** staff add another, **Then** it is
   refused.
3. **Given** a reviewer opens a submission, **Then** recommended-but-empty details and operational facts
   differing from the category default are listed at the top.

---

### Edge Cases

- **Moving a branch changes inherited details.** Products beneath now resolve a different form; any
  that miss a newly required detail stay on sale and are flagged "missing required details" (as in
  story 2, scenario 5). Their operational facts do not change — defaults apply only when a product is
  created or re-categorised.
- **A category's default changes.** Existing products keep their values; only products created or
  re-categorised afterwards take the new default.
- **An attribute is hidden on a category where products already have values for it.** The values are
  kept but no longer shown, filtered or asked; un-hiding restores them.
- **The shop's suggested categories are wrong or empty.** Search and browse are always available; the
  picker never chooses for the shop.
- **A leaf becomes a parent while a shop has an unsaved draft open in its browser.** Saved products
  move with FR-004; the unsaved draft's category is no longer selectable, and saving is refused until
  the shop chooses a leaf.
- **Two attributes with the same name.** Refused: attribute names are unique in the library; a name is
  a shop's and shopper's word, so two "Size"s would be indistinguishable.
- **Unit conversion for filters.** A value entered in kg and one in g are compared after conversion;
  shown values keep the unit the shop chose.
- **Per-variant details on a product whose variants are later reduced to one.** Values collapse to the
  remaining variant's; the shop is shown what was dropped.
- **A retired value.** A value products use cannot be removed; staff may retire it so no new product
  can choose it while existing products keep it.
- **Date and time inputs** exist for details such as a release date or opening hours of a service; they
  are never used for stock dates (expiry, packed, manufacture, batch), which the library refuses by
  name.
- **Old data.** Products, carts, saved items, lists, promotion targets and dev orders that point at
  products or categories from before this feature are removed with them; nothing reads the old model.

## Requirements *(mandatory)*

### Functional Requirements

**Category tree**

- **FR-001**: Products MUST be classified only by categories; product types MUST NOT exist anywhere in
  the platform.
- **FR-002**: Categories MUST form one tree of at most five levels (a department is level 1). Staff with
  manage rights MUST be able to create, rename, reorder among siblings, move under another parent,
  retire and restore categories; the system MUST refuse any change that exceeds five levels or makes a
  category its own ancestor.
- **FR-003**: Each category MUST have a name (unique among its siblings), a stable identifier for links,
  a display order, an optional storefront picture, and a list of synonyms used by the shop's category
  suggestions.
- **FR-004**: A category that is the home of products MUST NOT gain sub-categories unless, in the same
  change, its products are moved to one of them; the same applies when a restored sub-category reappears
  under it. Moving an existing category under a leaf that is home to products is refused (staff create
  the sub-category there instead).
- **FR-005**: A category MUST NOT be retired while it is the home of any non-archived product or has
  active sub-categories, and MUST NOT be created or restored under a retired parent; retiring MUST
  remove extra placements into it and hide it from customers and shops.
- **FR-006**: Every tree change MUST be recorded in the staff audit trail with who and when; read-only
  staff MUST be refused every change.

**Product classification**

- **FR-007**: Every product MUST have exactly one home category, and it MUST be a leaf at the time it
  is submitted or edited.
- **FR-008**: Staff (never shops) MUST be able to place a product in up to five additional leaf
  categories; additional placements MUST NOT affect its form, operational facts or breadcrumb, and MUST
  NOT be visible to shops.
- **FR-009**: A category's contents for customers MUST be the products whose home or extra placement is
  that category or any category beneath it.

**Attribute library**

- **FR-010**: Staff MUST be able to define attributes once in a library, each with: a unique name, help
  text, an input type (short text, long text, number, yes/no, single choice, multiple choice, date,
  time), and as applicable: allowed values (for choice types, ordered), a unit family and the units a
  shop may pick (for numbers), limits (minimum, maximum, decimal places, maximum length), and four
  switches — **filterable**, **shown to customers** (else internal-only), **may differ per variant**, and
  **can be a variant option** (single choice only).
- **FR-011**: The library MUST refuse retiring an attribute, changing its input type or unit family, or
  removing an allowed value while any product uses it; staff MAY retire an allowed value so no new
  product can choose it.
- **FR-012**: The library MUST refuse an attribute whose name denotes a stock date or lot (expiry,
  best-before, use-by, manufacture, packed, batch, lot).

**Attaching attributes to categories**

- **FR-013**: Staff MUST be able to attach an attribute to any category with a level (Required,
  Recommended, Optional), a section heading and an order.
- **FR-014**: A category's resolved form MUST be its ancestors' attachments followed by its own, where
  a deeper category MAY tighten an inherited level or hide an inherited attribute, and MUST NOT loosen
  one. There MUST be exactly one definition of a leaf's resolved form, used by the shop's form, by
  submission checks, by review, by the storefront's filters and product page, and by the staff preview.
- **FR-015**: Staff MUST be able to preview the resolved form of any leaf, with each attribute's level
  and the category it came from.
- **FR-016**: When attachments change so that products on sale lack a now-required detail, those
  products MUST stay on sale, MUST be flagged to their shop and to staff as missing required details,
  and their next edit or submission MUST supply it.

**Operational facts**

- **FR-017**: Every product MUST carry storage (frozen, chilled, room temperature), GST status (taxable,
  GST-free) and age-restricted (yes/no) as fixed facts, never as library attributes.
- **FR-018**: Any category MAY set a default for each fact, inherited by its descendants unless
  overridden deeper. A new or re-categorised product MUST take its leaf's resolved defaults; a shop MAY
  change them; a product MUST NOT be submitted while any fact is unset.
- **FR-019**: Every place that decides cold-chain handling or tax treatment MUST read the product's
  facts; a product's storage MUST never be unknown.
- **FR-020**: Age-restricted products MUST be labelled 18+ on every customer surface where the product
  appears (tile, page, cart, checkout, order). Verifying a customer's age is out of scope.

**Shop listing flow**

- **FR-021**: The shop's add-product flow MUST be: Name & category → Sizes & prices → Image → Details →
  Review, with no product-type step.
- **FR-022**: The category picker MUST offer: suggestions from the product name (up to five leaves,
  matched against category names, their parents' names and synonyms, each with its full path); search across all active
  leaves by name and synonym; column-by-column browsing from departments to leaves; and the shop's
  recently used leaves. Only active leaves MAY be chosen.
- **FR-023**: The Details step MUST render the leaf's resolved form: sections in order, required
  details marked and enforced, recommended details nudged and not enforced, the unit chosen beside each
  number, values checked against the attribute's limits.
- **FR-024**: Changing a draft's category MUST first list the entered details that will be dropped —
  every detail the new leaf does not ask for, including those it hides; facts the shop changed by hand
  MUST be kept and the others MUST take the new leaf's defaults.
- **FR-025**: After approval, changes to category, operational facts or details MUST go through Effy
  review, with the reviewer shown old and new values.
- **FR-026**: The product form MUST never ask for expiry, manufacture or packed dates or batch/lot.

**Per-variant details and options**

- **FR-027**: For an attribute marked "may differ per variant" on a product with more than one variant,
  the shop MUST be able to choose Same for all or Differs by variant, and enter one value per active
  variant when it differs; a required attribute that differs MUST have a value for every active variant.
- **FR-028**: Variant options MUST be chosen from the leaf's resolved attributes marked "can be a variant
  option", plus Pack size; option values MUST come from the attribute's allowed values (Pack size: from
  each variant's pack quantity and unit). Shops MUST NOT type option names or values. A product MUST have
  at most two options.
- **FR-029**: A variant's option value MUST also be that variant's value of the same attribute for
  filters and the product page, and that attribute MUST NOT be asked separately for the product.

**Storefront**

- **FR-030**: An aisle page MUST offer as filters the filterable attributes that apply to the leaves in
  view and that at least one product in view has a value for, listing only values present, with counts;
  search MUST do the same for its results. Choice filters MUST match any selected value within an
  attribute and all selected attributes together; filterable numbers MUST filter by range, after unit
  conversion. Search without a category offers at most eight attribute filters, those covering the most
  results; an aisle page offers every qualifying one.
- **FR-031**: A product MUST match a filter if any of its active variants matches; the product page MUST
  open on a matching variant when reached from a filtered list.
- **FR-032**: A product page MUST show its customer-visible details grouped by section, switching
  per-variant details with the selected variant; internal-only details MUST NOT reach any customer
  surface.
- **FR-033**: The customer website and the customer app MUST offer the same aisles, filters, product
  details and 18+ labels.

**Seed and clean rebuild**

- **FR-034**: The catalogue MUST start from a seeded general-retailer tree covering at least these
  departments: Fruit & Vegetables; Meat & Seafood; Dairy, Eggs & Fridge; Bakery; Pantry; Frozen; Snacks &
  Confectionery; Drinks; Liquor; Ready Meals & Deli; Health & Wellness; Beauty & Personal Care; Baby;
  Pet; Household & Cleaning; Home & Kitchen; Electronics; Toys & Games; Clothing & Accessories; Garden &
  Outdoor; Hardware & Tools; Office & Stationery; Sports & Fitness; Automotive; Party & Entertaining. Each
  department MUST have sub-categories at least two levels deep where the range calls for it, down to
  leaves a shop would recognise.
- **FR-035**: The seed MUST include an attribute library attached at the right levels — at least
  allergens, dietary labels, ingredients, nutrition information, country of origin, organic, alcohol
  content, flavour, material, dimensions, colour, clothing size, power and voltage, connector type,
  battery included, warranty, age range, scent, skin and hair type, pet type and life stage, screen size,
  capacity — and operational defaults so that **every leaf resolves all three facts**: storage per
  department (Frozen → frozen; Dairy, Eggs & Fridge, Meat & Seafood, Ready Meals & Deli → chilled; the
  rest → room temperature, with sub-branch overrides where needed); GST as clarified (2026-10-26);
  age-restricted no everywhere except Liquor.
- **FR-036**: Every product, product type, category, attribute and attribute value from before this
  feature MUST be removed, with everything that points at them; no compatibility with the old model
  MUST remain in any surface.

### Key Entities

- **Category**: a node in the one tree — name, stable identifier, parent, order, storefront picture,
  synonyms, status (active/retired), optional defaults for storage, GST status and age-restricted. A
  leaf is a category with no active children.
- **Attribute**: a library entry — name, help text, input type, allowed values, unit family and units,
  limits, filterable, shown-to-customers, may-differ-per-variant, can-be-a-variant-option, status.
- **Allowed value**: one choice of a choice attribute — label, order, status (active/retired).
- **Attachment**: an attribute on a category — level (Required/Recommended/Optional) or hidden, section
  heading, order.
- **Product**: belongs to one shop and one home leaf; carries storage, GST status, age-restricted,
  its details, its variants and options.
- **Extra placement**: a staff-made link from a product to an additional leaf.
- **Product detail value**: a product's value for one attribute — for the whole product, or for one
  variant when it differs; numbers keep the unit entered.
- **Variant option**: one of at most two per product, naming a library attribute (or Pack size); each
  variant's option value is one of that attribute's allowed values.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shop operator lists a new product without encountering a product type, in under 4
  minutes for a single-variant product with its picture ready.
- **SC-002**: In at least 80% of new listings, the shop chooses one of the suggested categories rather
  than searching or browsing.
- **SC-003**: 100% of approved products sit in exactly one active leaf, and every product's storage,
  GST status and age-restricted facts are set — zero products ride with unknown storage.
- **SC-004**: 100% of products submitted after a requirement exists carry every detail their leaf
  requires; products made non-compliant by later staff changes are all flagged.
- **SC-005**: On every aisle page, every filter shown has at least one matching product, and no filter
  from an unrelated department appears.
- **SC-006**: Staff add a category, an attribute, or an attachment and see it in the shop's form and
  on the storefront within a minute, without a release.
- **SC-007**: The seeded tree covers all 25 listed departments, and a sample of 100 everyday products
  across them (from a weekly shop to a phone charger) each has an obvious leaf.
- **SC-008**: Web and app show identical filters and product details for the same aisle and product.

## Assumptions

- **No data is kept.** The platform has no real users; the operator has authorised deleting every
  product and everything that references products or categories (carts, saved items, lists, promotion
  targets, dev orders). Promotions targeting categories are re-pointed by staff afterwards.
- **Who manages the taxonomy** follows today's back-office rights: admins and managers change it;
  customer-service agents read it.
- **Units** come from fixed families the platform knows how to convert: mass (mg, g, kg), volume (mL, L),
  length (mm, cm, m), area (cm², m²), power (W, kW), voltage (V), electrical capacity (mAh), data
  capacity (GB, TB), duration (minutes, hours, days, months, years), temperature (°C), and counts
  (pieces, sheets, rolls, packs — each its own unit, never converted into another). New families need a release; new attributes do not.
- **Filterable** applies to choice, yes/no and number attributes; text, date and time attributes are
  never filters.
- **Synonyms** serve the shop's category picker only; changing how customer search ranks results is a
  separate feature.
- **Suggestions** use word matching against names and synonyms; learned or machine suggestions are a
  later improvement.
- **Brand** remains a fixed product field (as today), not a library attribute, and stays a storefront
  filter.
- **Shop sections** (a shop's own grouping of its products) are unaffected.
- **Age verification** at checkout or delivery is a later feature; this feature only records and labels.
- **Customer search wording, the nine package statuses, delivery and pricing rules** are unchanged.
- **Depends on** product variants (098), product approval (067) and shop-managed stock (054), all
  complete in dev.
