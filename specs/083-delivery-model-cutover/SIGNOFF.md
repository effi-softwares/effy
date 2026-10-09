# Sign-off notes: 083 — Delivery Model Cutover

🟡 **STAGE 1 (the switch) — built and checked by machine (2026-10-09). NOT migrated, NOT deployed, NOT walked, NOT signed off.**
⛔ **STAGE 2 (the removal, T022–T038) — NOT STARTED**, and must not be until stage 1 is live, walked, and the
operator confirms no old-kind order is open.

Every check below ran on local containers and test runners. 21/21 stage 1 tasks ticked. **Nothing set the
switch**: it is NULL in every environment, and only a person can change that.

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

## Stage 2

Not started. Its entry conditions are in the runbook ("Stage 2 — when it may be released").
