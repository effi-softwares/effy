# Contract: Screen Inventory

**Feature**: 060-driver-mobile-ui · **Date**: 2026-09-20

The binding map from the design's **45 in-app screens** to the app's destinations and states. This is
the contract SC-001 is measured against: every row must be reachable and photographable.

⚠ **45 screens ≠ 45 routes.** Several are *states* of one destination (R13). The unit of verification
is the **state**, not the route — so every state must be deliberately reachable, not only reachable by
contriving a live backend condition.

**Status legend** — where each row stands **before** this feature:
· **NEW** = no screen exists · **REBUILD** = exists, substantially unstyled · **KEEP** = close enough,
content tweaks only

---

## Group 1 — Onboarding & auth (8 screens · 3 destinations)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 1 | `splash` | `App` | `SessionState.Restoring` | REBUILD |
| 2 | `email` | `SignInScreen` | `AuthStage.Email` | REBUILD ⚠ shop copy |
| 3 | `otp` | `SignInScreen` | `AuthStage.Code`, entering | REBUILD |
| 4 | `otp-verifying` | `SignInScreen` | `Code` + `submission=Verifying` | REBUILD |
| 5 | `otp-invalid` | `SignInScreen` | `Code` + `InvalidCode` | REBUILD |
| 6 | `otp-expired` | `SignInScreen` | `Code` + `ExpiredCode` | REBUILD |
| 7 | `otp-locked` | `SignInScreen` | `Code` + **`LockedOut`** | **NEW** ⚠ state does not exist |
| 8 | `perms` | `PermissionPrimingScreen` | default | REBUILD |

## Group 2 — Duty & today (5 + 2 cross-cutting · 1 destination)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 9 | `offduty` | `TodayRoot` | `dutyStatus=OFF_DUTY` | REBUILD |
| 10 | `home` | `TodayRoot` | `phase=COLLECTION` | REBUILD ⚠ no hero, no queue |
| 11 | `home-delivery` | `TodayRoot` | `phase=SAME_DAY_DELIVERY` | REBUILD |
| 12 | `home-empty` | `TodayRoot` | `phase=IDLE` | KEEP |
| 13 | `home-offline` | `TodayRoot` | `offline=true`, cached | **NEW** |
| 14 | `skeleton` | `TodayRoot` | `isLoading` | **NEW** |
| 15 | `error` | `TodayRoot` | `loadFailed` | **NEW** |

## Group 3 — Phase 1, collection run (3 screens · 3 destinations)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 16 | `collection-run` | `CollectionRunRoute` | loaded | REBUILD ⚠ no progress bar, no hub row |
| 17 | `shop-stop` | `ShopStopRoute` | loaded | REBUILD ⚠ no per-package tick, no swipe |
| 18 | `shop-problem` | **`ShopProblemRoute`** | default | **NEW** ⚠ currently a bare TextButton |

## Group 4 — The pivot, hub check-in (2 screens · 1 destination)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 19 | `hub-checkin` | `HubCheckinRoute` | `sameDayCount > 0` | REBUILD ⚠ no split bar, no swipe |
| 20 | `hub-checkin-empty` | `HubCheckinRoute` | `sameDayCount == 0` | REBUILD ⚠ only a button-label change today |

## Group 5 — Phase 2, same-day delivery run (12 screens · 5 destinations)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 21 | `delivery-run` | `DeliveryRunRoute` | loaded | REBUILD |
| 22 | `drop-detail` | `DropRoute` | `STAGED` / `OUT_FOR_DELIVERY` | REBUILD |
| 23 | `enroute` | `DropRoute` | `EN_ROUTE` | **NEW** ⚠ no screen; status changes silently |
| 24 | `arrived` | `DropRoute` | `ARRIVED` | **NEW** ⚠ same |
| 25 | `proof-pick` | `DropRoute` | `proof=pick` | REBUILD ⚠ no note field |
| 26 | `proof-photo` | `DropRoute` | `proof=photo` | **NEW** ⚠ system camera, absent on iOS |
| 27 | `proof-code` | `DropRoute` | `proof=code` | REBUILD ⚠ text field, not boxes+keypad |
| 28 | `proof-sign` | `DropRoute` | `proof=signature` | KEEP |
| 29 | `proof-contactless` | `DropRoute` | `proof=contactless` | REBUILD ⚠ free text, not chips |
| 30 | `success` | `DropRoute` | `delivered` | REBUILD |
| 31 | `failed` | `DropRoute` | `proof=fail` / `failed` | KEEP ⚠ add note field |
| 32 | `detail-skeleton` | `DropRoute` | `isLoading` | **NEW** |

## Group 6 — Map, per run (2 screens · 1 destination)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 33 | `map-collection` | `MapRoot` | `mode=COLLECTION` | **NEW** ⚠ "coming soon" |
| 34 | `map-delivery` | `MapRoot` | `mode=SAME_DAY` | **NEW** ⚠ "coming soon" |

## Group 7 — Notifications (3 screens · 1 destination + OS)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 35 | `activity` | `ActivityRoute` | has items | KEEP ⚠ add title+body, mark-all-read |
| 36 | `activity-empty` | `ActivityRoute` | empty | KEEP |
| — | `push` | **OS lock screen** | n/a | ⚠ **NOT an app screen** (FR-002) — copy only |

## Group 8 — History (4 screens · 2 destinations)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 37 | `history` | `HistoryRoot` | has records | KEEP |
| 38 | `history-empty` | `HistoryRoot` | empty | KEEP |
| 39 | `history-run` | `HistoryDetailRoute` | `kind=run` | REBUILD ⚠ generic layout today |
| 40 | `history-detail` | `HistoryDetailRoute` | `kind=drop` | REBUILD ⚠ says "photo captured", shows nothing |

## Group 9 — Account (4 screens · 4 destinations)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 41 | `account` | `AccountRoot` | default | REBUILD ⚠ no avatar, no duty row |
| 42 | `appearance` | **`AppearanceRoute`** | default | **NEW** ⚠ inline chips today |
| 43 | `help` | **`HelpRoute`** | default | **NEW** ⚠ absent entirely |
| 44 | `signout` | `AccountRoot` | `confirmSignOut` | KEEP ⚠ generic copy |

## Group 10 — Cross-cutting (1 remaining · 1 destination)

| # | Design screen | Destination | State | Status |
|---|---|---|---|---|
| 45 | `perm-denied` | **`PermissionDeniedRoute`** | default | **NEW** |

---

## Tally

| | Count |
|---|---|
| Design screens in the app | **45** |
| Design screens that are the OS's (`push`) | 1 |
| **Total in the design** | **46** ✅ |
| Destinations | **~24** |
| **NEW** (no screen exists) | **14** |
| **REBUILD** (exists, unstyled) | **23** |
| **KEEP** (content tweaks only) | **8** |

## New routes this feature adds

`ShopProblemRoute` · `AppearanceRoute` · `HelpRoute` · `PermissionDeniedRoute`

⚠ Each must be registered in `driverNavJson`'s serializers module or it will fail to restore across
process death — the `TabBackStacks` contract. A test enumerates the route set against the
serializers module so a route added without a serializer fails the suite rather than a device.

## New state this feature adds

- `AuthFieldError.LockedOut` — ⚠ today a locked-out driver sees the **same message** as one who
  mistyped (screen 7).
- `TodayUiState.offline` + `cachedAt` (screen 13) — the offline write queue already exists; it has no
  interface.
- `TodayUiState.loadFailed` distinct from `message` (screen 15).
- `DeliveryUiState.proofNote` (screens 25–31) — every proof path currently passes `null`.
- `MapUiState { mode, points, stops }` (screens 33–34).

## Verification obligation

SC-001 is met when all 45 rows have been **reached and photographed in both appearances** — 90 images.
⚠ Every state must be drivable deliberately: 039 shipped four live defects behind a fully green suite
because "layout, contrast and hierarchy are not properties a DOM assertion can see." A state only
reachable by contriving a backend failure would never be looked at, so each is drivable from a state
harness.
