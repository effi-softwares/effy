# API Contracts: Back-Office Product Catalogue (102)

All routes: **`catalog` service, staff gateway** (`staff-api.<zone>`), back-office authorizer. Errors are
problem+json as elsewhere. `read` = any active staff (csa included); `decide` = admin or manager (R10).
Every write that changes a product announces `products` after commit (R9). DTOs are added to
`@effy/shared-types` (`backoffice-products.ts`).

`version` is the product's `updated_at::text` (as in review); a stale one is **409 `stale`** (the problem's
`detail` starts with the code); the console re-reads the product.

## Products

### 1. `GET /catalog/v1/products` — read
Query: `q`, `shopId`, `categoryId` (includes descendants), `state` (`all` | `on_sale` | `in_review` |
`change_pending` | `held` | `off_sale` | `draft` | `archived`), `storage`, `margin` (`set` | `not_set`),
`missingDetails` (`true`), `lowStock` (`true`), `sort` (`updated` | `name` | `price` | `shop`), `dir`,
`cursor`.

```ts
interface BackOfficeProductListDTO {
  items: {
    id: string; name: string; brand: string | null; imageUrl: string | null;
    shop: { id: string; name: string; status: ShopStatus };
    categoryPath: string[];
    variantCount: number;
    shopPriceFrom: string; customerPriceFrom: string | null; priceVaries: boolean;
    margin: MarginDTO | null;
    state: BackOfficeProductState;            // R8
    createdVia: "shop" | "effy" | "import";
    lowStock: boolean; missingRequired: number;
    updatedAt: string; version: string;
  }[];
  counts: Record<BackOfficeProductState | "all", number>;  // same filters, every tab
  nextCursor: string | null;
}
```

### 2. `GET /catalog/v1/products/{productId}` — read
`BackOfficeProductDTO`: everything in the review item's read (overview, facts, details, media, variants
with codes, shop and customer prices, weight, stock, state), plus `state`, `hold`
(`{reason, heldAt, heldBy: {name}} | null`), `contentOwner`, `createdVia`, `import` (`{id, fileName} |
null`), `pendingChange` (`boolean` — links to review), `placements`, `history` (`{at, actor: {kind:
"staff"|"shop"|"effy-system", name}, action, detail}[]`, newest first), `version`.
404 when unknown.

### 3. `POST /catalog/v1/products` — decide
Create a product for a shop (R3, R4). Body: the shop's create body (`primaryCategoryId`, `name`,
`shortDescription`, …, `options`, `variants`, `details`, facts, `media`) **plus** `shopId` and `margin`
(required). 400 with field issues exactly as the shop gets them; 409 `shop_not_active`.
Response 201: `BackOfficeProductDTO` — a draft Effy is setting up (`effySettingUp`, `effyContent` set); pictures
follow by route 5 and `PATCH`, which puts it on sale once complete.

### 4. `PATCH /catalog/v1/products/{productId}` — decide
Edit an Effy-owned product (`contentOwner = 'effy'`) in place; same body as the shop's update, plus
`version`, and `media` as the complete ordered list (primary first) — reorder and removal in one call.
409 `not_effy_owned` once the product belongs to the shop. Runs `completeIfReady` (R4).

### 5. `POST /catalog/v1/products/{productId}/media` — decide
Presign an upload to `products/<shopId>/<productId>/…` (the shared presign helper). Effy-owned only.

### 6. ~~`POST /catalog/v1/products/{productId}/media/register`~~ — not built
The picture list travels in `PATCH` (route 4), which runs `completeIfReady` (research, implementation notes).

### 7. `POST /catalog/v1/products/{productId}/hold` — decide
Body `{ reason: string (1–500), version }`. 409 `already_held`, `archived`, `stale`.
Response `BackOfficeProductDTO`. Notifies the shop (`shop_product_held`).

### 8. `POST /catalog/v1/products/{productId}/release` — decide
Body `{ version }`. Response `{ product: BackOfficeProductDTO, releasedTo: "active" | "unavailable" |
"draft", reason?: "no_main_picture" | "shop_not_active" }`. 409 `not_held`, `stale`.

### 9. `POST /catalog/v1/products/{productId}/variants/{variantId}/state` — decide
Body `{ state: "active" | "inactive", version }` — through the shared `setVariantState` (removal is the
shop's). 409 `product_held` (to `active`), `last_variant`, `stale`.

### 10. `POST /catalog/v1/products/bulk` — decide
Body `{ action: "hold" | "release" | "margin", items: {productId, version}[] (1–200), reason?, margin? }`.
Each product in its own transaction. Response `{ done: string[], refused: {productId, reason}[] }`
(FR-028). One notification per shop per action (R11).

Existing routes reused unchanged: `POST /catalog/v1/products/{productId}/margin`,
`PUT /catalog/v1/products/{productId}/placements`, `GET /catalog/v1/products/missing-details`,
`GET /catalog/v1/taxonomy/categories`, `GET /catalog/v1/taxonomy/categories/{id}/form`, and the
`inventory-staff` stock routes. ⚠ `GET /catalog/v1/products/missing-details` and
`GET /catalog/v1/products/{productId}` coexist: API Gateway prefers the static path.

## Imports

### 11. `POST /catalog/v1/imports` — decide
Body `{ shopId, fileName, fileSha256, margin, columns: string[], rows: { rowNumber, cells: string[] }[] }` (≤ 500 rows,
R5–R6). 400 for an unknown column, a missing required column, too many rows, an empty file.
Response 202 `ProductImportDTO` (`state: "checking"`). `repeatOf: {importId, finishedAt} | null` warns
when the same file was imported for the shop before.

### 12. `GET /catalog/v1/imports` — read
Query `shopId?`, `cursor?`. `{ items: ProductImportSummaryDTO[], nextCursor }`, newest first.

### 13. `GET /catalog/v1/imports/{importId}` — read
```ts
interface ProductImportDTO {
  id: string; shop: { id: string; name: string }; fileName: string;
  state: "checking" | "checked" | "creating" | "done" | "failed";
  margin: MarginDTO; createdBy: { name: string }; createdAt: string;
  counts: { rows: number; ready: number; created: number; leftOut: number };
  products: {                                // grouped by product key
    key: string; name: string; result: "pending" | "ready" | "not_ready" | "created" | "left_out";
    productId: string | null;
    rows: { rowNumber: number; sku: string; problems: { column: string; message: string }[] }[];
    pictures: number;
  }[];
  repeatOf: { importId: string; finishedAt: string } | null;
  version: string;
}
```

### 14. `POST /catalog/v1/imports/{importId}/create` — decide
Body `{ version }`. 409 unless `checked`; 409 when nothing is ready. Response 202 (`state: "creating"`).

### 15. `GET /catalog/v1/imports/template` — read
Query `categoryIds` (comma-separated leaves, optional). `{ columns: {name, required, help}[] }` — the
browser writes the `.xlsx` (R5). Detail columns come from each leaf's resolved form.

## Worker (no route)

`productImportWorker` — SQS `product-import` (+ DLQ, alarm on DLQ depth > 0). Message
`{ importId, step: "check" | "create" }`. Idempotent per row (R5).

## Shop service changes (shared gateway — no new routes)

- `GET /shop/v1/products`, `GET /shop/v1/products/{id}`: `reviewState` gains `effy_setup`; DTO gains
  `hold` and `createdBy`.
- `POST /shop/v1/products/{id}/status`: 409 `product_held` for any change while held; 409
  `effy_setting_up` while Effy-owned.
- `PATCH /shop/v1/products/{id}`, media routes, submit, withdraw: 409 `effy_setting_up` while Effy-owned.
- `POST /shop/v1/products/{id}/variants/{variantId}/state`: 409 `product_held` for `active`.
