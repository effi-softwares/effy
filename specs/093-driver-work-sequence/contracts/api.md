# Contracts: 093

The types live in `packages/shared-types/src/driver.ts` (driver), `delivery-admin.ts` / `fleet*.ts`
(fleet) and the new `run-stage.ts`. The Kotlin driver contract is regenerated with
`pnpm --filter @effy/shared-types driver-contract:gen`.

## The refusals (driver service): 409 problem

Each refusal is shaped like `round_not_open`: `type`, a one-sentence `detail`, and `issues[]` as field
issues.

| type | When | detail | issues |
|---|---|---|---|
| `stops_outstanding` | check-in with a shop unsettled | "Collect from {Shop} first." / "Collect from 2 shops first: A, B." | `stopId` × n |
| `run_not_loaded` | drop status, proof, failure on a `pending` drop | "Load the van first." | `runId` |
| `finish_collection_first` | load while holding collected parcels not checked in | "Check in the parcels you collected first." | `runId` of that collection run |
| `return_parcels_first` | load while holding parcels to return | "Return the parcels from your last run first." | `runId` |
| `finish_deliveries_first` | collect while drops are in transit | "Finish your deliveries first." | `runId` |

## Driver requests (changed)

```ts
interface CollectRequest {               // packages now REQUIRED, non-empty
  changeId: string;
  packages: Array<{ packageId: string; outcome: "picked_up" | "not_available"; note?: string | null; method?: HandoverMethod }>;
}
interface CollectResult { collected: number; notAvailable: number; remaining: number } // new `remaining`

interface DropStatusRequest { to: "en_route" | "arrived"; changeId: string }   // out_for_delivery removed

type MissingReason = "not_at_hub" | "damaged" | "wrong_temperature" | "other";
interface LoadRequest {
  changeId: string;
  packages?: PackageHandover[];
  /** 093 — packages not loaded. Every package on the run is either handed over or listed here. */
  notLoaded?: Array<{ packageId?: string; packageCode?: string; reason: MissingReason; note?: string | null }>;
}
interface LoadResponse { loaded: number; held: number; dropsRemoved: number }

interface HubCheckinRequest {
  runId: string; changeId: string; packages?: PackageHandover[];
  /** 093 — collected packages that are not in the van. */
  missing?: Array<{ packageId?: string; packageCode?: string }>;
}
interface HubCheckinResponse { /* unchanged */ held: number }

interface VehicleCheckRequest {          // POST /driver/v1/vehicle-check
  changeId: string;
  answers: Record<VehicleCheckItem, { answer: "ok" | "minor" | "unsafe"; note?: string | null }>;
}
type VehicleCheckItem = "tyres" | "lights" | "brakes" | "mirrors" | "cold_storage" | "body";
interface VehicleCheckResponse { state: "ok" | "unsafe" }
```

## Driver reads (added fields)

- `MeDTO.vehicleCheck: { state: "due" | "ok" | "unsafe" | "none"; vehicleLabel: string | null }`. `none`
  means no vehicle is held.
- `TodayDTO.stage: RunStage | null`, `stageLabel: string | null`. `TodayDTO.loadStep: { runId; packageCount; dropCount } | null`
  is set when the current run is a delivery run that is open and unloaded. `active` is then null, and the
  app shows "Load the van".
- `CollectionRunDTO` and `DeliveryRunDTO`: `stage`, `stageLabel`. `DeliveryDropDTO.loaded: boolean`.
- `DeliveryDropSummary.packageCount` reflects removed rows (no change in shape).

## Fleet (staff gateway)

```text
POST /fleet/v1/dispatch/rounds/{id}/waive-sequence   { reason }            → 200 { message }
POST /fleet/v1/held-packages/{holdId}/resolve        { resolution: "found"|"lost" } → 200 { message }
POST /fleet/v1/vehicle-checks/{checkId}/clear        { note }              → 200 { message }
```

Each one audits (`fleet/src/shared/audit.ts`), announces `dispatch`, and on waive and clear also
announces `work` to the driver.

`GET /fleet/v1/exceptions` gains:
```ts
held: HeldPackageDTO[]          // open holds: holdId, orderNumber, shopName, driverName, roundId, step, reason, note, createdAt
overdue: OverdueRunDTO[]        // roundId, kind, driverName, stage, since (ISO), minutes
vehicleChecks: VehicleCheckDTO[]// today's checks with minor or unsafe answers: checkId, driverName, vehicleLabel, answers, unsafe, clearedAt
```

The `GET /fleet/v1/dispatch/day` rounds and `GET /fleet/v1/dispatch/rounds/{id}` gain `stage`, `stageLabel`,
`outOfOrder: boolean` and `waiver: { reason, staffName, at } | null`.

`DeliveryDaysDTO` gains `loadOverdueMin` and `checkinOverdueMin` (optional on PUT, kept when absent).
