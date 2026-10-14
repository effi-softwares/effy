# Research: Catalogue Pictures That Load Once

**Feature**: 086-catalogue-image-delivery · **Date**: 2026-10-14 · **Spec**: [spec.md](spec.md)

What the code does today, then one decision per open question. Every "today" claim was read from the
tree on 2026-10-14.

## What exists today

- **One private bucket, `effy-<env>-product-media`** (`infra/envs/dev/media.tf`), public access blocked,
  versioned, SSE-S3. It holds `products/` (catalogue), `promotions/` (banner artwork), `proof/`
  (delivery proof, archived to Glacier IR after 90 days by a prefix-scoped lifecycle rule) and
  `courier-label/` (labels carrying a customer's name and address). Its comment records that a public
  CDN was "deferred to the customer-facing slice".
- **Uploads** are presigned PUTs minted by `@effy/edge-shared` `media.ts` (`presignUpload(prefix, …)`,
  `presignLabelUpload`); keys are `<prefix>/<ownerId>/<uuid-hex>.<ext>` — random and never reused.
  Accepted: JPEG, PNG, WebP, ≤ 10 MB.
- **Every read link is a presigned GET** with a 15-minute life (`presignRead`, `imageUrlOrNull`, and
  storefront's own `imageUrl` in `storefront/src/lib/cards.ts`). Shopper-facing callers:
  - `storefront` — cards (`toCards`: listings, search, suggestions, home rails), product gallery and
    category image (`catalog/service.ts`), banners (`promotions/service.ts`).
  - `commerce` — cart lines (`cart/service.ts`), saved items (`saved/service.ts`), order thumbnails
    (`orders/service.ts`, `image_keys` = the first four lines' primary pictures).
- **Private-object callers that must stay private**: `driver` (proof), `fleet` (proof), `shop`
  `courier-pickup.ts` (label), `orders` `orders/service.ts:135` (label — ⚠ through `imageUrlOrNull`,
  the function shopper reads also use; whatever makes shopper pictures public must NOT be done by
  changing that function).
- **Operator callers** (shop products, shop orders, shop insights, catalog review) sign catalogue keys
  for consoles. Out of scope (spec Assumptions).
- **Lambdas run outside the VPC** (`edge-network.tf`) and reach RDS over its public endpoint, so a new
  worker reaches S3, SQS and the database with no endpoints.
- **No SQS queue and no bucket notification exist** anywhere in `infra/`.
- **customer-web** renders every catalogue picture through `next/image` with `unoptimized`
  (ProductCard, ProductGallery, MediaFrame, MiniCart, cart, checkout, receipt); `next.config.ts`
  allows `**.amazonaws.com`.
- **customer-mobile** loads pictures with Coil 3 (`core/image/ImageLoading.kt`,
  `core/presentation/ProductImage.kt`) from the DTO's `imageUrl`; its JSON is `ignoreUnknownKeys = true`
  (`EffyHttpClient.kt`), so an additive field cannot break an installed app.
- **Receipt emails carry no product pictures** (no media call in `notifications`), so the spec's
  "emails already sent" edge case has nothing to repair.

## R1 — How a picture gets one permanent public address

**Decision**: a CloudFront distribution in front of the existing bucket, reaching it through **Origin
Access Control**. The bucket stays private and its public-access block stays on; a **bucket policy**
grants the distribution `s3:GetObject` on exactly the public prefixes and nothing else — **no
`s3:ListBucket`**. The address is `https://media.<env-zone>/<storage key>` — e.g.
`https://media.dev.effyshopping.com/products/<owner>/<token>.jpg`. Services build it from the key and
one configured base URL; nothing new is stored.

**Rationale**:
- The key is already random and never reused (FR-005 is free: a replaced picture has a new key).
- The base URL is applied at read time, so changing the host later rewrites every address in one
  deploy. No address is stored in the database.
- Without `ListBucket`, S3 answers **403 for a key that is not there and for one the policy refuses**.
  That is FR-016 (no reveal of existence) and FR-017 (no listing) for free.
- CloudFront has edges in Sydney, Melbourne, Perth, Brisbane and Auckland (FR-006).

**Alternatives rejected**:
- *Public bucket / public-read prefix*: removes the public-access block on a bucket that also holds
  labels and proof. One policy typo from exposing customer addresses.
- *A second bucket for public pictures*: the cleanest isolation, but it moves every existing object,
  rewrites every upload path in three services and back-office, and breaks the proof guard's premise.
  The prefix-scoped policy plus R4's guard gets the same guarantee without a migration of bytes.
- *Long-lived presigned URLs (7 days)*: still different per request (the signature embeds the signing
  time), so FR-001/FR-002 fail.
- *CloudFront signed URLs or cookies*: per-viewer, so the browser cache cannot share them — the
  problem this feature exists to fix.

## R2 — Custom domain, certificate and price class

**Decision**:
- **Host `media.<env-zone>`** (`media.dev.effyshopping.com`), a Route 53 alias in the env's own zone.
- **Certificate**: a new ACM certificate **in `us-east-1`** through a provider alias `aws.us_east_1`
  in the env root, validated by DNS in the env zone. This is the CloudFront carve-out CLAUDE.md
  already records — the regional wildcard cert in `dns-env-zone` cannot be used.
- **Price class `PriceClass_All`**: Australia and New Zealand edges are only in "All"; 100 and 200
  would serve Sydney shoppers from Asia or North America.
- **IPv6 on.**

**Rationale**: an address under Effy's own name survives a change of CDN. The us-east-1 alias is the
one documented exception to "region is config".

**Alternative rejected**: the default `dxxxx.cloudfront.net` host — no certificate, but the address
changes if the distribution is ever replaced, and every browser cache with it.

## R3 — How long a browser keeps a picture

**Decision**: a CloudFront **response-headers policy** sets
`Cache-Control: public, max-age=31536000, immutable` (override on), plus `Access-Control-Allow-Origin: *`
for completeness. A **cache policy** caches for a year at the edge (default TTL = max TTL = 1 year,
min 1 day), keyed on the path only (no headers, cookies or query strings). Compression is off — the
formats are already compressed.

**Rationale**: objects reach S3 through presigned PUTs that set no `Cache-Control`, so it is set at
the edge instead of being retrofitted onto every upload and every existing object. Keys are immutable,
so a year is safe (FR-004/FR-005).

**Consequence (spec edge case)**: a removed picture can live in the edge for up to a year for anyone
holding its address. Nothing references it, so no page shows it. Accepted in the spec.

**Refusals and the long header**: a response-headers policy may stamp the same `Cache-Control` on a
403. A browser would then keep a refusal for a year. No page asks for a picture that is not there —
an original is named only after upload and a copy only once its row is `ready` — so this can only hit
someone typing addresses. The quickstart checks the 403's headers. If the header is present, a
`custom_error_response` for 403 with `error_caching_min_ttl = 10` keeps the edge from holding it, and
the browser case stays accepted.

## R4 — The public set, stated once, and the guard (FR-014, FR-015)

**Decision**:
- `@effy/edge-shared` gets **`media-public.ts`**:
  - `PUBLIC_MEDIA_PREFIXES = ["products", "promotions", "renditions"]` — the one statement.
  - `publicImageUrl(storageKey)` returns `<MEDIA_PUBLIC_BASE_URL>/<key>`, or **null** for an empty key,
    a key outside the set, or a key containing `..`, `//`, a leading `/` or a control character. It never throws (a missing picture must
    never fail a read). It throws only when the base URL is not configured — fail loudly (constitution,
    Real-World Identifiers / config contract).
- **Terraform** carries the same list as `local.public_media_prefixes` in `media.tf`, and builds the
  bucket policy's `Resource` from it.
- **Guards**:
  1. `media-public.guard.test.ts` (edge-shared) reads `infra/envs/dev/media.tf` and fails when its list
     differs from the constant — the `proof-prefix.guard.test.ts` pattern, for the same reason.
  2. The same test asserts the set never contains `proof`, `courier-label`, or `PROOF_MEDIA_PREFIX`.
  3. A source guard in each shopper service (`storefront`, `commerce`) fails if a file calls
     `presignRead` or `imageUrlOrNull` — a shopper picture goes through `publicImageUrl` only.
  4. A guard in the services that read labels or proof (`orders`, `shop`, `driver`, `fleet`) fails if
     `publicImageUrl` is called on a line that mentions `label` or `proof`.
  5. **SC-006 check in quickstart**: fetching a real label key and a real proof key through the CDN
     returns 403.
- A **new kind of stored object** is private by construction: it is not in the list, so the policy
  does not cover it and `publicImageUrl` returns null for it (spec US2 scenario 3).

**Alternative rejected**: a CloudFront path-pattern behaviour per public prefix with a default
behaviour that denies. It restates the list a third time (behaviours + policy + constant). The
bucket policy alone already refuses everything else.

## R5 — Right-sized pictures: prepared at upload, not on request

**Decision**: prepared ahead of time by a worker (FR-010), per the spec's assumption.
- **Widths**: the standard steps 160, 320, 640, 1280 px that are **below** the original's width, plus
  **the original's own width** when it is 1280 or less (FR-013). A 3000 px photo gets 160/320/640/1280;
  a 1000 px one gets 160/320/640/1000, so a large gallery shows a full-resolution WebP rather than an
  enlarged 640; a 120 px one gets just 120. That covers a 48 px cart thumbnail at 3×, a phone card at 2×
  and a desktop gallery at 2×.
- **Format: WebP only**, quality 78, `effort 4`, alpha kept (FR-013). Browsers that cannot show WebP get
  the original through `<picture>`'s fallback `<img>` (FR-009, as amended: the original is the
  universal fallback; ~1% of browsers, all of them old).
- **Animated originals** (an animated WebP; sharp reports `pages > 1`) get **no** copies and a `ready`
  row with no widths — the original is served, so the animation is not cut to one frame.
- **Where**: `renditions/<original key without extension>/w<width>.webp` — e.g.
  `renditions/products/<owner>/<token>/w320.webp`. A separate top-level prefix so the worker's own
  writes can never re-trigger it (R6), and so a rendition never sits under `courier-label/` or `proof/`.
- **Library**: `sharp` (libvips). EXIF orientation applied (`rotate()`), metadata stripped.

**Rationale**: no work and no wait on a shopper's request, no bill per transformation, and the bytes
are cached for a year like any other picture.

**Alternatives rejected**:
- *Next.js image optimizer*: runs on Amplify's SSR compute per transformation, has its own cache that
  Amplify does not share across instances, and does nothing for the mobile app.
- *AVIF as well as WebP*: ~20% smaller again, but 5–10× slower to encode in sharp, doubles the objects,
  and needs a second `<source>`. WebP at these widths already meets SC-003 (a 320–640 px product photo
  is ~15–60 KB). Can be added later: the rendition record carries its formats.
- *A CloudFront Function choosing the format from `Accept`*: edge code outside the one backend
  (Principle III), and unnecessary with `<picture>`.
- *Lambda@Edge resizing on request*: compute outside the backend, and a shopper waits on a cold resize.

## R6 — What triggers the worker, and how failure is seen (FR-020)

**Decision**: **S3 event notification → SQS queue → Lambda**.
- The bucket notifies `s3:ObjectCreated:*` for keys under `products/` and `promotions/` only — never
  `renditions/`, so the worker cannot trigger itself, and never `proof/` or `courier-label/`.
- The queue has a **dead-letter queue** after 3 receives. Visibility timeout 6 × the function timeout.
- **Alarms** (to the existing alerts topic): DLQ has any message; the worker's errors via the
  `background_function_alarms` map; a `RenditionFailed` metric.
- A picture that cannot be processed (corrupt, unsupported, larger than sharp's pixel limit) is
  recorded as `failed` with a reason and **not retried**. Only a transient fault (S3, DB) is thrown
  back to SQS for a retry.

**Rationale**: the upload is a presigned PUT that no Lambda observes (`media.ts` says so), so the
bucket is the only place that knows a picture arrived. SQS gives retries, a DLQ and back-pressure for
the backfill for free. A batch size of 1 keeps one bad picture from failing its neighbours.

**Alternatives rejected**:
- *Render when the shop service registers the picture*: misses promotion artwork (admin service) and
  holds the operator's request (FR-019).
- *S3 → Lambda directly*: no DLQ for async S3 invocations without extra configuration, and the
  backfill would need its own path.
- *The platform's own SNS topic*: designed but not delivered (CLAUDE.md, "still ahead").

## R7 — How a reader knows a picture's sizes exist (FR-012)

**Decision**: a table **`public.media_rendition`**, one row per original key, written **only** by the
worker: the widths made, the format, the original's dimensions, `ready` or `failed`, a reason and a
time. Readers `LEFT JOIN … ON storage_key = … AND status = 'ready'` and send the widths in the DTO.
No row (not yet made) or a failed row → empty widths → the client shows the original.

**Rationale**:
- A `<source>` whose file is missing shows a broken image; it does not fall back to the `<img>`. The
  reader must therefore know before it names a rendition.
- One table keyed by the storage key serves products and promotions alike, with one writer.
- A join on a primary key costs nothing measurable; a separate lookup would be another round trip on
  the one-connection pool (backlog PERF-11).

**Alternative rejected**: a column on `product_media` and another on `promotion` — two writers and two
shapes for one fact.

## R8 — The wire: additive, and a URL rule held in one place

**Decision**:
- Every shopper DTO that has `imageUrl` keeps it, now the **stable original address** (mobile and old
  web keep working, FR-007). Beside it, an **additive** `imageWidths?: number[]` — the rendition widths
  that exist, ascending; absent or empty means "only the original".
- The rendition address is **derived, not sent**: `renditionUrl(imageUrl, width)` in
  `@effy/shared-types` `media.ts` — one function, pinned by `media.fixtures.json` that a Kotlin twin
  will read when the app adopts sizes. It keeps the origin and puts
  `renditions/<key without extension>/w<width>.webp` after it (the key keeps its own `products/` or
  `promotions/`).
- DTOs gaining `imageWidths`: `StorefrontProductCardDTO`, the gallery `MediaDTO`, the category DTO,
  `BannerDTO`, cart line, saved item, and the order list's thumbnails (`thumbnailWidths` beside them).

**Alternative rejected**: sending every rendition address — eight to twelve more URLs per card on
every listing, and a second copy of the naming rule on the server.

## R9 — Rendering on the web

**Decision**: one server-renderable component, **`CatalogImage`** (`components/storefront/CatalogImage.tsx`),
used everywhere a catalogue or promotion picture is drawn today with `next/image unoptimized`:

```text
<picture>
  <source type="image/webp" srcset="…/w160.webp 160w, …/w320.webp 320w, …" sizes="{sizes}">
  <img src="{original}" alt sizes loading decoding fetchpriority …>
</picture>
```

No `<source>` when `imageWidths` is empty. It keeps each call site's `sizes`, `loading`/`priority` and
fill/cover classes. `next.config.ts` adds the media host to `remotePatterns` for any `next/image` left,
and drops `**.amazonaws.com` when the shopper paths no longer carry an S3 address (the account and
operator-adjacent pages are checked first).

**Rationale**: `next/image` with a custom loader cannot emit a format-typed `<source>`, so WebP could
not fall back to the original. Plain `<picture>` costs no client JavaScript (most call sites are server
components), which matters with `/search` at 173.8 of 174 KB.

**Bundle check**: `ProductCard` is in `/search`'s client bundle. `CatalogImage` replaces `next/image`
there; it must not grow the route. Measured in the tasks.

## R10 — Mobile

**Decision**: no change is needed for FR-007: the app gets the stable `imageUrl` and Coil's disk cache
starts working across launches. Adopting sizes is a **separate, later task** in the same feature: a
Kotlin `renditionUrl` pinned to the same fixtures, and `ProductImage` choosing the smallest width that
covers its measured size × density. Android and iOS 14+ decode WebP natively.

## R11 — Packaging `sharp` for Lambda arm64

**Decision**: the worker's `serverless.yml` marks `sharp` as an esbuild **external** and installs it
for the target with `packagerOptions.scripts: ["npm install --no-save --os=linux --cpu=arm64 --libc=glibc sharp@<pinned>"]`.
sharp ≥ 0.33 ships prebuilt `@img/sharp-linux-arm64` binaries, so nothing compiles. Memory 2048 MB
(sharp's speed scales with the CPU that memory buys), timeout 60 s, batch size 1.

**Verification**: the first deploy runs one real upload end to end before the backfill (quickstart §3).
If the packaging route fails, the fallback is a Lambda layer built by a pinned script in the repo — never
a third-party layer ARN.

## R12 — Backfill (FR-011, SC-007)

**Decision**: a second function in the worker service, **`renditionBackfill`**, run by the operator
(`serverless invoke`). It lists `products/` and `promotions/`, skips any key with a `ready` row (and,
with `{"retryFailed": true}`, re-queues `failed` ones), and sends one SQS message per key in the same
shape the bucket sends. It returns counts. Re-running is safe: the worker overwrites the same keys and
upserts the same row.

## R13 — Rollout without a moment of missing pictures (FR-021)

**Order**:
1. Terraform: certificate, distribution, bucket policy, queue, DLQ, notification, SSM base URL. Nothing
   reads them yet; presigned links keep working because a bucket policy does not affect them.
2. Migration: `media_rendition`.
3. Deploy `media`; upload one picture; check its renditions; run the backfill.
4. Deploy `storefront` and `commerce`: addresses switch to the CDN, `imageWidths` appear.
5. Deploy customer-web: `CatalogImage`. Until then the old web shows the new `imageUrl` through
   `next/image unoptimized` — it renders, from the CDN, at full size. Each step works on its own.

Each step can be rolled back on its own: the DTO change is additive and `imageUrl` is a working
address before and after.

## R14 — Telemetry (Principle VII)

- **Metrics** (EMF, namespace `Effy/Media`, no dimensions — an alarm on a metric with dimensions sees
  only that exact combination): `RenditionsCreated`, `RenditionFailed`. The reason and the time taken
  are in the log line and the row (as built; the first draft had a `reason` dimension and
  `RenditionSeconds`).
- **Alarms**: DLQ visible messages ≥ 1; worker errors (background map); **`RenditionFailed` ≥ 1** in five
  minutes (FR-020: every failure alerts — a failure is rare and each one names a picture to fix).
- **CloudFront (FR-022)**: its metrics exist only in `us-east-1`, and an alarm can notify only a topic
  in its own region. So the env root gets a small **`us-east-1` alerts topic** (through the
  `aws.us_east_1` alias) whose email subscription takes the same `var.alert_email` the regional topic uses
  (`workspace-admin@effyshopping.com` today), behind the same `count` guard — never retyped. AWS mails
  one more confirmation link, which the operator must click. Alarms: `5xxErrorRate` ≥ 1% for 15
  minutes and `4xxErrorRate` ≥ 10% for 15 minutes (a page naming pictures that are not there). The
  distribution's additional metrics are not needed for these two.
- **Product analytics**: none new — no new shopper action. The existing web-vitals events measure
  SC-004/SC-005 against the PERF-20 baseline.

## R15 — Cost (dev, order of magnitude)

CloudFront: 1 TB/month free tier for transfer and 10 M requests. A year at dev's traffic is pennies.
Storage: renditions add ~5–10% of the originals' bytes. Worker: a few seconds of 2 GB Lambda per
upload. SQS: within the free tier. The us-east-1 certificate is free.
