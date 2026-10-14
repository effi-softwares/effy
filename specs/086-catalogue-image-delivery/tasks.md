# Tasks: Catalogue Pictures That Load Once — Stable Addresses, Right-Sized

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included. FR-015 requires an automated guard, and the repo's practice is a guard or contract
test beside every rule that crosses a boundary (Terraform ↔ TS, `serverless.yml` ↔ code, TS ↔ Kotlin).

**Mode of work** (CLAUDE.md): Claude writes every file. Tasks marked **OPERATOR** are run by the user:
`make apply`, `make db-up`, `serverless deploy`/`invoke`, Amplify deploys and live checks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 stable addresses · US2 private stays private · US3 right-sized · US4 operators unaffected

---

## Phase 1: Setup

- [X] T001 Scaffold the route-less worker service `apis/edge-api/media/` from `apis/edge-api/live/`: `package.json` (`@effy/edge-media`; deps `@effy/edge-shared`, `@aws-sdk/client-s3` and `@aws-sdk/client-sqs` at the version `apis/edge-api/shared/package.json` pins, `pg`, `pino`, `sharp` pinned to an exact ≥ 0.33 version; devDeps as `live`), `tsconfig.json`, `vitest.config.ts`, empty `src/functions/`, `src/render/`
- [X] T002 Write `apis/edge-api/media/serverless.yml`: service `effy-edge-media`, nodejs22.x, arm64, region `ap-southeast-2`, **no `httpApi`**; env `EFFY_ENV`, `LOG_LEVEL`, `DB_*` and `DB_SECRET_ARN` as `notifications/serverless.yml`, `S3_MEDIA_BUCKET: ${ssm:/effy/${sls:stage}/media/bucket}`, `RENDITION_QUEUE_URL`/`ARN` from `${ssm:/effy/${sls:stage}/media/rendition_queue_arn}`; functions `render` (SQS event on that ARN, `batchSize: 1`, memory 2048, timeout 60) and `renditionBackfill` (no event, timeout 900); IAM per contracts/rendition-worker.md §Permissions; `custom.esbuild` as storefront's plus `external: [sharp]` and `packagerOptions.scripts: ["npm install --no-save --os=linux --cpu=arm64 --libc=glibc sharp@<same pin>"]` (research R11); header comment saying why the service has no route and attaches to no gateway
- [X] T003 [P] Record `media` as a no-HTTP service where `live` and `auth` are recorded: the exclusion comment and list in `scripts/edge-health.sh`, and any guard that enumerates stacks through `listStacks()` (`apis/edge-api/shared/src/lib/serverless-stacks.ts`, `gateway-capacity.contract.test.ts`, `gateway-placement.contract.test.ts`) — run those tests and make each treat a service with no `httpApi` as attaching to no gateway
- [X] T004 Run `pnpm install` at the root and confirm `pnpm --filter @effy/edge-media typecheck` passes on the empty scaffold

---

## Phase 2: Foundational (blocks every story)

**⚠ Nothing in US1–US4 starts before this phase is done: it is the public set, its one function, the CDN and the table.**

- [X] T005 [P] Create `apis/edge-api/shared/src/lib/media-public.ts`: `PUBLIC_MEDIA_PREFIXES = ["products", "promotions", "renditions"] as const`, `RENDITION_PREFIX = "renditions"`, and `publicImageUrl(storageKey)` exactly per contracts/public-media.md §behaviour (null for empty / outside the set / `..` / `//` / leading `/` / control characters, with a `warn` naming only the prefix; throws `MEDIA_PUBLIC_BASE_URL is not configured` when the env is unset; URI-encodes each segment). Export it and the constant from `apis/edge-api/shared/src/index.ts`. Header comment: the bucket also holds labels and proof, which is why this is the only builder
- [X] T006 [P] Unit tests `apis/edge-api/shared/src/lib/media-public.test.ts` covering every row of the contract's behaviour table
- [X] T007 [P] Create `packages/shared-types/src/media.ts`: `RENDITION_WIDTHS = [160, 320, 640, 1280] as const`, `MAX_RENDITION_WIDTH = 1280`, `renditionUrl(imageUrl, width)` (throws unless width is an integer 1–1280) and `srcSet(imageUrl, widths)` per contracts/wire.md; export from `packages/shared-types/src/index.ts`
- [X] T008 [P] Create `packages/shared-types/src/media.fixtures.json` (cases: `.jpg`, `.jpeg`, `.png`, `.webp`, a promotion key, an encoded character, an own-width copy `w1000`; widths 0, 1281, 12.5 → error) and `packages/shared-types/src/media.test.ts` that runs every case — the fixture the Kotlin twin (T050) will read
- [X] T009 Migration `db/migrations/<UTC timestamp>_media_rendition.sql` (scaffold with `make db-new name=media_rendition`): `public.media_rendition` exactly per data-model.md (CHECKs on the key's prefix, `status`, `format`, `failure` ⇔ `failed`, every width an integer 1–1280, ascending); comment that the one writer is `apis/edge-api/media` and that `effy_shopper` reads it through the shopper-role default privileges. Run the repo's schema-drift guard (`apis/edge-api/shared/src/lib/schema-drift.guard.test.ts`) and update whatever it requires
- [X] T010 Terraform provider alias: add `provider "aws" { alias = "us_east_1"; region = "us-east-1"; allowed_account_ids = [var.aws_account_id]; default_tags {…same…} }` to `infra/envs/dev/providers.tf`, with a comment that this is CLAUDE.md's CloudFront-certificate exception and the only region literal it permits
- [X] T011 Terraform in `infra/envs/dev/media.tf` — the public address: `locals { public_media_prefixes = ["products", "promotions", "renditions"] }` with a comment naming `PUBLIC_MEDIA_PREFIXES` and its guard; `aws_acm_certificate.media` (provider `aws.us_east_1`, `media.${module.dns.zone_name}`, DNS validation records in `module.dns.zone_id`, `aws_acm_certificate_validation`); `aws_cloudfront_origin_access_control` (s3, always sign, sigv4); `aws_cloudfront_cache_policy` (default = max TTL 31536000, min 86400, no headers/cookies/query strings, gzip/brotli off); `aws_cloudfront_response_headers_policy` (`Cache-Control: public, max-age=31536000, immutable` override on, `Access-Control-Allow-Origin: *`); `aws_cloudfront_distribution` (S3 origin = the bucket's regional domain + OAC, default behaviour `GET`/`HEAD` only, `redirect-to-https`, `PriceClass_All`, IPv6, alias `media.<zone>`, the validated cert, TLSv1.2_2021, no default root object); `aws_route53_record` A + AAAA alias for `media.<zone>`; `aws_ssm_parameter` `/effy/${var.env}/media/public_base_url` = `https://media.<zone>`. Update the file's header comment (the CDN is no longer deferred)
- [X] T012 Terraform in `infra/envs/dev/media.tf` — the bucket policy: one `aws_s3_bucket_policy` granting `cloudfront.amazonaws.com` `s3:GetObject` on `"${bucket_arn}/${prefix}/*"` for each of `local.public_media_prefixes`, conditioned on `AWS:SourceArn` = the distribution; **no `s3:ListBucket`**; keep the public-access block unchanged; comment that a missing key therefore answers 403 like a refusal (FR-016/017). Check first that no other `aws_s3_bucket_policy` exists for this bucket (a second would overwrite it)
- [X] T013 Terraform in `infra/envs/dev/media.tf` — the rendition queue: `aws_sqs_queue` `${name_prefix}-media-renditions-dlq` (14-day retention) and `${name_prefix}-media-renditions` (visibility 360 s, redrive to the DLQ after 3 receives); `aws_sqs_queue_policy` letting `s3.amazonaws.com` send with `aws:SourceArn` = the bucket and `aws:SourceAccount`; `aws_s3_bucket_notification` with two `queue` blocks (`s3:ObjectCreated:*`, `filter_prefix` `products/` and `promotions/`), `depends_on` the queue policy; SSM `/effy/${var.env}/media/rendition_queue_arn` (and `…_url`). Comment why `renditions/` is never notified. Check no other `aws_s3_bucket_notification` exists for the bucket
- [X] T014 Terraform alarms to `aws_sns_topic.alerts`: the DLQ's `ApproximateNumberOfMessagesVisible ≥ 1` in `infra/envs/dev/media.tf`; and a `render` entry `effy-edge-media-${var.env}-render` in `local.background_function_alarms` (`infra/envs/dev/background-functions.tf`, period 300, periods 3, threshold 3, `stops` says pictures are not being made smaller and shoppers get originals); and a metric alarm on `RenditionFailed` (the media service's EMF namespace, sum ≥ 1 in 300 s, `treat_missing_data = notBreaching`) whose description says to run the SC-007 query for the failed key (FR-020)
- [X] T015 Terraform in `infra/envs/dev/media.tf` — CDN alarms (FR-022, research R14), all with `provider = aws.us_east_1`: `aws_sns_topic` `${name_prefix}-alerts-us-east-1`; `aws_sns_topic_subscription` to `var.alert_email` behind the same `count = var.alert_email == "" ? 0 : 1` guard as `alerts.tf` (never a literal address); `aws_cloudwatch_metric_alarm` on `AWS/CloudFront` `5xxErrorRate` (≥ 1, 3 × 300 s) and `4xxErrorRate` (≥ 10, 3 × 300 s), dimensions `DistributionId` + `Region = Global`, actions to that topic. Comment why the topic exists in a second region
- [X] T016 Guard `apis/edge-api/shared/src/lib/media-public.guard.test.ts` (pattern: `proof-prefix.guard.test.ts`): reads `infra/envs/dev/media.tf`, extracts `local.public_media_prefixes` and asserts it equals `PUBLIC_MEDIA_PREFIXES`; asserts the set contains neither `PROOF_MEDIA_PREFIX` nor `courier-label`; asserts the bucket notification's `filter_prefix` values are exactly `products/` and `promotions/` (never `renditions/`); asserts no `s3:ListBucket` appears in the bucket policy resource
- [X] T017 **OPERATOR**: `make plan ENV=dev` then `make apply ENV=dev`; click the confirmation AWS mails for the `us-east-1` alerts subscription; `dig +short media.dev.effyshopping.com`; quickstart §1 curl checks, including the 403's headers (if it carries `immutable`, Claude adds research R3's `custom_error_response` and the operator re-applies) — 2026-10-14: applied; DNS resolves; original 200 with the year header; `/`, listing, missing key, `courier-label/`, `proof/` all 403. The 403 DOES carry `immutable` (response-headers policy), but the edge does not hold it (two misses in a row stay `Error from cloudfront`) — S3 sends no Cache-Control on a 403, so the 10s default already applies and R3's `custom_error_response` would restate it; browser case stays accepted per R3. No change made.
- [X] T018 **OPERATOR**: `make db-up ENV=dev` (quickstart §2) — 2026-10-14: migrated.

**Checkpoint**: the CDN serves catalogue keys and refuses everything else; nothing reads it yet.

---

## Phase 3: User Story 1 — a shopper's pictures are downloaded once (P1) 🎯 MVP

**Goal**: every shopper read sends the CDN address of the original (FR-001–FR-007).
**Independent test**: quickstart §4 — the same product returns the identical `https://media.dev…` address twice, with no `X-Amz-` query; a repeat page view transfers no picture bytes.

- [ ] T019 [US1] **OPERATOR**, before T028: take the PERF-20 baseline (quickstart §0) — Lighthouse mobile for `/`, an aisle and a product page against dev, saved under `specs/086-catalogue-image-delivery/baseline/`; SC-004 and SC-005 cannot be measured without it
- [X] T020 [US1] `apis/edge-api/storefront/serverless.yml`: add `MEDIA_PUBLIC_BASE_URL: ${ssm:/effy/${sls:stage}/media/public_base_url}`; extend `apis/edge-api/storefront/src/config.contract.test.ts` if it lists keys the code reads
- [X] T021 [P] [US1] `apis/edge-api/commerce/serverless.yml`: the same variable; extend `apis/edge-api/commerce/src/config.contract.test.ts` likewise
- [X] T022 [US1] `apis/edge-api/storefront/src/lib/cards.ts`: replace the local `imageUrl` (presignRead) with one built on `publicImageUrl`; keep the `Presign` seam's name or rename it to `ImageAddress` and update `suggest/`, `home/`, `search/`, `catalog/`, `promotions/` services that accept it; remove `presignRead` from the imports. Update the file's comment ("signing is local") to say the address is built, not signed. If nothing else in storefront reads S3 any more (`grep -rn "S3_MEDIA_BUCKET\|@aws-sdk/client-s3" apis/edge-api/storefront/src`), remove `S3_MEDIA_BUCKET` and the S3 read permission from `apis/edge-api/storefront/serverless.yml` (least privilege) and from its config-contract test
- [X] T023 [US1] `apis/edge-api/storefront/src/catalog/service.ts` and `src/promotions/service.ts`: category image, gallery and banner addresses through the same function (no behaviour change besides the address)
- [X] T024 [P] [US1] `apis/edge-api/commerce/src/cart/service.ts`, `src/saved/service.ts`, `src/orders/service.ts`: default `presign` → `publicImageUrl` (wrapped to the existing async signature); remove `imageUrlOrNull` imports from these three files
- [X] T025 [US1] Update the storefront and commerce unit/container tests whose expected `imageUrl` was a signed shape (`grep -rn "signed\|X-Amz" apis/edge-api/{storefront,commerce}/src`) to the CDN shape, and set `MEDIA_PUBLIC_BASE_URL` in their test setup
- [X] T026 [US1] `apps/customer-web/next.config.ts`: add the media host (from an env such as `NEXT_PUBLIC_MEDIA_HOST`, wired in `infra/envs/dev/amplify-customer-web.tf` from the base URL Terraform already holds — never a literal) to `images.remotePatterns`; keep `**.amazonaws.com` until T048
- [X] T027 [US1] **OPERATOR**, before T028: `make apply ENV=dev` (the Amplify env var from T026) and rebuild customer-web in Amplify, so the web build that is live when addresses switch already allows the media host
- [ ] T028 [US1] **OPERATOR**: deploy `storefront` and `commerce` to dev; quickstart §4 (SC-001); with the web build from T027, every page that had a picture still has it (FR-021, SC-009) and a repeat view shows pictures from cache (SC-002, at original size until US3); quickstart §7 with an installed customer app (FR-007, SC-001 in the app) — 2026-10-14 partial: deployed; product detail gives the same `https://media.dev…` address on two requests, no `X-Amz-`; live pages name 78 picture addresses, all 200. Open: browser repeat-view cache check and the installed app.

**Checkpoint**: MVP — stable addresses and browser caching, with no size work yet.

---

## Phase 4: User Story 2 — private pictures and documents stay private (P1)

**Goal**: FR-014–FR-017 hold mechanically, and are proven live.
**Independent test**: quickstart §1 — a real label and a real proof key answer 403 through the CDN; staff, the entitled shop and the driver still open them.

- [X] T029 [P] [US2] Source guard `apis/edge-api/storefront/src/media.guard.test.ts`: no file under `src/` (tests excluded) calls `presignRead(` or `imageUrlOrNull(`, and no file builds a `amazonaws.com` address
- [X] T030 [P] [US2] Source guard `apis/edge-api/commerce/src/media.guard.test.ts`: the same for commerce
- [X] T031 [P] [US2] Source guard in `apis/edge-api/shared/src/lib/media-public.guard.test.ts` (extend T016): across `apis/edge-api/{orders,shop,driver,fleet}/src`, no line containing `publicImageUrl(` also names `label` or `proof`; and `publicImageUrl` is imported nowhere outside `storefront`, `commerce` and `shared`
- [X] T032 [US2] Rename nothing, but document the trap: add a comment at `imageUrlOrNull` in `apis/edge-api/shared/src/lib/media.ts` that it is the **private** reader (orders reads labels through it) and must never be turned into a public one; point to `publicImageUrl`
- [ ] T033 [US2] **OPERATOR**: quickstart §1 403 checks against a real `courier-label/` and `proof/` key from the database; open a label in back-office and the shop console, and a proof in back-office, to confirm presigned access is unchanged (SC-006) — 2026-10-14 partial: a real `proof/` object is 403 through the CDN; no `courier-label/` object exists in dev yet. Open: opening a label/proof in the consoles.

---

## Phase 5: User Story 3 — a picture is delivered at the size it is shown (P2)

**Goal**: FR-008–FR-013; SC-003–SC-005, SC-007.
**Independent test**: quickstart §3 and §5 — an upload gets `ready` widths within a minute; a phone card downloads `…/w320.webp` under 50 KB; a picture without copies shows its original.

### The worker

- [X] T034 [P] [US3] `apis/edge-api/media/src/render/widths.ts`: `widthsFor(sourceWidth)` → the `RENDITION_WIDTHS` strictly below it, plus `sourceWidth` itself when ≤ 1280 (FR-013: 3000 → 160/320/640/1280; 1000 → 160/320/640/1000; 1280 → 160/320/640/1280; 120 → 120); `renditionKey(storageKey, width)` → `renditions/<key without extension>/w<width>.webp` (must agree with `renditionUrl` — a test feeds `media.fixtures.json` through both); unit tests `widths.test.ts`
- [X] T035 [P] [US3] `apis/edge-api/media/src/render/repository.ts`: `recordReady(key, widths, w, h)` and `recordFailed(key, reason, w?, h?)` — one `INSERT … ON CONFLICT (storage_key) DO UPDATE` each, raw SQL; `readyOrFailedKeys(prefix)` for the backfill; container test `repository.container.test.ts` (upsert replaces; CHECKs refuse a `proof/` key and a failed row without a reason)
- [X] T036 [US3] `apis/edge-api/media/src/render/service.ts`: `render(key, deps)` per contracts/rendition-worker.md steps 1–6 — refuse keys outside `products/`/`promotions/`; `GetObject` (NoSuchKey → acknowledge); `sharp(buf, { limitInputPixels: 50_000_000 }).rotate()`; classify `corrupt` / `too_large` / `unsupported` as recorded failures (acknowledged); an animated original (`metadata().pages > 1`) → `recordReady(key, [], w, h)` and stop; for each width `resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 4 })` and `PutObject` with `ContentType: image/webp`; then `recordReady`; S3/DB errors are thrown. S3 client and DB passed in (no DI framework)
- [X] T037 [P] [US3] `apis/edge-api/media/src/render/service.test.ts` with a fake S3 and real `sharp` on small generated images (`sharp({ create: … })`): a 2000 px JPEG → 160/320/640/1280; a 1000 px JPEG → 160/320/640/1000 (the largest copy is the source width); a 500 px PNG with alpha → 160/320/500, alpha kept; a 100 px image → `[100]`; a two-frame animated WebP → `ready` with `[]` and no objects written; garbage bytes → `failed/corrupt`; a `courier-label/` key → refused, no write; a missing object → no row; an EXIF-rotated image → dimensions after rotation
- [X] T038 [US3] `apis/edge-api/media/src/functions/render.ts`: SQS handler — parse `Records[].body` as an S3 event, ignore `s3:TestEvent`, decode keys (`decodeURIComponent` after `+` → space), call `render`, emit EMF `RenditionsCreated` / `RenditionFailed{reason}` / `RenditionSeconds` through the shared metrics helper; rethrow transient errors so SQS retries
- [X] T039 [US3] `apis/edge-api/media/src/functions/rendition-backfill.ts` per contracts/rendition-worker.md §backfill: list with `ListObjectsV2` pages under each prefix (or the given one), skip non-image extensions, skip `ready` (and `failed` unless `retryFailed`) via `readyOrFailedKeys`, `SendMessageBatch` in tens with the S3-event body shape, return the counts; unit test with fakes
- [X] T040 [P] [US3] `apis/edge-api/media/src/config.contract.test.ts` (pattern: storefront's): every env key the code reads is declared in `serverless.yml`; no `httpApi`; `render` has the SQS event with batch size 1; `sharp` is external; the IAM `PutObject` resource is `renditions/*` only
- [X] T041 [US3] **OPERATOR**: deploy `media`; upload one product picture; quickstart §3 (row `ready`, `w320.webp` is 200 `image/webp`); then `renditionBackfill` twice; SC-007 query; DLQ empty. If the deploy's `sharp` fails to load, stop and report — fallback per research R11 — 2026-10-14: deployed; `render` 161 invocations, `renditionBackfill` 2, zero errors; queue and DLQ empty; all 40 pictured products carry `imageWidths`; w160/w320/w447 copies 200 `image/webp` at 1.8/4.8/8.1 KB vs a 12.3 KB original.

### The readers

- [X] T042 [US3] `apis/edge-api/storefront/src/lib/cards.ts`: in `CARD_FROM`'s lateral add `LEFT JOIN public.media_rendition mr ON mr.storage_key = m.storage_key AND mr.status = 'ready'` and select `mr.widths AS image_widths` (add to `CardRow`); `toCards` sends `imageWidths: row.image_widths ?? []`. Same in `apis/edge-api/storefront/src/catalog/repository.ts` (category `image_key` and the gallery query) and `src/promotions/repository.ts` (`banner_image_key`), mapped in their services
- [X] T043 [P] [US3] `apis/edge-api/commerce/src/cart/repository.ts` + service, `src/saved/repository.ts` + service: the same join and `imageWidths`; `src/orders/repository.ts`: aggregate the widths beside `image_keys` and send `thumbnailWidths` index-aligned, and join them for the order detail's items (the receipt's lines) to send `imageWidths`
- [X] T044 [P] [US3] Add `imageWidths?: number[]` to `StorefrontProductCardDTO`, `MediaDTO`, `BannerDTO`, `StorefrontCategoryDTO` (`packages/shared-types/src/storefront.ts`), the cart line (`cart.ts`), the saved item (`saved-item.ts`); `thumbnailWidths?: number[][]` to the customer order list item and `imageWidths?: number[]` to the order item (`order.ts`); each with the one-line doc from contracts/wire.md
- [X] T045 [US3] Update `apis/edge-api/storefront/src/wire.contract.test.ts`, `storefront.container.test.ts` and `apis/edge-api/commerce/src/wire.contract.test.ts` for the new field (present, ascending, `[]` with no row or a failed row)

### The web

- [X] T046 [US3] `apps/customer-web/components/storefront/CatalogImage.tsx` per contracts/wire.md §Web rendering: props `src`, `widths?`, `alt`, `sizes`, `fill?`, `priority?`, `className?`; `<picture className="contents">` with a WebP `<source>` only when `widths` is non-empty, `<img>` with `loading`/`fetchPriority`/`decoding="async"`; no `"use client"`; `CatalogImage.test.tsx` (no source without widths; srcset built from `srcSet`; priority → eager + high)
- [X] T047 [US3] Replace `next/image unoptimized` with `CatalogImage` (passing `imageWidths`, keeping each `sizes`, `priority` and fill/cover class) in `app/(shop)/_components/ProductCard.tsx`, `ProductGallery.tsx`, `MiniCartBody.tsx`, `app/(shop)/cart/page.tsx`, `app/(shop)/promotions/[id]/page.tsx`, `components/storefront/kit.tsx` (`MediaFrame` gains `widths`), `app/checkout/CheckoutFlow.tsx`, `components/receipt/ReceiptDocument.tsx`; the two raw `<img>`s — `app/(account)/orders/page.tsx` (thumbnails, with `thumbnailWidths`; also gains `loading="lazy"`, closing backlog PERF-19) and `components/storefront/PromoBanner.tsx` (artwork, with the banner's `imageWidths`); and pass `widths` through `MediaFrame`'s callers `app/(shop)/_components/CategoryStrip.tsx` and `app/(account)/saved/SavedList.tsx`; thread `imageWidths` from each DTO to its call site; delete the "presigned → unoptimized (R7)" comments made untrue
- [X] T048 [US3] `apps/customer-web/next.config.ts`: once no customer-web page renders an S3 address (`grep -rn "amazonaws" apps/customer-web --include='*.ts*'` and the account pages checked), remove the `**.amazonaws.com` remote pattern and rewrite the `images` comment
- [X] T049 [US3] `pnpm --filter customer-web build && pnpm --filter customer-web size` — every guest route within 174 KB (`/search` had 0.2 KB of headroom); `pnpm --filter customer-web test`. If `/search` grows, shrink in the same change — never raise the budget
- [ ] T050 [P] [US3] *(optional — outside this feature's FR-008, which is scoped to the website; may follow in its own change)* customer-mobile: Kotlin `renditionUrl` in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/image/Rendition.kt` with a common test reading `packages/shared-types/src/media.fixtures.json`; DTOs gain `imageWidths: List<Int> = emptyList()`; `core/presentation/ProductImage.kt` asks Coil for the smallest width ≥ measured width × density, else the original
- [ ] T051 [US3] **OPERATOR**: Amplify deploy; quickstart §5 (SC-002, SC-003, FR-012 with a fresh upload), Lighthouse re-run vs the §0 baseline (SC-004, SC-005)

---

## Phase 6: User Story 4 — shops and staff notice nothing (P2)

**Goal**: FR-018, FR-019; SC-008.
**Independent test**: quickstart §6.

- [X] T052 [P] [US4] Confirm by test that operator reads still sign: `apis/edge-api/shop`, `catalog`, `admin` keep `presignRead` for product, review and promotion pictures (no edits expected — run their suites) and `presignUpload` validation is unchanged (`media.ts` untouched apart from T032's comment)
- [ ] T053 [US4] **OPERATOR**: quickstart §6 walk — shop console upload/replace/reorder/remove (picture shows at once, before its copies exist); back-office promotion artwork and product review; courier label opens

---

## Phase 7: Polish

- [X] T054 [P] `infra/envs/dev/media.tf` and `docs/customer-web-performance-backlog.md`: mark PERF-02/03 built (not deployed until the operator's steps are done); `infra/envs/README.md`: the media host and the us-east-1 alias as a value to re-check on a region move
- [X] T055 [P] FEATURE-HISTORY.md entry for 086 (newest first) and its line in CLAUDE.md's feature list; a CLAUDE.md paragraph under Platform shape: shopper pictures are public by prefix through `publicImageUrl` only, the public set is `PUBLIC_MEDIA_PREFIXES` = `local.public_media_prefixes`, labels and proof never
- [X] T056 Run every suite touched: `pnpm --filter @effy/edge-shared test`, `@effy/shared-types`, `@effy/edge-storefront`, `@effy/edge-commerce`, `@effy/edge-media`, `customer-web`; `make validate ENV=dev` and `make lint`; record any failure as found
- [X] T057 Build notes at the end of this file: where the build differed from a task as written

---

## Dependencies

```text
Setup (T001–T004)
  └─ Foundational (T005–T018)  ── T017 (apply) and T018 (migrate) are the operator's
        ├─ US1 (T019–T028)  🎯 MVP   ── T019 baseline and T027 web env before T028
        │     └─ US2 guards (T029–T032) are written alongside; T033 needs T017
        ├─ US3 worker (T034–T041)  needs T009, T013 + T017 (queue), T018
        │     └─ US3 readers (T042–T045) need T044 and US1's T022–T024
        │           └─ US3 web (T046–T049) needs T044; T051 needs T028 + T041
        └─ US4 (T052–T053) any time after T028
Polish (T054–T057) last
```

- US1 and US2 ship together (spec): T033 must pass before T028 is announced as done.
- Deploy order is research R13: Terraform → migration → `media` + backfill → `storefront`/`commerce` → web.

## Parallel examples

- **Foundational**: T005 + T006, T007 + T008, T009, T010 beside them; T011–T015 share `media.tf` (and
  T014 also `background-functions.tf`) — do those in sequence; T016 after T011–T013.
- **US1**: T021 and T024 (commerce) beside T020/T022/T023 (storefront).
- **US2**: T029, T030, T031 together.
- **US3**: T034, T035, T037, T040 together; T043 and T044 beside T042; T050 independent.

## Implementation strategy

1. **MVP = Setup + Foundational + US1 + US2**: pictures get permanent, cached addresses and privacy is
   proven. Most of SC-002 is reached here (no repeat downloads), at full size.
2. **US3** adds the size win (SC-003–SC-005) without touching US1's contract: `imageWidths` is additive.
3. **US4** is verification, not code.
4. Mobile adoption (T050) is outside this feature's FR-008 and can follow in its own change.

## Task counts

| Phase | Tasks |
|---|---|
| Setup | 4 |
| Foundational | 14 (2 operator) |
| US1 | 10 (3 operator) |
| US2 | 5 (1 operator) |
| US3 | 18 (2 operator, 1 optional) |
| US4 | 2 (1 operator) |
| Polish | 4 |
| **Total** | **57** |

## Analysis fixes (2026-10-14, `/speckit-analyze`)

C1 CDN alarms (T015) · G1 baseline (T019) · G2 alarm on any failure (T014) · I1 FR-009 amended: the
original is the fallback · U1 own-width copy (T034, T037) · G3 missed call sites (T047) · I2 order item
`imageWidths` (T043, T044) · G4 FR-008 scoped to the website · G5/G6 app and no-gap checks (T027, T028)
· A1 animated originals (T036, T037) · U2 the 403's headers (T017, research R3) · U3 storefront's S3
access (T022) · I3–I6, A2 wording in research, contracts, spec.

## Build notes (2026-10-14) — where the build differed from a task as written

- **T014**: the `render` error alarm is in `media.tf`, not in `background-functions.tf`'s map — that map
  is for SCHEDULED functions, and `background-alarms.contract.test.ts` refused a queue-fed one.
- **T026 / T027 — not needed, marked done.** Every catalogue picture moved to `CatalogImage` (plain
  `<picture>`), so customer-web has **no `next/image` left** and needs no remote host: `remotePatterns`
  is now `[]` (the `**.amazonaws.com` wildcard is gone — T048) and no Amplify variable was added.
  `next/image` with `unoptimized` never validated a host, so the web build live during T028 keeps
  rendering the new addresses.
- **T022 / T024**: the image seam was renamed `Presign` → `ImageAddress` in both services. The widths
  lookup is `renditionWidthsSql` + `imageWidthsField` in `@effy/edge-shared` (commerce cannot import
  storefront). Both services lost `S3_MEDIA_BUCKET` and `s3:GetObject`.
- **`imageWidths` is sent only when copies exist** (`imageWidthsField`). With `[]` the banner no longer
  matched the mobile app's byte-for-byte wire fixture; leaving the field off keeps a picture with no
  copies identical on the wire to before. Contracts already said "absent or [] → original".
- **The order list** reads keys and widths from ONE subquery (`image_refs`, json) instead of `image_keys`:
  every line of an order shares its `created_at`, so two separate ordered subqueries could pair a key
  with another line's widths.
- **T038 metrics**: no `reason` dimension and no `RenditionSeconds` — see research R14 and the contract.
- **T044** also covers `PromotionDTO`, and the regenerated Kotlin contracts
  (`packages/shared-types/contract/CommerceDto.kt`, `commerce-schema.json`) — `commerce-contract:check`
  passes once they are committed.
- **T047**: `PromoBanner`'s raw `<img>` is unchanged — its `imageUrl` is an unwired slot (no caller passes
  it, and it is not a DTO picture), and the component is in client chrome. Converting it waits for the
  slot to be wired.
- **Not run**: every `*.container.test.ts` (no Docker). Instead, all migrations were applied to a scratch
  Postgres 18 and the changed storefront, commerce and worker SQL was executed against that schema.
- **T050** (mobile sizes) not done — optional, outside FR-008.
