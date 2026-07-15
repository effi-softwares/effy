# Contract: Shop Products, Sections & Catalog Schema-Read

**Service**: `apis/edge-api/shop` (cold path) · **Gateway**: shared HTTP API ·
**Authorizer**: `shop` JWT (`${ssm:/effy/<env>/edge/authorizer/shop_id}`) ·
**Base path**: `/shop/v1` · **DTOs**: `@effy/shared-types` (`catalog.ts`; shop subset regen→Kotlin)

**Authz** (`authz.ts`, from the `shop_staff` record, backend-authoritative, fail-closed):
`authorizeShopMember(sub)` = `shop_staff.status='active' AND shop.status='active'` on the operator's
assigned shop (**any** role — `shop_manager` or `shop_staff`, R5). **Every** query is scoped
`WHERE shop_id = :actorShopId`, derived from the record — never from client input (FR-019/FR-031).
Denials are uniform (403) and never disclose which term failed; infra throw → 503.

**Errors**: RFC 9457; `validation`→400 (+`errors[]`), `not_found`→404, `conflict`→409
(SKU dup / hard-delete-guard / schema-in-use), unknown→503. Error bodies never leak internals.

---

## Catalog schema-read (drives the create form)

| Method | Path | Response |
|---|---|---|
| GET | `/shop/v1/catalog/schema` | `CatalogSchemaDTO` — active `product-types` each with their assigned attributes (mandatory/optional, order, group) + the active `category` tree. One call bootstraps the step form. |

## Products

| Method | Path | Query / Body | Response |
|---|---|---|---|
| GET | `/shop/v1/products` | `page,pageSize,q,type,category,section,status,priceMin,priceMax,sort(name\|price\|recent),order(asc\|desc)` | `PagedDTO<ProductListItemDTO>` (`items,total,page,pageSize`) — **all backend-computed** (FR-017); `pageSize` clamped ≤100; `q` matches name/sku/brand/short_description |
| GET | `/shop/v1/products/{id}` | — | `ProductDetailDTO` (+ attributes, media w/ presigned GET urls, sections); 404 if not this shop's |
| POST | `/shop/v1/products` | `CreateProductRequest` | `201 ProductDetailDTO` — validates universal + type-mandatory attributes; 400 field errors; 409 on dup SKU |
| PATCH | `/shop/v1/products/{id}` | `UpdateProductRequest` (subset) | `ProductDetailDTO` — **focused edit**: updates only supplied fields/attributes, re-validates them (mandatory cannot be cleared) (FR-023/FR-024) |
| POST | `/shop/v1/products/{id}/status` | `ChangeProductStatusRequest` (`draft\|active\|unavailable\|archived`) | `ProductDetailDTO` — publish re-validates mandatory; archive is the default "remove" |
| DELETE | `/shop/v1/products/{id}` | — | `204` — **hard delete only if unreferenced/draft** else `409` "archive instead" (R8) |

## Product media (presigned direct-to-S3)

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/shop/v1/products/{id}/media` | `CreatePresignedUploadRequest` (`contentType`, `fileSize`) | `CreatePresignedUploadResponse` (`uploadUrl`, `storageKey`) — validates type ∈ jpeg/png/webp + max size (FR-026) |
| POST | `/shop/v1/products/{id}/media/register` | `{storageKey, isPrimary?, altText?}` | `ProductMediaDTO` — records the uploaded object |
| PATCH | `/shop/v1/products/{id}/media/{mediaId}` | `{isPrimary?, displayOrder?, altText?}` | `ProductMediaDTO` — reorder / set primary |
| DELETE | `/shop/v1/products/{id}/media/{mediaId}` | — | `204` — cannot delete the last/primary of an active product (400) |

## Shop sections (shop-local)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/shop/v1/sections` | — | `ShopSectionDTO[]` (this shop) |
| POST | `/shop/v1/sections` | `CreateShopSectionRequest` (`name`, `displayOrder?`) | `201 ShopSectionDTO` — 409 on dup name in shop |
| PATCH | `/shop/v1/sections/{id}` | `{name?, displayOrder?}` | `ShopSectionDTO` |
| DELETE | `/shop/v1/sections/{id}` | — | `204` (unassigns products via cascade) |
| PATCH | `/shop/v1/products/{id}/sections` | `{sectionIds: string[]}` | `ProductDetailDTO` — set a product's section membership |

---

## Handler conventions

`preamble` first → `authorizeShopMember` (deny → 401/403/503) → resolve `actorShopId` from the record
→ parse → service (validation, isolation, EAV mapping) → repository (raw SQL, `count(*) OVER()` for the
list, `withTransaction` for multi-table writes) → `json`/`problem`. Register in `shop/serverless.yml`
under `/shop/v1/...` with `authorizer.id: ${ssm:/effy/<env>/edge/authorizer/shop_id}`, add
`S3_MEDIA_BUCKET` env + `s3:PutObject`/`s3:GetObject` IAM (scoped to the bucket), and per-function
`Errors>0` alarms + a `Duration p95` alarm on the list route (the < 1s SC-004 route). `@effy/shared-types`
must be added to the shop package's deps (currently only admin depends on it).

## Test assertions (contract-level)

- List: shop isolation (only `actorShopId` rows); `total` reflects filters; `pageSize` clamp; the
  client receives one page (never the whole catalog).
- Create: rejects missing universal/type-mandatory fields; rejects out-of-range/typed attribute
  values; 409 on dup SKU; 400 without a primary image.
- PATCH: updates only supplied subset; refuses clearing a mandatory attribute.
- Status/Delete: publish re-validates; DELETE 409 for a published/referenced product.
- Every error body: `application/problem+json`, no internal identifiers leaked.
