# Implementation Plan: Live Updates Without Polling

**Branch**: `dev` (feature directory `071-live-updates`) | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/071-live-updates/spec.md`

## Summary

Every screen that shows changing data stops reading on a timer and starts reading when it is told
something changed. The telling is a managed publish/subscribe channel (AWS AppSync Events —
operator decision): the backend function that commits a change publishes an empty "changed" to the
channel of whoever it concerns, and each open app re-reads through the routes it already uses.
An app that was away reads once when it is back. Push notifications are untouched and unrelated.

Five findings shape the plan:

1. **An update carries one word — the kind of thing.** `{"k":"orders"}`. With no content, a
   duplicate, late or reordered update cannot show anything wrong, and there is nothing to leak
   (research R2).
2. **Who may listen is a platform fact, not a token claim.** A shop id is not in the token. One
   small authorizer function verifies the token against its own pool and checks the channel against
   the staff or driver record. Customers are checked against their own token subject with no
   database read, so shoppers cannot reach the database through it (R3).
3. **The service never re-checks an open subscription**, and a connection can live a day. To meet
   "stops within fifteen minutes" the channel name carries a ten-minute epoch; every open app must
   re-subscribe — and pass the access check again — each epoch. Worst case 12 minutes (R5).
4. **A customer is told only when their own page would change.** The order page shows the *least
   advanced* portion; announcing on that value means a two-shop order produces exactly the updates a
   one-shop order does (R7).
5. **Cost is linear in orders, and one item dominated it**: per-item pick progress. Limited to the
   shop and to one update per order per five seconds, the feature costs under 0.05 USD a month now
   and about 3.6 USD at fifty shops (R12).

## Technical Context

**Language/Version**: TypeScript on Node 22 (`apis/edge-api/*`, `packages/*`); TypeScript / React 19
(`apps/shop-web`, `apps/back-office`, `apps/customer-web` on Next 16); Kotlin 2.4 / Compose
Multiplatform (three mobile apps, `packages/mobile-kit`); HCL (`infra/`).

**Primary Dependencies**: **one new managed service — AWS AppSync Events.** New libraries:
`ktor-client-websockets` and `ktor-client-okhttp` in the three mobile apps (the Android engine in
use has no WebSocket support, R10). Backend and web add **no** package: publishing is a `fetch`
signed by a small signer on `node:crypto` (R6), the authorizer uses `aws-jwt-verify` (already
installed for seven services), and the web client is the browser's own `WebSocket`.

**Storage**: none. No table, no column, no migration ([data-model.md](data-model.md)).

**Testing**: Vitest — unit tests for `announce` (never throws, de-duplicates, does nothing
unconfigured), the authorizer (every refusal in the contract), the customer-stage rule; a
`*.guard.test.ts` holding every state-changing function to the change map; a config-contract test
that each announcing service has the publish permission and parameters. Web: client state machine,
coalescing and catch-up under fake timers; a sweep test that no data `refetchInterval` remains.
Kotlin `commonTest`: the same client state machine against a fake socket; wire-contract fixture for
the live descriptor. Scripted measurements in `apis/edge-api/ops/src/verify/`.

**Target Platform**: Lambda (arm64) behind the existing gateway; AppSync Events in the platform's
region; three web apps on Amplify; three mobile apps on Android and iOS.

**Project Type**: monorepo — one backend, three web apps, three mobile apps.

**Performance Goals**: change visible on an open screen 95% < 5 s, 99% < 15 s (SC-001); current
state within 5 s of a connection returning (SC-004); ≤ 3 reads per ten-change burst (SC-012).

**Constraints**: no data refresh timer anywhere (FR-009); no dependence on push (FR-007); a failed
announcement never fails the change (FR-006); announce only after commit (FR-004); no content in an
update (FR-002); a customer never learns a shop from an update or its timing (FR-024); access ends
within 15 minutes (FR-023); nothing runs or costs while idle (FR-031); < 1 USD a month now, ≤ 5 USD
at fifty shops (SC-006); channel paths ≤ 5 segments of ≤ 50 characters; operator runs every deploy
and apply.

**Scale/Scope**: 1 new backend service (1 function), 1 shared module, 4 new read routes, ~45
announcing points across 8 services and the shared payments module; 1 web client + 3 app
integrations; 1 mobile client + 3 app integrations; 5 web refresh timers and 1 mobile loop removed;
1 Terraform file (~15 resources); 1 constitution amendment.

### Unknowns

All resolved in [research.md](research.md): channel (R1), update shape (R2), authorization (R3),
channels (R4), ending access (R5), publishing (R6), customer rule (R7), announcing points (R8), web
(R9), mobile (R10), infrastructure (R11), cost (R12), telemetry (R13), early proof (R14),
governance (R15).

Four items are marked **⚠ PROVE** there — facts about the managed service and the mobile engines
that documentation implies but does not state. They are settled by the early proof (R14) before
anything else is built, and a failure sends this plan back for correction.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v3.0.1**.

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology; this plan carries all of it. |
| II. Monorepo, shared contracts | ✅ | The kind list and the live descriptor are declared once in `@effy/shared-types`; one web client in `web-kit`, one mobile client in `mobile-kit`; no per-app copy. |
| III. Single serverless backend | ⚠ **amendment required** | No compute of ours is always on. But the principle names "a persistent-connection server" as needing an amendment, and AppSync Events is a new service under a locked standard. See Complexity Tracking and research R15. **Service placement**: a new `live` service holds the authorizer — it serves all four audiences by necessity (one API, one authorizer), recorded here as the principle requires. The live descriptor route goes in each audience's own service (`shop`, `customer`, `driver`, `admin`). The publish rule lives once, in `@effy/edge-shared/live`. |
| IV. Auth isolation | ✅ | The authorizer pins each pool's issuer; a namespace accepts only its own audience's token (FR-022). It is not a sign-in proxy — apps still authenticate against Cognito directly. The platform record stays authoritative for the access decision. |
| V. Design | ✅ | One small status line in the console header and the mobile app bar, from existing tokens (`--warning` on its tint for reconnecting, `muted` for off). No card, no new colour. |
| VI. Layered architecture | ✅ | `announce` is called from the service layer after commit. Clients: the live client is infrastructure; it invalidates the server-state cache (web) or emits into a `Flow` ViewModels collect (mobile). No server data is cached by hand. **"One event language"** is not engaged: a live update is not a domain event, has no consumer that acts on it and no payload; the domain-event envelope and `event_outbox` are untouched. |
| VII. Observability | ✅ | Metrics `Effy/Live` `UpdatesSent` / `UpdateSendFailures` by kind; alarms on send failures and authorizer errors to the existing alerts topic; a 4 USD budget on the same topic. No product-analytics event (R13). No PII: no scope id in a metric or a log line. |
| Real-world identifiers | ✅ | None introduced. The budget notifies the existing topic; no address is written. No custom domain. |
| Locked standards | ⚠ **amendment required** | Same amendment: AppSync Events named as the live channel. |

**Gate result**: passes **conditional on the amendment to v3.1.0**, which is the first task and
precedes any implementation. Re-checked after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/071-live-updates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── live-channel.md      # descriptor route, socket protocol, authorizer, announce()
│   └── change-map.md        # which change announces to which scope
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
apis/edge-api/
├── live/                              # NEW service — the authorizer only
│   ├── serverless.yml
│   └── src/{functions/authorizer.ts, authorize/{service,repository}.ts}
├── shared/src/
│   ├── live/{index,announce,sign,channel,scope}.ts   # NEW — exported as @effy/edge-shared/live
│   └── lib/order-completion.ts        # + customerViewChanged(before, after)
├── commerce/  shop/  inventory/  driver/  fleet/  orders/  catalog/  admin/
│   └── src/…                          # announce() after commit, per contracts/change-map.md
├── shop/ customer/ driver/ admin/
│   └── src/functions/live-v1-get.ts   # NEW — the live descriptor
└── ops/src/verify/{live-latency,live-authz,live-burst}.ts   # NEW — scripted measurements

packages/
├── shared-types/src/live.ts           # NEW — LiveKind, LiveDescriptor (+ generated Kotlin)
├── web-kit/src/live/                  # NEW — client, coalescer, LiveProvider, LiveStatus
└── mobile-kit/common/live/            # NEW — LiveClient (Ktor), LiveState, LiveStatusLine

apps/
├── shop-web/src/
│   ├── features/today/queries.ts          # − 30 s timer
│   ├── features/fulfillment/queries.ts    # − 15 s timers
│   └── app/…                              # LiveProvider + kind → query-key map
├── back-office/src/
│   ├── features/drivers/queries.ts        # − 30 s timer
│   ├── features/delivery/queries.ts       # − 30 s timer
│   └── app/…                              # LiveProvider + kind → query-key map
├── customer-web/app/(account)/orders/     # LiveRefresh client component (router.refresh)
├── shop-mobile/…/features/orders/         # − 15 s loop; ViewModels collect LiveClient
├── customer-mobile/…/features/orders/     # ViewModels collect LiveClient
└── driver-mobile/…/features/{work,delivery}/   # ViewModels collect LiveClient

infra/envs/dev/live.tf                 # NEW — API, namespaces, permission, parameters, alarms, budget
.specify/memory/constitution.md        # → v3.1.0
```

**Structure Decision**: the existing monorepo layout, extended in place. One new backend service
(`live`), one new shared backend module, one new directory in each of the two client kits, one new
Terraform file. Nothing is scaffolded ahead of need.

### Build order

Each phase is releasable on its own; an app that is not yet listening behaves exactly as today.

| Phase | Delivers | Spec |
|---|---|---|
| 0 | Constitution v3.1.0 | — |
| 1 | **Early proof**: API + authorizer + `announce` from payment finalisation + shop-web Today, measured | US1 (P1) |
| 2 | Catch-up, coalescing, stale-state line, epoch roll, in `web-kit`; timers removed from shop-web | US2 (P1) |
| 3 | Remaining shop changes announced; shop-mobile client and loop removal | US3 (P2) |
| 4 | Customer rule; customer-web and customer-mobile | US4 (P2) |
| 5 | Driver and fleet announcing; driver-mobile | US5 (P2) |
| 6 | Ops announcing; back-office and its timers | US6 (P3) |
| 7 | Guard test complete, measurements, documents corrected, sign-off | — |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A standing-connection component, and a new AWS service under a locked standard (Principle III, Technology Standards) — requires amendment to v3.1.0 | Live updates without polling and without push need an open connection to each app (FR-001, FR-007, FR-009). A managed, pay-per-use service holds it; none of our compute does, and it costs nothing idle (FR-031). | Polling is ruled out by the operator. Push as the trigger is ruled out by FR-007. Holding the connection ourselves is the always-on server 070 removed. |
| The `live` service serves four audiences (Principle III prefers one audience per service) | One Event API has one authorizer function; it must recognise all four pools to keep them apart. | Four APIs with four authorizers — four of everything, and nothing isolated that the issuer pin does not already isolate. |
| An epoch in the channel name, with a client-side roll every ten minutes (research R5) | The service does not re-authorize an open subscription; without it a removed person hears updates for up to 24 hours (FR-023, SC-009). | Accepting it because updates are empty and reads are still checked — true but the spec requires the updates to stop. A server-side disconnect — the service has none. |
