# Tasks: Live Updates Without Polling

**Input**: Design documents from `specs/071-live-updates/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/live-channel.md](contracts/live-channel.md),
[contracts/change-map.md](contracts/change-map.md), [quickstart.md](quickstart.md)

**Tests**: each implementation task carries its own tests, per the plan's Testing section and the
repository's convention (unit beside the source; `*.guard.test.ts`; `*.container.test.ts` against the
real migrations). A task is not done until its tests pass.

**Conventions**: `[P]` = different files, no dependency on an unfinished task. **OPERATOR** = run by
the operator, never by Claude; all AWS commands use `AWS_PROFILE=ef`. "Announce" always means
`announce()` from `@effy/edge-shared/live`, called in the service layer **after** the transaction
has committed, with the scopes given in [contracts/change-map.md](contracts/change-map.md).

## Phase 1: Setup

- [X] T001 Amend the constitution to **v3.1.0** (MINOR) per research R15 in `.specify/memory/constitution.md`: Principle III gains one sentence permitting a managed, pay-per-use connection service that incurs nothing while idle; Technology Standards names AWS AppSync Events as the platform's live channel; write the Sync Impact Report; set Last Amended. Then align the single-backend paragraphs in `CLAUDE.md` and `AGENTS.md`
- [X] T002 [P] Declare `LiveKind` (the closed list of seven) and `LiveDescriptor` in `packages/shared-types/src/live.ts`, export from the package index, and extend the contract generators so the Kotlin enum and descriptor fixture are produced for all three mobile apps (`shop-contract`, `driver-contract`, `commerce-contract`)
- [X] T003 [P] Scaffold the service `apis/edge-api/live/` (`package.json`, `tsconfig.json`, `vitest.config.ts`, `serverless.yml` with one function `authorizer`, no HTTP event, arm64, Node 22, the four pool ids and client ids read from the existing SSM parameters) modelled on `apis/edge-api/catalog/`; add it to the workspace and to the `edge-deploy` / `edge-test` targets in `Makefile`

---

## Phase 2: Foundational (blocks every story)

- [X] T004 Channel and epoch rules in `apis/edge-api/shared/src/live/channel.ts`: `epochOf(now)`, `channelFor(change, epoch)`, `publishEpochs(now)` (current, plus previous during the first 60 s), `parseChannel(path)` refusing wildcards and anything but three segments; unit tests for every boundary in `channel.test.ts`
- [X] T005 Scope resolution — one rule, used by the authorizer and by every live descriptor (data-model "Audience scope") — in `apis/edge-api/shared/src/live/scope.ts`: `shopScope(sub)`, `driverScope(sub)`, `opsScope(sub)` each returning the scope id or `null` for a missing or inactive record, raw SQL through `Queryable`; `scope.container.test.ts` against the real migrations (active, suspended, deactivated, reassigned)
- [X] T006 SigV4-signed publish in `apis/edge-api/shared/src/live/sign.ts` (service `appsync`, region from `AWS_REGION`, `POST https://{host}/event`, body `{channel, events:['{"k":"…"}']}`) using the SDK signer already bundled; unit test against a fixed credential and clock
- [X] T007 `announce(changes)` in `apis/edge-api/shared/src/live/announce.ts` per contract §4: de-duplicate by channel and kind, one request per channel per publish epoch, 1.5 s limit, one retry, **never rejects**, emits `UpdatesSent` / `UpdateSendFailures` (namespace `Effy/Live`, dimension `kind` only) through `shared/src/lib/metrics.ts`, logs no scope id, does nothing when the host parameter is absent; `announce.test.ts` covers each of those and that a thrown `fetch` resolves
- [X] T008 Export the module: `apis/edge-api/shared/src/live/index.ts` and `"./live"` in `apis/edge-api/shared/package.json` exports; add `LiveChange` type exactly as contract §4
- [X] T009 The authorizer in `apis/edge-api/live/src/authorize/service.ts` and `src/functions/authorizer.ts` per contract §3: verify with `aws-jwt-verify` against the pool the issuer names; `EVENT_CONNECT` any valid token; `EVENT_SUBSCRIBE` namespace = audience, scope = T005's answer (customer = token `sub`, no database read), epoch current or next, no wildcard; `EVENT_PUBLISH` refused; any exception refuses; `ttlOverride` 300; logs operation, audience and outcome only. `service.test.ts` has one case per row and per refusal in the contract
- [X] T010 Terraform `infra/envs/dev/live.tf`: the Event API (connect + subscribe `AWS_LAMBDA`, publish `AWS_IAM`), namespaces `shop` `customer` `driver` `ops`, the invoke permission for `appsync.amazonaws.com` on the authorizer, an IAM policy document granting `appsync:EventPublish` on the API, SSM parameters `/effy/<env>/live/{http-host,realtime-host,api-arn}`, alarms on `Effy/Live` `UpdateSendFailures` (≥ 5 in 15 min) and authorizer errors (≥ 1) to `aws_sns_topic.alerts`, a 4 USD monthly budget scoped to AppSync notifying the same topic (extend the topic policy for `budgets.amazonaws.com`). Run `terraform validate` only; if `aws_appsync_api` / `aws_appsync_channel_namespace` are absent from provider 6.53, use the fallback in research R11 and correct R11
- [X] T011 Config-contract test `apis/edge-api/shared/src/live/live.contract.test.ts`: every service that imports `@effy/edge-shared/live` has the publish statement and the two parameters in its `serverless.yml`; every alarm in `live.tf` has an action
- [X] T012 Web client core in `packages/web-kit/src/live/client.ts` per contract §2: handshake with the two subprotocols, `connection_init`, subscribe, `ka` watchdog from `connectionTimeoutMs`, jittered backoff 1 s → 60 s, states `live | reconnecting | off`, `subscribe_error` → `off`, ignores unknown kinds and invalid frames, never sends `publish`; `client.test.ts` drives it with a fake `WebSocket` and fake timers
- [ ] T013 Mobile client core in `packages/mobile-kit/common/live/LiveClient.kt` (+ `LiveState.kt`): the same state machine on Ktor WebSockets behind a small `LiveSocket` interface, exposing `Flow<LiveKind>` and `StateFlow<LiveState>`; add `ktor-client-websockets` and `ktor-client-okhttp` identically to the three `apps/*-mobile/gradle/libs.versions.toml` and `shared/build.gradle.kts`; `commonTest` against a fake socket in each app's test source set that already includes mobile-kit

**Checkpoint**: nothing is deployed and no app has changed behaviour.

**Built differently from the task text (2026-10-05), and why:**
- **T002** — the Kotlin kind list is NOT generated into the three per-app contract packages. It is
  one hand-written enum in `packages/mobile-kit/common/live/LiveKind.kt` (shared by all three apps,
  which per-app contract packages are not), held to the TypeScript list by
  `packages/shared-types/src/live.test.ts`. That file arrives with T013.
- **T006** — signed with a small signer on `node:crypto`, not the SDK's (research R6, corrected).
- **T010** — the SSM names follow the repository's underscore convention
  (`/effy/<env>/live/http_host` …). The publish permission is a statement in each announcing
  service's `serverless.yml`, scoped to the API's ARN, rather than a Terraform policy document.
- **T012, T021–T023** — built as one state machine in `client.ts` + `coalesce.ts`; splitting catch-up
  and the epoch roll from the connection logic would have meant writing it twice.
- **T013** — deferred until the early proof (T020) has shown the protocol against the real channel:
  the mobile client is the same protocol on engines whose subprotocol support is itself unproven.
- **T015** — one shared handler, `liveRoute` in `@effy/edge-shared/live`, behind all four routes.
  No function was added to `packages/api-client` (it holds no per-route functions); each app's own
  data layer calls the route (`apps/shop-web/src/features/live/repo.ts`).

---

## Phase 3: User Story 1 — A shop sees a new order the moment it is paid (P1) 🎯 MVP and early proof

**Goal**: an open shop Today screen shows a newly paid order within 5 s, with notifications denied.

**Independent test**: quickstart Stage 1, step 5 (SC-002, and SC-001 on the measured run).

- [X] T014 [US1] Announce on payment finalised: after `finalize` commits in `apis/edge-api/commerce/src/checkout/service.ts` and `apis/edge-api/commerce/src/webhook/` (both callers of `@effy/edge-shared/payments` finalise), announce `shop/orders` for each fulfilling shop, `customer/orders` for the order's token subject, `ops/orders` and `ops/slots`; the finalise result is extended to return the shop ids and customer subject it already reads. Add the publish statement and parameters to `apis/edge-api/commerce/serverless.yml`. Tests: announced once on first finalise, not on a replayed webhook, and the order is paid when `announce` is made to fail
- [X] T015 [P] [US1] Live descriptor `GET /shop/v1/live` in `apis/edge-api/shop/src/functions/live-v1-get.ts` with `src/live/service.ts` (scope from T005, hosts from SSM, `epochSeconds`, `serverTime`); route and parameters in `apis/edge-api/shop/serverless.yml`; add to `docs/api/path-assignment.md`; client function in `packages/api-client`
- [X] T016 [US1] `LiveProvider` and `useLiveStatus` in `packages/web-kit/src/live/LiveProvider.tsx`: takes a descriptor loader, a token getter and a `kind → query-key prefixes` map; on an update calls `queryClient.invalidateQueries` for the mapped prefixes (active queries only); connects on sign-in, closes on sign-out; export from `packages/web-kit/src/index.ts`
- [X] T017 [US1] Mount it in shop-web: provider at the authenticated layout in `apps/shop-web/src/`, map `orders → today + fulfillment keys`; **keep** the timers for now (removed in US2 once catch-up exists)
- [X] T018 [US1] Scripted latency measurement `apis/edge-api/ops/src/verify/live-latency.ts`: subscribes with a real shop token, pays N test orders through the existing checkout verifier, records commit-to-update times; document the command in `scripts/verify-070/README.md`'s successor `scripts/verify-071/README.md`
- [ ] T019 [US1] **OPERATOR** — quickstart Stage 1 steps 1–4: `make edge-deploy SERVICE=live ENV=dev`; `make plan ENV=dev` (confirm additive) and `make apply ENV=dev`; `make edge-deploy SERVICE=commerce ENV=dev` then `SERVICE=shop`; release shop-web
- [ ] T020 [US1] Record the early proof in `specs/071-live-updates/SIGNOFF.md`: SC-002 trials, the T018 figures, and each of the four ⚠ PROVE items (raw token accepted; an open subscription is not re-authorized; Ktor OkHttp and Darwin send both subprotocols — a throwaway connect from shop-mobile on each platform; Terraform resources). **A failed item corrects `research.md` and `plan.md` before any later task starts**

**Checkpoint**: stop if SC-001 or SC-002 is missed.

---

## Phase 4: User Story 2 — Catching up after being away (P1)

**Goal**: a screen that was disconnected, hidden or asleep shows the current state on return, with
no timer anywhere on shop-web.

**Independent test**: quickstart walk rows 5, 12, 13; SC-003, SC-004, SC-012.

- [X] T021 [US2] Coalescer in `packages/web-kit/src/live/coalesce.ts`: leading read, then at most one per 2 s, always one trailing; `coalesce.test.ts` proves ≤ 3 reads for ten updates in ten seconds and a final read after the last
- [X] T022 [US2] Catch-up in `packages/web-kit/src/live/client.ts` and `LiveProvider.tsx`: invalidate every mapped prefix once on `subscribe_success` after any reconnect and on `visibilitychange` to visible; close the socket after 5 minutes hidden; refresh an expired token through the existing session before reconnecting; tests under fake timers
- [X] T023 [US2] Epoch roll in `packages/web-kit/src/live/client.ts`: epoch from descriptor `serverTime` + elapsed, subscribe to next 60 s early, unsubscribe old 60 s after, re-fetch the descriptor on reconnect; a refused roll → `off`; tests across a boundary with a skewed device clock
- [X] T024 [P] [US2] `LiveStatus` line in `packages/web-kit/src/live/LiveStatus.tsx` and its slot in `packages/web-kit/src/console/ConsoleHeader.tsx`: nothing when live; "Reconnecting — last updated HH:MM" (`--warning` on its tint) or "Live updates off — last updated HH:MM" (`muted`) with a refresh button; last-read time from the query cache's `dataUpdatedAt`; no card; component test
- [ ] T025 [US2] Remove shop-web's data timers: `refetchInterval` / `refetchIntervalInBackground` / `REFRESH_INTERVAL_MS` in `apps/shop-web/src/features/today/queries.ts` and both in `apps/shop-web/src/features/fulfillment/queries.ts`, the now-redundant `refetchInterval: false` overrides in `apps/shop-web/src/features/fulfillment/components/OrderPager.tsx`, and their comments and tests; keep `useNow.ts` and the PWA update check
- [X] T026 [US2] Test in `apps/shop-web/src/` that an update arriving while a form is dirty and a list is scrolled re-reads without resetting either (FR-016)
- [ ] T027 [P] [US2] Mobile parity in `packages/mobile-kit/common/live/`: coalescer, catch-up on reconnect, epoch roll, connect on foreground / close on background via the existing lifecycle hook, and `LiveStatusLine.kt` (Compose, existing theme colours); `commonTest` mirrors T021–T023

---

## Phase 5: User Story 3 — Other shop changes go live (P2)

**Goal**: cancellations, refunds, colleague pick progress, handover, stock and the attention list
update on shop web and shop mobile.

**Independent test**: quickstart walk rows 2, 3, 4.

- [ ] T028 [US3] `customerViewChanged(before, after)` in `apis/edge-api/shared/src/lib/order-completion.ts` built on `stageFor` and `customerRefundState` (research R7); tests include the two-shop order where only the slower portion's move reports a change
- [ ] T029 [US3] Announce shop fulfilment changes in `apis/edge-api/shop/src/` services behind `fulfillment-status-v1-post.ts`, `fulfillment-pickup-v1-post.ts`, `fulfillment-deliver-v1-post.ts`: `shop/orders`, `ops/orders`, `customer/orders` only when T028 says so, plus `driver/work` and `ops/dispatch` on handover; publish statement in `apis/edge-api/shop/serverless.yml`
- [ ] T030 [US3] Announce pick progress in the services behind `apis/edge-api/shop/src/functions/order-picks-v1-post.ts` and `fulfillment-item-v1-patch.ts`: `shop/orders` only, at most once per order per 5 s per instance with the last always sent (a small throttle in `apis/edge-api/shared/src/live/throttle.ts`, tested)
- [ ] T031 [P] [US3] Announce refunds and cancellations: return the affected shop ids, customer subject and assigned driver from the shared refund/cancel service in `apis/edge-api/shared/src/payments/refunds/service.ts` and announce in its three callers — `apis/edge-api/commerce/src/functions/{order-cancel,order-refund-request}-v1-post.ts` services and `refund-reconcile-scheduled.ts`, `apis/edge-api/orders/src/lib/money.ts`, `apis/edge-api/shop/src/functions/order-refund-v1-post.ts` service; publish statement in `apis/edge-api/orders/serverless.yml`
- [ ] T032 [P] [US3] Announce `shop/stock` when a product runs out, crosses its low level or recovers (compare before and after with `shared/src/lib/low-stock.ts`, not on every change): `apis/edge-api/inventory/src/` services behind `stock-v1-put.ts`, `stock-adjustment-v1-post.ts`, `stock-threshold-v1-put.ts`, `stock-tracking-v1-put.ts` and their `admin-*` twins, and the stock decrement inside payment finalise (extend T014's result); publish statement in `apis/edge-api/inventory/serverless.yml`
- [ ] T033 [P] [US3] Announce `shop/attention` from `apis/edge-api/shop/src/attention/evaluator.ts` only for shops whose list gained or lost an entry in that run
- [ ] T034 [US3] Extend shop-web's kind map in `apps/shop-web/src/` with `stock → inventory keys` and `attention → attention keys`
- [ ] T035 [US3] shop-mobile: wire `LiveClient` once in the app container (`apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/`), add the descriptor call to its shop API client, collect `orders` in `features/orders/presentation/OrdersViewModel.kt`, **delete** the `LaunchedEffect` loop in `OrdersScreen.kt` and `QueueRefreshIntervalMillis`, show `LiveStatusLine`; update the ViewModel tests

---

## Phase 6: User Story 4 — A customer watches their order (P2)

**Goal**: the customer's order page and list follow their order, revealing nothing about shops.

**Independent test**: quickstart walk rows 7, 8; SC-011.

- [ ] T036 [P] [US4] Live descriptor `GET /customer/v1/live` in `apis/edge-api/customer/src/functions/live-v1-get.ts` (prefix from the token subject; no database read; connects as `effy_shopper` like its neighbours if the service does); `serverless.yml`, `docs/api/path-assignment.md`, `packages/api-client`
- [ ] T037 [US4] Guard test `apis/edge-api/shared/src/live/customer-announce.guard.test.ts`: every `scope: "customer"` announcement in the backend is either the paid/cancel/refund-request path or is gated by `customerViewChanged`; and no `LiveChange` for a customer can carry a shop id (type-level and by scan)
- [ ] T038 [US4] customer-web: `apps/customer-web/components/live/LiveRefresh.tsx` (client component using the web-kit client and coalescer, calling `router.refresh()`), mounted in `apps/customer-web/app/(account)/orders/` list and `[id]` pages only; a quiet inline status line per FR-015; nothing loaded for signed-out visitors (assert by test)
- [ ] T039 [US4] customer-mobile: wire `LiveClient` in the container under `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/`, connect only when signed in, collect `orders` in the order list and order detail ViewModels under `features/orders/`, show `LiveStatusLine`; tests

---

## Phase 7: User Story 5 — A driver's work changes (P2)

**Goal**: assigned, reassigned and withdrawn work appears on the driver's device.

**Independent test**: quickstart walk row 9.

- [ ] T040 [P] [US5] Live descriptor `GET /driver/v1/live` in `apis/edge-api/driver/src/functions/live-v1-get.ts` (scope via `requireDriver` / T005); `serverless.yml`, path assignment, Kotlin driver contract
- [ ] T041 [US5] Announce assignment changes in `apis/edge-api/fleet/src/` services behind `dispatch-reassign-v1-post.ts`, `dispatch-unassign-v1-post.ts`, `dispatch-reorder-v1-post.ts`, `dispatch-lock-v1-post.ts`, `dispatch-unlock-v1-delete.ts`, `exceptions-resolve-v1-post.ts` and `plan-waves-scheduled.ts`: `driver/work` to **both** the old and the new driver, and `ops/dispatch`; publish statement in `apis/edge-api/fleet/serverless.yml`
- [ ] T042 [P] [US5] Announce the driver's own actions in `apis/edge-api/driver/src/` services behind `driver-collect-v1-post.ts`, `driver-collect-issue-v1-post.ts`, `driver-hub-checkin-v1-post.ts`, `driver-drop-status-v1-post.ts`, `driver-drop-proof-v1-post.ts`, `driver-drop-fail-v1-post.ts`, `driver-duty-v1-post.ts` per the change map (`shop/orders` on collection, `customer/orders` via T028, `ops/orders`, `ops/dispatch`); publish statement in `apis/edge-api/driver/serverless.yml`
- [ ] T043 [US5] driver-mobile: wire `LiveClient` in the container under `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/core/`, collect `work` in the work-list, collection and delivery ViewModels, show `LiveStatusLine`; `WindowLine.kt`'s clock is left as is; tests

---

## Phase 8: User Story 6 — Back-office consoles (P3)

**Goal**: orders, dispatch and drivers, slot load and the review queue follow changes made elsewhere.

**Independent test**: quickstart walk row 10.

- [ ] T044 [P] [US6] Live descriptor `GET /admin/v1/live` in `apis/edge-api/admin/src/functions/live-v1-get.ts` (active back-office account → `/ops/all`); `serverless.yml`, path assignment, `packages/api-client`
- [ ] T045 [P] [US6] Announce the remaining ops changes: `apis/edge-api/orders/src/` services behind `fulfillment-arrival-v1-post.ts` and `fulfillment-handoff-v1-post.ts` (`ops/orders`, `customer/orders` via T028); `apis/edge-api/fleet/src/` behind `delivery-slot-create-v1-post.ts`, `delivery-slot-update-v1-patch.ts`, `delivery-days-*` (`ops/slots`) and `driver-status-v1-post.ts`, `driver-update-v1-patch.ts`, `duty-end-v1-post.ts` (`ops/dispatch`, `driver/work`); `apis/edge-api/catalog/src/` behind `review-approve-v1-post.ts`, `review-send-back-v1-post.ts` and `apis/edge-api/shop/src/` behind `product-submit-v1-post.ts`, `product-withdraw-v1-post.ts` (`ops/review`); publish statement in `apis/edge-api/catalog/serverless.yml`
- [ ] T046 [US6] back-office: mount `LiveProvider` at the authenticated layout in `apps/back-office/src/`, map `orders`, `dispatch`, `slots`, `review` to their query keys, show `LiveStatus`; remove `refetchInterval` from `apps/back-office/src/features/drivers/queries.ts` and `apps/back-office/src/features/delivery/queries.ts`; tests

---

## Phase 9: Polish & cross-cutting

- [ ] T047 Change-map guard `apis/edge-api/shared/src/live/change-map.guard.test.ts`: enumerate every `-post|-put|-patch|-delete` and `-scheduled` function in `commerce`, `shop`, `inventory`, `driver`, `fleet`, `orders`, `catalog`, `admin`; each must reach an `announce` call or appear in an allow-list with a written reason (cart, lists, saved items, catalogue and promotion edits, devices, accounts, delivery-zone configuration, notes and tags, feedback); prove it by removing one announcement
- [ ] T048 [P] No-timer sweep `scripts/check-no-refresh-timers.sh` (wired into the root test target): fails on `refetchInterval` with a non-false value in the three web apps and on a `delay(`-in-a-loop that calls a refresh in the three mobile apps, with `useNow.ts`, `pwa.ts` and `WindowLine.kt` allow-listed by reason (SC-010)
- [X] T049 [P] Authorization verifier `apis/edge-api/ops/src/verify/live-authz.ts` (60-odd cross-scope, cross-audience, wildcard, stale-epoch and publish attempts → 0 succeed); commands in `scripts/verify-071/README.md`. ⚠ No `live-burst.ts`: SC-012 is a property of the client (reads per burst), proved under a fake clock in `packages/web-kit/src/live/LiveProvider.test.tsx` — a script counting updates on a socket would measure the channel, not the screen
- [ ] T050 **OPERATOR** — quickstart Stage 2 and 3: deploy `inventory` → `driver` → `fleet` → `orders` → `catalog` → `customer` → `admin`; release the three web apps; rebuild the three mobile apps
- [ ] T051 Walk quickstart Stage 4 (13 rows) with the operator and run the measured checks; record every result, including SC-008 (publishing forced to fail) and SC-009 (suspend with a console open), in `specs/071-live-updates/SIGNOFF.md`; fix forward and re-walk any failure
- [ ] T052 Correct the documents that still describe polling or the withdrawn promise: `CLAUDE.md` (Current status: remove "a cheaper-than-a-server way to refresh the shop console"; add `live` to the service list; AppSync Events under Infra), `AGENTS.md`, `ARCHITECTURE.md` (client state: how a screen learns of a change; the `announce` rule), `docs/api/path-assignment.md`, `README.md`
- [ ] T053 Write the `FEATURE-HISTORY.md` entry and add 071 to the index in `CLAUDE.md`, with the measured latency, the first real AppSync bill line, and the operator steps still open

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1.** T001 precedes all implementation (constitution gate).
- **US1 is the gate**: T020 must record the early proof before US2–US6 begin.
- **US2** depends on US1 (it removes the timers US1 leaves in place).
- **US3, US4, US5, US6** each depend on US2's shared client behaviour (T021–T023, T027) and are
  otherwise independent of one another — except T028 (US3), which US4's T037, US5's T042 and US6's
  T045 use.
- **Polish**: T047 needs every announcing task; T050 needs all code; T051 needs T050.

Within the foundation: T004 → T006 → T007 → T008; T005 → T009; T010 needs T003; T011 needs T008
and T010; T012 and T013 are independent of the backend.

## Parallel opportunities

- Phase 1: T002, T003.
- Phase 2: T004/T005 together; T012 and T013 alongside all backend tasks.
- US1: T015 beside T014; T016 beside both.
- US2: T024 and T027 beside T021–T023.
- US3: T031, T032, T033 together after T028.
- After US3's T028: the four descriptor routes (T036, T040, T044) and T042, T045 in parallel.
- Polish: T048, T049.

## Implementation strategy

**MVP = Phases 1–3 (T001–T020)**: one shop screen, one change, measured. It proves the channel, the
authorizer, the cost model's first data point and the four unproven facts, and it is the point at
which the design can still change cheaply.

Then US2 makes it honest (no timers, catch-up, stale-state line) on the same surface. Each later
story adds one audience and is releasable alone; an app not yet listening behaves as it does today.

## Totals

| Phase | Tasks |
|---|---|
| Setup | 3 |
| Foundational | 10 |
| US1 (P1) | 7 |
| US2 (P1) | 7 |
| US3 (P2) | 8 |
| US4 (P2) | 4 |
| US5 (P2) | 4 |
| US6 (P3) | 3 |
| Polish | 7 |
| **Total** | **53** |
