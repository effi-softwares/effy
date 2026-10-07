# Contracts: Simple Order Status & Driver Assignment in Orders (073)

## Shared

`packages/shared-types/src/package-status.ts`:

```ts
type PackageStatus = "preparing" | "ready" | "with_driver" | "at_hub" | "out_for_delivery"
                   | "with_carrier" | "delivered" | "problem" | "cancelled";
const STATUS_WORD: Record<PackageStatus, string>;   // "With driver", "At hub", …
interface PackageStatusView { status: PackageStatus; word: string; detail: string | null; driverName?: string | null }
```

## Status on existing reads

| Read | Adds |
|---|---|
| `GET /orders/v1/orders` | `status: PackageStatusView` (least advanced package), `drivers: { collect: string[]; deliver: string[] }`, `needsDriver: boolean`; filter `?needsDriver=true` |
| `GET /orders/v1/orders/{id}` | per package: `statusView`, `collect: Assignment \| null`, `deliver: Assignment \| null` |
| shop `/shop/v1/orders*`, `/shop/v1/fulfillments*` | per package: `statusView` **without** `driverName` |
| driver `/driver/v1/history*` | per package: `statusView` |

```ts
interface Assignment {
  assignmentId: string | null;      // the concurrency token; null = unassigned
  driver: { id: string; name: string } | null;
  opensAt: string | null; dueAt: string | null; roundId: string | null;
  how: string | null;               // "Auto-assigned — fewest packages today (2)" | "Assigned by Ann"
  unassignedReason: string | null;  // one line, when unassigned
  movable: boolean;                 // false once collected
}
```

## Manual actions (`fleet`, back-office pool, admin/manager)

### `GET /fleet/v1/dispatch/packages/{packageId}/drivers?stage=collection|delivery`

```ts
Array<{ driverId: string; name: string; packagesToday: number;
        fit: "fine" | "concern" | "cannot"; notes: string[] }>   // fine first, then concern, then cannot
```

### `POST /fleet/v1/dispatch/packages/{packageId}/assign`
Body `{ stage, driverId, expectedAssignmentId: string | null, acceptConcerns?: boolean }`.
200 `{ message: "Assigned to Ben" }`.

### `POST /fleet/v1/dispatch/packages/{packageId}/unassign`
Body `{ stage, expectedAssignmentId }`. 200 `{ message: "Unassigned — auto-assign will pick it up within 5 minutes" }`.

Refusals — always one line in `detail`:

| Status | `type` | When |
|---|---|---|
| 422 | `cannot_take` | a "cannot" condition — `detail` names it |
| 409 | `needs_confirm` | only concerns, `acceptConcerns` absent — `detail` lists them |
| 409 | `changed` | the assignment changed since loaded |
| 409 | `collected` | "It's already in <driver>'s van" |

After commit: announce `dispatch` and `orders` to ops, `work` to both drivers.

## Removed

`POST /fleet/v1/dispatch/rounds/{id}/lock`, `DELETE …/lock`; `waves` from `GET /fleet/v1/dispatch/day`.

## Live

Hub check-in → shop `orders` for each shop on the round + ops `orders`, `dispatch`. Drop status /
failure → ops `orders`.
