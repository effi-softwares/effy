# Quickstart: validating 086 in dev

**Feature**: 086 · rollout order in [research.md](research.md) R13. ⚠ The operator runs every step that
touches AWS (CLAUDE.md, mode of work). All commands use `AWS_PROFILE=ef`.

## 0. Before anything ships — the baseline (backlog PERF-20)

Record LCP and total image bytes for `/`, an aisle (`/search?category=<key>`) and a product page on a
throttled phone profile (Lighthouse mobile), and keep the reports in `specs/086-catalogue-image-delivery/baseline/`.
SC-004 and SC-005 are measured against these.

## 1. Infrastructure

```sh
make plan ENV=dev     # expect: acm cert (us-east-1) + validation, cloudfront distribution + OAC +
                      # cache/response-headers policies, bucket policy, route53 alias media.dev…,
                      # sqs queue + dlq + queue policy, bucket notification, ssm ×2, alarms
make apply ENV=dev
dig +short media.dev.effyshopping.com          # resolves to CloudFront
```

Checks (SC-006), with a real key of each kind taken from the database:

```sh
curl -sI https://media.dev.effyshopping.com/products/<owner>/<token>.jpg      # 200, cache-control immutable
curl -sI https://media.dev.effyshopping.com/courier-label/<pkg>/<token>.pdf   # 403
curl -sI https://media.dev.effyshopping.com/proof/<…>                          # 403
curl -sI https://media.dev.effyshopping.com/products/nope/nope.jpg            # 403 (same as refusal)
curl -sI https://media.dev.effyshopping.com/                                  # 403 (no listing)
```

Look at the 403's headers: if it carries `cache-control: … immutable`, apply research R3's
`custom_error_response` before going on.

## 2. Database

```sh
make db-up ENV=dev     # adds public.media_rendition
```

## 3. Worker, then backfill

```sh
cd apis/edge-api/media && npx serverless deploy --stage dev
```

Upload one product picture in the shop console. Within a minute:

```sql
SELECT storage_key, status, widths, source_width FROM public.media_rendition ORDER BY rendered_at DESC LIMIT 1;
-- ready, e.g. {160,320,640,1280}
```

```sh
curl -sI https://media.dev.effyshopping.com/renditions/products/<owner>/<token>/w320.webp   # 200, image/webp
```

Then the backfill, and re-run it to see it skip everything:

```sh
npx serverless invoke -f renditionBackfill --stage dev
npx serverless invoke -f renditionBackfill --stage dev     # queued: 0
```

SC-007:

```sql
SELECT count(*) FILTER (WHERE status = 'ready') AS ready, count(*) FILTER (WHERE status = 'failed') AS failed
FROM public.media_rendition;
SELECT storage_key, failure FROM public.media_rendition WHERE status = 'failed';   -- the named remainder
```

The DLQ must be empty: `aws sqs get-queue-attributes --queue-url <dlq> --attribute-names ApproximateNumberOfMessages`.

## 4. Backend switch

```sh
cd apis/edge-api/storefront && npx serverless deploy --stage dev
cd ../commerce && npx serverless deploy --stage dev
```

SC-001:

```sh
for i in 1 2; do curl -s "https://edge-api.dev.effyshopping.com/storefront/v1/products/<id>" | jq -r '.imageUrl, (.imageWidths|tostring)'; done
# the same https://media.dev… address both times, no X-Amz- query string; widths listed
```

## 5. Web

Deploy customer-web (Amplify). Then, in a phone-sized browser window:

- **SC-002**: open `/`, an aisle, a product; reload each. DevTools Network → Img: every catalogue
  picture is `(disk cache)` / `(memory cache)` on the second view, 0 bytes transferred.
- **SC-003**: on an aisle page, a card picture's request is `…/w320.webp` (or `w640` at 3×),
  `image/webp`, under 50 KB.
- **FR-012**: upload a new picture to a live product and open the product at once — the original shows,
  no broken frame; after a minute and a reload, a `w…webp` is used.
- Re-run Lighthouse from §0 for SC-004 / SC-005.
- `pnpm --filter customer-web size` passes (bundle budget).

## 6. Operators (SC-008)

Shop console: upload, replace, reorder, remove a picture; it shows at once. Back-office: create a
promotion with artwork; review a product's pictures; open a courier label. All as before.

## 7. Mobile (FR-007, SC-001)

An installed customer app from before this feature: browse, product page, cart — pictures show, and
each comes from `https://media.dev…` (Android Studio network inspector, or a proxy). Open the same
product twice: the same address.
