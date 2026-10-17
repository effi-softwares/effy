# 04 — Delivery backlog

Date: 2026-10-18 · Source: [03-gap-analysis.md](03-gap-analysis.md) (IDs in brackets).

**Goal: a correct delivery service, quickly.** "Correct" means:
- no money is lost;
- no parcel is lost or double-owned;
- the customer is never told something false and is told the three things that matter;
- a driver can do a full day without a dead end;
- staff can resolve a failed delivery.

Everything else waits.

Sizes: **S** ≤ half a day · **M** 1–2 days · **L** 3–5 days. **Op** = an operator step (migrations, deploys,
walks). Claude writes the code; the operator runs anything live.

---

## NOW: Milestone A, "correct" (do in this order)

### A0. Make what's built real
| # | Item | Size | Done when |
|---|---|---|---|
| **A0.1** | Reconcile deploy state: list which migrations are applied on dev and which services are deployed; correct FEATURE-HISTORY where it contradicts itself (088 / 092) | S + Op | One table of applied / deployed per feature 085, 088–093 |
| **A0.2** | Apply the outstanding migrations (085 second migration, 088, 089, 090, 093), then deploy `fleet`, `driver`, `orders`, `shop`, `commerce` in the order FEATURE-HISTORY gives. ⚠ `fleet` **after** 093's migration or every planning pass breaks | Op | Dev runs the current code |
| **A0.3** | Confirm `public.locality` on dev is the full G-NAF load, not the 18-line sample [W31] | Op (S) | `SELECT count(*) FROM locality` is in the thousands; a courier-only postcode quotes courier |

### A1. Money and order integrity
| # | Item | Size | Done when |
|---|---|---|---|
| **A1.1** | Cancel the previous Stripe intent whenever `createIntent` replaces it. In the webhook, look an intent up by its order metadata (not only the current `payment` row) and alarm on an unmatched `succeeded` intent [W1] | M | A test pays a superseded intent: the order is paid or flagged, never silently pending; a metric and alarm exist |
| **A1.2** | Make `createIntent`'s DB writes one transaction (order + lines + points hold + delivery capture + hold), with Stripe calls outside it; one lock order, slot after order, everywhere [W2, W3] | M | A refusal leaves the order exactly as before the call; a guard asserts the lock order |
| **A1.3** | Sweep abandoned `pending_payment` orders older than N hours: cancel the intent, release points, mark abandoned [W4] | S | A scheduled function plus a container test |

### A2. Custody and dispatch correctness
| # | Item | Size | Done when |
|---|---|---|---|
| **A2.1** | Refuse back-office Unassign / Reassign of a delivery round that is loaded (out for delivery), except as a "hand over in person" reassign that moves custody. Dispatch actions take `PLANNER_PASS_LOCK` [W5, W6] | S | Container test: unassigning a loaded round is a 409; no parcel is re-gathered while in a van |
| **A2.2** | `packageStatus` reads open and `lost` holds ("Problem — missing" / "Lost"). "Lost" prompts a refund decision on the order [W7] | S | A held parcel never reads "At hub" |
| **A2.3** | Planner gates on the vehicle: status `active`, rego / insurance / roadworthy not expired. An unsafe check marks the **vehicle** off-road until cleared. Licence expiry in Melbourne time [W8] | S | Tests for each gate; handing the van over doesn't clear an unsafe check |
| **A2.4** | Proof: `mediaKey` must be under `proof/<dropId>/` and exist (HEAD) before a drop is completed [W9, I5] | S | A fake key is a 422 |
| **A2.5** | Fix the hidden 3-shops-per-collection-round cap: base feasibility on a configurable per-shop allowance from the round's opening, and say "too many shops for one run" when that's the reason [W15, I8] | S | A run with 6 ready shops and 2 drivers assigns all 6 |
| **A2.6** | Geographic drop order: sort a delivery round's drops by nearest neighbour from the hub using the address postcode's centroid (`locality` lat/lng, already stored), then by window. Loosen the no-location guard to allow **address** coordinates (not driver positions) [W16, M5, D-2] | M | A round's drops follow the centroid order; the guard still forbids device location |

### A3. Tell the customer the truth
| # | Item | Size | Done when |
|---|---|---|---|
| **A3.1** | One customer-stage function derived from package facts (plus holds and failures). Stages: Confirmed → Packing → **Scheduled ({day}, {window})** → **Out for delivery** → Delivered, plus **Delivery attempt failed**. Web and mobile trackers use it; wording goes in shared-types with Kotlin twins [W13, S1, D-4] | M | Collected-but-at-hub reads "Scheduled", never "On the way"; a failed attempt reads failed |
| **A3.2** | Produce `order_out_for_delivery` at **load** (once per order, not per shop) and `order_delivery_failed` at **fail** (with next step). Delivered email links the proof photo. Remove the per-shop `order_ready` push [W12, W14, M1, R9, D-3] | M | A two-shop order gets exactly one message per stage; the load-screen sentence becomes true |

### A4. Failed delivery has an outcome
| # | Item | Size | Done when |
|---|---|---|---|
| **A4.1** | Exceptions "Decide" for a failed parcel back at the hub: **Redeliver** (pick a day / window via `changeEffyWindow`), **Send by courier** (`moveToCourier`), **Refund**, **Return to shop**. Store the outcome and note; stop the silent re-plan; count attempts (max 2, then Refund / Return only); tell the customer (A3.2) [W10, M3, D-5] | L | No failed parcel is re-planned without a recorded decision; the order page shows the attempt history |
| **A4.2** | Proof viewable: the back-office order page shows the photo or signature (presigned), method, time and driver; the customer order page shows the delivered photo [M4] | S | A CSA can answer "I never got it" from one screen |

### A5. Driver app: a full day without a dead end
| # | Item | Size | Done when |
|---|---|---|---|
| **A5.1** | Off duty: send `acknowledgeHeldPackages` after the sheet; map `holding_packages` to its own message; sign-out must not leave the driver on duty silently [W17] | S | Test: going off duty holding parcels works; sign-out reports a failure |
| **A5.2** | The hub scan context excludes `not_available` packages (app, and the server's `packageCodes`) [W18] | S | A short collection finishes by scanning |
| **A5.3** | Sync drain: only named "already applied" 409s count as applied; everything else goes to "Not recorded" [W20] | S | `SyncCoordinator` tests (none exist today) |
| **A5.4** | Sign-out clears the offline queue, proof outbox and stop drafts (after sending, or with a warning) [W21] | S | Test with two drivers on one device |
| **A5.5** | Offline: persist run and drop reads; an offline load patches cached drops to loaded. Scan sessions use `rememberSaveable` [W19, W22, I6] | M | Airplane-mode walk: load → deliver 3 drops → reconnect, all land |
| **A5.6** | Navigate opens directions mode (`google.navigation:q=` / Apple `daddr` + `dirflg=d`) [M6] | S | One tap starts turn-by-turn |
| **A5.7** | The "Load the van first" dead end becomes a "Load the van" button; any refused step shows the one next action [I2] | S | No screen without a forward action |

### A6. Walk it
| # | Item | Size | Done when |
|---|---|---|---|
| **A6.1** | A written end-to-end walk script (customer order, two shops → labels → collect → hub → load → 1 delivered, 1 failed → return → decide → redeliver), run on dev on an Android device; findings fixed or logged [I1, I10] | S + Op | The walk is recorded in FEATURE-HISTORY |

**Milestone A total: about 4–5 weeks of build for one developer, plus the operator steps.**

---

## NEXT: Milestone B, "usable at volume" (after A is walked)

| # | Item | Size | Refs |
|---|---|---|---|
| B1 | Small console fixes: DutyPanel shows real work; Reassign lists all eligible on-duty drivers; reorder rows show address and order; order numbers are links; nine-word status everywhere (no raw enums or sub ids); Melbourne timestamps; Found / Lost with feedback; shop "Effy driver" on courier orders | M | W23–W27 |
| B2 | Checkout wording: the ASAP tile isn't called "Standard"; it says "Earliest available day · {estimate}" | S | W28, W30, D-6 |
| B3 | Fix the unreachable no-windows alarm and courier fallback (count timed windows; treat a full or closed Any-time as unavailable) | S | W29 |
| B4 | Remove dead code and machinery: Go-live tab, routes and 5-minute sweep; dead helpers; shop stubs; write-only `delivery_quote`; unused driver routes (after checking installed builds); app dead code | M | R1–R5 |
| B5 | Delivery KPIs page replacing the placeholder dashboard: on-time % (delivered ≤ window end), first-attempt %, failed by reason, drops per round-hour, window fill by day. Tables, not cards | M | M7, R7 |
| B6 | Dispatch board, one view per window: window → round → drops with progress and late flag, links to orders | M | I3, S10 |
| B7 | Delivery settings regrouped into about 5 sections with one writer service | M | I4, S8 |
| B8 | Guest postcode check plus an earliest-window hint in the header | M | M8 |
| B9 | Address validation and geocoding at address save (G-NAF or Google Address Validation); drop order uses the address point instead of the centroid | M | M9, M5 |
| B10 | Hosted route optimisation (Google Route Optimization, single vehicle) per delivery round when drops > ~8 | M | M5, D-7 |
| B11 | Customer self-service before a cutoff: change window, edit delivery instructions | M | M10 |
| B12 | iOS driver push (once the Apple Developer account exists) | S + Op | M11 |
| B13 | Failed-attempt evidence in the app: optional photo, "called customer" tick | S | I7 |
| B14 | One `markDelivered(source)` writer; `arrived` counts by delivery type | S | S2, I9 |

---

## LATER (parked: revisit when volume or a business decision demands it)

| # | Item | Trigger to pull it in | Refs |
|---|---|---|---|
| L1 | Driver location during rounds → dispatcher live map, geotagged proof | NSW 14-day notice given; more than ~5 drivers on the road at once | M12, D-8 |
| L2 | Live ETA / "N stops away" / customer tracking map | L1 done | M13 |
| L3 | SMS notifications, masked calls, "I'm outside" templates | Customer complaints about missed contact | M14 |
| L4 | Courier aggregator (Shippit or Sendle) for booking, labels and tracking webhooks | More than ~20 courier parcels a week | M15 |
| L5 | Shift roster and capacity forecast (drivers vs booked windows) | More than ~5 drivers | M16 |
| L6 | Per-bag labels (chilled / ambient), hub dwell-time limit and alarm for chilled | Meaningful chilled / frozen volume | M17 |
| L7 | Alcohol ID / age check flow | If alcohol is sold | M18 |
| L8 | Event backbone (drain `order.placed` to SNS) | A second consumer needs order events | M19 |
| L9 | Shop allocation / fallback shop on shortage | Same product sold by several shops | M20 |
| L10 | Refactors: split `override.ts`; `loadCalendar` helper; one area word in UI; trim comments; collapse waves to a log; replace or remove the schematic map | When the file is next touched | S3–S9, R6 |
| L11 | Density levers: per-area window offering, "green" window labels | Routes regularly over ~10 drops per window | 02 §4 |
| L12 | On-demand overflow via Uber Direct / DoorDash Drive for "today, no window left" | Demand for rapid delivery | 02 §1.3 |
| L13 | Multi-hub | A second hub | — |
| L14 | Mark stale docs superseded (driver-app-review, logistics-engine-architecture, audit-00, console guides) | Any time (S) | R8 |
