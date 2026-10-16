# Contract: driver — scanning foundations (090)

`HandoverMethod = "scan" | "typed" | "manual"`; `PackageHandover = { packageId: string; method: HandoverMethod }`.

| Route | Change |
|---|---|
| `POST …/collection/runs/{runId}/stops/{stopId}/collect` | `packages[].method?` |
| `POST /driver/v1/hub/checkin` | `packages?: PackageHandover[]` |
| `POST …/delivery/drops/{dropId}/proof` | `packages?: PackageHandover[]` |
| `POST …/delivery/runs/{runId}/return` | `packages?: PackageHandover[]` |
| `POST /driver/v1/delivery/runs/{runId}/load` | NEW: `{ changeId, packages? }` → `{ loaded: WireInt }`; 404 not yours; 409 `round_not_open` |
| `GET …/collection/runs/{runId}` | `hubSort?: { packageCode, kind: "load_now"\|"shelve"\|"courier_bay", label }[]` |
| `ParcelsToReturn` (088) | `packageCodes?: string[]` |

All additions are optional; installed builds ignore them and send none.
