# shop `products/` (+ `sections/`) — Shop product catalog (016)

The shop-operator side: **shop-owned** products authored against the back-office schema, browsed
through a backend-paginated table, edited with small focused edits, and organised into shop-local
sections. Cold path, shop authorizer.

## Routes (`/shop/v1/*`, shop authorizer)

| Group | Routes |
|---|---|
| Schema-read | `GET catalog/schema` (active types + attributes + category tree — drives the create form) |
| Products | `GET products` (search/filter/sort/paginate) · `GET products/{id}` · `POST products` · `PATCH products/{id}` · `POST products/{id}/status` · `DELETE products/{id}` · `PATCH products/{id}/sections` |
| Media | `POST products/{id}/media` (presign) · `POST products/{id}/media/register` · `PATCH products/{id}/media/{mediaId}` · `DELETE products/{id}/media/{mediaId}` |
| Sections | `GET sections` · `POST sections` · `PATCH sections/{id}` · `DELETE sections/{id}` |

## Authz + isolation (the security core)
`authz.authorizeShopMember(sub)` resolves the actor's **active shop id** from `public.shop_staff`
(status active AND the shop active, **any role**) in one round-trip — fail-closed (throw → 503),
uniform 403 on deny. The handler's `gate()` returns that `shopId`, and **every** query is scoped
`WHERE shop_id = :shopId` — never from client input (FR-019/FR-031, SC-005). A client-supplied shop
id in the body/query is ignored.

## Key behaviours
- **Draft-first create** — `POST products` creates a **draft**; the primary image and
  type-mandatory-completeness are enforced at **publish** (`POST products/{id}/status` → `active`),
  because the presign endpoint needs the product id first (reconciles FR-010 with create-then-attach).
- **EAV typing** — each supplied attribute value is validated against its `data_type` + `validation`
  + allowed-value set before it is written to the matching `value_*` column.
- **SKU** — optional, unique per shop when present (partial unique index → 409).
- **Optimistic concurrency (FR-023a)** — `PATCH` carries `expectedUpdatedAt`; the update runs
  `... AND date_trunc('milliseconds', updated_at) = :expected` (ms-truncated to survive the pg-Date
  round-trip); 0 rows → 409 "changed, reload". No version column.
- **Schema-drift (FR-020a)** — detail returns `missingMandatoryAttributes` (mandatory attrs the
  product has no value for) as a non-blocking notice.
- **Hard-delete guard (R8)** — only an unreferenced **draft** may be deleted; else 409 (archive).
- **Media** — private S3, presigned PUT (upload) / GET (read); `media.ts` validates content-type +
  size; an active product must keep a primary image.

## Layering
`functions/*` → `products/service.ts` (validation, EAV typing, the S3 presign boundary) →
`products/repository.ts` (raw SQL, `withTransaction`, `count(*) OVER()` for the list, the `pg_trgm`
`q` search). `sections/` is a small sibling slice reusing `ProductError`.
