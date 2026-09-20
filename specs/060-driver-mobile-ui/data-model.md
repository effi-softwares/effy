# Phase 1 Data Model: Driver Mobile UI Completion

**Feature**: 060-driver-mobile-ui · **Date**: 2026-09-20

⚠ **This feature has no persisted data model.** No migration, no table, no column, no DTO change.
What follows is the **presentation-state** model: the UI state each screen renders, the provenance
classification every field carries, and the placeholder fixtures that stand in for what the platform
cannot supply.

The authoritative screen list is [contracts/screen-inventory.md](./contracts/screen-inventory.md);
the authoritative field classification is
[provenance-register.md](./provenance-register.md).

---

## 1. Provenance — the model that makes US2 work

### `Provenance`

The classification every readable field carries. Recorded in the register, **not** rendered in the app
(FR-016, operator decision).

| Value | Meaning | Rule |
|---|---|---|
| `PLATFORM` | The value came from the backend or the device. | MUST NOT be replaced by a placeholder (FR-014). |
| `PLACEHOLDER_DECORATIVE` | Invented, and a driver acting on it costs nothing — a sample shop name, a map marker position, a photo thumbnail. | MAY render. Register entry required. |
| `PLACEHOLDER_OPERATIONAL` | Invented, and a driver **could act on it** — an ETA, a distance, a delivery window, a phone number. | ⚠ **MUST NOT render as a value.** Omit the field, or render it as explicitly unavailable (FR-015/FR-016, SC-015). |
| `DERIVED` | Computed in the app from `PLATFORM` values — a count, a percentage, a progress fraction. | Renders freely. Inherits the weakest provenance of its inputs. |

⚠ **The distinction between the two placeholder kinds is this feature's central safety rule.** Because
nothing is marked in the running app, a fabricated ETA is indistinguishable from a computed one, and a
driver will plan around it. `DERIVED` inheriting the weakest input is what stops "3 of 4 stops done"
being trustworthy when one of the four was invented.

### `FieldEntry` (a register row)

| Attribute | Notes |
|---|---|
| `screen` | A row id from the screen inventory. |
| `field` | The label a person reads, not the code identifier. |
| `provenance` | One of the four above. |
| `source` | For `PLATFORM`: the repository/use-case it reads from. |
| `reason` | For placeholders: why the platform cannot supply it. |
| `unblockedBy` | ⚠ The condition that would make it real (FR-017a) — so the register doubles as the backlog of what the platform still owes this app. |

---

## 2. New presentation state

Additive only. Every existing field on every existing UI state is retained.

### `AuthUiState` — one new error

```
AuthFieldError += LockedOut
```
⚠ Today a locked-out driver and a driver who mistyped see the **same message**. Screen 7 of the design
is a distinct state and this is the field that makes it representable.

### `TodayUiState` — three new fields

| Field | Type | Why |
|---|---|---|
| `offline` | `Boolean` | Screen 13. The offline write queue exists (049 FR-040); it has never had an interface. |
| `cachedAt` | `Instant?` | "Last synced 9:14 am" — ⚠ `PLATFORM`, from the queue's own timestamp, **not** invented. |
| `loadFailed` | `Boolean` | Screen 15. Distinct from `message`, which today does double duty as both error text and informational text. |

### `CollectionUiState` — per-package confirmation

| Field | Type | Why |
|---|---|---|
| `confirmedPackageIds` | `Set<String>` | FR-019. The manifest is read-only today. |
| `swipeProgress` | `Float` | FR-018, cancellable before commit. |

⚠ **Confirmation is local, not a write.** Ticking a package sends nothing; the existing single
"collect" call still fires on swipe commit. This keeps the feature presentation-only (FR-024) and
avoids inventing a per-package endpoint. The register records `confirmedPackageIds` as UI state, not
platform state. **Consequence**: it does not survive process death — recorded as a known limitation
(edge case: "leaves the stop and returns"), because persisting it would be backend work.

### `DeliveryUiState` — the note every proof path drops

| Field | Type | Why |
|---|---|---|
| `proofNote` | `String` | FR-022. ⚠ Every call site passes `null` today; the repository already accepts a note, so this is a UI gap, not a contract gap. |
| `failNote` | `String` | FR-022, same. |
| `dropSpot` | `DropSpot?` | FR-023 — `FRONT_DOOR` / `RECEPTION` / `MAILROOM` / `NEIGHBOUR`. Replaces free text. ⚠ Serialised into the existing note field, so no contract changes. |

### `MapUiState` — new

| Field | Type | Provenance |
|---|---|---|
| `mode` | `COLLECTION \| SAME_DAY` | UI |
| `stops` | `List<MapStop>` | names/order `PLATFORM`; **coordinates `PLACEHOLDER_DECORATIVE`** |
| `hubIndex` | `Int?` | Which stop is the hub (rendered distinctly, FR-023d) |

⚠ **`MapStop.coordinate` is the single largest placeholder in the feature.** 049 R13 recorded, and it
is still true, that shops carry no address or coordinates and orders carry an un-geocoded address. The
cartography is real (OpenFreeMap); the pins are not. `unblockedBy`: *"shop.address + geocoding — a
backend slice."*

---

## 3. Placeholder fixtures

**Location**: `features/<x>/data/PlaceholderData.kt`, one per feature, plus
`core/placeholder/Placeholder.kt` for the marker type. ⚠ **Never inline in a composable** — with no
in-app marking, one file per feature is the only thing keeping the register findable (R11).

**Authored fresh.** The design's sample content is **not** copied (FR-012): not the named driver, not
the Melbourne street addresses, not the `EFY-409xx` references, and ⚠ **not `1800 EFFY OPS`** — a
dispatch phone number is an outward-facing real-world identifier the constitution requires be
operator-supplied, so the help screen shows it as unavailable rather than carrying a plausible guess.

### The drift guard

A test enumerates every value exported from a `PlaceholderData.kt` and **fails naming the value** if
the register does not list it. Without it the register is a comment, and 058 recorded what a comment
is worth: *"a count in a comment is true only while someone maintains it."*

---

## 4. What is NOT changing

Stated explicitly so a reviewer can confirm FR-024 by reading rather than by testing:

- **No domain model changes.** `Driver`, `Today`, `CollectionRun`, `ShopStop`, `DeliveryRun`, `Drop`,
  `HistoryRecord`, `ActivityItem` are untouched.
- **No repository or use-case signature changes.** `proofNote` and `dropSpot` flow into parameters
  that already exist and are currently passed `null`.
- **No DTO or wire-contract change**, so `cm-contract-check`-style drift guards stay green and no
  Go↔Kotlin contract moves.
- **No auth, session or offline-queue change.** The offline queue gains a *reader* (screen 13); its
  behaviour is unchanged.
- **No new persisted state.** The appearance preference is the only thing the app persists and it
  already exists.

## 5. State-transition note

One transition becomes **visible** without changing: `STAGED → OUT_FOR_DELIVERY → EN_ROUTE → ARRIVED`
already exists in `DropStatus` and is already driven by `advanceDrop`. Today `EN_ROUTE` and `ARRIVED`
have **no screens** — the driver taps a button and the status changes silently. Screens 23 and 24 give
two existing states a face. ⚠ This is the clearest illustration of the whole feature: the machine was
built and never shown.
