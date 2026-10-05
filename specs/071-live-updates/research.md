# Research: Live Updates Without Polling

**Feature**: 071-live-updates | **Date**: 2026-10-05

Sources: the AppSync Events developer guide (authorization, channel-namespace handlers, WebSocket
protocol) and the AppSync quota table, read 2026-10-05; the repository as it stands after 070.
Anything not confirmed by one of those is marked **⚠ PROVE** and is a task in the early proof (R14),
not an assumption the build rests on.

## R1 — The channel: AppSync Events

**Decision**: one AppSync **Event API** per environment. Operator decision; recorded, not re-opened.

**Rationale**: connections are held by the managed service, so nothing of ours runs while an app is
merely open (FR-031, Principle III). A channel is a path; publishing is one signed HTTPS request.
There is no connection table to keep, no `$connect`/`$disconnect` functions, no fan-out loop.

**Alternatives considered**: API Gateway WebSocket — the same order of cost but we would own the
connection registry (a table), three route functions and the fan-out; rejected by the operator for
moving parts. Server-sent events from a function — a Lambda cannot hold a response open past its
time limit, which is exactly what 070 retired. Push-triggered refresh — ruled out by FR-007.

## R2 — What an update is

**Decision**: one JSON value, `{"k":"<kind>"}`, where kind is one of a closed list
([contracts/live-channel.md](contracts/live-channel.md)). No id, no status, no amount, no timestamp.

**Rationale**: FR-002 allows "at most, what kind of thing". The kind lets a screen re-read only what
it shows (orders, not stock). With no payload there is nothing to get wrong when an update is
duplicated, late or reordered (FR-003), and nothing for a log line to leak (FR-034).

**Alternatives considered**: carrying the order id — lets a screen re-read one row, but a customer's
update would then need a per-shop-portion identifier scrubbed out, and "two updates with two ids" is
a hidden-fulfilment leak waiting to happen (FR-024). Rejected.

## R3 — Who authorizes: one Lambda authorizer

**Decision**: connect and subscribe use `AWS_LAMBDA` authorization; publish uses `AWS_IAM`. The API
keeps **no** Cognito auth provider.

**Rationale**: a Cognito provider only proves "this token is from that pool". Whether this person
may hear *this shop* is a platform fact — the staff record's shop and status — and is not a claim
(CLAUDE.md, Auth: the platform record is authoritative). One function does both steps: verify the
token against the pool its issuer names (`aws-jwt-verify`, already used by seven services), then
check the requested channel against the platform record. The same token the apps already send to
the REST gateway is the authorization token; with no Cognito/OIDC provider on the API the
documented restriction on passing a raw OIDC token to a Lambda authorizer does not apply
(**⚠ PROVE**).

- `EVENT_CONNECT`: any valid, unexpired token from one of the four pools.
- `EVENT_SUBSCRIBE`: the namespace must be the token's own audience (FR-022); the scope segment
  must be the one the platform record yields (FR-017..021); the epoch segment must be current or
  next (R5); any wildcard is refused.
- `EVENT_PUBLISH`: always refused — clients never publish.

Results are cached by the service per (token, operation, channel) for 300 s (`ttlOverride`), so an
open app costs one or two authorizer runs per ten minutes.

**Customers need no database read**: the customer channel is keyed by the token's own `sub`, so the
check is string equality. A burst of customers opening order pages therefore cannot reach the
database through this function — the same isolation 070 built with `effy_shopper`.

**Alternatives considered**: four Cognito providers plus an `onSubscribe` handler — the handler
runs in the AppSync JS runtime and still needs a Lambda data source to read the staff record, so it
is two mechanisms instead of one. Per-scope API keys — a key is a shared secret in a client bundle.

## R4 — Channels

**Decision**: four namespaces, one channel per scope and epoch:

| Namespace | Channel | Scope id |
|---|---|---|
| `shop` | `/shop/{shopId}/{epoch}` | the staff record's shop |
| `customer` | `/customer/{sub}/{epoch}` | the customer's own token subject |
| `driver` | `/driver/{driverId}/{epoch}` | the driver record |
| `ops` | `/ops/all/{epoch}` | none — every active back-office account |

The kind travels in the payload, not the path, so each app holds **one** subscription per scope.

**Rationale**: ids are UUIDs (36 characters) and fit the 50-character segment limit; three segments
are inside the five allowed. A customer channel is never keyed by, and never contains, a shop
identifier (FR-024).

**Clients never build a channel from an id.** Each audience's service gains one read,
`GET /{audience}/v1/live`, returning the hosts, the channel prefix for the signed-in person, the
epoch length and the server's clock. It is read on sign-in and on reconnect only.

## R5 — Stopping within fifteen minutes (FR-023, SC-009)

**Finding**: authorization runs when a subscription is made. Nothing re-checks an established
subscription, and a connection may live 24 hours. Left alone, a suspended staff member's open app
would keep hearing "orders changed" until it closed.

**Decision**: the last channel segment is an **epoch** — `floor(server time / 600 s)`.
- Publishers send to the current epoch, and also to the previous one during the first 60 s of an
  epoch.
- A client subscribes to the next epoch 60 s before it begins and drops the old one 60 s after.
- The authorizer accepts only the current and next epoch and refuses wildcards, so every ten
  minutes each open app must pass the access check again.

Worst case a removed person hears updates for one epoch plus the two margins: **12 minutes**.
Signing out closes the connection on the device at once.

**This is a clock, not a refresh.** Rolling the epoch sends one subscribe frame on an open socket;
it reads no data and makes no request to the gateway (FR-009, FR-012). The client derives the epoch
from the server clock returned by R4's read, so a wrong device clock cannot desynchronise it.

**Alternatives considered**: disconnecting a person from the server — the service offers no such
call. Relying on the 24-hour limit — misses the requirement by two orders of magnitude. Arguing the
update is harmless because it is empty and every read is still checked — true, and it is the
defence in depth, but the spec asks for the updates themselves to stop.

## R6 — Publishing

**Decision**: one shared module, `@effy/edge-shared/live`, with one function:
`announce(changes: LiveChange[]): Promise<void>`. It signs a `POST https://{host}/event` with the
function's own role (SigV4, service `appsync`) and sends one request per distinct channel.

- **Called after the transaction has committed**, from the service layer, never inside it (FR-004).
- **Never throws.** One attempt with a 1.5 s limit, one retry, then it gives up, logs and counts
  the failure (FR-006, SC-008). The handler awaits it — a function frozen mid-request would lose it.
- De-duplicates within a call, so a change that touches the same scope twice publishes once.
- No client and no socket: plain `fetch`, signed with the SDK's v4 signer already in the bundle.

**Why not through the outbox**: `event_outbox` has no drain (070 FR-026, deliberately). Building one
means a scheduled function — a timer, and seconds of delay — to deliver something whose loss is
already tolerated: an app that misses an update is corrected by the next one or by its next
catch-up read. A lost announcement is a stale screen, not a wrong one.

**Latency cost**: one in-region HTTPS call (tens of milliseconds) added to each changing request.

## R7 — What the customer is told (FR-024, FR-025, SC-011)

**Decision**: a customer is announced to in exactly three cases — their order is paid; the value of
`stageFor()` for the whole order changes; a refund or cancellation on it changes what
`customerRefundState()` reports. The comparison is made in the service that commits the change,
using the shared rules in `shared/src/lib/order-completion.ts` that the order page itself is built
from.

**Rationale**: `stageFor()` is the *least advanced* portion's stage. On an order split across two
shops it moves when the slower shop moves, so the customer receives the same number of updates, at
the same moments, as on a one-shop order. Announcing on every shop-side transition would deliver
two "packed" updates and reveal the split by count alone.

## R8 — Where changes are announced

Every announcing point, by service, is listed in
[contracts/change-map.md](contracts/change-map.md). Summary: `commerce` (payment finalised,
customer cancel, refund request), the shared payments module (refund settled — one implementation,
three callers), `shop` (fulfilment transitions, pick progress, handover, attention), `inventory`
(stock crossing out-of-stock or its low level — not every decrement), `driver` (collection,
check-in, proof, duty), `fleet` (assignment, reassignment, wave planning, slots), `orders` (staff
cancel/refund, arrival, handover to carrier), `catalog` (review queue).

**Guard**: a test enumerates every state-changing function and scheduled function in those services
and fails unless each either announces or appears in an allow-list with a written reason. A new
route that changes order state cannot ship silently un-live.

## R9 — Web clients

**Decision**: a hand-written client in `packages/web-kit/src/live/` (the protocol is seven message
types). It owns one socket per signed-in app, reconnects with jittered exponential backoff, closes
the socket when no `ka` arrives within the service's stated timeout, and rolls epochs.

- **shop-web, back-office**: a `LiveProvider` maps a kind to TanStack Query key prefixes and calls
  `invalidateQueries` — only *active* queries re-read. All `refetchInterval` data timers are
  deleted: `today/queries.ts` (30 s), `fulfillment/queries.ts` (15 s ×2), back-office
  `drivers/queries.ts` and `delivery/queries.ts` (30 s). `useNow` and the PWA update check stay
  (FR-011; neither reads screen data).
- **customer-web**: order pages are server-rendered; a small client component on the order list and
  order detail routes calls `router.refresh()`. Signed-out pages load nothing.
- **Coalescing** (FR-014, SC-012): re-read at once on the first update, then at most once per 2 s,
  always once after the last. A ten-change burst costs at most three reads.
- **Catch-up** (FR-013): one re-read on `subscribe_success` after any reconnect and when the tab
  becomes visible again. Hidden tabs keep the socket for five minutes, then close it.
- **Stale state** (FR-015): the provider exposes `live | reconnecting | off` and the time of the
  last successful read; the console header shows it.
- **Not disturbing the person** (FR-016): invalidation re-reads lists in place; it never navigates,
  and forms hold their own state. Existing behaviour, asserted by test.

`aws-amplify`'s Events client was considered for the web apps and rejected: the mobile apps cannot
use it, and two implementations of one protocol is the two-sources shape this repo keeps paying for.

## R10 — Mobile clients

**Decision**: the same client in `packages/mobile-kit/common/live/` on Ktor WebSockets, exposed as a
`Flow<LiveKind>`; each app's container wires it once and ViewModels collect it (MVVM, Principle VI).

- **Engine**: the apps use `ktor-client-android`, which has **no WebSocket support**. The live
  client gets its own `HttpClient` on `ktor-client-okhttp` (Android) and the existing Darwin engine
  (iOS). **⚠ PROVE** that both engines send the two required subprotocols.
- **Lifecycle**: connect when the app is in the foreground and signed in; close on background.
  Returning to the foreground reconnects and reads once (FR-013).
- **Removed**: shop-mobile's `OrdersScreen` 15 s loop and `QueueRefreshIntervalMillis`. Driver's
  `WindowLine` 30 s tick stays — it re-words a loaded time and reads nothing (FR-011).
- All three apps pin the same Ktor version (3.5.1), so the dependency is added identically to each.

## R11 — Infrastructure

**Decision**: `infra/envs/dev/live.tf` — the Event API, four namespaces, the authorizer's invoke
permission, one IAM policy document for publishing, SSM parameters for the hosts and API id, alarms
and a budget. **⚠ PROVE** at `terraform validate` that provider 6.53 carries `aws_appsync_api` and
`aws_appsync_channel_namespace`; if not, the fallback is the provider's CloudFormation-stack
resource wrapping `AWS::AppSync::Api`, still Terraform-authored.

No custom domain: the service's own hostnames are published through SSM into each app's build
configuration. A certificate and a record would add nothing a customer sees.

Region is not a literal anywhere: the hosts come from the API's own attributes and the signer reads
`AWS_REGION`.

## R12 — Cost (SC-006, SC-007)

Prices: 1.00 USD per million operations (publish in, message out, connect, subscribe);
0.08 USD per million connection-minutes. Nothing is charged while no app is connected and nothing
is published (SC-007). The authorizer and the publishing calls stay inside Lambda's free tier.

| | Now (dev, a handful of devices) | Fifty shops |
|---|---|---|
| Connected devices | ~5, a few hours a day | 150 shop devices × 12 h, plus ~60 others |
| Connection-minutes / month | ~30 k → **0.00** | ~4.5 M → **0.36** |
| Orders / month | tens | 60,000 (40 per shop per day) |
| Operations per order | ~80 | ~80 |
| Operations / month | < 10 k → **0.01** | ~4.8 M → **4.80** |
| Epoch re-subscribes | negligible | ~0.5 M → **0.50** |
| **Total** | **< 0.05 USD** | **≈ 5.7 USD** |

⚠ **The fifty-shop figure does not fit under 5 USD as first drawn**, and the reason is one item:
per-item pick progress, announced to every device in the shop. Two measures bring it inside, both
adopted:

1. Pick progress is announced to the **shop only** — not to `ops`, whose consoles do not show
   per-item progress (FR-029 lists status changes).
2. Pick progress is announced **at most once per order per 5 s** from one function instance (the
   last one always sent). A picker scanning eight items produces two or three updates, not eight.

With both: ~45 operations per order → ~2.7 M → **≈ 3.6 USD** at fifty shops.

The honest boundary: the bill is linear in orders. Under these assumptions 5 USD is reached near
**90,000 orders a month**. The budget alert (R13) is what tells the operator before that.

## R13 — Telemetry and alerts (FR-033, FR-034, Principle VII)

- **Metrics** (embedded format, namespace `Effy/Live`): `UpdatesSent`, `UpdateSendFailures`,
  dimension `kind` only — no scope id, no person (FR-034; low cardinality).
- **Alarms** (Terraform, to the existing alerts topic): send failures ≥ 5 in 15 minutes;
  authorizer errors ≥ 1. Nothing here is scheduled, so `background-functions.tf` gains no entry.
- **Cost**: an AWS Budget scoped to AppSync at 4 USD a month, notifying the **existing alerts
  topic** — no address is written anywhere, so no new identifier is needed (constitution,
  Real-World Identifiers).
- **Product analytics**: none. An update is not a user action.
- **Clients**: `live_connection_state` is not sent to PostHog; connection flapping is system
  health, visible through the authorizer and connect counts.

## R14 — Early proof before the pattern scales

The first build step is one vertical slice — API, authorizer, `announce` from payment finalisation,
shop-web Today — measured against SC-001/002 before any other surface is touched. It also settles
the four **⚠ PROVE** items: raw token to the authorizer (R3), an established subscription is not
re-authorized and the epoch scheme closes it (R5), both Ktor engines pass the subprotocols (R10),
the Terraform resources exist (R11). Any of them failing changes this document first, not the code.

## R15 — Governance

Principle III forbids introducing "a persistent-connection server" without amending the
constitution. AppSync Events is a managed, pay-per-use service and no compute of ours, but it is
the first standing-connection component since 070 removed one, and it is a new AWS service under a
locked standard. **Decision**: amend to **v3.1.0** (MINOR) before implementation — Principle III
gains one sentence permitting a managed pay-per-use connection service that incurs nothing while
idle, and the standards list names AppSync Events as the platform's live channel. Recorded in the
plan's Complexity Tracking.
