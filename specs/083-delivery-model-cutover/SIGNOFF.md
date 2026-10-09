# Sign-off notes: 083 — Delivery Model Cutover

🟡 **STAGE 1 (the switch) — built, and migrated + deployed to dev (operator-reported, 2026-10-09). Not walked, not signed off.**
🟡 **STAGE 2 (the removal) — BUILT and checked by machine (2026-10-10). NOT migrated, NOT deployed, NOT walked, NOT signed off.**

Every check below ran on local containers and test runners. 38/38 tasks ticked, with what was done
differently and what was not done listed under each stage. **Nothing set the switch, and nothing ran the
removal migration** — both are a person's.

⚠ **Stage 2 was started on the operator's instruction** ("just do it … no one uses it"), not because its
entry conditions were confirmed: nobody confirmed that dev's switch is on or that no old order is open.
The removal migration checks both for itself and refuses, changing nothing, if either is not so.

## Stage 1 — what changed

- **The switch has its one writer.** `apis/edge-api/admin/src/delivery/go-live.repository.ts` is the only
  code that names `delivery_settings.delivery_model_v2_from`. It writes under the settings row's lock, in
  one transaction with an `admin.audit_log` row (`delivery.model_switch_set | _changed | _cancelled |
  _turned_off | _blocked`, `target_type = 'delivery_model'`). Who set the switch, and when, is read back
  from that trail — stored nowhere else. The one reader (`public.delivery_model_v2_at`) is unchanged.
- **Routes** (staff gateway, +2): `GET /admin/v1/delivery/go-live` (any active staff) and
  `PUT /admin/v1/delivery/go-live/switch` (**admin only**, decided from the staff record).
  - `at` = an instant or `"now"` → set or change; a moment already past is stored as now.
  - `at` = null before the moment → cancel; after it → **turn back off**, which needs a `reason`.
  - `expected` = the moment the page showed; a mismatch is 409 `changed` and nothing is written.
  - Not ready → 409 `not_ready`. After stage 2's removal → 409 `removed` (read defensively today: the
    column does not exist yet).
- **"Ready" is one function** — `goLiveReadiness` (`shared/src/delivery/readiness.ts`): delivery area, hub,
  an active Effy plan that **prices the nearest and farthest listed postcode**, a window on, a collection
  run active, courier off-or-armed; advisory: drivers cleared, what an out-of-area customer is told. The
  page, the setter and the sweep all ask it.
- **The sweep** (`deliveryModelSwitchSweep`, every 5 minutes, no route). While a switch is scheduled:
  emits `DeliveryModelSwitchReady`; not ready **and** within 10 minutes of the moment → clears it, audits
  `_blocked` with the failing items, emits `DeliveryModelSwitchBlocked = 1`. **Never undoes a moment that
  has passed.** While on: `LegacyOrdersOpen`, and past `legacy_orders_alert_days` (7)
  `LegacyOrdersOpenPastDue`. Namespace `Effy/Platform`.
- **"An old order still open" is one definition** — `LEGACY_OPEN_ORDER_SQL` (`shared/src/delivery/legacy.ts`):
  no delivery type, paid, a live portion not arrived, not fully refunded. The Go-live count, the order
  list's filter (`GET /orders/v1/orders?deliveryType=legacy&open=true`) and the alert read it.
- **Back-office → Delivery → Go-live**: the checklist as a table (required first, advisory marked, each
  linking to the tab that fixes it — the delivery screen's tab is now in the URL), the switch in detail
  rows with admin-only controls, the old-order count linking to Orders with a removable **Still open**
  chip, and the history. No cards.
- **Infra**: `infra/envs/dev/delivery-model-alarms.tf` (2 alarms, missing data not breaching) and the
  sweep's failed-invocation alarm in `background-functions.tf`.
- **Migration** `20261009122203_delivery_model_cutover.sql`: `delivery_settings.legacy_orders_alert_days`
  (default 7, 1–60) and a comment on the switch column naming its writer. Nothing else.
- **Runbook**: `docs/runbooks/delivery-model-v2-cutover.md`.

## Proofs

| # | Proves | Where | Broken once? |
|---|---|---|---|
| P1 | readiness: empty is not ready; ready one item at a time; a plan that cannot price the farthest postcode is not ready; courier off-or-armed; drivers advisory | `shared/…/go-live.container.test.ts` | ✅ |
| P2 | the switch is refused while not ready (nothing stored, nothing audited, items named); a manager is refused | `admin/…/go-live.container.test.ts` | ✅ readiness check removed → failed |
| P3 | set / change / cancel / turn back off, each on the trail; past = now; two admins at once → `changed` | same | — |
| P4 | the sweep clears a not-ready switch only when near; never undoes a passed moment | same | ✅ nearness rule removed → failed |
| P5 | one file names the switch column; `goLiveReadiness` defined once, called by the service three times | `shared/…/windows.guard.test.ts` | ✅ a second writer → failed |
| P6 | across the moment: old quote before, new after; an old client after the moment is refused before any charge; the unpaid order is re-captured whole | `commerce/…/checkout.container.test.ts` | proof of existing behaviour |
| P7 | with the model ON, an old same-day parcel still gets its round and an old standard one is still the carrier's and is handed over; neither can be moved | `fleet/…/planner.container.test.ts`, `orders/…/handovers.container.test.ts` | ✅ gather required a recorded type → failed |
| P8 | the count and the list are the same orders, and fall together as they close | `shared/…/go-live…`, `orders/…/handovers…` | ✅ both halves |
| P9 | the Go-live tab: rows, schedule sends instant + `expected`, cancel, turn-back needs a reason, non-admin sees no control, refusal words | `back-office/…/GoLivePanel.test.tsx` | — |
| — | alarms watch what the sweep emits; the sweep is scheduled inside its 10-minute window | `admin/…/go-live-alarms.contract.test.ts` | — |

## Verified

`CONTAINER_TESTS=1`: shared 900, admin 260, orders 125, commerce 329, fleet 307, driver 178 — all pass.
Back-office 380, shared-types 104. `pnpm -r typecheck`, design-system guards, `check-no-refresh-timers`,
the shop and driver word scripts, `check-no-phantm`, gateway-capacity and background-alarm contracts,
`terraform fmt` + `validate` — all pass.

## Done differently from tasks.md

- **T014 (P7)** — not a new cross-service file. The planner half is in fleet's planner suite and the
  handover half in orders' handover suite, where the fixtures already are; both run with the switch on.
  **Not covered by P7**: taking one old order through the driver app's proof-of-delivery to "Delivered"
  in a single test — the driver suites cover that path, but not with the switch on. Nothing on it reads
  the switch (P5 holds that), so this is a gap in the proof, not a known defect. Walk V4 covers it.
- **T015** — no change: the customer DTO, `ArrivalPanel`, the shop's `deliveredBy`, the driver check-in
  and back-office's Delivery type section each already assert an old order renders.
- **T017** — a `not_ready` refusal does not list the failing items in the error line (the API client's
  error carries a code, not the list); the page re-reads and the checklist above marks them.
- **The live kind** announced on a switch change is `coverage` (the switch changes the coverage answer);
  no new kind was added.

## Found while building

- **An order's delivery type is recorded when it is captured, not when it is paid.** So an order captured
  the old way and paid minutes after the moment is still an old-kind order. Expected, and it finishes as
  sold — but the old-order count can rise for a few minutes after the switch. In the runbook.

## Not done / to know

- **The schedule field is the browser's local clock.** The page shows the chosen moment back in Melbourne
  time before and after saving; an administrator outside Melbourne must read that line.
- **Nothing detects whether installed apps can draw the new checkout.** A person confirms it (runbook).
  An older app after the moment is refused before any charge; it cannot buy.
- The 082 known gap stands: the orders list's "needs a driver" lists a supplier-ready parcel before its
  run is due.

## Operator steps (dev) — stage 1

```sh
make db-up ENV=dev                          # 20261009122203_delivery_model_cutover
make edge-deploy SERVICE=admin ENV=dev      # +2 staff routes, +1 scheduled function
make edge-deploy SERVICE=orders ENV=dev     # the "still open" filter
make apply ENV=dev                          # 2 alarms + the sweep's failed-invocation alarm
```

(`AWS_PROFILE=ef`.) Then the back-office build on push. No app release. Setting the switch is a separate,
deliberate act on the Go-live tab — see the runbook.

## Walks (not recorded)

V1 checklist with one item broken → the switch is refused · V2 schedule 5 minutes ahead; an order before
and one after · V3 cancel a scheduled moment · V4 an old same-day and an old standard order taken to
delivery after the switch · V5 the old-order count reaches zero · V6 turn back off with a reason, then on.

---

# STAGE 2 — the old arrangement removed

## What changed

- **One checkout.** A serviced address answers `effyWindows` or `courier` and nothing else. Gone: the
  method choice, the same-day slot picker, the standard-day picker, the per-shop same-day bridge, the
  per-package compatibility fee, "N of your M deliveries can arrive today". The intent reads
  `deliveryWindow` and `deliveryType`; the old slot/day fields are not read (sent anyway → ignored, and
  with no window the existing `slot_required` refusal answers).
- **The quote carries no package list** — `packages`, `sameDaySlots`, `standardDays`, `standardFee`,
  `sameDayAvailableUntil`, `sameDayUnavailableReason` are removed from the wire. Nothing tells a customer
  how many suppliers fill an order.
- **Every new order has a delivery type.** Only orders from before delivery types have none.
- **The removal migration** `20261009150000_retire_delivery_model_v1.sql`:
  - **refuses** (nothing changed) while an old-kind order is open, or on a database that has taken
    orders and was never switched over; **proceeds** on a database with no order at all (a new
    environment, every test database);
  - marker `delivery_settings.legacy_model_removed_at` (NOT NULL, default now);
    `public.delivery_model_v2_at` answers **true for good**;
  - drops `delivery_zone.sameday_eligible`, table `shop_sameday_exception`,
    `delivery_fee_plan.same_day_factor` / `standard_factor`, `delivery_settings.standard_lookahead_days` /
    `carrier_lead_days` / `courier_estimate_text`, `order_package_delivery.delivery_fee_amount`,
    `shop_fulfillment.delivery_fee_amount`, `driver_round.locked_by_sub` / `locked_at`,
    `driver_zone_capability.method` (duplicates removed first, the oldest kept; new unique index on
    driver, function, area);
  - each drop carries a `READER AUDIT` note; the audit was a catalog query against the full schema
    (no function, view or trigger named any of them).
- **No service asks which delivery model is on** (`model.ts` deleted; `windows.guard.test.ts`).
- **Orders**: "hand over on the day minus the carrier's lead time" is gone; a courier parcel is due out by
  its service's next pickup (080). The handover list holds orders sold as courier delivery only.
- **Fleet**: delivery-days settings are the Effy look-ahead, the non-delivery days, the hold and the hub
  turnaround; a clearance is one row (plain insert, `ON CONFLICT DO NOTHING`; revoke by id).
- **Admin**: no platform-wide courier estimate; a new group has no same-day flag. After the removal the
  go-live route refuses every change (409 `removed`) and the page says the model is on for good.
- **Back-office**: tabs **Collection runs** and **Delivery windows**; "window" where it said "slot";
  no carrier lead time or standard look-ahead; no "starts with the new delivery model" notice.
- **Customer web and customer mobile**: the delivery step draws `EffyWindowOptions` / the window section,
  or the courier block. `DeliveryOptions.tsx` deleted; the Kotlin quote is windows-or-courier.
- **Guard**: `scripts/check-no-legacy-delivery.sh` (Makefile `legacy-delivery-guard`, web CI) fails the
  old path's identifiers in live source. It does not sweep the words "same_day"/"standard".
- **Seeds**: `047_delivery_dev.sql` sets up what the go-live checklist asks for (list, plan, hub, runs,
  windows) and seeds no courier service; `062_capability_dev.sql` writes one row per clearance.
- **Docs**: CLAUDE.md "Delivery model" rewritten for the one model; `docs/archive/delivery-model-v1.md`;
  047 and 069 specs marked superseded; the cutover runbook has the stage 2 steps.

## Proofs

| # | Proves | Where | Broken once? |
|---|---|---|---|
| P10 | the migration refuses with an old order open; refuses when never switched over or the moment is ahead; applies otherwise; one model, one row per clearance (the oldest kept), every order still there; a database with no order migrates from nothing | `shared/…/retire.container.test.ts` | ✅ both guards removed → 3 failed |
| P11 | nothing can be sold the old way: a client sending the old fields and no window is refused, nothing written or charged; the quote's keys are exactly the new ones | `commerce/…/checkout.container.test.ts`, `checkout.guard.test.ts`, `wire.contract.test.ts` | — |
| P12 | an order from before delivery types still reads as sold to the customer: no `delivery` block, its day | `commerce/…/checkout.container.test.ts` (079 P9) | — |
| P13 | the same in back-office: its day, who delivered it, no due-out day, can still be handed over; cannot be moved | `orders/…/handovers.container.test.ts`, `promise.test.ts` | — |
| P14 | one row per clearance: grant twice adds none, revoke removes it, never another driver's; the guard script fails a planted identifier | `fleet/…/schema.container.test.ts`, `driver-method.guard.test.ts`; the script | ✅ planted → exit 1 |
| P15 | web and app draw windows or courier only, send one window, and agree byte for byte on the quote | `customer-web` checkout tests; `customer-mobile` host tests; `wire.contract.test.ts` ↔ `DeliveryWireContractTest.kt` | — |
| — | after the removal the switch says on-for-good and refuses set / schedule / cancel / turn back | `admin/…/go-live.container.test.ts` | — |
| — | a name dropped from one table and live on another is exempted from the drift guard by name, with where it is held | `shared/…/schema-drift.guard.test.ts` | — |

## Verified (2026-10-10)

`CONTAINER_TESTS=1`: shared 888, commerce 325, orders 118, admin 263, fleet 307, driver 178, storefront
180, notifications 71, customer 221, catalog 43, inventory 64, auth 151, live 41 — all pass. Shop 484 of
485: the one failure is the known `attention/repository.container.test.ts` `recipientsForShop`, not this
feature's. Back-office 380, customer-web 635, shop-web 453, shared-types 104, web-kit 100. Customer-mobile:
Android main + host tests, and the iOS simulator target compile. `pnpm -r typecheck`, design-system
guards, every `scripts/check-*.sh`, `check-no-phantm`, `sm-contract-check`, `mobile-guard`,
`terraform validate` — all pass.

- ⚠ `make cm-contract-check` **fails until the regenerated contract is committed**: it compares
  `contract/CommerceDto.kt` with the last commit, and this change regenerated it.
- ⚠ The orders suite failed twice on 10-second container start-up timeouts while other suites were
  running, and passed in full when run with the machine quiet. No assertion failed.
- **Not run**: the shop-mobile and driver-mobile host tests (neither app was touched; their contract is
  unchanged), and the driver contract check.

## Done differently from tasks.md

- **T022** — the guard also lets the migration run on a database with **no orders** (otherwise no new
  environment and no test database could migrate). The marker is `NOT NULL DEFAULT now()`, so a settings
  row created later is "removed" from the start. `delivery_model_v2_at` is `SELECT true`. The proof is
  `retire.container.test.ts` (the text loader, with `before`/`from`), not a goose run.
- **T023** — `sameday.ts` became `schedule.ts` (`collectionSchedule`, `melbourneDate`); `sameDayCutoff` was
  kept as `lastOrderCutoff` because the cross-language collection contract pins it; `model.ts` was deleted
  rather than left unchanged.
- **T025** — the handover list's `due=` filter was **kept** (back-office still calls it; it answers
  correctly for courier parcels). Only the lead-time arithmetic went.
- **T027** — no driver or shop contract regeneration was needed (nothing of theirs changed).
- **T030** — the staff word script was **not** extended to the delivery configuration screens.
- **T031** — P12/P13 are in the suites above. No new assertion was added for the driver/shop compatibility
  fields: their existing tests still assert them and pass.
- **T035** — `delivery-console-guide.md`, `order-console-guide.md`, `logistics-engine-architecture.md` and
  `driver-app-design-brief.md` carry a dated **"partly out of date"** notice pointing at the current model.
  **They were not rewritten.**
- **T036** — the constitution names same-day/standard in no principle; not amended.
- **Stage 1's P6** (across the moment) was removed with the code path it proved: there is no "before".

## Found while building

- **Stage 1 defect, fixed here:** `readiness.ts` filtered drivers by `status = 'active'` without the
  exemption the storefront's availability guard requires, so `storefront`'s suite was red. I had not run
  that suite in stage 1. A comment-only fix; the deployed `admin` service is unaffected.
- **Dead values left in place:** the coverage reason `courier_pending` and `CourierReachDTO.pending` can no
  longer occur (nothing is "pending" on a switch). The notice was removed; the type members were not.

## ⚠ To know before releasing stage 2

- **Not reversible.** Take a database backup first.
- **The customer storefront and customer app must go out WITH the `commerce` deploy.** A customer web or
  app build from before this change cannot read the new quote — checkout stops at the delivery step,
  uncharged — until that customer has the new build. Shop and driver apps are unaffected.
- **Deploy the four services before the migration** (the old code reads columns the migration drops).
  Between the `fleet` deploy and the migration, granting a driver clearance fails.
- **On dev the migration will refuse** if the switch was never set or an old order is open. Either set
  the switch on the Go-live tab and finish the old orders, or — dev only, nobody's data —
  `make purge-orders ENV=dev`, after which a database with no orders migrates.

## Operator steps (dev) — stage 2

```sh
make edge-deploy SERVICE=commerce ENV=dev   # one checkout: windows or courier
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=admin ENV=dev
make db-up ENV=dev                          # 20261009150000_retire_delivery_model_v1
```

(`AWS_PROFILE=ef`.) With the web builds on the same push and a customer app release. No `make apply`.
Detail and the refusal messages: `docs/runbooks/delivery-model-v2-cutover.md`.

## Walks (not recorded)

V7 the migration applies · V8 a window order on web and in the app; a courier order · V9 an order from
before the switch opened as a customer and as staff · V10 a driver and a shop on their previous app build
complete their work.
