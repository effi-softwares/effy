# Research: Retire the Hot Path

Decisions that shape the plan. Facts cited here were read from the repository on 2026-10-04/05;
the full index is [migration-inventory.md](migration-inventory.md).

## R1 — The latency premise is weaker than recorded

**Finding**: the "~135 ms per database round trip" figure that justified keeping shopper traffic off
the serverless backend was measured **from a laptop running core-api locally** to the Sydney
database (`FEATURE-HISTORY.md:1548-1549`: "measures 135 ms from local `core-api`"). It is not an
in-region figure. A function running in the same region as the database does not pay it.

**Decision**: port the reads as they are — the same statements, issued in the same order — and
measure in-region before optimising. Do not pre-emptively collapse the home page's eight reads or
the facet fan-out into single statements.

**Rationale**: rewriting eight proven queries into one is a parity risk taken to solve a problem
that may not exist in-region. SC-004/005/006 are measured in the verification walk; if a target is
missed, the fix is local to one repository file.

**Alternatives rejected**: combined single-statement reads up front (parity risk, no evidence it is
needed); raising the per-container pool above one connection (multiplies connection use — see R4).

## R2 — Where the routes live

**Decision**: two new services and two additions to existing ones.

| Service | Audience | Holds | Functions (est.) |
|---|---|---|---|
| `storefront` (new) | public | 8 storefront reads, 2 platform-status, health | ~12 |
| `commerce` (new) | customer, plus 3 public routes | saved (6), lists (8), cart (10), promo (2), cart preview + policy (public), checkout (5), orders (2), customer cancel + refund request (2), payment webhook (public, signature), refund reconciler (schedule), health | ~40 |
| `orders` (existing, 8 functions) | back-office | + issue refund, cancel order, decline refund request | +3 |
| `shop` (existing, 50 functions) | shop | + shop-manager refund | +1 |

**Rationale**:
- `admin` is at 434 of CloudFormation's 500 resources and `customer` carries the profile surface;
  neither can absorb ~50 routes. At roughly five resources per route, `commerce` lands near 220 —
  to be confirmed by `serverless package` at scaffold time, before routes are added.
- One audience per service is the repo's stated preference (`catalog/serverless.yml:11-15`). Staff
  refund routes therefore go to the services that already hold those audiences, which also keeps
  them **off the shopper connection limit** (R4).
- The three public routes in `commerce` follow the existing pattern of omitting the authorizer per
  route (046's public feedback route).

**Measured (T021, 2026-10-05)**: `serverless package` gives exactly 5 resources per route (log group,
function, permission, integration, route) plus 3 per service. `storefront` packages to **53** with
its 10 functions. `commerce` projects to about **205** at 40 functions plus one schedule — well
under the 450 threshold, so saved items and lists stay in `commerce` and no third service is needed.

**Alternatives rejected**: one service for everything (mixes four audiences; staff money routes
would share the shopper connection limit); a separate `payments` service for the webhook and all
refunds (splits payment finalisation from checkout, which call the same code); adding to `customer`
(resource limit, and it would bury the commerce surface in the profile service).

## R3 — One home for money logic, three services that call it

**Decision**: payment-provider access and the three money operations — finalise a payment, issue a
refund, cancel an order — live in **one module** of the shared edge library, exposed on its own
import path (`@effy/edge-shared/payments`), not through the library's main entry. `commerce`,
`orders` and `shop` import it; each is granted read access to the payment secrets.

**Rationale**: today "money lives where the secret lives" (one process). With staff routes in
their own services (R2), the equivalent guarantee is one implementation, not one deployment. A
separate import path keeps the provider SDK out of every function bundle that does not move money.

**Alternatives rejected**: duplicating refund logic per service (the two-copies defect this repo
has shipped repeatedly); an internal call from `orders`/`shop` to `commerce` (a second network hop
and a service-to-service credential that does not exist).

## R4 — Shopper traffic cannot starve staff (FR-030)

**Finding**: every edge function connects as the database's master user, one connection per warm
container, against a budget of about 85 (`shared/src/lib/db.ts:1-5`). Function concurrency is
uncapped. Nothing today stops a burst on one surface taking every connection.

**Decision**: `storefront` and `commerce` connect as a **dedicated database role** with a
connection limit (40). When the limit is reached the database refuses the connection immediately;
the handler maps that refusal to a retryable "unavailable" answer. Staff, shop and driver services
keep the existing role and are unaffected.

- The role and its grants are created by a migration, without a password.
- The password is generated and stored by an operator-run make target, in a secret the operator
  creates — the same arrangement the payment secrets already use. No secret enters Terraform state
  or a migration.
- The existing connection code already takes its user and secret from configuration, so the two
  services differ only in two configuration values.

**Rationale**: the limit is enforced by the database, so it holds regardless of how many functions
or containers exist, and needs no assumption about the account's concurrency quota.

**Alternatives rejected**: per-function reserved concurrency (per function, not per service — forty
separate caps, and it reduces the account's shared pool, whose size is unknown); gateway
throttling (limits request rate, not connections, and is a single stage-wide setting that cannot
tell shoppers from staff); a connection proxy (a new always-on cost, which is what this feature
removes).

## R5 — Paths and credentials follow the existing edge convention

**Decision**: new routes use `/<service>/v1/...` (`/storefront/v1/home`, `/commerce/v1/cart`).
Clients reach them through the edge client they already have, presenting the same credential they
already present to edge customer routes. Handlers identify the shopper by the token's subject only.
The full old-to-new mapping is [contracts/api-migration.md](contracts/api-migration.md).

**Rationale**: every consumer is being rebuilt in one cut-over (Clarifications), so keeping the
old paths buys nothing and would need a second routing convention on the gateway. Reusing the
existing edge client removes each app's second client, second base address and second token mode.

**Consequence**: the storefront's three browser-direct catalogue calls now hit the gateway from the
browser, so the storefront origin is added to the gateway's allowed origins (one list, shared with
the media bucket, in `edge-gateway.tf`).

**Alternatives rejected**: registering bare `/v1/*` paths on the gateway to make repointing a
one-line change (a second convention kept forever, to save edits that are being made anyway).

## R6 — The payment webhook, made safe

**Decision**:
- The signature is verified against the request body exactly as received (decoded first when the
  gateway marks it encoded). An invalid signature is the only case answered as the caller's error.
- "This event has been seen" is recorded **inside the same transaction** as the event's effects.
  If handling fails, the record rolls back with it, the provider is told to retry, and the retry is
  processed. A genuine duplicate still does nothing.
- Unknown event types are acknowledged and ignored.

**Rationale**: this is FR-023. It needs no new column — the existing `stripe_event` table is
sufficient once the insert moves inside the transaction — so the spec's "may need a supporting
record" resolves to "does not".

**Cut-over** (FR-041): the operator registers the new address at the provider **alongside** the old
one, stores the new endpoint's signing secret, and only then disables the old endpoint. During the
overlap both backends may receive the same event; the shared seen-record makes the second a no-op.

## R7 — Stuck refunds (FR-024)

**Decision**: a scheduled function in `commerce`, every five minutes, takes each refund still
`submitting` after two minutes and resolves it: it asks the provider whether a refund carrying this
refund's id exists for the payment; if so it records that outcome; if not it submits again with the
refund's stored idempotency key. A refund still unresolved after fifteen minutes raises an alarm.

**Rationale**: a function that times out between "provider accepted" and "we recorded it" is the
new failure mode a time-limited runtime introduces. Asking the provider first makes recovery
correct even after the provider's own idempotency window has passed.

## R8 — Time limits

**Decision**: `commerce` functions that call the payment provider (intent, confirm, payment
methods, webhook, cancel, refund) run with a 25-second limit; everything else keeps the 10-second
default. Memory is 512 MB for both new services.

**Rationale**: the gateway's ceiling is 30 seconds and the client's patience is 12. A function
limit below the client's would turn a slow provider call into a guaranteed failure that the client
then retries; above it, the function finishes its work and the retry finds it done.

## R9 — Exactness: money, time, SQL

- **Money**: integer cents in ordinary integers; amounts cross the database boundary as text and
  are parsed without floating point. One shared helper; each existing rounding rule is ported with
  its own test (percentage discount rounds down, capped at subtotal; parse truncates past two
  places; goodwill refuses more than two). The order read's float conversion (inventory defect g)
  is replaced by the shared helper.
- **Time**: Melbourne wall-clock via the platform's `Intl` time-zone support, the method
  `collection-deadline.ts` already uses and already pins with daylight-saving fixtures.
- **SQL**: statements are carried over verbatim. Three couplings get an explicit test: the search
  similarity expression must equal the index expression in the catalogue migration; "is this
  product purchasable" has one definition and a guard that fails on a hand-written copy; the search
  filter builder is shared by the page, the count and the facets.
- **Driver type mapping**: the database client returns large integers and decimals as text and
  timestamps as dates. Every repository maps rows to domain values explicitly — already the rule.

## R10 — Measurements and alerts

**Decision**: a single shared helper emits CloudWatch embedded-format metrics (today each service
hand-rolls its own). Domain counters keep their meaning under namespaces `Effy/Storefront` and
`Effy/Commerce`. Per-operation request counts, errors and durations come from the platform's
built-in per-function metrics — one function per route makes them per-operation for free. The four
inert Prometheus rule files are deleted and replaced by live alarms on the existing alerts topic.

**Rationale**: no metrics stack was ever built (`infra/observability/README.md`); alarms on the
existing topic are the pattern `insights.tf` already uses and already reach the operator.

**Retired with their mechanisms**: stream gauges, pool gauges, the `/metrics` endpoint.

## R11 — Shop console

**Decision**: delete the stream client (`useShopLive`, `web-kit` `runtime/live`) and any "live"
indicator; keep the Today query's existing 30-second refresh. A migration removes the database
notification that fed the stream; the triggers' other duty — marking insights buckets for
recomputation — is untouched.

**Rationale**: Clarifications. Leaving the notification in place would be harmless but would be
exactly the kind of mechanism-with-no-consumer this feature exists to remove.

## R12 — Operator tools

**Decision**: a new workspace package, `apis/edge-api/ops`, with three command-line entry points
(`create-first-admin`, `delete-admin`, `load-localities`). It is not a deployed service. The three
Make targets keep their names and arguments and call the new entry points; the database address
still comes from `infra/scripts/db-dsn.sh`.

**Rationale**: same behaviour, same commands, one language. The Cognito client the tools need is
already a dependency elsewhere in edge-api.

## R13 — Proof (FR-035/036/037)

| Kind | What |
|---|---|
| Real-database tests, including simultaneous requests | payment finalisation exactly-once; window hold, capacity, over-capacity; stock deduction; refund ceiling and idempotency; cancellation; saved-item and list limits; webhook retry and duplicate handling |
| Guards re-pointed at the new code | refund append-only; stock append-only; hidden fulfilment; purchasable-in-one-place; no reference to a dropped column; every setting declared where deployed |
| Collapsed to one implementation | order stage and counted-refund-status mirrors; collection-deadline parity |
| Kept unchanged | mobile wire-contract tests; shared-types fixtures and generated Kotlin |
| Ordinary unit tests written with the code | storefront, search, facets, cursor, cart, promo, saved, lists |

## R14 — Governance (FR-001..003)

**Decision**: the first task is a constitution amendment to **3.0.0**:
- Principle III becomes a single-backend principle: all server behaviour runs on the serverless
  TypeScript backend; services are split by audience and domain; a plan states which service a
  feature extends.
- The locked "Hot path: Go" standard is removed.
- Principle VII and the observability standard are corrected to what exists: structured logs,
  CloudWatch metrics and alarms. The Prometheus/Grafana wording is removed.
- Principle VI's "both backends publish" becomes "the backend publishes".

**Rationale**: until amended, this plan violates Principle III and the locked-technology rule
outright. The repo's method is to change the law first.

## R15 — Sequence

Build → deploy alongside → switch → destroy → walk → delete source. Detail in
[quickstart.md](quickstart.md). Two orderings matter:

- The **role migration** runs before the new services deploy; the **notification-removal
  migration** runs at teardown.
- **Infrastructure teardown** follows the switch immediately; the **Go source** is deleted last,
  after the verification walk, because it is the only precise reference for fixing a parity defect.

## Open items for tasks, not decisions

- Pin the payment SDK's API version to the one the current Go SDK release targets (read from the
  module at task time).
- Confirm the `commerce` resource count with a packaging dry run before adding routes.
- Read the storefront's real origin list from `core_api_cors_origins` in `dev.tfvars` when moving
  it to the gateway.
