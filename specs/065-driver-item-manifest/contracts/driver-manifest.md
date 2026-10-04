# Contract: Driver Manifest

Source of truth: `packages/shared-types/src/driver.ts`. Kotlin is generated
(`pnpm --filter @effy/shared-types driver-contract:gen`) and guarded by `driver-contract:check`.

No route is added, removed or renamed. Three existing reads gain fields. All integers are `WireInt`
(027 R13: a bare `number` generates `Double`).

## New types

```ts
export type TemperatureClass = "frozen" | "chilled" | "normal" | "not_recorded";

export interface ClassSummary {
  frozen: WireInt;
  chilled: WireInt;
  normal: WireInt;
  notRecorded: WireInt;
}
```

## Changed: `ManifestLine`

```ts
export interface ManifestLine {
  name: string;
  qty: WireInt;            // quantity IN THE BAG (was: quantity ordered)
  orderedQty: WireInt;     // NEW
  included: boolean;       // NEW — false when the shop supplied none
  temperatureClass: TemperatureClass; // NEW
}
```

## `GET /driver/v1/collection/runs/{runId}/stops/{stopId}`

`CollectionPackage` gains `summary: ClassSummary`.

⚠ **Behaviour change**: `items` now holds **that package's** lines only. Previously every package
at the stop carried every line at the stop (research R2).

## `GET /driver/v1/delivery/runs/{runId}`

`DeliveryDropSummary` gains `summary: ClassSummary` — the drop's total across its packages.

## `GET /driver/v1/delivery/drops/{dropId}`

```ts
export interface DropPackageRef {
  ref: string;             // the order number, unchanged
  fromShopCount: WireInt;  // unchanged; 1 for a per-package entry
  items: ManifestLine[];   // NEW
  summary: ClassSummary;   // NEW
}
```

`DeliveryDropDTO` gains `summary: ClassSummary`, and `packages` now has **one entry per package**
at the drop, in a stable order, instead of one synthetic entry for the whole drop. The app labels
them by position.

## Prohibitions (asserted by a guard test over both payloads)

- No key named or containing `price`, `amount`, `total`, `fee`, `discount`.
- On the drop payload: no `shopId`, `shopName`, `shopCode`, or any shop address field.
- Refusals for "not your round" and "no such round" stay byte-identical (existing FR-038 of 063).

## Compatibility

All additions are additive. `historyDetail` continues to return `packages: []`.
