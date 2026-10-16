# Quickstart: Return Failed Parcels to the Hub (088)

How to prove it works. Container tests need Docker (`CONTAINER_TESTS=1`).

## Automated

| # | Proves | Where |
|---|---|---|
| P1 | A failure on the last drop leaves the round `in_progress` with 1 to return; the return completes it | `driver/src/proof/completion.container.test.ts` |
| P2 | Return is idempotent on `changeId`; a second return with a new id returns 0 | `shared/src/delivery/parcel-return.container.test.ts` |
| P3 | A failed drop later delivered on the same round is not "to return" | same |
| P4 | Custody lists in-transit and to-return delivery parcels, not staged ones; go-off-duty refuses while holding one | `shared` custody test; `driver/src/driver/service.test.ts` |
| P5 | `packageStatus`: failed → Problem (driver named); returned + unresolved → At hub "needs a next step"; resolved → At hub | `shared/src/status/status.test.ts` (table rows) |
| P6 | The delivery gather skips a returned parcel with an unresolved failure; plans it after `changeEffyWindow` resolves it | `fleet/src/planner/planner.container.test.ts` |
| P7 | `moveToCourier` / `moveToEffy` / `changeEffyWindow` refuse a failed unreturned parcel with the new words, and resolve the failure after a return | `shared/src/delivery/override.container.test.ts` |
| P8 | Dispatch `reassign` / `unassign` refuse a round with parcels to return (409 `parcels_to_return`) | `fleet` planner/dispatch container test |
| P9 | Exceptions list says `with_driver` for a failed parcel in a van, `at_hub` after the return | `fleet/src/exceptions` container test |
| P10 | Today/run carry `toReturn`; `active` is null when only the return is left; old-build decode of Today still succeeds | `driver` container test; driver-mobile host test decoding a fixture with and without `toReturn` |
| P11 | The app: "Return to hub" hero, one swipe, offline queued and moves on | driver-mobile `TodayViewModelTest` / `DeliveryViewModelTest` |
| P12 | Both new routes announce (`change-map.guard.test.ts`); gateways stay under 300 (`gateway-capacity.contract.test.ts`) | guards |

```sh
cd apis/edge-api/shared  && CONTAINER_TESTS=1 npx vitest run
cd apis/edge-api/driver  && CONTAINER_TESTS=1 npx vitest run
cd apis/edge-api/fleet   && CONTAINER_TESTS=1 npx vitest run
cd apps/driver-mobile    && ./gradlew :shared:testAndroidHostTest :androidApp:assembleDebug
pnpm --filter back-office test
```

## Walk (operator, dev)

1. A driver with a delivery round of two drops: fail one ("Nobody home"), deliver the other.
2. Today shows **Return to hub · 1 parcel** and the order number; the round is not in History.
3. Back-office → Exceptions: the parcel reads **With driver**; Dispatch day shows 1 failed parcel with
   drivers. Try "Move to courier" on the order: refused, "Record its return first".
4. At the hub, swipe **Return to hub**. The round moves to History; Today moves to the next round.
5. Back-office: the parcel reads **At hub — returned after a failed delivery, needs a next step**;
   Exceptions says **At hub**. Choose a new window for the order: the exception closes and the next
   planning pass puts the parcel on that window's round.
6. Repeat 1–3, then record the return from back-office instead (Story 4): the driver's Today drops
   the return step within seconds (live update).
