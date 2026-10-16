# Contract: driver — return parcels to the hub (088)

Service `apis/edge-api/driver`, **shared** gateway. Driver-pool bearer; scoped to the caller's rounds.

## POST /driver/v1/delivery/runs/{runId}/return

Request (`ParcelReturnRequest`, `@effy/shared-types/driver.ts`):

```json
{ "changeId": "uuid" }
```

Response 200 (`ParcelReturnResponse`):

```json
{ "returned": 2, "roundComplete": true }
```

- Returns EVERY parcel on the round that is to return (research R1). `returned: 0` when there is
  nothing (already returned, or none failed) — success, not an error.
- Idempotent on `changeId`: a replay answers with the first call's result (FR-005).
- 404 `not_found` — no such round, or not the caller's (one answer for both).
- 409 `round_not_open` — unchanged 072 refusal.
- Announces after commit (research R8).

## Additive fields (old builds ignore them)

`TodayDTO.toReturn: ParcelsToReturn | null` and `DeliveryRunDTO.toReturn: ParcelsToReturn | null`:

```json
{ "runId": "uuid", "count": 2, "orders": ["EFY-ABC123", "EFY-DEF456"] }
```

- `null` when the round has nothing to return. On Today it is the CURRENT round's (the round under
  way); `active` is `null` when the return is the only work left on it (research R4).
- `orders` are order numbers only — no address, no customer (049 FR-013).

⚠ `TodayItemRef.kind` is NOT extended. A new value would fail to decode on every installed build.

## Kotlin

`contract-driver/DriverDto.kt` regenerated: `ParcelReturnRequest`, `ParcelReturnResponse`,
`ParcelsToReturn`; `toReturn` defaulting to `null` on `TodayDTO` and `DeliveryRunDTO`.
