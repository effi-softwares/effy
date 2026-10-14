# Implementation Plan: Catalogue Pictures That Load Once — Stable Addresses, Right-Sized

**Branch**: `086-catalogue-image-delivery` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: `specs/086-catalogue-image-delivery/spec.md` (backlog PERF-02 + PERF-03). The spec's two
operator-overridable assumptions are planned **as written**: a hidden product's picture is fetchable
by anyone holding its unguessable address, and sizes are prepared at upload.

## Summary

Shopper pictures get **one permanent address on a CDN**, and **smaller WebP copies made once, when
the picture is uploaded**.

- **Address**: CloudFront at `media.<env-zone>` in front of the **existing private bucket**, through
  Origin Access Control. The bucket policy lets the CDN read **only** `products/`, `promotions/` and
  `renditions/`. Labels and proof stay reachable only by presigned links. A year-long, `immutable`
  browser cache is set at the edge. The address is the storage key on a configured base URL, built at
  read time by one function (`publicImageUrl`) that refuses anything outside the public set.
- **Sizes**: an S3 upload under `products/` or `promotions/` notifies a queue; a new worker-only
  service, **`media`**, makes 160/320/640/1280 px WebP copies (never enlarging) under `renditions/`,
  and records which exist in **`public.media_rendition`**. A one-off backfill does the same for every
  existing picture.
- **Wire**: `imageUrl` stays (now the CDN address of the original). Beside it goes an additive
  `imageWidths`; the copies' addresses are derived by one shared function (`renditionUrl`).
- **Web**: one `<picture>` component (`CatalogImage`) offers the WebP copies with the original as the
  fallback, replacing `next/image unoptimized` on every catalogue picture.
- **Mobile**: nothing required (stable `imageUrl`, unknown keys ignored). Adopting sizes is a later
  change (spec FR-008 is scoped to the website).
- **Sizes never blur and never break**: a picture narrower than 1280 px also gets a copy at its own
  width; an animated one gets none; a browser without WebP gets the original.

Decisions and rejected alternatives: [research.md](research.md). Rollout order: research R13.

## Technical Context

**Language/Version**: TypeScript (Node 22 Lambdas, arm64; React 19 / Next.js 16.2), SQL (PostgreSQL
16, Goose), HCL (Terraform). Kotlin only for the optional mobile adoption task.

**Primary Dependencies**: **new**: `sharp` (pinned, worker only; prebuilt linux-arm64 binaries).
Existing: `@aws-sdk/client-s3`, `@aws-sdk/client-sqs` (new to the repo, same SDK family and version),
`@effy/edge-shared`, `@effy/shared-types`, `serverless-esbuild`.

**Storage**: PostgreSQL — one new table, `public.media_rendition` ([data-model.md](data-model.md)). S3 —
the existing bucket gains the `renditions/` prefix.

**Infrastructure (Terraform, `infra/envs/dev`)**: provider alias `aws.us_east_1`; ACM certificate +
DNS validation; CloudFront distribution, OAC, cache policy, response-headers policy; bucket policy; a
Route 53 alias `media.<zone>`; SQS queue + DLQ + queue policy; bucket notification; SSM
`/effy/<env>/media/public_base_url`, `…/rendition_queue_arn` and `…/rendition_queue_url`; regional
alarms; a `us-east-1` alerts topic and the two CloudFront error-rate alarms (FR-022).

**Testing**: Vitest — unit (`publicImageUrl`, `renditionUrl` fixtures, width selection, the worker's
decisions with a fake S3), container tests against Postgres (the upsert; reader joins), guard tests
(prefix parity with Terraform, no presign in shopper services, no public address for labels and
proof), config-contract tests (env declared in `serverless.yml`), the customer-web bundle budget, and
the quickstart's live checks.

**Target Platform**: AWS `ap-southeast-2` (CloudFront global; certificate in `us-east-1`).

**Project Type**: monorepo — infrastructure, one new backend service, two changed services, shared
packages, customer web.

**Performance Goals**: SC-002 (zero picture bytes on a repeat view), SC-003 (card picture ≤ 2× its
width, WebP, < 50 KB), SC-004 (−80% home picture weight), SC-005 (−30% largest-picture time). A
picture's copies exist within ~1 minute of upload.

**Constraints**: the bucket stays private (public-access block on); private prefixes never reachable
through the CDN; an additive wire only; `/search` has 0.2 KB of bundle headroom; no third-party Lambda
layer; region literals only where CLAUDE.md allows (us-east-1 for the CloudFront certificate).

**Scale/Scope**: ~1 Terraform file, 1 migration, 1 new service (2 functions), ~8 backend read paths, 7
DTOs, 1 shared-types module + fixtures, 1 web component and ~8 call sites.

## Constitution Check

*GATE: checked before Phase 0, re-checked after Phase 1.*

| Principle | Verdict | How |
|---|---|---|
| **I. Spec-driven** | ✅ | Spec 086 is tech-free; this plan carries the how; tasks follow. |
| **II. Shared contracts** | ✅ | `imageWidths` and `renditionUrl` live in `@effy/shared-types`, pinned by fixtures for the Kotlin twin. `publicImageUrl` and `PUBLIC_MEDIA_PREFIXES` live in `@effy/edge-shared`, used by both shopper services. |
| **III. One serverless backend** | ✅ | The worker is a Lambda service under `apis/edge-api/media` with **no route — no gateway** (the `live` precedent), so neither gateway's integration count changes. CloudFront and SQS are managed and pay-per-use, not compute: CloudFront serves stored bytes, and **runs no code** (no Lambda@Edge or CloudFront Functions, research R5). Services extended: `storefront`, `commerce` (shopper reads). Unchanged: `shop`, `admin`, `catalog`, `orders`, `driver`, `fleet`. |
| **IV. Auth isolation** | ✅ | No route and no token. Public pictures were already public through the storefront; private objects keep presigned access behind each audience's existing route. |
| **V. Design** | ✅ | No colour, radius or layout change; `CatalogImage` keeps every call site's classes. |
| **VI. Layers** | ✅ | Worker: handler → `render` service → S3 and `media_rendition` repository (raw SQL). Readers add a join in their repositories and map `widths` explicitly. No DI framework. Web: a presentational server component. |
| **VII. Telemetry** | ✅ | EMF metrics `RenditionsCreated`, `RenditionFailed`, `RenditionSeconds`. Alarms: DLQ ≥ 1, worker errors (background map), **any** `RenditionFailed` (FR-020). The customer-facing CDN is alarmed on its 5xx and 4xx rates from a `us-east-1` topic to the same operator mailbox variable (FR-022, research R14). No new product event. |
| **Real-world identifiers** | ✅ | `media.<env-zone>` derives from the operator-chosen zone. No email, account or endpoint added; alarms use the existing alerts topic. |
| **Quality gates** | ✅ | Acceptance is verified through quickstart.md; the bundle budget and guards run in CI. |

**Post-design re-check (after Phase 1)**: unchanged — the contracts add no route, no third backend, no
new identifier.

## Project Structure

### Documentation (this feature)

```text
specs/086-catalogue-image-delivery/
├── spec.md
├── plan.md                    # this file
├── research.md                # R1–R15
├── data-model.md              # media_rendition, prefixes, wire additions
├── quickstart.md              # dev validation, in rollout order
├── contracts/
│   ├── public-media.md        # the address, publicImageUrl, CDN responses, bucket policy
│   ├── wire.md                # imageWidths, renditionUrl, <picture>
│   └── rendition-worker.md    # render, backfill, permissions
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
infra/envs/dev/
├── providers.tf               # + provider "aws" { alias = "us_east_1" }
└── media.tf                   # + local.public_media_prefixes, bucket policy, CDN, cert, DNS,
                               #   queue + DLQ + notification, SSM ×2, alarms; background map entry

db/migrations/<ts>_media_rendition.sql

apis/edge-api/
├── shared/src/lib/
│   ├── media-public.ts        # PUBLIC_MEDIA_PREFIXES, publicImageUrl
│   ├── media-public.test.ts
│   └── media-public.guard.test.ts   # parity with media.tf; no private prefix in the set
├── media/                     # NEW worker service — no route
│   ├── serverless.yml         # render (SQS), renditionBackfill (invoke); sharp external, arm64
│   └── src/
│       ├── functions/render.ts, rendition-backfill.ts
│       ├── render/service.ts          # decide widths, resize, write, record
│       ├── render/repository.ts       # upsert media_rendition
│       ├── render/*.test.ts, *.container.test.ts
│       └── config.contract.test.ts
├── storefront/
│   ├── serverless.yml         # + MEDIA_PUBLIC_BASE_URL
│   └── src/lib/cards.ts, catalog/*, promotions/*, search/*, home/*   # publicImageUrl + widths join
└── commerce/
    ├── serverless.yml         # + MEDIA_PUBLIC_BASE_URL
    └── src/cart/*, saved/*, orders/*                                 # publicImageUrl + widths join

packages/shared-types/src/
├── media.ts                   # RENDITION_WIDTHS, renditionUrl, srcSet
├── media.fixtures.json
├── media.test.ts
└── storefront.ts, cart.ts, saved-item.ts, order.ts                   # + imageWidths

apps/customer-web/
├── components/storefront/CatalogImage.tsx
├── app/(shop)/_components/ProductCard.tsx, ProductGallery.tsx, …     # use CatalogImage
├── components/storefront/kit.tsx (MediaFrame)
└── next.config.ts             # media host in remotePatterns; **.amazonaws.com dropped when unused

apps/customer-mobile/          # optional, last: Kotlin renditionUrl + ProductImage width choice
```

**Structure Decision**: one new worker service beside the existing ones, because rendering pictures
is neither a shopper's nor an operator's request and must not run inside either's request.
Everything else extends what exists: the bucket's Terraform file, the two shopper services'
repositories, the shared packages, and customer-web's components.

## Delivery order (each step works on its own — FR-021)

1. **Terraform** (operator applies): CDN, policy, queue, notification, SSM. Nothing reads them yet.
2. **Migration** (operator runs): `media_rendition`.
3. **`media` service** (operator deploys) → one real upload → **backfill**.
4. **`storefront` + `commerce`** (operator deploys): CDN addresses + `imageWidths`.
5. **customer-web** (Amplify): `CatalogImage`.
6. Optional: **customer-mobile** adopts sizes.

## Risks

| Risk | Mitigation |
|---|---|
| A private object becomes public | Prefix-scoped policy with no list; one constant + parity guard; `publicImageUrl` returns null outside the set; source guards; quickstart 403 checks on a real label and proof key. |
| `sharp` binaries wrong for arm64 Lambda | Pinned version, esbuild external + target install (R11); one real upload before the backfill; fallback is a repo-built layer. |
| Worker loops on its own output | Notification filtered to `products/` and `promotions/`; output only under `renditions/`; the worker also refuses other prefixes. |
| Bundle budget on `/search` (0.2 KB headroom) | `CatalogImage` replaces `next/image` there (no client JS added); `size` runs in the tasks and in Amplify. |
| A removed picture stays cached for a year | Accepted in the spec: unreferenced, so never shown. |
| A refusal cached for a year (response-headers policy on a 403) | No page names a missing picture; the quickstart checks the 403's headers; `custom_error_response` if needed (R3). |

## Complexity Tracking

No constitution violations. Principle VII's alarm on a customer-facing flow is met for the CDN by the
`us-east-1` alarms (research R14) — it was an unrecorded gap in the first draft of this plan.

One recorded exception to "region is config": the `aws.us_east_1` provider alias pins `us-east-1`,
for two things that can live nowhere else — the CloudFront certificate (CLAUDE.md, Decisions) and the
CloudFront alarms with their topic (CloudFront publishes metrics only there).
