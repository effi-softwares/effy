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
| **Shift length** / **stops done** (off-duty) | offduty | 🟡 | No shift model exists. Decorative — a driver does not route on them. ⚠ Reconsider as ⛔ if operators begin using them for time records. | A shift/roster model |
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
*Pending — Phase 2.*

### Group 3 — Phase 1, collection run
*Pending — Phase 2.*

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
