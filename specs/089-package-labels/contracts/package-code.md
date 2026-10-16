# Contract: package codes and labels (089)

## `@effy/shared-types` — `package-code.ts`

```ts
export const PACKAGE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PACKAGE_TOKEN_PREFIX = "EFY1:";
export function packageToken(code: string): string;          // "EFY1:7K3Q9M"
export function parsePackageToken(read: string): string | null; // the code, or null for anything else
```

## Shop — `GET /shop/v1/orders/{id}` (existing; additive)

`ShopOrderDetailDTO.label`:

```ts
label: {
  packageCode: string;      // "7K3Q9M"
  position: WireInt;        // 2
  packageCount: WireInt;    // 3   → "package 2 of 3"
  suburb: string | null;    // "Richmond"
  cold: "frozen" | "chilled" | null;
}
```

⚠ No window, day, estimate, customer name, street or price is added. Who delivers is the existing
`deliveredBy` ("Effy driver" → **EFFY**, "Courier" → **COURIER** on the label).

## Back-office — `GET /orders/v1/admin/orders/{id}` (existing; additive)

`AdminOrderPackageDTO.packageCode: string`.

## Driver (existing reads; additive, optional on the wire)

| Read | Field |
|---|---|
| `GET /driver/v1/collection/runs/{runId}` | each stop: `packageCodes?: string[]` |
| `GET /driver/v1/collection/runs/{runId}/stops/{stopId}` | each package: `packageCode?: string` |
| `GET /driver/v1/delivery/runs/{runId}` | each drop: `packageCodes?: string[]` |
| `GET /driver/v1/delivery/drops/{dropId}` | each package (`DropPackageRef`): `packageCode?: string` |

`contract-driver/DriverDto.kt` regenerated; fields default to null.
