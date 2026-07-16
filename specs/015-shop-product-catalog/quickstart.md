# Quickstart & Validation: Shop Product Catalog (015)

A run/validation guide, not implementation. Implementation detail lives in `tasks.md` (Phase 2) and
the code. Steps marked **[operator]** touch live AWS / migrations and are **operator-run** (CLAUDE.md
mode of work): Claude authors the code/SQL/Terraform; the operator applies.

## Prerequisites

- Dev infra from prior slices live (four Cognito pools, dev DB, shared HTTP API + authorizers).
- Node 22 + pnpm; Go toolchain not needed (cold path only).
- A back-office **admin** or **manager** account (schema authority) and, at an **active** shop, a
  **shop_manager** and a **shop_staff** account (catalog CRUD) — provisioned via 006/009.
- `goose` installed (`make check-goose`).

## Build & static checks (Claude-runnable)

```bash
pnpm install
pnpm --filter @effy/shared-types contract:gen     # regen Kotlin shop DTOs after catalog.ts
pnpm typecheck && pnpm -r test                     # edge-api + web feature units
pnpm --filter @effy/edge-admin test                # catalog schema slice
pnpm --filter @effy/edge-shop test                 # products/sections slice
turbo build
# mobile:
cd apps/shop-mobile && ./gradlew :shared:allTests   # catalog use-case + ViewModel unit tests
terraform -chdir=infra/envs/dev validate && terraform -chdir=infra/envs/dev fmt -check
```

## Deploy sequence **[operator]**

Ordering matters — the migration must be committed before `db-up`, and infra before edge-deploy.

1. **[operator]** `make apply ENV=dev` — provisions the **S3 product-media bucket** + CORS + the
   shop-Lambda `s3:PutObject/GetObject` IAM and the `S3_MEDIA_BUCKET` SSM key. *Abort if any Cognito
   pool would be replaced.*
2. Commit `db/migrations/<ts>_product_catalog.sql`, then **[operator]** `make db-up ENV=dev`
   (creates `public.product*`, the schema tables, seed, and the `admin.audit_log` actions).
3. **[operator]** `make edge-deploy SERVICE=admin ENV=dev` (catalog schema authority) and
   `make edge-deploy SERVICE=shop ENV=dev` (products/sections/media/schema-read).

## Validation scenarios (map to spec Success Criteria)

### SC-001 — schema addable without code/deploy (US1)
1. Sign into **back-office** as admin/manager → **Catalog** → create a product type "Prepared Food",
   define/assign 3 attributes (1 mandatory, 2 optional), add a food category.
2. **Expected**: type/attributes/category persist; no deployment occurred; an `admin.audit_log` row
   exists per mutation. A `csa` account can **read** the schema but every mutate returns 403.

### SC-002 / SC-003 — guided create + local draft (US2)
1. Sign into **shop-web** as `shop_staff` → **Catalog** → **Add product**. Pick "Prepared Food";
   the step form renders exactly that type's mandatory/optional attributes.
2. Fill name, category, price, **primary image** (uploads to S3 via presigned PUT), short description
   + mandatory attributes; **close the drawer mid-way**, reopen → entries restored from the local
   draft. Complete and publish (< 3 min).
3. **Expected**: product appears in the table; draft cleared; optional attributes stored when provided,
   never required. Repeat on **shop-mobile** (bottom-sheet step form) — same outcome.

### SC-004 / SC-005 — backend search/filter, shop isolation (US3)
1. Seed >1 page of products (script). Search `q`, filter by status/type/category/price; page through.
2. **Expected**: correct paginated results + `total` reflect filters, computed backend-side; the client
   holds one page only. A second shop's operator sees **only** their own products across
   list/search/detail (100% isolation).
3. **SC-004 latency (T088a)**: seed **≥10,000** products into one shop; measure `GET /shop/v1/products`
   first-page + total-count latency and confirm **< 1s**. This is the explicit verification of SC-004
   (the Duration-p95 alarm is ongoing monitoring, not the acceptance proof).

### SC-006 / SC-007 — focused edit, no cards (US4)
1. Open a product → **details page**: tabs (Overview/Attributes/Media/Pricing/Categorization),
   sectioned `dl` rows.
2. Click a section **pencil** → small Dialog (web) / bottom sheet (mobile) with only that group; change
   pricing; save.
3. **Expected**: only pricing changed; the rest provably unchanged; **zero** card tiles and **zero**
   metric cards on the page (DOCTRINE-2) on both surfaces.

### SC-010 / SC-011 — permission + mandatory enforcement
1. As a **role-less / unassigned / inactive-shop** principal, attempt create/edit/archive/delete.
   **Expected**: backend refuses (403) in 100% of attempts even if a UI control were forced.
2. Attempt to publish with a missing mandatory attribute or clear one via focused edit.
   **Expected**: blocked with an inline reason.

### US5 — sections, lifecycle, inventory placeholder
1. Create a section, assign products, filter by it. Change a product `active → unavailable → archived`;
   confirm the table/detail reflect it. Try to **hard-delete** a published product → refused (archive
   offered); hard-delete a never-published **draft** → removed.
2. **Expected**: inventory area shows a clearly labeled **"coming soon"** and captures no stock.

## Sign-off checklist

- [ ] `pnpm typecheck` + `pnpm -r test` + mobile `allTests` + `turbo build` green.
- [ ] `terraform validate`/`fmt` clean; migration committed before `db-up`.
- [ ] SC-001…SC-011 + US5 validated live (both web and mobile for the parity rows).
- [ ] `docs/audiences/shop-capabilities.md` gains catalog rows for **both** shop surfaces (mobile rows
      land with Phase C; a stated cell is required, ✅/⬜/⏸).
- [ ] No-card audit passes on the details page (web + mobile).
- [ ] Secret/PII sweep clean; error bodies leak nothing.
