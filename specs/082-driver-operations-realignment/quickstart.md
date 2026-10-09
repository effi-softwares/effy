# Quickstart & Proofs: 082

## Machine proofs — each named one broken once

| # | Proves | Where |
|---|---|---|
| P1 | `collectionRunFor`: latest run that makes the window; previous delivery day's last run when none that day; skips non-delivery days; DST days | shared unit |
| P2 | A later-day Effy parcel at the hub is on NO delivery round before its day; on its day it is on its window's round | fleet container |
| P3 | A `standard` parcel WITH a window (078) is planned; a carrier/courier parcel never is | fleet container |
| P4 | Collection: not offered before its intended run; offered on it; offered (late) after; courier-via-hub on the next run; supplier pickup never | fleet container |
| P5 | Clearance ignores the method; an ungrouped postcode is cleared by a single-group driver; no delivery grant → never | shared unit + fleet container |
| P6 | Existing grants: every driver can do at least what they could (rows of either method) | fleet container |
| P7 | Hub check-in: `effyGroups` by day and window, `courierCount`; old counts still present | driver container |
| P8 | Needs a driver: listed only once the round has opened, for any day's window | orders container |
| P9 | `GET /dispatch/windows`: days on sale, parcels, `collectLate`, `coldOvernight`, round or planned-on-the-day | fleet container |
| P10 | "Assign to…" delivery before the day → `not_yet` | fleet container |
| P11 | An order moved back to Effy for a later day (081) gets a round on that day | fleet container |
| P12 | Guards: no method read in the planner/capabilities; `check-driver-delivery-words.sh` | guard + script |
| P13 | Driver app: check-in shows two groups; no screen says the old words | driver-mobile host tests |

```
pnpm --filter @effy/edge-shared test -- collection-deadline driver-eligibility
pnpm --filter @effy/edge-fleet test
pnpm --filter @effy/edge-driver test
pnpm --filter @effy/edge-orders test
pnpm --filter @effy/back-office test
bash scripts/check-driver-delivery-words.sh
```

## Walks in dev (model switch on briefly)

- **V1** Buy a window two days ahead; supplier marks ready; confirm it is not on today's collection run
  if a later run still makes it, is collected on that run, checked in, and shown under "Effy delivery —
  <day, window>".
- **V2** On its day, the round appears, opens on time, and is delivered with proof.
- **V3** A chilled parcel collected the evening before reads "needs cold storage" in Assignments.
- **V4** Driver page: Collects / Delivers with areas, no method; a single-group driver is offered an
  ungrouped postcode's delivery.
- **V5** Assignments: switch days; "needs a driver" lists a parcel only after its round opens.
- **V6** Every driver screen and dispatch screen: no "same-day" / "standard".
- **V7** A driver on the previous app build completes a collection and a delivery.
