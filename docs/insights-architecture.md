# Shop Insights & Today — Architecture Research

**Feature**: [058-shop-today-insights](../specs/058-shop-today-insights/spec.md) (FR-030) · **Written**: 2026-09-10
**Status**: the research the brief asked for *before* any code. Decisions it reaches are carried into
[research.md](../specs/058-shop-today-insights/research.md) and [plan.md](../specs/058-shop-today-insights/plan.md).

The shop console gets two screens with opposite data profiles:

| | **Today** | **Insights** |
|---|---|---|
| Question | What needs doing right now? | How did the shop do over a period? |
| Freshness | Seconds (a paid order must appear while the operator watches) | Minutes (a figure a minute old is fine; it must say how old) |
| Shape | Small, current, per shop (≤5 orders, ≤~20 attention items) | Aggregates over up to 60 days (current window + comparison window) |
| Correctness | Must match live state *the moment it changes* | Must match the records within a bound, including late corrections |

They must not share a mechanism, and this document is about why each gets the one it gets.

---

## 0. The constraints Effy actually has

Everything below is judged against these, not against a generic platform:

- **One region, one database.** AWS `ap-southeast-2` (Sydney); PostgreSQL 16 on a single RDS
  `t4g.micro` (002). Every shop and every operator is in Australia.
- **Two backends.** The cold path (Node/TypeScript Lambdas behind one API Gateway **HTTP API**, one JWT
  authorizer per Cognito pool) serves the shop console today. The hot path (`core-api`, Go on one
  Fargate task behind an ALB, 040) is the only long-running process on the platform, and since 057 it
  already verifies **shop-pool** tokens on one route.
- **The payment webhook already exists.** Stripe → `core-api` → signature verified → deduped on the
  Stripe event id (`public.stripe_event`) → a status-guarded `FinalizeSucceeded` transaction that marks
  the order paid and fans it out to one `shop_fulfillment` per shop (019/020). A shop *learns* of an
  order only after that transaction commits.
- **No event backbone yet.** `public.event_outbox` is written; nothing publishes it (CLAUDE.md: "still
  ahead: the event backbone"). There is no SNS topic to subscribe to.
- **Volume in scope:** 10,000 to 500,000 orders a month, across the whole platform.
- **The shop console already polls.** `fulfillmentQueueQuery` refetches every 15 s while the tab is
  visible (020 R8). That is the baseline every option below is compared with.

---

## 1. Analytics reads — how production consoles serve them

### 1.1 What the reference platforms do

- **Shopify** reports are near-real-time: "When you open a sales report, the data is up to date, give
  or take about 1 minute" [S1]. Reversals — refunds, returns, cancellations, edits — are recorded "as a
  negative number on the date the return was processed", not on the original order's date [S1]. That
  second rule matters more than it looks: it means a reported past day never changes because of
  something that happened later, which is what makes rollups cheap to keep correct. Shopify also shows
  an explicit *last refreshed* timestamp and flags delayed data rather than hiding it [S2].
- **Saleor** exposes aggregate figures through its GraphQL API (`ordersTotal(period: …)` with a
  reporting period) computed by the core on request; richer dashboards are bolted on with an external
  semantic layer (Cube) [S3][S4].
- **Medusa** ships no analytics in the admin; it comes from a plugin that queries the store's own
  database [S5].
- **Postgres practice for "dashboards over events"** is the rollup table: pre-aggregate per
  (tenant, time bucket), keep it current incrementally, query the rollup. Citus's comparison:
  materialized views "recompute all totals during each refresh", whereas "for larger data sets and
  databases that have more active workloads only processing net new data from your last rollup can be
  a more efficient use of resources" [S6].

So the industry range runs from "aggregate on request" (Saleor, Medusa plugin) to "pre-aggregate and
stamp the freshness" (Shopify, rollup practice). The brief — and FR-026 — requires the latter.

### 1.2 Options for Effy

| Option | How | Verdict |
|---|---|---|
| **A. Aggregate raw rows per request** | `SUM` over `order_item` for the shop and window | ✗ Forbidden by FR-026. Cost grows with history and with every open Insights tab. |
| **B. Materialized view, periodic `REFRESH`** | One view, refreshed every minute | ✗ Recomputes *all history* every refresh [S6]; late corrections wait for the next full refresh; `REFRESH … CONCURRENTLY` still does the full work. |
| **C. Rollup tables, recomputed per dirty bucket** ✅ | `(shop, hour)` and `(shop, day, product)` tables; writes that change a figure mark the bucket dirty; a job recomputes only dirty buckets **from source** | ✅ Chosen. Reads are a bounded indexed scan; correction is exact (recompute, not increment); cost is flat in history. |
| **D. Columnar / OLAP store** (Redshift Serverless, ClickHouse, Tinybird, Athena) | CDC from Postgres into a warehouse | ✗ Cargo cult at this size. 500k orders/month is ~15M order-lines a *year* — trivially within one Postgres instance. Redshift Serverless alone has a 4-RPU floor at $0.375/RPU-hour [S7]: a dashboard hit throughout a 12-hour trading day keeps it warm for **~$540/month**, before the CDC pipeline. |
| **E. Timescale continuous aggregates** | Extension-managed incremental rollups | ✗ Means leaving RDS for Timescale's own cloud [S8] — a locked-stack change (constitution, Technology Standards) for a problem option C solves in plain SQL. |

**Why recompute rather than increment.** An incremental `+=` rollup (Citus's pattern) is exact only if
every change arrives exactly once and in order. Effy's corrections arrive out of order and can
*un*-happen: a refund is `submitted`, then weeks later `failed` (055: "the bank can reject it up to
thirty days later"). Recomputing a dirty bucket from the source rows is idempotent — running it twice,
or late, or after a reversal gives the same answer — so there is no double-counting to reason about.
The bucket is small (one shop-hour), so recomputing it costs about what an increment would.

**Refund dating.** Following Shopify [S1], a refund reduces revenue **on the day it was issued**. This
is the difference between "a past day's figure changes when a customer is refunded next week" (which
would force every historical bucket to be invalidatable and would make a report someone exported
yesterday disagree with today's) and "past days are stable; the refund shows up today". The spec was
amended to match (FR-032). A refund that later *fails* is the one correction that reaches back — it
invalidates the bucket of the day it was issued.

### 1.3 Buckets, time zones and weeks

- **The bucket key is the UTC instant at which a local hour began in the shop's timezone.** Not a
  UTC hour: Australia has half-hour zones (Adelaide, Darwin), whose local hours start at :30 UTC. Not
  `(local_date, local_hour)`: the repeated 02:00 on the April daylight-saving changeover would collide.
  A `timestamptz` bucket start is unique per real hour, gives 25 buckets on the fall-back day and 23 on
  spring-forward, and days/weeks are derived with `AT TIME ZONE` at read time.
- **Product figures are daily** (by local date). Top products never needs an hour grain.
- **Weeks start Monday** (Australian convention, ISO 8601).
- **The shop's timezone is data**, `public.shop.timezone`, defaulting to `Australia/Melbourne` for
  every shop (spec Assumptions). If it ever changes, that shop's rollups are rebuilt — the rollup
  records which timezone it was built under, so a mismatch is detectable rather than silently wrong.

### 1.4 The edge: when it wins and when it is cargo cult

The brief asks for "edge-served" reads with CDN stale-while-revalidate. Measured against Effy:

- **An edge runtime runs near the user. It helps only when the data is also near the user, or the
  response is cacheable for many users.** Neither holds here. Every operator is in Australia and so is
  the database; an edge function in Sydney would call back to RDS in Sydney — a regional function with
  an extra hop. Vercel's own documentation now says "we recommend migrating from edge to Node.js for
  improved performance and reliability", and that a function which "depends on a data source" should
  run "close to that source" [S9].
- **A CDN cache helps when many requests share a key.** Insights is private and per shop: the cache key
  has to include the shop (the brief says so), each shop has a handful of operators, and a manager
  opens Insights a few times a day. The hit rate would be near zero, and a shared cache in front of
  authenticated per-tenant money figures is a leak waiting for one wrong `Vary`.
- **Where the edge genuinely wins**: public, cacheable, globally read content — the customer
  storefront, product images, the CDN in front of Amplify. Effy already uses it there (042).

**Decision.** No edge runtime and no CDN cache for these screens. "Served pre-computed" means the
rollup: the request reads a bounded, indexed slice (≤ 1,440 hour rows for 30 days plus the comparison
window, and one product-day aggregate) from the same region as the operator. Freshness is carried by
`computedAt` in the payload. Client-side stale-while-revalidate [S10] is what TanStack Query already
does (show cached data, refetch in the background); the HTTP layer adds `Cache-Control: private,
no-cache` + `ETag` so an unchanged payload returns `304` with no body.

**Cache key.** `{shopId, range, timezone}`. On the client, TanStack Query's key is
`['shop', 'insights', range]` — the shop is implied by the session and the timezone by the shop, so
both are in the key by construction. On the server, the rollup *is* the cache, keyed by
`(shop_id, bucket_start)`, and the payload carries the timezone it was computed in.

**Cache busting for corrections** (brief B2): every write that changes a figure — an order becoming
paid or cancelled, a refund created or changing status, a portion declared can't-supply — marks the
affected `(shop, bucket)` dirty in the same transaction (a trigger, §3.4). The next rollup run (≤ 60 s)
recomputes exactly those buckets and advances the shop's `computedAt`. A nightly reconciliation
recomputes the last 35 days for every shop and alarms if it had to change anything.

---

## 2. Realtime order feeds

### 2.1 The patterns

- **Provider webhook → queue → fan-out.** How Shopify and Stripe tell *your server* something happened.
  Both are explicit that delivery is at-least-once, unordered and not guaranteed: Stripe "doesn't
  guarantee the delivery of events in the order that they're generated" and says to "track event IDs to
  identify duplicate deliveries" [S11]; Shopify "doesn't guarantee ordering within a topic", provides
  `X-Shopify-Webhook-Id` to "ignore duplicate deliveries", and says "your app shouldn't rely on
  receiving data from Shopify webhooks … use reconciliation jobs" [S12]. This is the *ingress* half —
  Effy's is already built (§0). The question for this slice is the *egress* half: server → browser.
- **Server-Sent Events.** One long-lived HTTP response; the browser reconnects by itself; a server sends
  a comment line periodically "to prevent connections from timing out" [S13]. Two constraints matter:
  - The `EventSource` constructor accepts only a URL and `withCredentials` — **no custom headers** [S14].
    A bearer token would have to go in the query string (and into every access log). The fix is to read
    the stream with `fetch` + `ReadableStream`, which can send `Authorization`.
  - Over HTTP/1.1 browsers cap connections at **6 per domain across all tabs**; HTTP/2 negotiates ~100
    streams instead [S13]. The ALB speaks HTTP/2 to browsers.
- **WebSockets** — bidirectional, which a feed does not need. Hosted as API Gateway WebSocket APIs
  (2-hour maximum connection, 10-minute idle timeout [S15]), AppSync Events, Pusher, Ably, or
  Cloudflare Durable Objects.
- **Polling with ETags.** The simplest thing that works; its cost scales with *open tabs × frequency*,
  not with *how much actually changed*.
- **The "poke" pattern.** Replicache's term: "a poke is a contentless hint delivered over pubsub … that
  they should pull" [S16]. The push channel carries no data; the client refetches over the normal
  request path. Pokes can ride "WebSocket, SSE, or even polling" [S16].

### 2.2 Reconnection, backfill and ordering

The brief's hard requirement is: on connect, backfill; on reconnect, backfill **again** rather than
trusting continuity; never show a row that is not a stored order. The poke pattern gets all three for
free, and the event-stream patterns have to work for them:

- **Backfill = refetch the snapshot.** The authoritative state is a query (`GET /shop/v1/today`). A
  client that (re)connects refetches it; nothing about what happened while it was away needs replaying.
  `Last-Event-ID` resumption [S14] is unnecessary — and is exactly the "assuming continuity" the brief
  forbids.
- **Ordering and exactly-once are properties of the snapshot, not the stream.** A duplicated or
  reordered poke causes one redundant refetch, never a duplicate row. Postgres itself guarantees that
  "messages from different transactions are delivered in the order in which the transactions committed"
  and collapses identical notifications within one transaction [S17].
- **Every row is a stored order** because rows only ever come from the snapshot query — which is the
  spec's FR-009, enforced structurally.
- **Missed pokes are harmless.** `NOTIFY` is not durable: a listener that is disconnected misses it
  [S17]. So the server treats *its own* reconnection to Postgres as "anything may have changed" and
  tells every client to resync; the client treats *its* reconnection the same way. The worst case is a
  refetch that was not needed.

### 2.3 Where the notification comes from

Operational state is changed by **many writers on two backends**: `core-api` (payment, refunds),
`edge-shop` (picking, handover, can't-supply, stock), `edge-orders` (carrier handoff, arrival),
`edge-driver` (collection, delivery), `edge-fleet` (release), `edge-inventory` (stock). A poke emitted
from application code would have to be added to every one of them, and missing one leaves the feed
quietly stale with no error — 054's `availability` lesson, where a rule written in 14 places was one
omission from wrong.

**Decision: a Postgres trigger emits the poke** — `pg_notify('shop_ops', <shop_id>)` on the tables that
define the Today snapshot. It fires in whichever backend's transaction made the change, is delivered
only if that transaction commits [S17], and cannot be forgotten by a future writer. The same triggers
mark rollup buckets dirty (§1.4). This is the platform's first use of triggers; research R6 records the
reasoning and the constraints on what they may do.

`core-api` holds **one** dedicated `LISTEN shop_ops` connection per task (not per browser), fans each
notification out to that task's SSE subscribers for that shop, and emits a `resync` to all of them if
its Postgres connection drops. A second task (if `core-api` ever scales out) runs its own listener — no
cross-task coordination is needed, because Postgres broadcasts to every listening session.

---

## 3. Webhook reliability practice (and what Effy does)

| Practice | Stripe | Shopify | Effy today |
|---|---|---|---|
| Signature | HMAC-SHA256 over `timestamp.payload`, constant-time compare, ignore non-`v1` schemes [S11] | HMAC, verify before acting [S12] | ✅ `stripe-go` `ConstructEventWithOptions` (020) |
| Replay window | Timestamp inside the signature; library default tolerance **5 minutes**; "don't use a tolerance value of 0" [S11] | — | ✅ library default (5 min) |
| Duplicates | "Log the event IDs you've processed" [S11] | `X-Shopify-Webhook-Id` [S12] | ✅ `public.stripe_event` PK on the event id + a status-guarded transition (a replay is a no-op) |
| Ordering | Not guaranteed; don't order by `created` [S11] | Not guaranteed; use `X-Shopify-Triggered-At` / `updated_at` [S12] | ✅ Handlers read current state, never assume order |
| Retries | Live mode: "up to three days with an exponential back off" [S11] | Retries, then disables | ✅ Stripe's retries; the handler is idempotent |
| Respond fast, work async | "Quickly returns a successful status code (2xx) before any complex logic" [S11] | Same | ⚠ Finalize runs inline (019); fine at this volume, recorded |
| Reconciliation sweep | Retrieve missing objects via the API [S11] | "Use reconciliation jobs … leveraging `updated_at`" [S12] | ⚠ **No sweep for a missed `payment_intent.succeeded`** — an order whose payment succeeded but whose webhook never arrived within Stripe's 3-day retry window stays `pending_payment`. Out of this slice's scope; recorded as a carry-forward. |
| Dead-letter | Stripe keeps the undelivered event for manual resend (15 days dashboard / 30 CLI) [S11] | — | n/a for ingress. For this slice's own async work, the dirty-bucket table **is** the durable queue: a failed rollup leaves the row in place for the next run, and an alarm fires on its age. |

**Where this slice applies the same discipline to its own async path:**

- **At-least-once + idempotent consumer** — rollup recompute is idempotent by construction (§1.2).
- **Retry with backoff** — the scheduled rollup retries every minute until the dirty row clears; the
  `core-api` listener reconnects to Postgres with capped exponential backoff; the browser reconnects
  the stream with capped exponential backoff and jitter.
- **Periodic reconciliation** — the nightly sweep recomputes 35 days per shop from source and counts
  what it corrected; a non-zero count is an alarm, because it means a writer bypassed the dirty marks.

---

## 4. Cost

### 4.1 Assumptions (stated so they can be argued with)

| | 10k orders/mo | 500k orders/mo |
|---|---|---|
| Shops | 15 | 250 |
| Shop portions (1.5 per order) | 15,000 | 750,000 |
| Console tabs open (2 per shop, 12 h/day, 30 days) | 30 tabs · 648k connection-min | 500 tabs · 10.8M connection-min |
| Snapshot-changing writes (≈10 per portion: paid, received, picks, ready, collected, stock) | 150k | 7.5M |
| Snapshot refetches caused by pokes (≈1 per write after client debounce and tab visibility) | 150k | 7.5M |

**Unit prices** (AWS list, US East, as published; Sydney is typically the same or slightly higher —
re-check in the AWS Pricing Calculator before relying on the last digit):
API Gateway HTTP API **$1.00/M requests** [S18]; WebSocket API **$1.00/M messages + $0.25/M
connection-minutes** [S18]; Lambda **$0.20/M requests**, arm64 **$0.0000133334/GB-s**, always-free
**1M requests + 400,000 GB-s/month** [S19]; ALB **$0.008/LCU-hour**, one LCU = 3,000 active
connections/minute or 25 new connections/second [S20]; AppSync Events **$1.00/M operations + $0.08/M
connection-minutes** [S21]; Pusher, Ably and Cloudflare as published [S22][S23][S24].

A cold-path read (API Gateway + Lambda at 256 MB × 100 ms ≈ 0.025 GB-s) therefore costs
**≈ $1.53 per million** at list price.

### 4.2 Realtime (Today) — monthly marginal cost

| Option | 10k orders/mo | 500k orders/mo | Notes |
|---|---:|---:|---|
| Polling every 15 s (today's queue interval) | $4 | $66 + DB | ✗ Misses SC-002 (10 s p95). 33 snapshot req/s at 500k. |
| Polling every 5 s (fast enough for SC-002) | $12 | $198 + DB | ✗ 129.6M requests; **~100 snapshot req/s** in trading hours at 500k, several queries each — a `t4g.micro` cannot carry it, so the real cost includes a database resize this table does not price. |
| **SSE on `core-api` + Postgres `LISTEN/NOTIFY` pokes + refetch** ✅ | **≈ $0** (refetches inside Lambda free tier; ALB +0.01 LCU) | **≈ $13** ($11.5 refetches + ≤$1 ALB LCU + fallback polling) | Uses the ALB and Fargate task that already exist; ~KBs of memory per open stream. DB load tracks *changes*, not tabs. |
| API Gateway WebSocket + DynamoDB connection table + fan-out Lambda | ≈ $1 | ≈ $25 | Still needs something to hear the database change (a listener or the unbuilt outbox relay); 2-h connection cap [S15]; a new stateful service. |
| AppSync Events | ≈ $1 | ≈ $28 | Managed pub/sub; same "who publishes?" problem; pings and subscribes are billed operations [S21]. |
| Cloudflare Durable Objects | ≈ $5 | ≈ $17–20 | $5 Workers Paid floor [S24]; a second cloud, Cognito JWT verification in a Worker, and a publisher from AWS into it. |
| Ably | ≈ $0 (free: 200 connections, 6M msgs) | ≈ $89 ($29 base + $37.5 messages + $10.8 connection-min + refetch) [S23] | Third-party account; data leaves AWS. |
| Pusher Channels | ≈ $0 (Sandbox: 100 connections) | $60–110 (Startup $49 is capped at 500 connections; realistically Pro $99) [S22] | Tiered by concurrent connections — the dimension that grows with shops, not orders. |

### 4.3 Analytics (Insights) — monthly marginal cost

| Option | 10k | 500k | Notes |
|---|---:|---:|---|
| **Postgres rollups + 1-minute dirty-bucket job + nightly sweep** ✅ | **≈ $0** | **≈ $0.30** | 43,200 invocations × ~0.5 s × 256 MB ≈ 5,400 GB-s — inside the always-free tier; reads ≈ 75k/month. Storage: ~2.2M hour-rows/year at 250 shops, inside the existing 20 GB volume. |
| Aggregate raw rows per request | ≈ $0 | ≈ $0.10 + DB CPU | Cheap in dollars; ✗ forbidden by FR-026 and grows with history. |
| Materialized view refreshed each minute | ≈ $0 | DB CPU growing with all history | ✗ [S6] |
| Redshift Serverless (+ CDC) | ≈ $540 | ≈ $540+ | 4-RPU floor × $0.375/RPU-h × 12 h × 30 d [S7], before replication. |

### 4.4 Verdict

The chosen arrangement costs **≈ $0/month at 10k orders** and **≈ $13–14/month at 500k orders**, with
no new vendor, no new AWS service, no new account and no new real-world identifier. Every hosted
realtime option costs more at 500k *and* still needs the same database listener to know when to
publish — they would replace the cheapest link in the chain (the last hop to the browser) and keep
the rest. The brief's rule — "do not add a paid realtime provider if SSE from the core API meets the
requirement at a fraction of the price" — applies: it meets it at roughly **a seventh to a
fifteenth** of the price of the hosted options at 500k.

**What it is not:** it is not the platform's event backbone. The poke carries a shop id and nothing
else, and no business logic may consume it. When the SNS backbone lands (Principle VI's shared
topic), domain events go there; the poke remains a UI cache-invalidation hint.

---

## 5. Summary of decisions

1. **Insights**: Postgres rollup tables keyed by `(shop, local-hour start)` and `(shop, local date,
   product)`, recomputed from source for dirty buckets every minute, reconciled nightly; served by the
   cold path (`edge-shop`) from Sydney; `computedAt` in every payload; `ETag` + `private, no-cache`.
2. **No edge runtime, no CDN cache** for either screen.
3. **Refunds dated on the day issued** (Shopify [S1]); the spec was amended.
4. **Today**: a snapshot read on the cold path (`GET /shop/v1/today`), made live by **SSE from
   `core-api`** carrying content-free pokes, which come from **Postgres triggers** via
   `LISTEN/NOTIFY`; backfill = refetch on every (re)connect; fallback = 30 s polling with `ETag`.
5. **Webhook ingress unchanged**; the missing payment reconciliation sweep is recorded as a
   carry-forward, not built here.

---

## Sources

- [S1] Shopify Help Center — Sales reports. https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report
- [S2] Shopify Help Center — Shopify analytics; Shopify changelog, "Real-time analytics: new time controls and live data indicators". https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports · https://changelog.shopify.com/posts/real-time-analytics-new-time-controls-and-live-data-indicators
- [S3] Saleor dashboard GraphQL schema (`ordersTotal`, `ReportingPeriod`). https://github.com/saleor/saleor-dashboard/blob/main/schema.graphql
- [S4] Cube — Adding an e-commerce admin dashboard to Saleor. https://cube.dev/blog/adding-analytics-dashboard-to-ecommerce-web-app-with-cubejs-saleor-example
- [S5] Medusa analytics plugin (Agilo). https://github.com/Agilo/medusa-analytics-plugin
- [S6] Citus Data — Materialized views vs. rollup tables in Postgres. https://www.citusdata.com/blog/2018/10/31/materialized-views-vs-rollup-tables/ · Scalable incremental data aggregation on Postgres. https://www.citusdata.com/blog/2018/06/14/scalable-incremental-data-aggregation/
- [S7] Amazon Redshift pricing (Serverless RPU-hour, base capacity). https://aws.amazon.com/redshift/pricing/
- [S8] Tiger Data (Timescale) — Timescale Cloud vs. Amazon RDS PostgreSQL; AWS — Using PostgreSQL extensions with RDS. https://www.tigerdata.com/blog/timescale-cloud-vs-amazon-rds-postgresql-up-to-350-times-faster-queries-44-faster-ingest-95-storage-savings-for-time-series-data · https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Extensions.html
- [S9] Vercel — Edge Runtime. https://vercel.com/docs/functions/runtimes/edge
- [S10] RFC 5861 — HTTP Cache-Control Extensions for Stale Content (`stale-while-revalidate`). https://www.rfc-editor.org/rfc/rfc5861
- [S11] Stripe — Receive Stripe events in your webhook endpoint. https://docs.stripe.com/webhooks
- [S12] Shopify — Webhook best practices. https://shopify.dev/docs/apps/build/webhooks/best-practices
- [S13] MDN — Using server-sent events. https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- [S14] WHATWG HTML Standard — Server-sent events. https://html.spec.whatwg.org/multipage/server-sent-events.html
- [S15] AWS — Quotas for WebSocket APIs in API Gateway; Quotas for HTTP APIs (30 s integration timeout). https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html · https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html
- [S16] Replicache — Poke. https://doc.replicache.dev/byob/poke
- [S17] PostgreSQL 16 — NOTIFY. https://www.postgresql.org/docs/16/sql-notify.html
- [S18] Amazon API Gateway pricing. https://aws.amazon.com/api-gateway/pricing/
- [S19] AWS Lambda pricing. https://aws.amazon.com/lambda/pricing/
- [S20] Elastic Load Balancing pricing; ALB attributes (idle timeout). https://aws.amazon.com/elasticloadbalancing/pricing/ · https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- [S21] AWS AppSync pricing (Events). https://aws.amazon.com/appsync/pricing/
- [S22] Pusher Channels pricing. https://pusher.com/channels/pricing/
- [S23] Ably pricing. https://ably.com/pricing
- [S24] Cloudflare Durable Objects pricing. https://developers.cloudflare.com/durable-objects/platform/pricing/
