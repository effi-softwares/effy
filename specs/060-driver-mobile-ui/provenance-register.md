# Data Provenance Register — Effy Driver App

**Feature**: 060-driver-mobile-ui · **Created**: 2026-09-20 · **Status**: ⚠ SCAFFOLD — filled during implementation

> **This document is the single authority on which parts of the driver app are real.**
>
> Placeholder data is **not marked in the running app** (FR-016, operator decision 2026-09-20), so
> this register is the *only* record. A reviewer holding it must be able to classify every field on
> any screen (SC-004, SC-005).

## How to read it

| Provenance | Meaning |
|---|---|
| ✅ `PLATFORM` | Real. From the backend or the device. |
| 🟡 `PLACEHOLDER_DECORATIVE` | Invented. Acting on it costs nothing. |
| ⛔ `PLACEHOLDER_OPERATIONAL` | Invented **and** a driver could act on it — so it **MUST NOT render as a value**. Shown as unavailable, or the field is omitted. |
| 🔢 `DERIVED` | Computed in the app. Inherits the weakest provenance of its inputs. |

⚠ **The ⛔ row is the safety rule.** With nothing marked on screen, a fabricated ETA is
indistinguishable from a computed one and a driver will plan their route around it. Anything
operational is omitted rather than invented (FR-015, SC-015).

## Rules this register enforces

1. Every screen in [contracts/screen-inventory.md](./contracts/screen-inventory.md) appears here.
2. Every field a person can read on that screen appears under it.
3. A ✅ field may never become 🟡 or ⛔ (FR-014, SC-009).
4. Every 🟡/⛔ names **what would make it real** (FR-017a) — so this doubles as the backlog of what
   the platform still owes the driver app.
5. ⚠ **Mechanically guarded**: a test enumerates every value exported from a
   `features/*/data/PlaceholderData.kt` and fails, naming the value, if it is not listed here.
   Without that, this file is a comment.

---

## Known placeholders, declared up front

These are established by research and will not change during implementation. Individual screen
sections are filled in as each phase lands.

| Field | Where | Class | Why the platform cannot supply it | Unblocked by |
|---|---|---|---|---|
| Stop / drop **ETA** | home, collection-run, map, enroute | ⛔ | No routing engine, and no coordinates to route between. | Shop geodata + a routing provider |
| **Distance** to a stop | home, collection-run, enroute | ⛔ | Same — no coordinates. | Shop geodata |
| **Delivery window** (e.g. "12:30–1:00") | home-delivery, delivery-run, drop-detail | ⛔ | ⚠ 052 R4 established the platform's delivery promise is **date-granular**; there is no time window and none can be derived. | A time-window model (a backend slice) |
| Map **marker coordinates** | map-collection, map-delivery | 🟡 | ⚠ 049 R13: shops carry no address or coordinates; orders carry an un-geocoded address. Decorative because the map is illustrative, not navigational — **Navigate still hands off to the device's own maps app with the real address string**. | `shop.address` + geocoding |
| Map **cartography** | map-collection, map-delivery | ✅ | Real OpenStreetMap data via OpenFreeMap. ⚠ *Not* OSM's own tile servers, which forbid app distribution (R2). | — |
| **Dispatch phone number** | help | ⛔ | ⚠ An outward-facing real-world identifier. The constitution requires these be **operator-supplied, never inferred**; the design's `1800 EFFY OPS` is sample content. Shown as unavailable. | The operator supplying a real number |
| Proof photo **geotag** | proof-photo, history-detail | ⛔ | No location capture is wired. A wrong geotag on a delivery record is evidence in a dispute. | Location capture + permission |
| **Shift length** / **stops done** (off-duty) | offduty | ⛔ | ⚠ **RECLASSIFIED during implementation, 🟡 → ⛔.** The planning note called these decorative "because a driver does not route on them". Building the screen showed that is the wrong test: the figure a driver checks is *"did my stops register?"*, and rendering `0` after a full shift answers it **wrongly**. They render `—`. | A shift/roster model with a completed-stop count |
| **Bay / dock** detail | home, collection-run, hub-checkin | 🟡 | `shop` has no premises detail. | Shop premises fields |
| **"assigned 9:02 am by dispatch"** | collection-run | 🟡 | Assignment time is not exposed by the driver API. | A field on the run DTO |

## Confirmed real — must not regress

Everything feature 049 already wires stays ✅ (FR-014, SC-009):

driver identity, work email, zone, hub, vehicle · duty status · run and stop identity, shop names,
ordering · package references, destination suburb, same-day/standard method, item lines and
quantities · hub split counts · drop identity, customer name, **full delivery address**, instructions,
package count · drop status and its transitions · proof method and note, captured media · failure
reason · history records and timelines · activity items and read state · app version · offline
`cachedAt`.

---

## Per-screen register

> Filled during implementation, one section per phase. Each screen lists **every** readable field.

### Group 1 — Onboarding & auth
*Pending — Phase 6.*

### Group 2 — Duty & today

**Screen 9 · `offduty`** — `TodayScreen.OffDutyBody`

| Field | Class | Source / reason |
|---|---|---|
| Brand title "Effy Driver" | ✅ | Static copy |
| Duty pill "OFF DUTY" | ✅ | `driver.dutyStatus` |
| Zone line | ✅ | `driver.zone`; omitted when unassigned |
| Date ("Wednesday 22 Aug") | — | ⚠ **OMITTED, not placeholder.** The app has no date-formatting dependency and 060 adds no capability for a label. Unblocked by: a date utility, if a later slice wants one. |
| Greeting name | ✅ | `driver.display` — ⚠ the design's time-of-day ("Morning,") is dropped; it needs a clock |
| "Stops done" | ⛔ | No shift model and no completed-stop count. Renders `—`. ⚠ Showing `0` after a full shift would tell a driver their work did not register. **Unblocked by**: a shift/roster model |
| "Shift length" | ⛔ | Same. Renders `—`. **Unblocked by**: a shift/roster model |
| "Go on duty" action | ✅ | Real — calls `setDuty` |

**Screens 10–11 · `home` / `home-delivery`** — `TodayScreen`, `CurrentWorkCard`, `UpNextList`

| Field | Class | Source / reason |
|---|---|---|
| "Today" + stops-remaining line | 🔢 | Derived from `today.remainingCount` (✅) and `today.phase` (✅) |
| Duty pill "ON DUTY" | ✅ | `driver.dutyStatus`. ⚠ Deliberately **not** interactive — see `DutyPill` |
| Phase bar titles + active phase | ✅ | `today.phase` |
| Phase bar meta ("In progress" / "Locked until check-in") | 🔢 | Derived from `today.phase` |
| Hero title | ✅ | `today.active.title` |
| Hero subtitle | ✅ | `today.active.subtitle` |
| Hero status chip | ✅ | `today.active.status` |
| Hero **map strip** | 🟡 | Neutral panel reserving the space. **Unblocked by**: Phase 5 (MapLibre + OpenFreeMap) **and** shop geodata for the pins |
| Hero **ETA** | ⛔ | ⚠ **OMITTED from the metrics row**, not dashed — in an inline dot-separated row a string of dashes reads as a broken screen. **Unblocked by**: a routing provider + shop geodata (049 R13) |
| Hero **distance** | ⛔ | Same. **Unblocked by**: `shop.address` + geocoding |
| Hero **bay / dock** | 🟡 | `shop` carries no premises detail. Currently unused. **Unblocked by**: premises fields on `shop` |
| "Up next · N shops/drops" | 🔢 | Derived from `today.upNext.size` |
| Queue row index | 🔢 | Derived from list position (active is #1, so the queue starts at 2) |
| Queue row title / subtitle | ✅ | `TodayItem.title` / `.subtitle` |
| Queue row **ETA** | ⛔ | ⚠ **OMITTED on every row.** A driver sequences their round by these. **Unblocked by**: routing + geodata |
| "Then: hub check-in" + hub name | ✅ | `driver.hub`; the row is hidden when unassigned. Collection phase only |
| Drop **delivery window** ("12:30–1:00") | ⛔ | ⚠ **OMITTED.** 052 R4: the platform's delivery promise is **date-granular**; there is no time window and none can be derived. Telling a customer "between 12:30 and 1" would invent a commitment Effy has not made. **Unblocked by**: a delivery time-window model |

**Screen 12 · `home-empty`** — all ✅ / static copy. Pulsing indicator suppressed under reduced motion.

**Screen 13 · `home-offline`** — banner copy static ✅; **`cachedAt` is ✅ PLATFORM**, read from the
offline queue's own timestamp, ⚠ not invented.

**Screen 15 · `error`** — all static copy ✅; retry calls the real refresh.

### Group 3 — Phase 1, collection run

**Screen 16 · `collection-run`** — `CollectionRunScreen`

| Field | Class | Source / reason |
|---|---|---|
| "N of M shops collected" + progress bar | 🔢 | Derived from `run.stops[].status` (✅) |
| Stop sequence mark | ✅ | `CollectionStop.sequence` |
| Shop name, shop code | ✅ | `CollectionStop.shopName` / `.shopCode` |
| Package count per stop | ✅ | `CollectionStop.packageCount` |
| Stop action button state | 🔢 | Derived from `CollectionStop.status` |
| Hub block name | ✅ | `driver.hub`; falls back to the generic "Effy hub" when unassigned |
| Stop **ETA** | ⛔ | ⚠ **OMITTED on every stop.** **Unblocked by**: routing + shop geodata (049 R13) |
| Stop **distance** | ⛔ | ⚠ **OMITTED.** **Unblocked by**: `shop.address` + geocoding |
| Stop **address** | — | ⚠ **OMITTED — the platform has none.** `CollectionStop` carries name and code only; `shop` has no address field at all. The design shows a street address per stop. **Unblocked by**: `shop.address` |
| Stop **bay / dock** | 🟡 | No premises detail on `shop`. Unused. **Unblocked by**: premises fields |
| **"assigned 9:02 am by dispatch"** | 🟡 | ⚠ **OMITTED rather than invented** — assignment time is not on the run DTO. **Unblocked by**: a field on the run DTO |

**Screen 17 · `shop-stop`** — `ShopStopScreen`

| Field | Class | Source / reason |
|---|---|---|
| Shop name | ✅ | `ShopStop.shopName` |
| "N of M confirmed" | 🔢 | Derived from local `confirmedPackageIds` — ⚠ **UI-only state; sends nothing and does not survive process death** |
| Package reference | ✅ | `CollectionPackage.ref` |
| Destination suburb | ✅ | `CollectionPackage.destinationSuburb` |
| Item count per package | 🔢 | Derived from `CollectionPackage.items[].qty` (✅) |
| Same-day / standard badge | ✅ | `CollectionPackage.method` |
| Tick state | 🔢 | Local UI state (see above) |
| Collection-bay instructions | 🟡 | ⚠ **OMITTED** — the design's "collection bay 2, rear lane" has no field behind it. **Unblocked by**: premises fields on `shop` |

**Screen 18 · `shop-problem`** — `ShopProblemScreen`

| Field | Class | Source / reason |
|---|---|---|
| Package reference chips | ✅ | `ShopStop.packages[].ref` |
| Problem kinds | ✅ | A closed set defined in the app (`ProblemKind`) |
| Note field | ✅ | Free text, sent to the platform |
| Submitted report | ✅ | `reportIssue` — ⚠ **the package reference is prefixed into the NOTE**, because the endpoint has no package parameter. **Unblocked by**: a package column on the issue record |

### Group 4 — The pivot, hub check-in
*Pending — Phase 2.*

### Group 5 — Phase 2, same-day delivery run
*Pending — Phase 2.*

### Group 6 — Map
*Pending — Phase 4.*

### Group 7 — Notifications
*Pending — Phase 7.*

### Group 8 — History
*Pending — Phase 7.*

### Group 9 — Account
*Pending — Phase 5.*

### Group 10 — Cross-cutting
*Pending — Phase 7.*

---

## Summary counts

*Filled on completion. SC-004 requires 100% coverage with no field unclassified.*

| | Count |
|---|---|
| Screens registered | 0 / 45 |
| Fields ✅ `PLATFORM` | — |
| Fields 🟡 `PLACEHOLDER_DECORATIVE` | — |
| Fields ⛔ `PLACEHOLDER_OPERATIONAL` (rendered as unavailable) | — |
| Fields 🔢 `DERIVED` | — |
