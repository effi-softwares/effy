# `@effy/edge-catalog` — catalogue back-office service (067, 101)

A Serverless service on the **staff** gateway (`provider.httpApi.id` from `/effy/<env>/staff/http_api_id`); every
route but `healthz` carries the back-office authorizer. Reads are open to any active staff member (csa included);
changes need admin or manager, read from `admin.staff`, never the token claim (`review/handler-support.ts`).

## What it owns
- **The taxonomy (101)** — `src/taxonomy/`, routes `/catalog/v1/taxonomy/…`: the category tree (create, rename,
  icon, picture, synonyms, defaults, move, retire/restore), the attribute library and its values, and attachments
  (attach, tighten, hide, remove), plus each category's resolved form with where every row came from. Every write
  goes through the ONE writer, `@effy/edge-shared/catalog` `taxonomy.ts`, which takes the taxonomy lock, checks its
  rules and rebuilds the derived tables with `public.rebuild_category_derived()` in the same transaction. The
  service adds the audit row (`admin.audit_log`, `taxonomy.*`) and, after commit, `announceTaxonomy()` (live kind
  `taxonomy`, back-office and every shop). Category pictures are presigned uploads under `categories/<id>/` — a
  public media prefix — so this service may `s3:PutObject` there and nowhere else.
- **Placements (101)** — `src/placements/`: a product's up-to-five extra "also shown in" leaves
  (`PUT /catalog/v1/products/{productId}/placements`; this repository is the only writer of `product_placement`
  besides the taxonomy writer dropping a retired category's), and `GET /catalog/v1/products/missing-details`, the
  products on sale with a required detail a later requirement left empty.
- **Product review and margin (067)** — `src/review/`. Approval is refused while a required detail is empty
  (`missing_required_details`); moving a product to another leaf reconciles its details through `reconcileDetails`.

## Rules worth knowing
- Product types do not exist (101). A product's form is its home leaf's `category_form`; inheritance is defined
  once, in `rebuild_category_derived`, never re-derived by a reader.
- Storage, GST status and 18+ are columns on the product, defaulted from the leaf (`category_resolved`).
- Refusals carry a stable `code` (`category_too_deep`, `attachment_loosens`, `value_in_use`, …) beside the problem
  type; back-office maps each code to its own words (`features/taxonomy/errorText.ts`).

## Tests
`pnpm --filter @effy/edge-catalog test`; with Docker, `CONTAINER_TESTS=1` runs `taxonomy-writer`, `placements`
and `review` against the real migrations.

## Deploy (operator)
`make edge-deploy SERVICE=catalog ENV=dev` — attaches to the staff gateway, touching only this service's routes.
