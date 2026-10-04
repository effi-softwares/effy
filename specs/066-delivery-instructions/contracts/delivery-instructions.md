# Contract: Delivery Instructions

Source of truth: `packages/shared-types/src/`. Kotlin is generated and drift-guarded
(`contract:check`, `commerce-contract:check`, `driver-contract:check`).

No route is added, removed or renamed. Every addition is optional or nullable.

> **As built**: every new field is declared optional (`?:`) so a client tolerates a server that has
> not deployed yet; servers always send the key. Validation refusals are HTTP **400** on both paths
> (the status each already uses), not 422 as first drawn below. See SIGNOFF.md.

## New module `delivery-instructions.ts`

```ts
export type HandoverPreference = "leave_at_door" | "meet_at_door";
export const HANDOVER_PREFERENCES = ["leave_at_door", "meet_at_door"] as const;
export const DELIVERY_NOTE_MAX = 250; // Unicode code points

export interface DeliveryInstructionsDTO {
  handover: HandoverPreference | null;
  note: string | null;
}

/** Trim, strip control characters, collapse whitespace; "" → null; > max → { ok: false }. */
export function normaliseDeliveryInstructions(input: unknown):
  | { ok: true; value: DeliveryInstructionsDTO }
  | { ok: false; field: "handover" | "note"; reason: "invalid" | "too_long" };
```

## Hot path (`core-api`)

### `POST /v1/checkout/intent`

`CreateCheckoutIntentRequest` gains:

```ts
deliveryInstructions?: DeliveryInstructionsDTO | null;
```

- Absent or `null` → the order has none.
- Refused with `422` and a field error on `deliveryInstructions.note` (`too_long`) or
  `deliveryInstructions.handover` (`invalid`). The response never echoes the value.
- Normalised server-side; what is stored is what is later returned.

### Order receipt and order detail reads (customer)

The order DTO in `order.ts` gains:

```ts
deliveryInstructions: DeliveryInstructionsDTO | null; // null when none were given
```

## Cold path — customer (`/customer/v1/addresses`)

`AddressDTO` gains `defaultDeliveryInstructions: DeliveryInstructionsDTO | null`.

`CreateAddressRequest` and `UpdateAddressRequest` gain
`defaultDeliveryInstructions?: DeliveryInstructionsDTO | null`.

- On update: key **absent** → unchanged; key present with `null` → cleared; present with a value →
  replaced.
- Same validation and the same `422` shape as the intent.

## Cold path — back-office (`/admin/.../orders/{id}`)

The order detail DTO in `order-admin.ts` gains
`deliveryInstructions: DeliveryInstructionsDTO | null`. Read access is unchanged (any active staff,
including `csa`).

## Cold path — driver (`GET /driver/v1/delivery/drops/{dropId}`)

`DeliveryDropDTO`:

```ts
instructions: string | null;        // EXISTING — now the customer's note, verbatim (was always null)
handover: HandoverPreference | null; // NEW
```

Driver-scoped as today; another driver's drop is refused identically to a nonexistent one.

## Prohibitions (guard tests)

- No file under `apis/edge-api/shop/src` or `apis/edge-api/notifications/src` contains
  `delivery_note` or `delivery_handover`.
- No analytics event type carries a string property sourced from the note.
- No client renders the note through an HTML-interpreting path.

## Cross-language fixture

`packages/shared-types/src/delivery-instructions.fixtures.json` — cases of input → normalised
output or refusal (blank, 250, 251, emoji at the boundary, control characters, mixed whitespace,
unknown handover). Read by the TypeScript unit test and by the Go test in
`internal/platform/deliveryinstructions`. A case that passes in one and fails in the other is the
defect this file exists to catch.
