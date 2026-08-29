---
description: "Task list for 053 — Order Lifecycle Completion"
---

# Tasks: Order Lifecycle Completion

**Input**: Design documents from `/specs/053-order-lifecycle-completion/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. This feature changes money-adjacent state, sends customer mail, and corrects two
rules that failed silently for weeks — every one of those needs a test that fails when the behaviour is
wrong. Several tasks below require the test to be proven **by breaking it**.

**Organization**: grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1–US5 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: settle the one structural unknown, then scaffold.

- [X] T001 ⚠ **BLOCKING — measure before building.** Package the current admin stack and count its
      CloudFormation resources per [quickstart.md](quickstart.md) §2:
      `cd apis/edge-api/admin && npx serverless package --stage dev`, then count `Resources` in
      `.serverless/cloudformation-template-update-stack.json`. Record the number in
      [research.md](research.md) R7, replacing the estimate. Research R7 chose a separate service on
      this constraint; if headroom is ample, re-state the choice on domain grounds instead of on the
      estimate. **Do not start T002 until the number is written down.**
- [X] T002 Scaffold the new cold-path service at `apis/edge-api/orders/` (`package.json`,
      `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `serverless.yml`) modelled on
      `apis/edge-api/driver/`. ⚠ **The `.gitignore` is not optional** — `apis/edge-api/notifications`
      shipped without one in 052 and committed 1.7 MB of build artifacts including a
      `serverless-state.json` carrying resolved DB hostname, username and secret ARNs.
- [X] T003 Wire `apis/edge-api/orders/serverless.yml` to the shared gateway: `provider.httpApi.id` from
      `/effy/<env>/edge/http_api_id` and the **admin** authorizer **by id** from
      `/effy/<env>/edge/authorizer/admin`. Path scheme `/orders/v1/...`. Set `versionFunctions: false`
      from the start rather than waiting to need it.
- [X] T004 [P] Add `apis/edge-api/orders` to the workspace: `pnpm-workspace.yaml` if needed, `turbo.json`
      pipeline, and the `make edge-deploy SERVICE=orders` path in the `Makefile`.
- [X] T005 [P] Add a **config-contract test** at `apis/edge-api/orders/src/config.contract.test.ts` that
      reads the **real `serverless.yml`** and asserts every env var the code reads is declared there.
      ⚠ This is 035's fourth-recurrence guard: four env vars were read and never declared, every pool
      resolved "unknown", no email was ever sent, and 100 passing tests missed it because they set the
      vars themselves.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠ CRITICAL**: no user story work begins until this phase is complete.

- [X] T006 Write the forward-only migration
      `db/migrations/<ts>_order_lifecycle_completion.sql` creating `public.carrier_handoff` and
      `public.package_arrival` and altering `public.notification_request`, exactly per
      [data-model.md](data-model.md) §1–§3. House style: text CHECK enums, no triggers, an index on
      every FK, `COMMENT ON` every table and every non-obvious column.
- [X] T007 In the same migration, add the two CHECK constraints that make bad rows **unrepresentable**
      rather than merely refused: `package_arrival` — `source='staff_recorded'` ⇒
      `recorded_by_sub IS NOT NULL`; `notification_request` — `channel='email'` ⇒
      `recipient_email IS NOT NULL`.
- [X] T008 ⚠ Verify the `notification_request` alter is **purely additive**: `channel` defaults to
      `'push'`, so every existing row and every existing producer keeps its current meaning, and
      existing `dedupe_key` values (which have no channel segment) are **not** rewritten.
- [X] T009 [P] Promote `isActiveStaff` and the `admin|manager` role gate out of
      `apis/edge-api/admin/src/feedback/authz.ts` into `packages/edge-shared/src/`, and re-point the
      feedback service at the shared version.
- [X] T010 ⚠ **Prove T009 changed nothing**: `apis/edge-api/admin`'s existing feedback tests must pass
      **unmodified**. That is the 028 extraction proof — if a test had to change, the behaviour did.
- [X] T011 [P] Add the back-office order DTOs to `packages/shared-types/src/order-admin.ts`:
      `OrderSummaryDTO`, `OrderDetailDTO`, `OrderPackageDTO`, `CarrierHandoffDTO`, `PackageArrivalDTO`,
      `OrderHistoryEntryDTO`. ⚠ A **separate type family** from the customer's order DTO — these carry
      shop identity and the customer's must never learn to (FR-021).
- [X] T012 [P] Money on the wire is a **2-dp decimal string** in every new DTO (027 R13). Add the
      assertion to the DTO tests; no floats, no cents integers.
- [X] T013 Build the service skeleton in `apis/edge-api/orders/src/` — handler → service → repository
      per Principle VI, raw SQL, explicit greppable wiring, no DI framework.

**Checkpoint**: schema, contracts and the shared authz gate are in place. User stories can begin.

---

## Phase 3: User Story 1 — Staff can find and understand an order (Priority: P1) 🎯 MVP

**Goal**: back-office staff can find any order and read everything about it. Independently valuable —
support can answer order questions for the first time.

**Independent test**: place an order, find it in the console by its `EFY-…` reference, and confirm every
fact about it is legible without anyone querying the database by hand.

### Backend

- [X] T014 [US1] Implement `GET /orders/v1/orders` (list/search) in
      `apis/edge-api/orders/src/orders/` — `q` (reference or customer email), `status`, `awaiting`
      (`handover` | `arrival`), keyset `cursor`, `limit`. Newest first.
- [X] T015 [US1] Implement the `awaiting` filter as a **join**, not a stored state (research R3) — it is
      the operator's work queue, derived from `carrier_handoff` / `package_arrival` absence.
- [X] T016 [US1] Implement `GET /orders/v1/orders/{orderId}` returning `OrderDetailDTO`: progress,
      packages and their states, items, amounts and payment method, delivery destination.
- [X] T017 [US1] Implement the order **history** as a single read-side union over `fulfillment_event`
      (020), `driver_task_event` (049), `carrier_handoff` and `package_arrival`, ordered by time
      ([data-model.md](data-model.md) §8). ⚠ A projection, never a stored timeline — a stored one is a
      fourth place a state change must be written and the first place it gets forgotten.
- [X] T018 [US1] Assemble the detail with **parallel reads**, not N serial queries. ⚠ 029 found
      `GET /v1/storefront/home` intermittently 503-ing at 3.007 s from 8 serial queries — a Sydney RDS
      round trip measures ~135 ms and this endpoint reads from six tables.
- [X] T019 [US1] Gate reads with the shared `isActiveStaff` — **any active staff including `csa`**
      (FR-015). Fail-closed: a gate that throws yields 503, never an implicit allow.
- [X] T020 [P] [US1] Unit tests for the search, the `awaiting` join, and the history ordering in
      `apis/edge-api/orders/src/orders/*.test.ts`.
- [X] T021 [P] [US1] Container-backed test that the history union returns events from **all four**
      sources in correct time order. ⚠ Needs Docker up.
- [ ] T022 [P] [US1] Negative tests: a **customer** token and a **shop** token against `/orders/v1/*`
      are both refused at the gateway (Principle IV).

### Console

- [X] T023 [US1] Add the route `apps/back-office/src/routes/orders.tsx` and the nav entry in
      `apps/back-office/src/components/layout/nav.ts`.
- [X] T024 [US1] Create the feature slice `apps/back-office/src/features/orders/` — `access.ts`,
      `model.ts`, `queries.ts`, `repo.ts` — modelled on `features/shops/`.
- [X] T025 [US1] Build `OrdersListScreen.tsx` on the shared `DataTable` from `@effy/web-kit/console`,
      with the search box and the `awaiting` filter.
- [X] T026 [US1] Build `OrderDetailScreen.tsx` as a **sectioned page**: order header, packages, items,
      payment, destination, history.
- [X] T027 ⚠ [US1] **NO CARDS** (Principle V). No metric row at the top, no bordered boxes tiling the
      detail. Sectioned pages, tables and detail rows. An order detail is exactly where the
      dashboard-card instinct fires — this task exists to resist it.
- [X] T028 [US1] Render the history as scannable **when / what / who** rows, not a timeline widget.
- [X] T029 [P] [US1] Console tests in `apps/back-office/src/features/orders/*.test.tsx` covering the
      list, the filter, and the detail's sections. ⚠ Assert on content, not on a class name — 052 found
      `MethodList.test.tsx` had been asserting nothing since a styling commit moved the class its
      selector matched.
- [X] T030 [US1] Keep server state in TanStack Query; no hand-caching in component state (Principle VI).

**Checkpoint**: US1 is independently shippable. Support can see orders.

---

## Phase 4: User Story 2 — A standard order can be completed (Priority: P1)

**Goal**: the gap this feature exists to close. A standard package can be handed over and marked
arrived, and the order finishes.

**Independent test**: the [quickstart.md](quickstart.md) §4 walk. The backend half is testable by
`curl` without the console; the console buttons depend on T026.

### Handover

- [X] T031 [US2] Implement `POST /orders/v1/fulfillments/{fulfillmentId}/handoff` in
      `apis/edge-api/orders/src/handoff/` per the contract: 201 new, 200 already-recorded,
      409 not-`collected`, 422 same-day.
- [X] T032 ⚠ [US2] `reference` **absent is valid and complete** (FR-003). Not a 422, not a warning, not
      an incomplete record anywhere downstream. Test both the present and the absent case.
- [X] T033 [US2] Write the `admin.audit_log` entry for every handover (FR-014), attributed to the acting
      subject, using the 009 pattern in `apis/edge-api/admin/src/shops/repository.ts`.

### Arrival

- [X] T034 [US2] Implement `POST /orders/v1/fulfillments/{fulfillmentId}/arrival` in
      `apis/edge-api/orders/src/arrival/`, writing in **ONE transaction**: the status-guarded
      `collected → delivered`, the `package_arrival` row (`source='staff_recorded'`), and — only when
      this is the order's **last** package — the customer notification intents.
- [X] T035 ⚠ [US2] Idempotency is the `FinalizeSucceeded` shape: `UPDATE ... WHERE id=$1 AND
      status='collected'`. A repeat affects 0 rows → no arrival, no notification, and the **original
      `arrivedAt` is preserved** (FR-005). The `UNIQUE (shop_fulfillment_id)` on `package_arrival` is the
      second, independent guarantee the database itself enforces.
- [X] T036 [US2] Refuse an arrival where no `carrier_handoff` exists, and **name the missing handover**
      in the refusal (FR-006). A refusal that does not say why is a support ticket.
- [X] T037 [US2] Gate both writes on **admin|manager only** via the shared role gate (FR-015). ⚠ A
      `csa` must be refused these two routes while keeping every read in US1.
- [X] T038 [US2] Write the `admin.audit_log` entry for every arrival (FR-014).

### ⚠ The driver path — easy to miss, and SC-010 fails without it

- [X] T039 ⚠ [US2] Extend `apis/edge-api/driver/src/delivery/repository.ts` so the existing
      `deliver` transaction **also writes a `package_arrival` row** with `source='driver_proof'` and its
      `delivery_task_id`. Research R6: without this, every same-day arrival — the only kind the platform
      has ever recorded — is unattributable and **SC-010 is false**.
- [X] T040 [P] [US2] Test that a driver-completed drop and a console-completed handover produce
      `package_arrival` rows with **different `source` values**, both attributable.

### Console actions

- [X] T041 [US2] Add the handover and arrival actions to `OrderDetailScreen.tsx` (depends on T026),
      visible only to `admin`/`manager` and refused server-side regardless of what the UI shows.
- [X] T042 ⚠ [US2] A package with a handover but **no reference** must look **normal** in the console —
      no warning styling, no empty-field affordance, nothing that reads as unfinished. This is the
      visual half of SC-009 and no assertion can see it.

### Tests

- [X] T043 [P] [US2] Container-backed idempotency test: record the same arrival **five times** → exactly
      one `package_arrival`, one push intent, one email intent, `arrivedAt` unchanged (SC-007).
- [X] T044 [P] [US2] Container-backed **concurrency** test: two simultaneous arrival writes → exactly one
      of each. ⚠ Run concurrently, not sequentially — sequential passes while the race is live.
- [X] T045 [P] [US2] Refusal tests: arrival with no handover; arrival on a package still at the shop;
      handover on a same-day package; `csa` on both write routes.
- [X] T046 [P] [US2] Mixed-order test (FR-007): an order with one same-day and one standard package is
      **not** finished until both have arrived.

**Checkpoint**: a standard order can reach `delivered`. This has never been possible before.

---

## Phase 5: User Story 3 — The customer is told their order arrived (Priority: P2)

**Goal**: an arrival message that reaches a shopper who has never installed the app.

**Independent test**: complete an order for a customer with no device token and confirm the email lands.

- [X] T047 [US3] Extend the notification producers to write **one row per channel**, with
      `dedupe_key = "<type>:<channel>:<recipientSub>:<entityId>"` per
      [contracts/notification-channel.contract.md](contracts/notification-channel.contract.md).
- [X] T048 ⚠ [US3] Snapshot `recipient_email` **at enqueue, not at send** (052's rule). A customer who
      later changes their account email must not retroactively redirect a message about an order that
      has already arrived.
- [X] T049 [US3] Add the `order-delivered` template to `packages/email-kit/src/catalog.ts` and author its
      MJML. Pre-formatted vars only: `orderNumber`, `deliveredOn`, `orderUrl`.
- [X] T050 ⚠ [US3] The template carries **no package count and no shop reference** (FR-021). "Your 2
      parcels have arrived" discloses the fulfilment structure the product model hides.
- [X] T051 [US3] It states the order arrived and links to it — it does **not** restate the receipt. That
      is a different document with a different job, already sent.
- [X] T052 [US3] Add the email branch to `apis/edge-api/notifications/src/worker/` — render via
      `@effy/email-kit`, send via SES, record `failed` + `last_error`, retry within the existing attempt
      budget. The `push` branch is unchanged and `skipped` still means "no device token".
- [X] T053 ⚠ [US3] **Scope boundary**: `order_delivered` is the only type producing an email row.
      `order_ready` and `order_out_for_delivery` stay push-only. ⚠ `order_paid` MUST NOT gain one — it
      already has the 052 receipt, and a second email for one event is a defect, not coverage. Add a
      test that pins this.
- [X] T054 [P] [US3] `make email-check` must pass on the new template: both size budgets, the text part,
      the three contrast passes, the category/unsubscribe rules.
- [X] T055 ⚠ [P] [US3] Test the **plain-text part** for entity escaping. 039 found every email's text part
      was HTML-escaped, so a tokenised URL became `…?token&#x3D;ABC` — invisible in HTML, broken in
      text/plain, with no error anywhere.
- [X] T056 [P] [US3] Test that an `email` intent for a customer with **no device token** still sends,
      and that a `push` intent for the same customer is `skipped` rather than `failed`.

**Checkpoint**: a web-only shopper hears about their delivery.

---

## Phase 6: User Story 4 — Progress wording tells the truth (Priority: P2)

**Goal**: no shopper is told their order departed while it sits on a shop shelf.

**Independent test**: hold an order at `ready_for_pickup` and confirm neither customer surface says it
has left.

- [X] T057 [US4] In `apis/core-api/internal/features/orders/stage.go`, move `ready_for_pickup` from rank
      **2 to 1**. Nothing else in the map changes.
- [X] T058 ⚠ [US4] **Prove it by reverting it.** Add a test to
      `apis/core-api/internal/features/orders/stage_test.go` naming the shop-shelf case, then put the
      old rank back and confirm that test fails. A correction that passes both ways is not covered.
- [X] T059 [US4] Confirm **no client change is needed** — both customer surfaces render the
      server-derived stage. ⚠ If either surface needs editing, a second implementation of the rule has
      crept back in and that is the defect 052 deleted `summarizeFulfillment` to prevent.
- [ ] T060 [P] [US4] Test that the website and the app show the **same** wording for the same order
      (FR-017).

---

## Phase 7: User Story 5 — An arrived order stops blocking account closure (Priority: P3)

**Goal**: a customer whose shopping has arrived can leave.

**Independent test**: complete an order, immediately request closure, confirm it is not a blocker.

- [X] T061 [US5] In `apis/edge-api/customer/src/closure/repo.ts`, change the fulfilment term from
      `f.status <> 'collected'` to `f.status <> 'delivered'`.
- [X] T062 ⚠ [US5] Test **both** directions (research R5 — the bug is two bugs): a `delivered` package
      must **not** block, and a `collected` package **must**. Today the first blocks and the second does
      not, so a test covering only one leaves a live defect.
- [X] T063 [P] [US5] Update the stale comment above the predicate. It says the term would "become correct
      automatically when the delivery lifecycle lands" — it landed in 049 with a **different terminal
      state**, which is why this silently stayed wrong.
- [X] T064 [P] [US5] ⚠ Correct the stale rationale in the same file's `findBlockingOrders` docblock:
      "core-api … HAS NO CLOUD DEPLOY (local-Docker-only by platform decision)" has been **false since
      040**. The exception may still be right; the reason recorded for it is not.

---

## Phase 8: Polish & Cross-Cutting

### Telemetry (Principle VII)

- [X] T065 [P] Emit `order_arrival_recorded_total{source}` and
      `carrier_handoff_recorded_total{has_reference}` from the orders service.
- [X] T066 [P] Emit `order_completed_total`. ⚠ **This is the number this feature exists to move off
      zero** — it is also the only signal that will tell you whether anyone is actually recording these
      arrivals by hand (plan.md § Risks).
- [X] T067 [P] Emit `notification_email_send_failed_total{type}` from the notifications worker.
- [X] T068 Add the metric filter + alarm for `notification_email_send_failed_total` in
      `infra/envs/dev/`. ⚠ **Not deferred.** 038 and 046 both deferred their equivalents; this one guards
      the only message a web-only customer receives.

### Documentation

- [X] T069 [P] Update `docs/audiences/customer-capabilities.md` §053 (order completion, arrival message)
      and `docs/audiences/shop-capabilities.md` if the shop view is affected.
- [X] T070 [P] Write `docs/order-console-guide.md` — the operator's runbook for the handover/arrival
      workflow, in the shape of `docs/delivery-console-guide.md`.
- [X] T071 [P] Update `ORDER-FLOW-GAPS.md` at the repo root: mark G1, G6 and G7 closed, and record that
      the **failed same-day delivery** is now the last remaining way an order gets stuck.
- [X] T072 [P] Update the `## Active feature` section of `CLAUDE.md`.

### Full gate sweep

- [X] T073 `pnpm -r typecheck` and `pnpm -r test`. ⚠ **Count the reporting packages** — 029 found the
      suite green while `typecheck` failed, caught only because the "Done" count fell by one. Vitest does
      not run `tsc`.
- [X] T074 [P] `cd apis/core-api && go build ./... && go vet ./... && gofmt -l . && go test ./...`
- [X] T075 [P] `make email-check`, `make lint` (terraform validate + fmt), `make brand-check`,
      `tokens:check` — the last must be **unchanged**, proving this feature added no design token.
- [X] T076 [P] Secret and PII sweep across the new service, the new template and the console feature.
      ⚠ Include the built artifacts, not only source — that is how 052's `serverless-state.json` leak
      got in.

### Operator steps (not runnable by the assistant)

- [ ] T077 Commit the migration, then `make db-up ENV=dev` (003's commit-guard).
- [ ] T078 `make edge-deploy SERVICE=orders ENV=dev` — the new service.
- [ ] T079 `make edge-deploy SERVICE=driver ENV=dev` (T039), `SERVICE=customer ENV=dev` (T061),
      `SERVICE=notifications ENV=dev` (T052). Each carries a change.
- [ ] T080 Deploy `core-api` (T057) via `make core-image-push` + `make core-deploy`. ⚠ **Before** pushing
      to `dev` — Amplify auto-deploys the consoles on push, and 047 recorded that the reverse order
      briefly broke dev checkout.
- [ ] T081 `make apply ENV=dev` for the new alarm (T068).

### The walks

- [ ] T082 ⚠ **The walk that matters** — [quickstart.md](quickstart.md) §4, a standard order end to end
      to `delivered`. This path has never completed on this platform.
- [ ] T083 [quickstart.md](quickstart.md) §5 — every refusal and the idempotency walk, including the
      **concurrent** two-staff case.
- [ ] T084 [quickstart.md](quickstart.md) §6 — the mixed order, checking FR-021 on the order page, the
      email **and** the push copy.
- [ ] T085 [quickstart.md](quickstart.md) §7 — attribution across both arrival sources.
- [ ] T086 ⚠ [quickstart.md](quickstart.md) §8 — **look at the console**, light and dark and narrow.
      039 shipped four live defects with a fully green suite because layout, contrast and hierarchy are
      not properties a DOM assertion can see. This console is a brand-new surface.
- [ ] T087 [quickstart.md](quickstart.md) §9 — confirm the four metrics, and prove the alert by causing a
      send failure.
- [ ] T088 Sign-off: write `specs/053-order-lifecycle-completion/SIGNOFF.md` recording what was walked,
      what was not, and every carry-forward.

---

## Dependencies

```
Phase 1 (T001 ⚠ blocking) → Phase 2 → ┬→ Phase 3 (US1) ─┬→ T041/T042 (US2 console)
                                      ├→ Phase 4 (US2) ─┘
                                      ├→ Phase 5 (US3) ← needs T034 (the arrival that produces the intent)
                                      ├→ Phase 6 (US4)   independent
                                      └→ Phase 7 (US5)   independent
                                                         → Phase 8
```

- **T001 blocks everything** — it decides where the routes live.
- **US4 and US5 are fully independent** of US1–US3 and of each other. Each is a one-line change with its
  own test and could ship today, before any of the rest.
- **US2's backend** is independent of US1; only its **console buttons** (T041/T042) need T026.
- **US3** needs T034 to exist before its producer has anything to fire on.

## Parallel opportunities

- **Phase 2**: T009/T011/T012 in parallel (different packages).
- **Phase 3**: all backend tests (T020–T022) parallel; console (T023–T030) parallel with backend once
  the DTOs from T011 exist.
- **Phase 4**: T043–T046 all parallel.
- **Phase 6 and Phase 7 in parallel with everything** — different files, different services.
- **Phase 8**: T065–T067, T069–T072, T074–T076 all parallel.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** Staff can find and read orders — genuinely useful alone,
and it ends the situation where "contact support" reaches people who cannot see the order.

**The feature's actual point is US2**, and US1+US2 together are the smallest thing worth deploying: an
order that can finish, and somewhere to finish it from.

**Consider shipping US4 and US5 first, separately.** They are two one-line corrections to live defects,
each independently testable, neither dependent on anything else here. There is no reason a customer
should keep being told their order departed while it sits on a shelf for however long this feature takes.
