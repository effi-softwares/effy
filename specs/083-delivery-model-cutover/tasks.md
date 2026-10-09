# Tasks: Cutover to the New Delivery Model

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included — proofs P1–P15 are the definition of done; each named one is broken once and restored.

Abbreviations: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`CW` = `apps/customer-web`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`,
`M1` = `db/migrations/<ts>_delivery_model_cutover.sql`, `M2` = `db/migrations/<ts>_retire_delivery_model_v1.sql`.

⚠ **TWO STAGES.** Stage 1 (Phases 1–7) is built, deployed and walked first. **Stage 2 (Phases 8–9) is NOT
started until the operator confirms no old-kind order is open in the target environment** — its migration
refuses otherwise. ⚠ Claude writes code, SQL and Terraform; the operator runs migrations, deploys,
`make apply` — and SETS THE SWITCH. Nothing in these tasks turns the model on.
⚠ Kept on purpose (research R7): the method columns, the two coverage table names, the driver wire's
`same_day_delivery` / `sameDayCount` / `standardCount` / `CollectionPackage.method`, the shop wire's
`deliveryMethod`, and the customer words "Same-day delivery" / "Standard delivery".
⚠ Known red before this feature: `EA/shop/src/attention/repository.container.test.ts` (079 SIGNOFF).

## Format: `[ID] [P?] [Story] Description`

---

# STAGE 1 — THE SWITCH

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=delivery_model_cutover`.
- [X] T002 [P] In `ST/delivery-admin.ts` add `GoLiveReadinessItem`, `GoLiveReadiness`, `GoLiveSwitch` (state `off|scheduled|on`, at, setBy, setAt, canTurnBack, removedAt), `GoLiveLegacy`, `GoLiveHistoryEntry`, `GoLiveDTO`, `GoLiveSwitchRequest`, and the refusal codes `not_ready | changed | removed` (contracts § Stage 1). In `ST/order-admin.ts` add `open?: boolean` to the order-list query type.

## Phase 2: Foundational (blocks every Stage 1 story)

- [X] T003 Write M1 per [data-model.md](data-model.md): `delivery_settings.legacy_orders_alert_days` (int, default 7, CHECK 1–60, COMMENT); re-COMMENT `delivery_model_v2_from` naming its one writer. Down drops the column.
- [X] T004 `EA/shared/src/delivery/legacy.ts`: `LEGACY_OPEN_ORDER_SQL(orderAlias)` (research R5: `delivery_type IS NULL`, `status = 'paid'`, a live portion with no `package_arrival`, not fully refunded — reuse `COUNTED_REFUND_STATUSES`), `legacyOpenOrders(q)` → `{ open, lastClosedAt }`. Export from `delivery/index.ts`. **P8** (shared half) in `legacy.container.test.ts`: paid+undelivered counts; delivered, cancelled, fully refunded, typed, unpaid do not. Break once (drop the arrival term).

---

## Phase 3: User Story 1 — The go-live checklist (P1) 🎯 MVP

**Independent test**: with one required item missing the checklist names it and the setter is refused; fix it and it passes.

- [X] T005 [US1] `EA/shared/src/delivery/readiness.ts`: `goLiveReadiness(q, now)` per research R2 — items `coverage`, `hub`, `effy_plan` (active plan AND `effyFee` prices the nearest and farthest listed postcode at 1 g and at the heaviest finite band + 1 g without `UnpricedDistanceError` / `UnpricedWeightError`), `windows`, `collection_runs`, `courier` (off, or active courier plan + active default service), advisory `drivers`, `out_of_area`; each with `detail` (one plain line) and `fixAt` (a back-office path). `ready` = every required item ready. Export from `delivery/index.ts`.
- [X] T006 [US1] **P1** in `EA/shared/src/delivery/readiness.container.test.ts`: a fully set-up platform is ready; removing each required thing in turn fails exactly that item; courier on with no service fails `courier`, courier off passes it and flags `out_of_area`; no driver → advisory only, still ready; a plan whose distance bands stop short of the farthest postcode is not ready. Break once (drop the farthest-postcode pricing).
- [X] T007 [US1] `EA/admin/src/delivery/go-live.{repository,service}.ts`: `readGoLive(now)` → `GoLiveDTO` (readiness; switch state from `delivery_model_v2_from` and the latest `admin.audit_log` row with `target_type = 'delivery_model'`, actor name from `admin.staff`; `legacy` via `legacyOpenOrders` only while the switch is on; last 20 history rows). Function `EA/admin/src/functions/delivery-go-live-v1-get.ts` (read = any active staff) registered in `EA/admin/serverless.yml`.

---

## Phase 4: User Story 2 — The switch (P1)

**Independent test**: set the switch a few minutes ahead; an order before the moment is sold the old way, one after is sold a window or courier.

- [X] T008 [US2] `go-live.service.ts` `setSwitch(body, actorSub, now)` per research R3: admin role from the staff record (403 otherwise); `expected` must equal the stored value (409 `changed`); a value: `goLiveReadiness().ready` required (409 `not_ready` with the failing items), a past instant stored as `now`; `null` before the moment = cancel; `null` after = turn back off, `reason` required (400), refused 409 `removed` when `delivery_settings.legacy_model_removed_at` exists and is set (read defensively — the column arrives with M2). One transaction: `UPDATE delivery_settings` + `admin.audit_log` (`delivery.model_switch_set|_changed|_cancelled|_turned_off`, detail `{from, to, reason}`); then `announce([{scope:"ops", kind:"delivery"}])`. Function `delivery-go-live-switch-v1-put.ts` + `serverless.yml`. `gateway-capacity.contract.test.ts` and `change-map.guard.test.ts` stay green.
- [X] T009 [US2] **P2, P3** in `EA/admin/src/delivery/go-live.container.test.ts`: refused when not ready (items in the body); manager/CSA 403; stale `expected` 409; past instant = now; schedule → change → cancel each writes one audit row; after the moment, turn back needs a reason and sets NULL. Break once (skip the readiness check in the setter).
- [X] T010 [US2] **P5** — extend `EA/shared/src/delivery/windows.guard.test.ts`: `delivery_model_v2_from` is WRITTEN only in `admin/src/delivery/go-live.repository.ts`; `goLiveReadiness` is defined once and the setter, the read and the sweep import it. Break once (a second writer).
- [X] T011 [US2] Sweep: `EA/admin/src/functions/delivery-model-switch-sweep.ts` (`schedule: rate(5 minutes)`, no route) per research R4 — while the moment is in the future emit `DeliveryModelSwitchReady` (1/0, namespace `Effy/Platform`); not ready and the moment within 10 minutes → clear it, audit `delivery.model_switch_blocked` with the failing items, emit `DeliveryModelSwitchBlocked` = 1, announce; while the switch is on emit `LegacyOrdersOpen` and, once `now − switch > legacy_orders_alert_days`, `LegacyOrdersOpenPastDue` = the count. **P4** in `go-live.container.test.ts` (blocked inside the window; left alone when ready or far off; never reverts a passed moment). Break once (revert a passed moment).
- [X] T012 [P] [US2] `infra/envs/dev/delivery-model-alarms.tf`: alarms `DeliveryModelSwitchBlocked ≥ 1` and `LegacyOrdersOpenPastDue ≥ 1` (missing data not breaching) to the alerts topic; add the sweep to the failed-invocation alarms in `infra/envs/dev/background-functions.tf`; a contract test `EA/admin/src/delivery/go-live-alarms.contract.test.ts` pinning metric names/namespace to the sweep. `terraform fmt` + `validate`.
- [X] T013 [US2] **P6** in `EA/commerce/src/checkout/checkout.container.test.ts`: with the switch set to an instant, a quote before it carries the old choices and one after carries `effyWindows`; an unpaid order captured before and re-submitted after is re-captured as a typed order; a client still sending the old choice after the moment gets 409 and nothing is written or charged. (Proof of existing behaviour — no production change expected; if one is needed, it goes in `EA/commerce/src/checkout/service.ts`.)

---

## Phase 5: User Story 3 — Old orders finish as sold (P1)

**Independent test**: one old same-day and one old standard order placed before the switch are taken to delivery after it, unchanged.

- [X] T014 [US3] **P7** — a container test `EA/orders/src/orders/legacy-after-switch.container.test.ts` (using fleet's and driver's repositories as 080's tests do): with the switch ON, an order with `delivery_type NULL` + same-day window is gathered for delivery, delivered with proof and completes; one with `delivery_type NULL` + standard day reads `delivered_by = courier`, is handed over (053 path) and completes on arrival; neither is offered a delivery move (081 `no_delivery_type`); cancel and refund still work. Break once: make the delivery gather require a recorded type.
- [X] T015 [US3] Sweep the six surfaces' readers of `delivery` for an order with no type (customer DTO, shop `deliveredBy`, driver check-in groups, back-office Delivery type section) and add one assertion each where none exists that an old order still renders (`CW/components/receipt/ArrivalPanel.test.tsx`, `BO/orders/components/DeliveryTypeSection.test.tsx`, `EA/shop/src/orders/*.test.ts`, `EA/driver/src/work/checkin.container.test.ts` already covers the windowless case).

---

## Phase 6: User Story 4 — The old-order count (P2)

**Independent test**: three old orders open after the switch → count 3 and the list shows them; close them → zero and it says so.

- [X] T016 [US4] `EA/orders/src/orders/repository.ts`: the list accepts `open=true` with `delivery=legacy` and narrows by `LEGACY_OPEN_ORDER_SQL("o")`; `functions/orders-v1-get.ts` parses it. **P8** (orders half) in `EA/orders/src/orders/repository.container.test.ts`: the filter lists exactly the orders the count counts.
- [X] T017 [US4] Back-office Go-live tab: `BO/delivery/golive/{GoLivePanel.tsx,ReadinessTable.tsx,SwitchControl.tsx,LegacyOrders.tsx}` + `BO/delivery/{repo,queries,errorText}.ts` + a "Go-live" tab in `BO/delivery/DeliveryScreen.tsx`. Readiness as a table (item, Ready / Not ready, detail, a link to `fixAt`), required first, advisory marked "Advisory"; switch state in detail rows with who/when; admin-only controls — "Switch now", a date-time field + "Schedule", "Change", "Cancel", "Turn back off…" (reason required, confirm dialog naming what happens to orders placed meanwhile); `not_ready` lists the items; old-order count with a link to `/orders?delivery=legacy&open=true`, "No old order remains open" at zero; history list. Live: key under the delivery kinds in `BO/live/routes.ts`. No cards, no metric tiles. **P9** in `GoLivePanel.test.tsx` (rows; schedule sends the instant and `expected`; cancel; turn back needs a reason; manager sees no controls; refusal words).
- [X] T018 [P] [US4] `BO/orders/OrdersListScreen.tsx` + `model.ts`/`repo.ts`: read `open=true` from the URL with the legacy filter and show it as a removable "Still open" chip.

---

## Phase 7: Stage 1 polish, runbook, hand-over

- [X] T019 `docs/runbooks/delivery-model-v2-cutover.md`: prerequisites (customer app build ≥ 078 released — nothing detects this; courier decided on/off); order of work (M1 → deploy `admin`, `orders` → `make apply` → back-office build → read Go-live → set the moment); watching the moment; old-order count; backing out (turn back off, what happens to orders placed meanwhile); when and how Stage 2 is released.
- [X] T020 Run every affected suite with containers (shared, admin, orders, commerce, fleet, driver), back-office, shared-types, `pnpm -r typecheck`, design-system guards, word scripts, `terraform validate`.
- [X] T021 `specs/083-delivery-model-cutover/SIGNOFF.md` (Stage 1 section: what changed, proofs, deviations, operator steps, walks V1–V6), `FEATURE-HISTORY.md` 083 entry (Stage 1), `CLAUDE.md` feature line + the switch bullet ("Nothing sets it; E9 adds the setter" → the setter and its rule), backlog E9 status and Stage 1 task ticks.

**⛔ STOP — Stage 1 is deployed and walked, and the operator confirms the old-order count is zero, before anything below starts.**

---

# STAGE 2 — REMOVAL

## Phase 8: User Story 5 — The old arrangement is removed (P2)

**Independent test**: after it, no staff, supplier or driver screen offers or names the old arrangement, a new order can be placed, and an old order still opens with its original delivery line.

- [ ] T022 [US5] Scaffold and write M2 per [data-model.md](data-model.md): the refusing guard first (old-kind order open — the R5 definition restated in SQL with a comment naming `LEGACY_OPEN_ORDER_SQL`; switch NULL or in the future); `legacy_model_removed_at = now()`; `delivery_model_v2_at` returns true when the marker is set; the column drops, each preceded by a `-- READER AUDIT:` comment listing what was checked; `driver_zone_capability` dedupe to one row per (driver, function, zone) keeping the oldest, drop `method`, new unique index; recreate `coverage_for_postcode` / any function naming a dropped column. **P10** in `EA/shared/src/delivery/retire.goose.container.test.ts` (refuses with an old order open; refuses with the switch off; applies otherwise; `delivery_model_v2_at` true afterwards). Break once (remove the guard).
- [ ] T023 [US5] Shared library: delete `EA/shared/src/delivery/sameday.ts`'s `sameDayForShops` and the same-day bridge in `zone.ts` (keep `melbourneDate`, `sameDaySchedule` → move to `slots.ts`/`windows.ts` as `collectionSchedule`); delete `standard-days.ts` except `nonDeliveryDates` (moved to `windows.ts`); in `quote.ts` delete the 069 path, `compatibilityFees` and per-package `feeAmount` — a serviced address always answers `effyWindows` or `courier`; `slots.ts` drops `judgeSlot` / `openSlots`; `model.ts` unchanged (the database function now answers true). Update `delivery/index.ts` and every importer. **P11** (shared half) in the existing quote/windows tests.
- [ ] T024 [US5] Commerce: `EA/commerce/src/checkout/{delivery-choice,service,quote,store}.ts` and `functions/checkout-intent-v1-post.ts` — delete `resolveDeliveryChoice`; the intent no longer reads `deliveryMethod` / `sameDaySlotId` / `standardDate` (sent by an old client → ignored; with no `deliveryWindow` on an Effy quote the existing `window_required` refusal answers); delete the "N of your M deliveries" sentence and its test. **P11** (commerce half) in `checkout.container.test.ts`: nothing can be sold the old way. Break once.
- [ ] T025 [P] [US5] Orders: `EA/orders/src/orders/promise.ts` (+ test) — remove the 069 "day − carrier lead" due date; a carrier/courier parcel is due by its service's next pickup (080). `EA/orders/src/handoff/*` drops `due=` values that only served it, keeping `view=`.
- [ ] T026 [P] [US5] Admin + fleet: `EA/admin/src/delivery/{service,repository,types}.ts`, `coverage.{service,repository}.ts` — remove `standardLookaheadDays`, `carrierLeadDays`, the group's `samedayEligible`, `courier_estimate_text`; `EA/fleet/src/deliverydays/*`, `slots/*` likewise; `EA/fleet/src/capabilities/{sql,repository}.ts` — one row per clearance now: plain insert with `ON CONFLICT DO NOTHING`, delete by id, remove `UNREAD_METHOD`; update `driver-method.guard.test.ts` (the column no longer exists). Container tests updated; **P14** (clearance half): one row per clearance after M2.
- [ ] T027 [US5] Types and contracts: `ST/{delivery,delivery-admin,checkout,order}.ts` — remove the fields listed in contracts § Stage 2; mark the kept driver/shop fields `@deprecated — compatibility (083): kept so installed apps keep working`; `make cm-contract-gen`, driver and shop contract gens; compile all three mobile apps; `pnpm -r typecheck`.
- [ ] T028 [US5] Customer web: `CW/app/checkout/CheckoutFlow.tsx`, delete `DeliveryOptions.tsx` (+ test) and the 069 slot/day pickers under `CW/app/checkout/_components`; the delivery step renders `EffyWindowOptions` or `CourierDelivery` only; rewrite `CheckoutFlow.slots.test.tsx` for windows. **P15** (web half).
- [ ] T029 [US5] Customer mobile: `CM/features/checkout/{domain/Checkout.kt,data/CheckoutMappers.kt,data/*Repository.kt,presentation/CheckoutViewModel.kt,presentation/CheckoutScreen.kt}` — remove the 069 method/slot/day state, intents and composables; the screen draws `EffyWindowsView` or the courier block only; host tests updated. **P15** (mobile half).
- [ ] T030 [P] [US5] Back-office delivery screens: `BO/delivery/DeliveryScreen.tsx` — tab "Same-day" → "Collection runs", "Time slots" → "Delivery windows"; `components/DeliveryDaysPanel.tsx` loses the standard look-ahead and carrier lead fields (keeps non-delivery days and the Effy look-ahead); `components/SlotsPanel.tsx` wording "slot" → "window"; `golive/SwitchControl.tsx` shows "The old arrangement was removed on <date>" and no turn-back when `removedAt` is set. Add `apps/back-office/src/features/delivery` to `scripts/check-driver-delivery-words.sh`'s staff paths (allowing the customer-words note). Tests updated.
- [ ] T031 [US5] **P12, P13** — `EA/commerce/src/orders/service.test.ts` + `EA/orders/src/orders/repository.container.test.ts`: an order with no delivery type still returns its delivery line (method, window or day), who delivered each package, and its full history after M2; `EA/driver/src/work/checkin.container.test.ts` and `EA/shop/src/orders/*.container.test.ts`: `sameDayCount`, `standardCount`, `kind: same_day_delivery`, `deliveryMethod` still present and correct.
- [ ] T032 [US5] `scripts/check-no-legacy-delivery.sh` (shape of `check-no-emerald.sh`): fail on `sameDayForShops|compatibilityFees|resolveDeliveryChoice|standardDate|standard_date|sameDaySlotId|carrier_lead|carrierLead|standard_lookahead|standardLookahead|sameday_eligible|samedayEligible|same_day_factor|standard_factor` in tracked source outside `db/migrations`, `docs/archive`, `specs/`, `FEATURE-HISTORY.md` and the script itself; wire into `Makefile` and `.github/workflows/web.yml`. **P14** (script half): prove by planting.
- [ ] T033 [P] [US5] `db/seeds/047_delivery_dev.sql` rewritten for the new model (postcode list, an Effy plan, windows, collection runs; no rings, no same-day flags, no courier service — names are the operator's).

---

## Phase 9: User Story 6 — One model in the documentation (P3) + Stage 2 hand-over

- [ ] T034 [US6] `CLAUDE.md`: rewrite "Driver logistics model" for the new model — remove the ⚠ BEING REPLACED banner, the 047/069 same-day/standard bullets and every "until E9" note; state the model in one screen (who delivers; coverage; one fee per order; windows today + next delivery days; courier; collection and delivery; permissions; status words); keep the one-writer / one-definition ⚠ bullets from 072–083 that still hold; update "Current status" and "Still ahead".
- [ ] T035 [P] [US6] `docs/archive/delivery-model-v1.md` (what same-day/standard was, the tables and columns it used, and how to read an old order: no delivery type, `package_delivered_by`, the method and window/day columns); mark `specs/047-delivery-shipping-engine/spec.md` and `specs/069-delivery-slots-dates/spec.md` superseded in their headers; update `docs/delivery-console-guide.md`, `docs/order-console-guide.md`, `docs/logistics-engine-architecture.md`, `docs/driver-app-design-brief.md` and the runbooks so none describes the old model as current; extend the cutover runbook with the Stage 2 steps.
- [ ] T036 [US6] Check `.specify/memory/constitution.md` for any principle naming same-day/standard; amend only if one does (record the result either way in SIGNOFF).
- [ ] T037 Run every suite with containers (all twelve services), all three web apps, shared-types, email-kit, design-system guards, the three mobile apps' host tests, `pnpm -r typecheck`, every `scripts/check-*.sh`, `terraform validate`.
- [ ] T038 `SIGNOFF.md` (Stage 2 section), `FEATURE-HISTORY.md` 083 (Stage 2), backlog E9 Stage 2 task ticks and programme status ("E0–E9 complete; E10 deferred"), memory.

---

## Dependencies

- Stage 1: Setup (T001–T002) → Foundational (T003–T004) → US1 (T005–T007) → US2 (T008–T013) ; US3 (T014–T015) needs nothing new (proofs) ; US4 (T016–T018) needs T004, T007–T008 ; polish (T019–T021).
- **Stage 2 starts only after Stage 1 is deployed, walked, and the old-order count is zero.**
- Stage 2: T022 (M2) → T023 (shared) → T024–T026 → T027 (types) → T028–T030 → T031–T033 → docs (T034–T036) → T037–T038.

## Parallel examples

- Stage 1: T012 (alarms) and T018 (order-list chip) beside the backend; T014–T015 any time after T004.
- Stage 2: T025, T026, T030, T033, T035 touch different files once T023 is done.

## Implementation strategy

MVP = Phases 1–4: the checklist and the switch — the cutover itself. Phases 5–6 prove old orders are safe
and give the operator the count; Phase 7 hands Stage 1 over. Stage 2 is a second delivery, weeks later in
production. Each phase ends with its proofs green and the named one broken once.
