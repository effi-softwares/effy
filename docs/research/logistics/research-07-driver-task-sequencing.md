# Research 07 - Driver task sequencing: one step unlocks the next

2026-10-17. Question from the operator: should the driver app enforce the order of work - collect every
shop, *then* check in at the hub; load the van, *then* deliver - and is that how the major delivery
systems do it?

> **Status (2026-10-17): built as feature 093** ([specs/093-driver-work-sequence](../../../specs/093-driver-work-sequence/tasks.md)) -
> S1–S3, S4b, S5–S9, A1–A6 and B1–B5, plus combined trips. Not yet migrated or deployed. S4 was already handled.

**Short answer: yes.** Every system that runs a hub-and-spoke operation gates its route on a load step and
treats the hub hand-over as the step that closes the inbound leg. There is no single published
"industry standard", but the major platforms converge on the same pattern (§1). Effy already has most of
the pieces. **The gates exist in the app but not on the server**, and four smaller rules are missing
(§3).

---

## 1. What the major systems do

| System | What it enforces | Source |
|---|---|---|
| **Onfleet - Route Load task** | A route that starts at a hub gets a **Route Load task first**. *"The Route Load task must be completed before a driver can begin any other drop-off or pickup tasks on the route."* The barcodes of every drop-off are rolled into it. A package the driver does not load **must have a reason code**, which **alerts dispatch in real time**. Manual check-off is the fallback for an unreadable label, and admins can switch it off to force scanning. **Once loading has started, no barcodes can be added or changed**; changes go through dispatch. | [Route Load Task](https://intercom.help/onfleet-4f83d83093ac/en/articles/15254784-route-load-task) |
| **Onfleet - task order** | "Allow drivers to start task out of order" is **off by default**: drivers work tasks in the assigned order unless the business turns it on. Linked tasks (pickup → drop-off) are done in sequence by one driver. A route plan moves Pending → In Progress → Completed. | [Driver App Task Order](https://support.onfleet.com/hc/en-us/articles/16255546602516), [Route Plans](https://intercom.help/onfleet-4f83d83093ac/en/articles/15254680-route-plans), [Dependency Notifications](https://support.onfleet.com/hc/en-us/articles/19537601194132-Dependency-Notifications) |
| **Bringg - task lifecycle** | A strict state machine: accept → start → arrive (check-in) → leave (check-out) → done. The SDK refuses a step out of order with a named error: `NOT_ACCEPTED`, `EARLY_TO_START`, `WAYPOINT_IS_NOT_CURRENT`, `NOT_CHECKED_IN`, `HIGHER_PRIORITY_FOUND`, **`LINKED_TASK_NOT_COMPLETED`** (*"this task follows another task which should be completed before this task could be started"*). | [Task Flow Handling](https://developers.bringg.com/docs/bringg-driver-sdk-android-task-flow-handling) |
| **Bringg - mandatory actions** | Each step can carry mandatory actions (scan, photo, signature, form). *"If you mark a step as mandatory, the flow cannot proceed until the driver starts and completes this step."* Timing options include **"Before start tasks"** and **"Before checkout"**, plus actions at shift start and end. | [Driver actions in order flows](https://help.bringg.com/docs/set-up-driver-actions-in-order-flows) |
| **Track-POD - Load Check** | Load check can be **mandatory before a route can start**. Staff or drivers scan every item before departure, and loading errors are fixed at the depot instead of at the customer. Orders that are not loaded are marked Rejected and excluded from delivery. | [Load planner](https://www.track-pod.com/blog/load-planner/), [Checking & scanning](https://track-pod.com/blog/checking-scanning-and-proof-of-delivery/) |
| **Amazon Flex / DSP** | Check in at the station → receive the route → **scan every package and load the van** (load time is a scorecard metric) → start the route → scan and photo at the door → **return undelivered packages to the station, scanned in**. A **pre-trip vehicle inspection** is mandatory at shift start; a severe defect grounds the van. | [Flex pickup](https://flex.amazon.com/blog/navigating-the-package-pickup-process-with-ease/), [Flex returns](https://flex.amazon.com/blog/navigating-the-package-returns-process-with-ease/), [Day in the life (Automotive Fleet)](https://automotive-fleet.mydigitalpublication.com/articles/a-day-in-the-life-of-an-amazon-driver), [eDriving pre-trip DVCR](https://support.edriving.com/hc/en-us/articles/360019537238-Pre-Trip-DVCR) |
| **Shipsy - hub operations (middle mile)** | Inbound unloading is scanned against the trip's manifest, and the system flags three exceptions automatically: **Shortage** (on the manifest, not unloaded), **Excess arrival** (unloaded, not on this trip) and **Misrouted** (not for this hub). Departure is its own step, with a seal number and odometer reading. | [Exceptions](https://knowledge.shipsy.ai/help/hub-operations-and-mid-mile-management/how-system-applies-exception-automatically--9daje7ai), [In-scan at hub](https://knowledge.shipsy.ai/help/hub-operations-and-mid-mile-management/consignment-in-scanning-at-hub--ksuog7aa), [Trip departure](https://knowledge.shipsy.ai/help/hub-operations-and-mid-mile-management/trip-departure-of-a-vehicle--sznzlg5x) |
| **General chain-of-custody guidance** | Scan at every hand-over: pick, pack, load, departure, arrival, out for delivery, delivery attempt. Reconcile exceptions **before the vehicle leaves** the facility. When a scan is missed, fall back to a manual sign-off with a reason. | [Racklify - delivery scans](https://racklify.com/encyclopedia/how-to-use-delivery-scans-to-reduce-exceptions-and-improve-last-mile-performance/), [Racklify - handoff scans](https://racklify.com/encyclopedia/how-to-implement-package-handoff-scans-in-your-warehouse/) |

**Caveat on sources.** Onfleet, Bringg and Shipsy publish their rules; Amazon does not publish its DSP
app, so the Amazon row comes from Amazon's Flex blog and trade-press accounts. Food-delivery apps
(DoorDash, Uber Eats) are single-order, point-to-point work with no hub, so they are not a model for
this.

## 2. The rules they share (Effy's target)

1. **Work is a chain, and the server enforces it.** Each step is refused until the step before it is
   finished. The app hides or disables what is not allowed yet, but the *server* answers with a named
   refusal, like Bringg's `LINKED_TASK_NOT_COMPLETED`. Effy already works this way for time
   (`round_not_open`), but not yet for order.
2. **The inbound leg ends at the hub, and only once every pickup is settled.** "Settled" means
   collected, or declared not available with a reason. Check-in is the last stop.
3. **The outbound leg starts with a load step.** Until the van is loaded, no drop can be started,
   arrived at, delivered or failed.
4. **Loading is verified package by package, and every gap needs a reason.** Scanning comes first, with
   manual check-off as the fallback. A package that is not loaded is **declared** with a reason, taken
   off the run and reported to dispatch. "Mark all loaded" by itself records nothing.
5. **The manifest locks at load.** Nothing joins a van after it is loaded. New work waits for the next
   run. This is Onfleet's "no barcodes added once loading has started".
6. **The hub check-in reconciles against the manifest.** A package that was collected but not handed
   in is a *shortage*, and a scan for something not on the run is *excess* or *misrouted*. Each one is
   an exception, not something to ignore.
7. **The outbound leg ends back at the hub.** Undelivered parcels are scanned back in, and the shift
   cannot end quietly with goods in the van.
8. **Shift-level steps**, all optional: a pre-trip vehicle check before the first run (Amazon) and an
   end-of-shift check-out.
9. **Stop order inside a run** is the business's choice. Onfleet enforces it by default, and Circuit
   and others leave it to the driver. Either way the deviation is recorded.
10. **Dispatch sees the phase** of every run (collecting, to hub, checked in; to load, out, returning,
    closed) and is alerted when a step is overdue, such as "open 20 min, not loaded".

## 3. Effy today - what exists and what is missing

### Already right
- **The time gate.** `assertRoundOpen` (`apis/edge-api/driver/src/work/open.ts`) is one server rule
  that every route calls (072).
- **Delivery work cannot exist before the hub.** The delivery gather joins `hub_checkin`
  (`fleet/src/planner/sql.ts:148`), so a parcel only reaches a delivery run after it has been checked
  in.
- **The collection run screen** offers "Check in at the hub" only when `run.allCollected`
  (`CollectionScreens.kt:154`).
- **"Load the van"** (090/092) moves every staged drop out for delivery together, and the run screen
  hides "Open next drop" while drops are still staged.
- **Returning failed parcels to the hub** (088). A delivery run stays open until its failed parcels are
  checked back in.
- **Going off duty while holding packages** needs an explicit confirmation (`driver/service.ts:90`).
- **Hand-over records** say whether each package was scanned, typed or ticked by hand (090/091).
- **Dispatch cannot unassign** a package that is already in a van or out on a run (`assignments/service.ts:189`).

### Missing - backend (`apis/edge-api/driver`, `fleet`)

| # | Gap | Where | Fix |
|---|---|---|---|
| **S1** | **Hub check-in is not gated on the shops.** `hubCheckin` (`work/complete.ts:144`) checks ownership and opening time, then closes the run. An old build, a retried request or a second device can check in with shops still outstanding. The run becomes `completed`, and its uncollected `assigned` packages are left on a closed run. | driver | Refuse with **409 `stops_outstanding`** unless every `shop_pickup` stop is `done`/`skipped`. List the open stops, as `round_not_open` does. |
| **S2** | **Drops can be worked before the van is loaded.** `setDropStatus` accepts `pending → en_route/arrived` directly (`work/delivery.ts:183`). `submitProof` and `failDrop` (`proof/repository.ts:84,178`) check only the opening time, so a staged drop can be delivered or failed without ever being loaded. | driver | Refuse with **409 `run_not_loaded`** for any drop action while the drop is `pending`. Make **load the only writer of `out_for_delivery`**, with a guard test like `open.guard.test.ts`. ⚠ Compatibility: installed builds send per-drop `out_for_delivery` ("Start this drop"). Either treat that one call from `pending` as loading this drop (record a hand-over, method `manual`), or wait until no old build is in use. **Decision needed.** |
| **S3** | **Loading records no exceptions.** `loadRun` (`work/load.ts`) moves every staged drop out, whatever was scanned. "Mark all loaded" says nothing about a package that wasn't there. | driver + fleet | The load request takes `notLoaded: [{packageId, reason}]` (`not_at_hub`, `damaged`, `wrong_temperature`, `other`+note). Those packages come off the run, return to the hub's holdings for the next pass, and raise an exception for dispatch. A drop with every package missing is taken off the run. |
| ~~S4~~ | ~~Work joins a van that has already left.~~ **Not a gap.** `roundVisiting` in `fleet/src/planner/assign.ts` already skips a delivery run once it is `in_progress`, and loading puts a run in progress. Corrected 2026-10-17. | - | Keep it, and pin it in 093. |
| **S4b** | **A package the driver never saw is marked collected.** A late join adds a package to a shop stop the driver has open. `collectStop` (`work/complete.ts:79`) treats a package missing from the request as collected, and the app sends only the packages it showed. | driver | Settle only the packages the request names. Anything else stays `assigned`, and the stop stays open. |
| **S5** | **The hub check-in does not reconcile.** "Check in without scanning" accepts everything. A package that was collected but not handed in is recorded nowhere as missing, and `packages_arrived` is a count, not a list. | driver + fleet | The check-in takes `missing: [packageId]`. Those packages are marked *custody unknown*, kept off delivery planning and raised as a **shortage** exception. A scan of a code not on the run is refused on the phone (the scan rule's "not on your run" result) and not counted. |
| **S6** | **No round phase.** `driver_round.status` only says planned / in_progress / completed. Today, dispatch and the app each work out the phase from the stops, and none of them says it. | driver + fleet | One derived **phase**, written by one SQL fragment and used by Today, the run reads and dispatch. Collection: `to_collect · collecting · to_hub · checked_in`. Delivery: `to_load · out · returning · closed`. No new column is needed. |
| **S7** | **Two runs can be interleaved.** A driver with collected parcels not yet checked in can open a delivery run and load the van, mixing inbound and outbound parcels in one vehicle. | driver | Refuse with **409 `finish_current_run`**: no load, and no first collect on a new run, while another run of this driver's has parcels on board that are not checked in. Dispatch can override. **Decision needed:** some operations do run a collection loop and a delivery loop on one trip. |
| S8 | **Stop order is not recorded.** Drops and shop stops can be done in any order (fine), but a deviation is not recorded. | driver | Record `completed_seq` against the planned `seq`. Dispatch sees "done out of order". Do not enforce. |
| S9 | **No pre-trip vehicle check.** Optional, as Amazon does it. | fleet + driver | A short checklist on going on duty, tied to the vehicle. A "severe defect" answer blocks the first run and alerts dispatch. **Decision needed.** |

### Missing - driver app (`apps/driver-mobile`)

| # | Gap | Fix |
|---|---|---|
| **A1** | **The drop screen allows delivery before loading.** `DropScreen.kt:324–327` enables "Can't deliver" and "Scan to deliver" whenever the run is open, even when the drop is staged. A drop row on the run list, or Today's active card, opens it directly. | While the drop is staged, show "Load the van first", disable both buttons and link to the load step. |
| **A2** | **Today's active card for an unloaded delivery run is the first drop**, not "Load the van" (`active = outstanding[0]`, `driver/src/work/service.ts:223`). | The server returns a `load` step as the active item while drops are staged (S6's phase). ⚠ Installed builds decode `kind` as a closed enum, so carry it the way `toReturn` is carried (a field, not a new kind). |
| **A3** | **The load step cannot say a package is missing.** Its only fallback is "Mark all loaded". | Add "Can't find a package" on the load scan and the manual list: pick the package and a reason (S3). Finishing the load with unscanned packages asks the driver to confirm they are missing. |
| **A4** | **Hub check-in cannot say a package is missing** (S5). | List the packages that have not been scanned when the driver finishes. Each one is either "It's here" (manual) or "Not in the van" (missing). |
| **A5** | **The new refusals.** | Map `stops_outstanding`, `run_not_loaded` and `finish_current_run` to a sentence and an action ("Collect Shop X first"), as `round_not_open` is mapped now. |
| A6 | One "what's next" line per phase on each run screen, from the server's phase. | - |

### Missing - back-office (`apps/back-office`)

| # | Gap | Fix |
|---|---|---|
| **B1** | **Dispatch shows only "Opens … / Open"** for a round (`dispatch/model.ts` `roundOpenState`). | Show the phase (S6) on Dispatch day and round detail: *Collecting 3/5 · To hub · Checked in · To load · Out 4/9 · Returning 2 · Closed*. |
| **B2** | **No overdue alerts.** | Exceptions for: *open and not loaded after N min*; *every shop collected but not checked in after N min*; *returning parcels not checked in by end of shift*. N is a fleet setting. |
| **B3** | **Load and check-in exceptions have no screen** (S3, S5). | Rows on the Exceptions screen with an action: re-plan the package (it returns to the next pass), or record it found/lost. |
| B4 | **Dispatch override** for S7, and for a run stuck at a gate (a driver's phone has died). | "Mark loaded" or "Check in on the driver's behalf", recorded as staff in the hand-over history (method `staff`). |
| B5 | Out-of-order drops (S8) and manual hand-overs (091) on the round's timeline. | - |

## 4. The flow after the change

```
COLLECTION RUN                                  DELIVERY RUN
opens (round_opens_at)                          opens (round_opens_at)
  └─ shop stop × n   collect / not available      └─ LOAD THE VAN   scan or tick; missing → reason
       (scan; any order, deviation recorded)           ⛔ every drop refused until loaded (S2)
  └─ HUB CHECK-IN    ⛔ until every shop is           ⛔ nothing joins after loading (S4)
       settled (S1); missing → shortage (S5)      └─ drop × n   arrive → deliver | can't deliver
  closes → parcels available to delivery runs     └─ RETURN TO HUB  failed parcels scanned in (088)
                                                  closes
⛔ one run with parcels on board at a time (S7)
⛔ off duty with parcels in the van → confirm (exists)
```

## 5. Suggested order of work

1. **S1, S2, S4b + A1, A2, A5.** These close the gates. They are small and server-first, and they fix
   the "driver can do things out of order" risk directly. This is one feature, and it needs the S2
   compatibility decision.
2. **S3, S5 + A3, A4 + B3.** Load and check-in exceptions.
3. **S6 + B1, B2 + A6.** Phase everywhere, and the overdue alerts.
4. **S7, S8, S9, B4, B5.** These need decisions first.
