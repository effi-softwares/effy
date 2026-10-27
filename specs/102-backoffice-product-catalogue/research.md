# Research: Back-Office Product Catalogue (102)

Each decision: what was chosen, why, what else was weighed. R-numbers are cited by the plan, the data
model and the contracts.

## R1 — Which service and gateway

**Decision**: every new route goes into the existing **`catalog`** service, on the **staff** gateway.

**Rationale**: `catalog` already owns staff-side product work — review, margin, placements, missing
details, taxonomy — behind the back-office authorizer and its `guard(event, scope, "read" | "decide")`.
A product list, holds, Effy creation and imports are the same audience (back-office) and the same domain
(the catalogue). `docs/api/path-assignment.md`: one service per audience and domain.

**Capacity** (measured 2026-10-27 by `gateway-capacity.contract.test.ts`): the staff gateway carries
**189 / 300 (63 %)** — admin 49, admin-promotions 32, fleet 48, orders 30, catalog 23, inventory-staff 7.
This feature adds **15** (contracts/api.md) → **204 / 300 = 68 %**, under the 75 % alarm. `gateway-capacity.contract.test.ts` is the authority; re-run it at T-time.
Should it pass 75 %, split `catalog` into a second stack from the same directory (the `inventory` /
`admin-promotions` precedent) — never merge routes.

**Alternatives**: a new `products-admin` service (rejected: a second staff service for one domain);
the `admin` service (rejected: `catalog` already holds the product decisions this sits beside).

## R2 — How a hold is stored, and why it cannot be undone by a shop

**Decision**: four nullable columns on `public.product` — `held_at`, `held_by`, `held_reason`,
`held_prior_status` — plus two CHECKs:

- `product_hold_shape_ck`: all four set or all four NULL;
- `product_held_not_active_ck`: `held_at IS NULL OR status <> 'active'`.

Holding sets `status = 'unavailable'` (remembering the prior status). Release restores the prior status.
Hold and release history lives in `admin.audit_log` (`product.held` / `product.released`), like every
other staff decision on a product.

**Rationale**:
- **Every storefront reader already sells only `status = 'active'`.** Making a hold a status change means
  no storefront, cart, checkout or search query changes, and SC-004 holds at the database: *no* route —
  present or future — can make a held product active, because the CHECK refuses it.
- The shop's `changeStatus` and the shared `setVariantState` add an explicit early refusal
  (`product_held`, 409) so the shop gets a sentence instead of a constraint error.
- A separate `product_hold` table was weighed: it gives history for free but adds a join to every list
  read; the audit log already carries history for review decisions, so holds read the same way.

**Interactions** (spec edge cases):
- **Held while in review**: approving a held new product must not set `active`. `approveNewProduct`
  writes `held_prior_status = 'active'` and leaves `status` as is when the product is held — release
  then puts it on sale.
- **Change approved while held**: changes never touch `status`; nothing to do (FR-016).
- **Release when the prior status was `active` but the product no longer has a main picture, or the
  shop is not active**: release to `unavailable` and say so in the response (`releasedTo`).
- **Archived**: cannot be held (409); a held product cannot be archived by the shop (it would orphan the
  hold) — `changeStatus` refuses every status change while held, not only `active`.
- **Sizes**: `setVariantState(..., 'active')` returns a new outcome `held` while the product is held
  (spec FR-012, Story 5 #5). Off-sale and remove stay allowed.

## R3 — Effy-created products: one writer of product content

**Decision**: extract the shop service's create and in-place (never-approved) edit into
**`@effy/edge-shared/catalog` `authoring.ts`** — parse, validate against the leaf's form, write the row,
the variant set (`applyVariantSet`), the details (`writeProductDetails`) and media rows — parameterised
by `{ shopId, actor: { kind: "shop" | "effy", sub } }`. The shop service's `createProduct` and the
draft branch of `updateProduct` call it; the `catalog` service calls it for Effy. The shop's
*proposal* path (`change.ts`, approved products) stays in the shop service — Effy never proposes.

**Rationale**: two copies of product validation is the two-sources-for-one-fact shape this repo
refuses. The shared module already holds both writers the form needs; `authoring.ts` composes them.
A guard (`authoring.guard.test.ts`) fails an `INSERT INTO public.product` outside it.

**Alternatives**: the catalog service calling the shop service over HTTP (rejected: service-to-service
calls are not a pattern here, and the shop authorizer would refuse a staff token); copying the shop's
service (rejected above).

## R4 — Effy-created products are approved as made, and Effy finishes them

**Decision** (operator, 2026-10-27): an Effy-created product is created with `approved_at = now()` and
its margin (required), priced at once (`priceVariants`), and a new column
**`content_owner` (`shop` | `effy`, default `shop`)** set to `effy`.

- While `content_owner = 'effy'`, back-office may edit its content in place through `authoring.ts`
  (`PATCH /catalog/v1/products/{id}`), and the **shop may not** edit it or change its status
  (409 `effy_setting_up`) — two writers on one draft would race.
- After every Effy write, **`completeIfReady`** checks the submit rules (required details, a main
  picture, a valid variant set with one size on sale). When they pass it sets `status = 'active'`,
  `content_owner = 'shop'` in the same transaction, audits `product.effy_completed` and notifies the
  shop (`shop_product_added_by_effy`). From then on the product is the shop's like any other, and later
  content changes go through the 067 change review.
- It never enters the review queue (`review_state` stays `none`; `approved_at` is set).
- `product.created_via` (`shop` | `effy` | `import`) and `product.import_id` record origin (FR-018,
  FR-025); `created_by` keeps the actor's sub as today.

**Shop view**: the shop's review state gains `effy_setup` ("Effy is setting this up"), computed in
`REVIEW_STATE_SQL` ahead of `live`.

## R5 — Bulk import: parsed in the browser, checked and created by a worker

**Decision**:
1. **Template and parsing in back-office.** Staff download an `.xlsx` template generated in the browser,
   and upload `.xlsx` or `.csv`. The browser parses it to rows of strings and posts JSON
   (`POST /catalog/v1/imports`) — no file reaches a Lambda, and 500 rows are ~200 KB, well under the
   payload limit.
   - New dependencies (back-office only): **`read-excel-file`** and **`write-excel-file`** (MIT, small,
     maintained) and **`papaparse`** for CSV. Not SheetJS: the npm `xlsx` package is frozen at a version
     with published advisories, and its fixed builds are off-registry.
   - The parsed shape is the trust boundary: the server re-validates every cell.
2. **Checking and creating are asynchronous.** Picture links must be fetched and 500 rows checked;
   that does not fit an API request's 29 s. `POST /imports` writes `product_import` (`checking`) and its
   rows, then sends one message to a new SQS queue **`product-import`**; a route-less worker in `catalog`
   checks every row, fetches pictures into a **private staging prefix** (`imports/<importId>/…`), writes
   each row's result and sets `checked`. `POST /imports/{id}/create` sets `creating` and enqueues again;
   the worker creates every ready product, **one transaction per product**, through `authoring.ts`, and
   sets `done`. Each step announces `products` to back-office; the screen re-reads (no polling).
   - SQS (not an async Lambda invoke) for retries and a dead-letter queue with an alarm, matching the
     notifications path. The worker is idempotent: a row already `created` is skipped; a message for an
     import not in the expected state is dropped.
3. **Picture copy**: on create, each staged picture is copied to the product's `products/…` key, so the
   bucket's existing notification makes the WebP renditions (086) exactly as for a shop upload. The
   staging prefix is **not** in `PUBLIC_MEDIA_PREFIXES` and has a 7-day lifecycle rule (Terraform).

## R6 — Import rows: shape and duplicate safety

**Decision**: one row per **size**; rows sharing a **Product key** are one product (its product-level
columns are read from its first row; a later row that disagrees is an error). Columns: Product key,
Name, Brand, Short description, Long description, **Category** (full path, e.g. `Dairy › Milk › Full
cream`, or the category's id), Storage, GST, 18+, Option 1 name / value, Option 2 name / value, **SKU**
(required), Barcode, Shop price, Compare-at price, Weight (g), Pack quantity, Pack unit, Stock, Picture
links (`|`-separated, first = main), and one **`Detail: <attribute name>`** column per detail. The
template download takes chosen leaves and pre-fills their detail columns; unknown columns are an error
on the import, not ignored.

- **SKU is required on every import row.** It is the key that makes FR-023 provable: a row whose SKU
  (case-insensitive — the existing `product_variant_shop_sku_uq`) or barcode already exists in the shop,
  or appears twice in the file, is not ready; at create the unique index is the last word (a race →
  that product is left out with the reason). Uploading the same file twice therefore creates nothing the
  second time.
- **Margin**: one margin for the import (required on `POST /imports`), overridable per row by an optional
  **Margin** column.
- Limit **500 rows** per import, one shop per import.

## R7 — Picture links: fetching safely (SSRF)

**Decision**: the worker fetches only `https:` URLs; resolves the host and refuses loopback, private,
link-local, CGNAT and unique-local ranges (v4 and v6), and re-checks after each redirect (max 3); 15 s
timeout, 10 MB cap read as a stream; the bytes must sniff as JPEG, PNG or WebP (`image-dimensions.ts`)
and meet the shop upload's minimum size. A failure makes the row not ready with the reason ("picture 2
could not be fetched"). The worker has no permission but `PutObject` on `imports/*`, `GetObject` on
`imports/*` and `PutObject` on `products/*`.

## R8 — The list query

**Decision**: one repository read in `catalog` (`products/repository.ts`):
- search: `product_search_trgm_idx` for text; an exact, case-insensitive SKU / barcode match through
  `product_variant` (`product_variant_shop_sku_uq` is per shop, so add
  **`product_variant_sku_lower_idx`** on `lower(sku)` and use `product_variant_gtin_idx`) — `EXISTS`, so a
  product with several matching sizes appears once;
- aisle filter through `category_ancestor` (includes every aisle below), never a recursive CTE;
- the **state** is one SQL expression, `BACKOFFICE_STATE_SQL`, used by the rows and by the counts
  (precedence: held › archived › in review › change pending › draft (never approved, incl. sent back and
  Effy setting up) › on sale › off sale);
- counts per tab: one grouped query with the same filters minus the tab;
- paging: keyset on the sort key + id; page size 50;
- from-prices and low stock from `product_variant` aggregates in a lateral join.
Target: < 1 s at 50 000 products (SC-002); verified with `EXPLAIN ANALYZE` on a seeded 50k set in the
container test.

## R9 — Live updates

**Decision**: a new kind **`products`** in `LIVE_KINDS` ("a product's sale state or Effy's handling of it
changed"), announced to back-office and to the product's shop. Back-office maps it to `["products"]`
and `["product-review"]`; shop-web maps it to its products query. Every new route that changes a
product announces after commit (`change-map.guard.test.ts`). The KMP apps parse unknown kinds as `null`,
so no app change is needed.

## R10 — Who may do what

**Decision**: `guard(…, "read")` for the list, detail, import list and import read (any active staff,
csa included); `guard(…, "decide")` (admin, manager) for everything that writes. The UI hides actions
for csa from `roles`, as product review does; the server is the authority.

## R11 — Notifications to the shop

**Decision**: three new `notification_request` types, all `audience = 'shop'`, push + console, through the
existing notifications worker and email templates: `shop_product_held` (with the reason),
`shop_product_released`, `shop_product_added_by_effy` (one per product when it completes; an import
sends **one** summary `shop_products_imported` with the count instead of one per product). Bulk holds
group per shop: one notification per shop per bulk action (`dedupe_key` = action id + shop).

## R12 — Back-office UI shape

**Decision**: a new feature folder `apps/back-office/src/features/products/`, routes `/products`,
`/products/new`, `/products/$productId`, `/products/imports`, `/products/imports/$importId`.
- **List**: a TanStack Table (server-driven), the console's `ef-*` table patterns, tabs with counts,
  a filter row (search, shop combobox, aisle picker from the taxonomy query, storage, margin, missing
  details, low stock), row selection with a bulk bar (Hold · Release · Set margin). Filters live in the
  route's search params (FR-007). No cards (layout doctrine).
- **Product page**: a sectioned page with tabs — Overview · Sizes & stock · Details · Aisles · History —
  and a header with the state pill, shop, and actions (Hold / Release, Set margin). Pending changes link
  to `/product-review/$productId`.
- **New product**: the shop-web product form. If its form components are not already in
  `@effy/web-kit`, they move there (rule: used by both consoles → shared) — the details renderer from
  101 especially, so one form exists. *Verify at task time*; this is the largest UI risk.
- **Imports**: a list per shop, and an import page showing rows grouped Ready / Not ready with each
  problem, and a Create button.
- Nav: **Catalogue › Products** (first in the group), with subs **All products** and **Imports**; the
  shop detail screen gets a "Products" link to `/products?shopId=…`.

## Implementation notes (2026-10-27) — where the build departed from the plan, and why

- **R1 (after)**: `gateway-capacity.contract.test.ts` → staff **203 / 300 (68 %)**; catalog went 23 → 37 routes
  (+14, not 15: see R3 below).
- **R3/R4 — an Effy-created product is a draft until it is complete, then Effy approves it.** Instead of approving at
  creation and editing an approved product in place, the product is created as a draft (`approved_at` NULL,
  `review_state = 'none'`, never queued) carrying Effy's margin; `completeIfReady` approves it, prices it and puts it
  on sale (or keeps it off sale while held) the moment it is complete, and hands it to the shop. This reuses the
  draft writers unchanged and never touches an approved product's content outside review.
  `product_effy_owned_draft_ck` holds it: Effy-owned ⇒ never approved, never in review, margin set.
- **No media-register route**: Effy's form uploads with `POST …/{id}/media` (presign) and sends the complete picture
  list in `PATCH …/{id}` (`replaceEffyDraft`). Pictures must be under `products/<productId>/`.
- **R5 — shop-web's form moved to `@effy/web-kit/product-form`** (steps, fields, variant editor, picker, draft and
  validation helpers, with their tests); each console keeps its own flow. `CategoryPicker` reports analytics through
  `onEvent` instead of importing shop-web's telemetry. The sticky form foot became `ef-actionbar` in `console.css`
  (used by both consoles now).
- **R6 — import columns**: no Stock and no per-row Margin column (one margin per import; stock is the shop's after
  import). A required detail left empty makes the row **not ready** (the shop's create path would accept it as a
  draft; a list is imported complete). The sheet's header is stored on `product_import.columns`; each row's cells
  are a JSON array read against it.
- **R7**: the address check runs in the connection's own DNS `lookup` (no window between check and connect);
  IPv4-mapped IPv6 is checked as its IPv4 address.
- **R8 — paging is by offset in an opaque cursor** (≤ 5 000 deep), not keyset: four sorts, one of them computed, and
  staff page a few screens at most. SC-002 held at 50 000 products (`list-perf.container.test.ts`).
- **R9**: `products` is not in the live channel's send-failure alarm (an alarm holds 10 metrics; a stale screen is
  the only cost), like `promotions` and `taxonomy`.
- **Back-office list pictures are presigned** (as product review's), not CDN addresses: the public-address guard
  keeps CDN addresses to the shopper services.
