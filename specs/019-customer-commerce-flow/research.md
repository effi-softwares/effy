# Research: Customer Commerce Flow (019)

Phase 0 decisions. Each resolves an unknown surfaced while planning the first customer-facing commerce
slice on the Go hot path, grounded in the existing repo patterns and current (2026) vendor guidance.

Legend: **Decision** / **Rationale** / **Alternatives rejected**.

---

## R1 — Commerce backend lives on core-api (hot path), reading the 016 catalog

- **Decision**: All customer commerce (catalog reads, search, cart, addresses, checkout, orders, payment,
  favorites) is built as new feature slices in `apis/core-api` (Go). It **reads** the existing `public.*`
  catalog tables that feature 016 authored on the cold path, and adds the commerce write tables itself.
- **Rationale**: Binding FR-028 routing law — commerce is latency-sensitive customer traffic → hot path
  (constitution Principle III). core-api already has the customer `PoolVerifier` wired, the pgx pool, the
  metrics/logging platform, and the three-layer slice pattern (`platformstatus` is the reference). Both
  backends share one Postgres, so reading 016's tables from Go is a straight `SELECT`.
- **Alternatives rejected**: Building customer reads on the cold path (edge-api) where the catalog already
  has code — rejected: violates the routing law and puts customer latency on Lambda cold starts. Waiting
  for core-api's cloud deployment — rejected: core-api runs locally today and the base address is config,
  so the full flow is buildable and demoable now; Fargate go-live is its own slice.

## R2 — Customer identity on the hot path: `cognito_sub → customer.id` lookup

- **Decision**: Add a small identity repository in core-api that resolves the verified JWT `sub` to a
  `public.customer` row (`SELECT id, status FROM public.customer WHERE cognito_sub = $1`), reused by every
  customer-scoped commerce service; refuse `status = 'barred'` uniformly. A JIT upsert already happens on the
  cold path at sign-in, so the row exists for any authenticated customer; if absent, treat as no-record →
  refuse (the customer must have completed the cold-path `/customer/v1/me` bootstrap).
- **Rationale**: `customerping` only echoes the token subject; no DB lookup exists on the hot path. Cart,
  order, address, favorite all FK to `customer.id`, so the lookup is a shared prerequisite. Mirrors the
  proven edge-api pattern (`apis/edge-api/customer/src/customer/repo.ts`). `customer.status` stays the
  authoritative access gate (Principle IV).
- **Alternatives rejected**: FK commerce tables to `cognito_sub` directly — rejected: `customer.id` is the
  platform's stable internal key and keeps joins uniform; sub is the external identity key. Doing a JIT
  upsert on the hot path too — rejected: keep account provisioning single-owner on the cold path; the hot
  path only reads identity.

## R3 — Stripe: server owns the secret, clients confirm with a client_secret

- **Decision**: `github.com/stripe/stripe-go/v82` in core-api owns the **secret key + webhook secret**. On
  checkout, core-api computes the amount **server-side from the cart**, creates one **PaymentIntent** with
  `CaptureMethod: automatic` (immediate capture per the clarification) and
  `AutomaticPaymentMethods.Enabled`, and returns only the `client_secret` (+ publishable key). Web uses
  **Payment Element** (`@stripe/stripe-js` + `@stripe/react-stripe-js`), mobile uses **PaymentSheet**
  (Android SDK direct + iOS SDK via a Swift bridge). Publishable key ships to clients
  (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; mobile `STRIPE_PUBLISHABLE_KEY` via `secrets.properties` →
  `BuildKonfig` → `AppConfig`). Test-mode keys (`sk_test_…`, `pk_test_…`, `whsec_…`) in dev.
- **Rationale**: Keeps amount authority and the secret server-side (FR-027); the `client_secret` authorizes
  confirming exactly one PaymentIntent from an untrusted client and nothing else. Payment Element/PaymentSheet
  offload PCI (card fields are Stripe-hosted iframes/native sheet; raw PAN never touches Effy). Publishable
  key is a NAME not a secret — fits the mobile "pool id is a name, not a key" doctrine and the guard
  `scripts/mobile-guard.sh`.
- **Alternatives rejected**: Stripe **Checkout** (hosted redirect) — rejected: redirect fights the committed
  shadcn design + guest-first SSR storefront; Payment Element is embedded/on-domain/themeable. Putting the
  secret key anywhere on a client — forbidden. A KMP Stripe SDK — none exists (confirmed).

## R4 — Webhook is the authoritative order finalizer; client confirm is UX only

- **Decision**: A raw-body `POST /v1/stripe/webhook` (no pool authorizer) verifies the signature with
  `webhook.ConstructEvent(...)` and, on `payment_intent.succeeded`, transitions the order
  `pending_payment → paid`, writes `shop_fulfillment` rows, and appends the `order.placed` outbox event — all
  in one DB transaction. The client result only drives the UI. A fallback `POST /v1/checkout/confirm`
  re-fetches the PaymentIntent from Stripe server-side and runs the **identical idempotent finalizer** (covers
  a delayed/missed webhook in local dev).
- **Rationale**: The client can die exactly at success (app killed / tab closed) and is untrusted, so money
  capture must be confirmed by Stripe's server-to-server webhook. In Gin the webhook must read the raw body
  **before/around** JSON middleware or the HMAC breaks. Local dev: core-api is Docker-only, so Stripe can't
  reach localhost → use the existing `make cm-ngrok-core` tunnel (or `stripe listen`) and register the
  resulting URL + `whsec_…`; when core-api moves to Fargate the URL is config, no code change.
- **Alternatives rejected**: Marking the order paid from the browser/app result — rejected: untrusted and
  lossy. Webhook-only with no fallback — rejected: brittle in local dev where webhook delivery is manual.

## R5 — "No duplicate order / no double charge": three independent idempotency guards

- **Decision**: (1) **Create-side** — the PaymentIntent is created with a **deterministic** idempotency key
  `sha256("pi:" + order_id + ":" + attempt_version)` (not a random key), so a retried create returns the same
  intent. (2) **Order-side** — the order row is created/located before the intent and is idempotent on the
  customer's active checkout (one active `pending_payment` order per cart, upsert not blind insert). (3)
  **Webhook-side** — every Stripe `event.ID` is persisted in `stripe_event` (unique PK) and the paid
  transition is written `UPDATE … WHERE status = 'pending_payment'`, so redelivery / webhook+confirm both
  converge without double-applying.
- **Rationale**: Directly satisfies SC-006/SC-007 and FR-029/FR-031. Each guard is independent so no single
  failure produces a duplicate.
- **Alternatives rejected**: Random idempotency keys — rejected: don't dedup a user double-tap. A distributed
  lock — rejected: unnecessary; DB constraints + the status-guarded UPDATE are sufficient and simpler.

## R6 — Multi-shop fan-out via a transactional outbox + per-shop fulfillment rows

- **Decision**: The event backbone (SNS/SQS) is **documented-only, not built**. So at the paid transition,
  in the **same transaction**, core-api (a) inserts one `shop_fulfillment` row per distinct
  `order_item.shop_id` (the "records" — the order physically placed into each shop), and (b) appends one
  `order.placed` row to a new `public.event_outbox` table carrying the **ARCHITECTURE.md envelope**
  (`event_type`, `event_id`, `dedup_key`, `payload jsonb`, `occurred_at`, `published_at NULL`) with a
  per-shop breakdown in the payload. `order_item.shop_id` is denormalized at placement from
  `product.shop_id`. Actual SNS/SQS dispatch + shop-app surfacing + notifications are the **later
  event-backbone/fulfillment slice** (the paired `processed_events` consumer-dedup table is introduced there).
- **Rationale**: Matches the clarification ("records + event only"). The outbox is written atomically with the
  order so the event can never be lost or double-emitted, and its shape is **identical** to the future SNS
  path — we pre-build the documented contract, not a parallel one (constitution "one event language"). Fan-out
  grouping is a pure `GROUP BY shop_id` over `order_item`.
- **Alternatives rejected**: Publishing to SNS now — rejected: no topic/queue module exists in infra; building
  it is its own slice. Creating fulfillment rows via an async consumer — rejected: keeps the "place into the
  right shops" guarantee transactional and simple; async delivery is deferred.

## R7 — Product images: core-api mints presigned GET URLs (reuse 016's private bucket)

- **Decision**: Reuse the existing private `effy-<env>-product-media` bucket and the `/effy/<env>/media/bucket`
  SSM contract. core-api adds `aws-sdk-go-v2/service/s3` + `feature/s3/s3-request-presigner`, reads the bucket
  from config, and mints short-lived (15-min) presigned GET URLs for each `product_media.storage_key` in
  product list/detail responses. Its task role gains `s3:GetObject` on the bucket ARN; locally, credentials
  resolve through the default chain (the developer's `ef` AWS profile), exactly like the existing Cognito
  client. A public CloudFront CDN is **deferred** (out of scope here).
- **Rationale**: Ports the proven edge-api `presignRead` pattern (`apis/edge-api/shop/src/products/media.ts`)
  into Go; aws-sdk-go-v2 core/config are already dependencies. Keeps images private with no new bucket.
- **Alternatives rejected**: Public bucket / CDN now — rejected: infra scope, and the bucket is deliberately
  private. Streaming image bytes through core-api — rejected: wasteful; presigned direct-to-S3 GET is standard.
- **Web note**: presigned URLs carry a signature query string and expire, which defeats `next/image`
  optimization caching. Render product media via `next/image` with `unoptimized` (or a passthrough loader) and
  the S3 host allowed in `next.config.ts` `remotePatterns`; migrate to a CDN-backed optimized path in the
  later CDN slice.

## R8 — Cart: hybrid (device-local guest → server on sign-in)

- **Decision**: Guests keep a **device-local** cart (web: a TanStack Store slice persisted to
  `localStorage`, snapshotting each line's name/price so a later price change doesn't silently mutate it —
  the exact pattern ARCHITECTURE.md already prescribes; mobile: an in-app local store). On sign-in the local
  cart is **merged** into a **server cart** via `POST /v1/cart/merge` (sum quantities per product, clamp to
  max), after which the **server cart is authoritative** (read/written through core-api). The server cart
  stores only `product_id + quantity`; price/availability are always re-read from `product` (authoritative)
  and the client compares against its snapshot to surface changes.
- **Rationale**: Implements the clarified hybrid model + FR-021/FR-022/SC-009. Storing only product+qty on
  the server (not price) keeps `product` the single price authority; the client snapshot is only for
  change-detection UX. No cross-device guest cart is required.
- **Alternatives rejected**: Pure server cart including guests — rejected: forces guest identity/session
  plumbing the clarification ruled out. Pure client cart submitted only at checkout — rejected: the
  clarification chose hybrid (server cart once signed in) for durability + a synced cart badge.

## R9 — Money representation

- **Decision**: Persist and compute money as `numeric(12,2)` AUD end-to-end (matching `product.price_amount`),
  expose amounts in DTOs as decimal **strings** + a `currency` field (matching the existing `catalog.ts`
  convention), and convert to **integer minor units (cents)** only at the Stripe API boundary in core-api.
  Totals are computed server-side and are authoritative; the receipt, the charge, and order history all read
  the same stored amounts (SC-008).
- **Rationale**: Avoids float drift; one currency (AUD) so no FX. Strings in DTOs preserve exactness across
  JSON and match how the catalog already ships prices.
- **Alternatives rejected**: Floats/doubles for money — rejected: rounding drift. Integer cents in the DB —
  workable but diverges from `product.price_amount numeric(12,2)`; keep one representation and convert once at
  the Stripe edge.

## R10 — Mobile navigation: adopt `mobile-kit` TabBackStacks for the commerce stacks

- **Decision**: Adopt `packages/mobile-kit`'s `TabBackStacks` + `AppNavKey` (`@Serializable` routes,
  saveable across config change / process death) for the Home and Search tabs' **multi-level** stacks
  (Home → ProductDetail → Cart → Checkout → Receipt). The Account tab keeps its existing 013 `AppNavigator`
  sub-graph unchanged. New commerce routes are `AppNavKey`s registered in `navKeySerializersModule`.
- **Rationale**: The commerce flow is exactly the deep, per-tab navigation `mobile-kit` was built for (015);
  the interim single-stack `AppNavigator` doesn't model per-tab back stacks. Routes as `@Serializable` keys
  keep a later Jetpack Nav3 migration a presentation-only change.
- **Alternatives rejected**: Extending the lightweight `rememberSaveable`-string + single `AppNavigator` —
  rejected: doesn't cleanly support multiple deep stacks with independent state; `mobile-kit` already solves
  this and is drift-guarded.

## R11 — Web: Stripe lives outside the Amplify quarantine

- **Decision**: Stripe UI lives under the commerce tree `app/(shop)/checkout/` as a **client-component
  island**: the checkout page is a Server Component that fetches the `client_secret` from `coreApi()`
  server-side and hands it to a small `"use client"` `<PaymentForm>` wrapping `<Elements>` / `<PaymentElement>`;
  `confirmPayment({ redirect: 'if_required' })` keeps most card payments inline (3DS redirects handled
  automatically), returning to `/checkout/complete`, which shows order state **read from core-api** (webhook
  authority), never from the browser result alone.
- **Rationale**: The `app/(auth)/` quarantine exists only to keep the heavy `aws-amplify` SDK out of the
  shared chunk; Stripe is unrelated, lighter, and a commerce concern. Keeping the island under `(shop)` keeps
  the public shell PPR/static-friendly — only the checkout island is dynamic and gated by `requireCustomer`.
- **Alternatives rejected**: Placing Stripe in `(auth)` — rejected: wrong quarantine, and checkout isn't auth.
  Loading Stripe in the root layout — rejected: pollutes every page's bundle (the same mistake the Amplify
  quarantine prevents).

## R12 — Search & Home composition

- **Decision**: Search is served by core-api over the existing `pg_trgm` GIN index (`ILIKE %q%` on
  name/brand/short_description), filtered by category / price range / sale-only / an attribute facet, paginated
  by a **stable cursor** (keyset on `created_at, id`) for infinite scroll; facets are **query params** on web
  (Disallowed in robots) so discovery pages stay cacheable. Home is a composed `GET /v1/storefront/home`
  returning merchandising **rails derived from the catalog** — Featured (newest active), On-sale
  (`compare_at_amount IS NOT NULL`), one or more category rails — plus a minimal static/derived banner list.
  Recently-viewed is **device-local**: the client stores product ids and hydrates them via a batch
  `GET /v1/storefront/products?ids=…`.
- **Rationale**: Reuses the search index 016 already provisioned (SC-004); keyset pagination is stable under
  inserts (offset pagination double-shows on insert). Catalog-derived rails avoid a merchandising CMS (out of
  scope per the assumptions). Device-local recently-viewed matches the clarification and needs no server table.
- **Alternatives rejected**: Offset pagination — rejected: unstable for infinite scroll. A full-text `tsvector`
  search — rejected: `pg_trgm` already indexed and meets the < 1s target; revisit if relevance demands it. A
  server recently-viewed table — rejected: the clarification chose device-local; avoids a write on every view.

## R13 — Delivery fee & address

- **Decision**: A **single flat per-order delivery fee** (a configured constant, e.g. an env/const on
  core-api) added once to every order regardless of shop count (per the clarification). Checkout requires a
  delivery address: `customer_address` rows are CRUD-managed; the chosen address is **snapshotted** onto the
  order (`order.delivery_address jsonb`) so a later address edit/delete never mutates a historical receipt.
- **Rationale**: Simplest correct model; clean cent-for-cent reconciliation (SC-008). Snapshotting is standard
  for immutable receipts.
- **Alternatives rejected**: Per-shop delivery fees — rejected by the clarification. FK the order to a live
  address row without snapshot — rejected: address mutation/deletion would corrupt past receipts.

---

## Summary of new dependencies

| Surface | Added |
|---|---|
| core-api | `stripe-go/v82`; `aws-sdk-go-v2/service/s3` + `feature/s3/s3-request-presigner`; `Stripe`+`AWS.MediaBucket` config; a flat delivery-fee constant |
| customer-web | `@stripe/stripe-js`, `@stripe/react-stripe-js`; `stripeConfig()`; S3 host in `next.config` remotePatterns |
| customer-mobile | `com.stripe:stripe-android` (PaymentSheet); iOS `StripePaymentSheet` + `SwiftPaymentBridge`; `STRIPE_PUBLISHABLE_KEY`; a new Ktor `coreClient`; adopt `mobile-kit` TabBackStacks |
| shared-types | `storefront/cart/order/checkout/address/favorite` DTOs + `customer-commerce-contract.ts` KMP codegen |
| infra (operator) | `s3:GetObject` on the media bucket for the core-api role; Stripe test secrets in Secrets Manager; ngrok/`stripe listen` webhook in dev |
