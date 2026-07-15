# Feature Specification: Shop Product Catalog Management

**Feature Branch**: `015-shop-product-catalog`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "product catalog feature for the platform — each shop has its own catalog of grocery/household/food products; a shop-dashboard page with a product table (backend search/filter/pagination), an add-product step form (web drawer / mobile bottom sheet) with mandatory + optional attributes and a local draft, a product-details page (sections/tabs, NO cards) with small focused edit actions (pencil → web dialog / mobile bottom sheet). Inventory is 'coming soon'. Attributes are dynamic and back-office-managed. Platform looks to Uber Eats + eBay as reference. No CARD design anywhere unless truly necessary."

## Platform design doctrine (established by this feature) *(binding, cross-cutting)*

Two platform-wide rules are first written down here because this feature is where they first bite. They are **not scoped to this feature** — they are meant to guide every current and future surface, and SHOULD be promoted into the constitution (Principle V — Native-Feel, Consistent Design) so every agent and contributor inherits them.

- **DOCTRINE-1 — Reference platforms.** Effy is *"Uber Eats + eBay, food-first."* When deciding business logic, data models, entities, or UI/UX for any feature, the team looks to how **Uber Eats** (food, menus, modifiers, discovery) and **eBay** (rich product entities, attributes/item-specifics, category taxonomy, search/filter) solve the same problem, adapts it to Effy's single-brand hidden-fulfillment model, and prefers the industry-standard, production-grade pattern over a bespoke one. Food and food-related products get priority.
- **DOCTRINE-2 — No card layouts.** Card-style containers (bordered/elevated boxes tiling content, "metric cards," dashboard summary cards) MUST NOT be used to lay out content, **unless a card is genuinely the right pattern for that specific content and no better layout exists** — in which case the plan records the justification. Prefer tables, lists, sectioned pages, tabs, and detail rows. There are **no metric/summary cards at the top of pages.**

## Clarifications

### Session 2026-07-15

- Q: How should removing a product work (hard delete vs the archived status)? → A: **Both** — archiving is the default "remove" (the row and its data are retained so future references stay intact); a **hard delete** is permitted only for a product that is not referenced anywhere (e.g., a never-published draft-status product with no dependent data).
- Q: Who in a shop may manage the catalog (create/edit/delete)? → A: **Both manager and staff** — any user with an **active shop assignment** (`shop_manager` *or* `shop_staff`) may create/edit/delete; role-less/unassigned users and users at an inactive shop are refused. (This replaces the earlier manager-only assumption.)
- Q: Is there a required uniqueness key for a product within a shop? → A: **SKU unique per shop when provided** — SKU is optional, but when set it MUST be unique within that shop; product **name** and **GTIN** are not forced unique, and there is no cross-shop uniqueness.
- Q: Which fields does product search match? → A: **Name + SKU + brand + description** — backend text search covers these core fields.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Back office defines the catalog schema (Priority: P1)

A back-office administrator maintains the **shared vocabulary** that every shop's catalog is built from: the list of **product types** (e.g., *Prepared Food*, *Packaged Grocery*, *Beverage*, *Household*), the reusable **attribute definitions** (e.g., *Brand*, *Net weight*, *Allergens*, *Dietary labels*, *Spice level*, *Preparation time*, *Storage*), and the **platform category taxonomy** (food categories, grocery aisles, household). For each product type they choose which attributes apply and whether each is **mandatory or optional**. This library is the source of truth that drives what a shop is asked for when it creates a product.

**Why this priority**: Nothing else in the feature can exist without it — the product-creation form, the table's filters, and the details page are all *generated from* this schema. It is the foundation, and it is independently demonstrable.

**Independent Test**: In the back office, create a new product type "Prepared Food", attach three attributes (one mandatory, two optional) and place it under a food category. Confirm the type, its attribute assignments, and the category are saved and retrievable. No shop or product is needed to prove this story.

**Acceptance Scenarios**:

1. **Given** an administrator on the catalog-schema screen, **When** they create an attribute definition with a data type (e.g., a single-select list with allowed values), **Then** it is saved and becomes available to assign to any product type.
2. **Given** an existing product type, **When** the administrator assigns an attribute and marks it mandatory, **Then** every shop creating a product of that type is thereafter required to provide it.
3. **Given** the category taxonomy, **When** the administrator adds a child category under a parent, **Then** the new category is available for shops to classify products under.
4. **Given** an attribute that is already in use by existing products, **When** the administrator attempts a change that would invalidate stored values (e.g., removing an allowed value in use), **Then** the system prevents silent data loss and surfaces the conflict.

---

### User Story 2 - Shop adds a product with a guided, schema-driven step form (Priority: P1)

A shop operator opens their catalog page and starts **Add product**. On web this opens a focused **drawer/dialog**; on mobile a **bottom-sheet drawer**. The flow is a clear, **multi-step form** with obvious separation of concerns: first choose the **product type**, then fill the **universal mandatory basics** (name, category, price, primary image, short description), then the **type-specific attributes** (mandatory ones required, optional ones clearly marked skippable), then **review & publish**. Work-in-progress is preserved as a **local draft** (device-local, not saved to the platform) so an interrupted operator can resume; the draft is discarded on submit or explicit discard.

**Why this priority**: Creating products is the core job the feature exists to enable; without it the catalog is empty. It exercises the schema (US1) end-to-end and delivers immediate value.

**Independent Test**: With at least one product type defined, a shop operator completes the step form for a food product, providing all mandatory fields, and the product appears in that shop's catalog. Closing the flow mid-way and reopening restores the entered values from the local draft.

**Acceptance Scenarios**:

1. **Given** the add-product flow, **When** the operator selects a product type, **Then** the subsequent steps present exactly that type's mandatory and optional attributes, grouped and labeled clearly.
2. **Given** a step with unmet mandatory fields, **When** the operator tries to advance or publish, **Then** progression is blocked and the missing fields are indicated inline.
3. **Given** a partially completed flow, **When** the operator closes it and returns later on the same device, **Then** their entries are restored from the local draft.
4. **Given** a completed valid form, **When** the operator publishes, **Then** the product is created in that shop's catalog, the local draft is cleared, and the operator is returned to the catalog with the new product visible.
5. **Given** the operator provides an optional attribute value, **When** they publish, **Then** the value is stored against the product; omitting an optional attribute never blocks creation.

---

### User Story 3 - Shop browses and finds products in a backend-driven table (Priority: P1)

A shop operator views their catalog as a **product table/list** — the full list of that shop's products. They **search** by text, **filter** (by product type, category, section, status, price range, and other indexed attributes), **sort**, and page through results. All searching, filtering, sorting, and pagination are **performed by the backend** — the client requests a page of results, never fetching the whole catalog to filter locally.

**Why this priority**: A catalog is only useful if the operator can see and locate items. It is the operator's daily entry point and is independently valuable the moment products exist.

**Independent Test**: With more products than fit on one page, apply a text search and a status filter; confirm results are correct, paginated, and returned as discrete pages (the client demonstrably does not hold the entire catalog). Clearing filters restores the full paged list.

**Acceptance Scenarios**:

1. **Given** a catalog larger than one page, **When** the operator opens the catalog, **Then** the first page of results is shown with controls to move between pages and a total count.
2. **Given** a search term, **When** the operator searches, **Then** only matching products (by name and key attributes) are returned, paginated, and the result reflects the shop's catalog only.
3. **Given** an active filter (e.g., status = draft), **When** applied, **Then** the returned set and total count reflect the filter, computed by the backend.
4. **Given** a shop operator, **When** they view the table, **Then** it contains **only their shop's** products and never another shop's.
5. **Given** any list state, **When** rendered, **Then** no card-style tiles are used and there are no summary/metric cards above the table (DOCTRINE-2).

---

### User Story 4 - Shop views product details and edits in small, focused steps (Priority: P2)

Selecting a product opens its **details page**, where all of the product's information is organized into clear **sections and, where helpful, tabs** (e.g., Overview, Attributes, Media, Pricing, Categorization) — **never card tiles** (DOCTRINE-2). Each section or small related group of fields carries an **edit affordance (a pencil icon)**. Editing is **deliberately focused**: activating an edit opens a **small** editor — a **dialog on web, a bottom-sheet drawer on mobile** — scoped to just that field or small related group (one or two fields / one logical group), never a giant "edit everything" form. Saving updates only that part and returns to the details view.

**Why this priority**: Viewing and correcting product data is essential but follows creation and listing; a shop can operate briefly without granular editing, so it ranks just below the create/list core.

**Independent Test**: Open an existing product, edit one focused group (e.g., pricing) via its pencil action, save, and confirm only that group changed while the rest of the page is unaffected; confirm the details page uses sections/tabs and no cards.

**Acceptance Scenarios**:

1. **Given** a product in the table, **When** the operator selects it, **Then** its details open on a dedicated page organized into sections/tabs with no card layout.
2. **Given** a section with an edit affordance, **When** the operator activates the pencil, **Then** a small focused editor opens (dialog on web, bottom sheet on mobile) containing only that section's field(s).
3. **Given** a focused editor with a change, **When** the operator saves, **Then** only that field/group is updated and the change is reflected on the details page.
4. **Given** a focused editor, **When** the operator cancels, **Then** no change is made.
5. **Given** a mandatory attribute, **When** edited to an empty/invalid value, **Then** the save is blocked with an inline reason.

---

### User Story 5 - Shop organizes and governs its catalog lifecycle (Priority: P3)

A shop operator organizes its catalog into its own **sections** (e.g., "Breakfast", "Pantry") for internal grouping, and governs each product's **lifecycle state** (e.g., draft / active / unavailable / archived) so the catalog reflects what the shop actually offers. Inventory/stock tracking is explicitly **out of scope** and shown as **"coming soon."**

**Why this priority**: Organization and lifecycle are quality-of-life improvements on top of a working catalog; valuable but not required to prove the feature.

**Independent Test**: Create a shop section, assign products to it, filter the table by that section; change a product's status and confirm the table filter reflects it. Confirm an inventory area is present but clearly marked "coming soon" and offers no stock editing.

**Acceptance Scenarios**:

1. **Given** a shop, **When** the operator creates a section and assigns products, **Then** those products can be filtered/grouped by that section.
2. **Given** a product, **When** its status is changed (e.g., active → unavailable), **Then** the change is persisted and reflected in the table and its details.
3. **Given** the product details or catalog, **When** the operator looks for stock/inventory, **Then** they see a clearly labeled "coming soon" placeholder and cannot enter stock data.

---

### Edge Cases

- **Empty catalog**: a shop with zero products sees a helpful empty state (with a prominent Add-product action), not an error or a blank table.
- **No schema yet**: if no product types exist, the add-product flow explains that catalog setup is pending rather than presenting an empty type list.
- **Schema drift after creation**: if the back office later marks an attribute mandatory, or retires a product type, existing products that predate the change remain valid and viewable; the system must not corrupt or hide them, and must indicate when an existing product is now missing a newly-required attribute.
- **Concurrent edits**: two operators editing the same product's different sections should not clobber each other's unrelated changes; editing the same field concurrently must resolve deterministically (last-write with a conflict signal, not silent loss).
- **Draft on a different device**: a local draft is device-local; an operator who switches devices will not see it, and this is acceptable and expected (drafts are explicitly not synced).
- **Large media / unsupported file**: image uploads that are too large or of an unsupported type are rejected with a clear reason, not a silent failure.
- **Cross-shop isolation**: an operator must never see, search, edit, or link to another shop's products; attempts to reach another shop's product by direct reference are refused.
- **Permission boundary**: a principal without an active shop assignment/role (role-less, unassigned, or at an inactive shop) cannot create/edit/archive/delete; attempts are refused by the backend, not merely hidden in the UI.
- **Duplicate SKU**: creating or editing a product with a SKU already used by another product in the **same shop** is rejected with an inline reason; a blank/absent SKU is always allowed.
- **Hard-delete guard**: attempting to permanently delete a product that has been published/active or is referenced elsewhere is refused; archiving is offered instead.
- **Price/number validity**: negative prices, non-numeric numeric attributes, or values outside a defined range are rejected with inline reasons.
- **Very long attribute schemas**: a product type with many attributes still produces a usable, well-grouped step form and a readable details page (no single overwhelming screen).

## Requirements *(mandatory)*

### Functional Requirements

**Catalog schema authority (back office)**

- **FR-001**: The system MUST let authorized back-office users define and maintain **product types** (a named classification that determines which attributes a product of that type carries).
- **FR-002**: The system MUST let authorized back-office users define and maintain a reusable library of **attribute definitions**, each with a name, a **data type** (at minimum: short text, long text, number/decimal with optional unit, boolean, single-select, multi-select), optional allowed-value list (for select types), optional unit, optional validation constraints (e.g., min/max, max length), and help text.
- **FR-003**: The system MUST let authorized back-office users **assign attributes to product types**, marking each assignment **mandatory or optional**, and controlling its display order and grouping within the creation/detail experience.
- **FR-004**: The system MUST let authorized back-office users maintain a **platform category taxonomy** (hierarchical: parent categories and child categories) that shops classify products under.
- **FR-005**: The catalog schema (types, attributes, categories) MUST be **easily manageable by the back office** without code changes or a new deployment — adding a type, attribute, or category is a data operation performed through the back-office console.
- **FR-006**: The system MUST prevent schema changes that would **silently invalidate or destroy** stored product data (e.g., deleting an in-use attribute or removing an in-use allowed value) — such changes are blocked or require explicit handling, and the conflict is surfaced.
- **FR-007**: Managing the catalog schema MUST be restricted to authorized back-office roles; the access decision MUST be **backend-authoritative** (a valid session without the role is refused by the backend, not merely hidden).

**Shop product creation**

- **FR-008**: A shop operator MUST be able to create a product for **their own shop** via a **guided multi-step form**, presented on web as a focused drawer/dialog and on mobile as a bottom-sheet drawer.
- **FR-009**: The creation flow MUST require the operator to **select a product type**, and MUST then present **exactly that type's** mandatory and optional attributes, clearly separated and grouped, with optional attributes visibly marked as skippable.
- **FR-010**: The creation flow MUST capture a set of **universal mandatory basics** for every product regardless of type — at minimum: **name/title, product type, primary category, price with currency, at least one product image, and a short description** — and MUST block publication until all mandatory fields (universal + the type's mandatory attributes) are valid.
- **FR-011**: The creation flow MUST accept **optional attributes** without ever requiring them, storing any provided values against the product.
- **FR-012**: The system MUST preserve an in-progress creation as a **device-local draft** (local storage on web, local persistence on mobile) that is **not** persisted to the platform, MUST restore it when the operator reopens the flow on the same device, and MUST clear it on successful publish or explicit discard.
- **FR-013**: On successful creation the product MUST appear in that shop's catalog, associated only with that shop.
- **FR-013a**: A product's **SKU** is optional; when provided it MUST be **unique within the owning shop**, and creation/edit MUST reject a duplicate SKU with an inline reason. Product **name** and **GTIN/barcode** are NOT required to be unique, and no uniqueness is enforced across shops.

**Shop catalog browsing (backend-driven)**

- **FR-014**: A shop operator MUST be able to view **their shop's products** as a table/list showing key columns (e.g., image, name, type, category, price, status).
- **FR-015**: The system MUST support **text search** across a product's **name, SKU, brand, and description**, returning matching products for the operator's shop only.
- **FR-016**: The system MUST support **filtering** by at least product type, category, shop section, status, and price range, and **sorting** by at least name, price, and recency.
- **FR-017**: Search, filtering, sorting, and **pagination MUST be performed by the backend** — the client requests discrete pages and MUST NOT retrieve the entire catalog to compute results locally.
- **FR-018**: List responses MUST include enough information to render pagination controls and a **total result count** reflecting the active search/filters.
- **FR-019**: The catalog list MUST enforce **shop isolation**: an operator can only ever list, search, and open products belonging to their own shop.

**Product details & focused editing**

- **FR-020**: Selecting a product MUST open a dedicated **details page** presenting all of the product's information organized into **sections and, where helpful, tabs** (e.g., overview, attributes, media, pricing, categorization).
- **FR-021**: The details page MUST NOT use **card-style layouts**, and pages MUST NOT show **summary/metric cards** (DOCTRINE-2).
- **FR-022**: Each section (or a small related group of fields) MUST provide a **focused edit affordance (pencil icon)** that opens a **small** editor scoped to only that field or group — a **dialog on web**, a **bottom-sheet drawer on mobile**.
- **FR-023**: Focused editing MUST update **only** the field(s)/group being edited, leaving the rest of the product unchanged, and MUST validate against the schema (mandatory attributes cannot be cleared; typed/constrained values are enforced) with inline reasons on failure.
- **FR-024**: The system MUST NOT present a single "edit the whole product" mega-form as the primary editing model; editing is decomposed into small focused actions.

**Media**

- **FR-025**: A product MUST support at least one **image**, with a designated **primary image** and support for **additional gallery images**, orderable by the operator.
- **FR-026**: The system MUST reject invalid media (unsupported type, oversized) with a clear reason.

**Categorization & lifecycle**

- **FR-027**: A product MUST be classifiable under the **platform category taxonomy** (at least one primary category).
- **FR-028**: A shop MUST be able to define its own **sections** to organize its catalog and assign products to them; sections are shop-local and do not affect the platform taxonomy.
- **FR-029**: A product MUST have a **lifecycle status** (at minimum: draft, active, unavailable, archived) that the operator can change, and that is reflected in the table and its details.
- **FR-029a**: "Removing" a product MUST default to **archiving** it — the row and its data are retained so any future references stay intact. A **hard delete** (permanent removal) MUST be permitted **only** for a product that is not referenced anywhere (e.g., a never-published draft-status product with no dependent data); a product that has been published/active or is otherwise referenced MUST NOT be hard-deleted, only archived.

**Permissions & isolation**

- **FR-030**: Creating, editing, archiving, and deleting products MUST require an **active shop assignment with any shop role** (`shop_manager` or `shop_staff`); the decision MUST be **backend-authoritative**. Role-less/unassigned principals, and users whose shop is not active, MUST NOT mutate the catalog (refused by the backend, not merely hidden in the UI).
- **FR-031**: All product data access (list, detail, mutate) MUST be strictly **scoped to the operator's shop**; cross-shop access is refused by the backend.

**Cross-surface parity & responsiveness**

- **FR-032**: The shop catalog capability MUST be delivered on **both** shop surfaces — the shop web console and the shop mobile app — at capability parity, and this parity MUST be recorded in the shop capability register.
- **FR-033**: The web experience MUST be **desktop-first** yet **excellent on mobile web**; the mobile app experience MUST be **tablet-first** yet **excellent on phones** — both fully responsive, with appropriate touch targets and native-feeling interactions per platform.

**Design doctrine (feature-level, promoting to platform-wide)**

- **FR-034**: This feature (and, once promoted, every surface) MUST follow **DOCTRINE-1** — reference Uber Eats and eBay for business logic, data models, and UI patterns, favoring the industry-standard approach and prioritizing food and food-related products.
- **FR-035**: This feature (and, once promoted, every surface) MUST follow **DOCTRINE-2** — no card layouts and no metric/summary cards unless a card is demonstrably the right pattern with the justification recorded.

**Out of scope (explicit)**

- **FR-036**: Inventory / stock-level tracking is **out of scope** for this feature and MUST be presented as a clearly labeled **"coming soon"** placeholder that captures no stock data; a future specification will define it.

### Key Entities *(include if feature involves data)*

- **Product Type**: A back-office-defined classification (e.g., *Prepared Food*, *Packaged Grocery*, *Beverage*, *Household*) that determines which attributes a product carries. Has a name, description, status, and an ordered set of attribute assignments.
- **Attribute Definition**: A reusable, back-office-defined attribute (e.g., *Brand*, *Net weight*, *Allergens*, *Dietary labels*, *Spice level*, *Preparation time*, *Storage temperature*, *Country of origin*, *Ingredients*, *Material*, *Dimensions*). Carries a data type, optional unit, optional allowed values, optional validation, and help text. Reusable across many product types.
- **Attribute Assignment**: The link between an Attribute Definition and a Product Type, carrying the **mandatory/optional** flag, display order, and grouping/section hint. This is what makes creation "type-driven."
- **Product**: A **shop-owned** catalog item. Carries universal fields (name/title, owning shop, product type, primary category, price + currency, optional compare-at/sale price, short + long description, lifecycle status, GTIN/barcode, and an optional **SKU** that — when set — is **unique within the owning shop**) plus a set of attribute values keyed to its type's schema, plus media and section memberships. GTIN/barcode is captured to enable a **future** cross-shop master-catalog dedupe without committing to it now (and is not itself a uniqueness key).
- **Product Attribute Value**: The value a specific product holds for a specific assigned attribute (the dynamic, schema-driven data).
- **Category (platform taxonomy)**: A back-office-managed hierarchical classification (parent/child) that products are filed under; shared across all shops for consistent classification.
- **Shop Section**: A **shop-local** grouping (like a menu section or aisle) that a shop defines to organize its own catalog; does not affect the platform taxonomy.
- **Product Media**: Images associated with a product, with one primary image and orderable additional gallery images.
- **Draft (device-local)**: An in-progress product-creation state stored only on the operator's device; not a platform record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A back-office administrator can define a new product type, attach mandatory and optional attributes, and place it in the category taxonomy — and a shop can then create a product of that type — **without any code change or deployment**.
- **SC-002**: A shop operator can create a complete, valid product through the guided step form in **under 3 minutes** for a typical food item, on both web and mobile.
- **SC-003**: An operator who abandons the creation flow mid-way and returns on the same device recovers **100%** of their previously entered values from the local draft.
- **SC-004**: With a catalog of **10,000+** products, searching/filtering returns the correct first page and total count in **under 1 second** as experienced by the operator, and the client never loads more than one page of results at a time.
- **SC-005**: Search and filter results are **100% shop-isolated** — no operator can retrieve, view, or edit any product outside their own shop across every access path (list, search, direct reference).
- **SC-006**: Editing a single focused section changes **only** that section's data in **100%** of cases, with the rest of the product provably unchanged.
- **SC-007**: The product table and details page contain **zero** card-style tiles and **zero** metric/summary cards (DOCTRINE-2 verified on both surfaces).
- **SC-008**: The catalog capability reaches **parity on both** the shop web console and the shop mobile app, and the parity register records it for both.
- **SC-009**: Both surfaces render and remain fully usable across their responsive range (desktop→mobile web; tablet→phone app) with no broken layouts or unreachable controls.
- **SC-010**: A principal lacking an active shop assignment/role (role-less, unassigned, or at an inactive shop) is refused all create/edit/archive/delete operations by the backend in **100%** of attempts, even if a UI control were reachable.
- **SC-011**: Every mandatory field (universal + the selected type's mandatory attributes) is enforced at creation and edit; a product cannot be published or saved with a missing/invalid mandatory value.

## Assumptions

- **Backend path**: All catalog APIs are **shop-side and back-office management operations** (ops/admin CRUD), so they run on the **cold path** (edge-api), consistent with the operator's stated preference. No latency-sensitive customer traffic is introduced by this feature; a future customer-facing browse/search may warrant the hot path and will be decided in its own spec.
- **No customer-facing surface**: This feature is management-only (shop + back office). Customers do not see this catalog yet; a customer storefront catalog is a separate future slice.
- **Roles** (clarified): Managing a shop's catalog (create/edit/archive/delete) requires an **active shop assignment with any shop role** (`shop_manager` or `shop_staff`); role-less/unassigned users and users at an inactive shop are refused. Managing the catalog **schema** requires back-office admin/manager roles. All decisions are backend-authoritative; catalog CRUD reuses a **shop-scope membership check** (active shop, any role) rather than the manager-only gate.
- **Product ownership**: Products are **shop-owned and independent** (confirmed) — each shop authors its own product rows; there is no shared master product in this slice. GTIN/barcode is stored to keep a future master-catalog path open.
- **Attributes are dynamic** (confirmed): the exact attribute list is **data**, managed by the back office, not hardcoded. The plan will seed an initial, research-backed set (below) so the feature is usable on day one.
- **Categories**: A **platform-provided taxonomy** (seeded, back-office-managed) plus **shop-defined sections** (confirmed).
- **Variants/modifiers**: Handled through the dynamic attribute system rather than a separate bespanned variant engine in this slice; a richer food-modifier/variant experience may be revisited in a later slice if the attribute model proves insufficient.
- **Drafts** are **device-local only** (confirmed) — never synced to the platform; switching devices loses the draft, which is acceptable.
- **Inventory** is explicitly deferred ("coming soon"), per the operator.
- **Currency**: A single platform currency is assumed for pricing at this stage; multi-currency is out of scope.
- **Representative seed attributes (informative, back-office-managed, Uber Eats + eBay-informed)** — not a hardcoded schema, but the starting library the plan will seed:
  - *Food / Prepared*: dietary labels (veg/vegan/halal/etc.), allergens, spice level, portion/serving size, calories/nutrition, ingredients, preparation/lead time, served hot/cold, contains-alcohol.
  - *Packaged grocery*: brand, GTIN/barcode, net weight/volume + unit, units per pack, storage (ambient/chilled/frozen), country of origin, nutritional info, best-before handling.
  - *Household / general*: brand, material, dimensions, weight, hazardous flag.
  - *Universal*: name/title, product type, primary category, price + currency, primary image + gallery, short description, long description, status.

## Dependencies

- **Shop identity & shop-scope check** (007 / 014): reuses the shop pool, the shop authorizer, and a backend-authoritative **active-shop-membership check** (any shop role) for catalog-management authorization. The manager-only gate (`/shop/v1/manager-ping`) is **not** required for catalog CRUD, though it remains available for any future manager-only catalog action.
- **Back-office console & RBAC** (005 / 009): the schema-authority screens live in the back-office console and reuse its admin/manager RBAC.
- **Shop capability parity register** (`docs/audiences/shop-capabilities.md`): MUST gain catalog rows for both shop surfaces as part of this feature.
- **Shop data** (009): products belong to real shops created by back-office shop management.
- **Constitution promotion (recommended)**: DOCTRINE-1 and DOCTRINE-2 SHOULD be promoted into constitution Principle V via a `/constitution` amendment so they bind platform-wide beyond this feature.

## Out of Scope

- Inventory / stock-level tracking (explicit "coming soon"; future spec).
- Customer-facing catalog browse/search/detail (future customer slice).
- Cross-shop shared master catalog / offer model (kept possible via GTIN, not built).
- A dedicated food-modifier/variant engine beyond the dynamic attribute system.
- Pricing beyond a single base price (+ optional compare-at) in one currency — promotions, tax engines, and multi-currency are out of scope.
- Bulk import/export of catalogs.
