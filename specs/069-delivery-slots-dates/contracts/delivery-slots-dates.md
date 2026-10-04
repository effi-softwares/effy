# Contract: Delivery Time Slots & Standard Delivery Date

The TypeScript in `packages/shared-types` is the source of truth. Kotlin is generated
(`contract/CommerceDto.kt`, `contract-driver/DriverDto.kt`); Go mirrors the customer shapes and is
pinned by `delivery_wire_contract_test.go`. All times are ISO-8601 instants carrying the
Australia/Melbourne offset; all days are `yyyy-mm-dd` Melbourne dates.

## 1. Customer — hot path (`core-api`)

### `POST /v1/checkout/quote` → `DeliveryQuoteDTO` (extended)

```ts
interface DeliveryQuoteDTO {
  postcode: string;
  serviced: boolean;
  /** Kept for old clients. Now the latest open slot's cutoff, or null. */
  sameDayAvailableUntil: string | null;
  packages: DeliveryPackageDTO[];        // unchanged: per-package options and fees
  expiresAt: string;

  /** 069 — open same-day slots for this order, earliest first. Empty when none. */
  sameDaySlots: DeliverySlotOptionDTO[];
  /** 069 — why same-day is not offered, when it is not. */
  sameDayUnavailableReason: "not_eligible" | "slots_closed" | null;
  /** 069 — standard delivery days, earliest first. Never empty when `serviced`. */
  standardDays: StandardDayOptionDTO[];
}

interface DeliverySlotOptionDTO {
  slotId: string;        // opaque; sent back on intent
  date: string;          // yyyy-mm-dd
  startAt: string;
  endAt: string;
  cutoffAt: string;      // lets the client grey a slot out without a round trip
}

interface StandardDayOptionDTO {
  date: string;          // yyyy-mm-dd
}
```

- A `same_day` option appears on a package only when `sameDaySlots` is non-empty.
- ⚠ No fee on a slot or a day. The fee is the method's, read from `packages[].options` (FR-021).
- ⚠ No capacity, no remaining count, no shop identity (FR-050).

### `POST /v1/checkout/intent` (extended)

```ts
interface CreateCheckoutIntentRequest {
  // …existing fields…
  deliveryMethod?: "same_day" | "standard";
  sameDaySlotId?: string;   // required if any package resolves same_day
  standardDate?: string;    // required if any package resolves standard; absent ⇒ earliest day
}

interface CreateCheckoutIntentResponse {
  // …existing fields…
  /** 069 — when the held place lapses. Absent when no package is same-day. */
  slotHeldUntil?: string;
}
```

Refusals — `409`, problem body with a `code` and, for the two `*_unavailable` codes, a fresh
`quote: DeliveryQuoteDTO` so the client can re-offer without a second request:

| `code` | When | Customer is told |
|---|---|---|
| `slot_required` | a package resolves same-day and no `sameDaySlotId` was sent | choose a delivery time |
| `slot_unavailable` | the slot is unknown, disabled, past cutoff, full, or not collectable in time | that time is no longer available |
| `date_unavailable` | `standardDate` is not among the days currently offered | that day is no longer available |

- No payment intent is created or updated on a refusal (FR-009, FR-019).
- ⚠ A refusal never substitutes a slot, a day or a method (FR-010).
- A client MUST re-run intent before confirming payment if `slotHeldUntil` has passed.

### Order / receipt read → `ArrivalEstimateDTO` (extended)

```ts
interface ArrivalEstimateDTO {
  method: "same_day" | "scheduled" | "standard";
  promisedFrom: string | null;   // now written: the delivery day
  promisedTo: string | null;     // equal to promisedFrom for orders placed from 069 on
  /** 069 — same-day only. Null for standard and for every earlier order. */
  windowStart: string | null;
  windowEnd: string | null;
}
```

Rendering rule, identical on web, mobile and the receipt email:

| Data | Text |
|---|---|
| window, date is today | "Today, 5 pm – 7 pm" |
| window, other date | "Thu 8 Oct, 5 pm – 7 pm" |
| no window, one date | "Thursday 8 October" (existing) |
| no dates | "We'll confirm your delivery date" (existing; every pre-069 order) |

## 2. Driver — cold path (`edge-api/driver`)

```ts
interface DeliveryDropDTO {
  // …existing fields…
  /** 069 — the window the customer was sold. Null for a pre-069 order. */
  deliveryWindow?: { startAt: string; endAt: string } | null;
}

interface DeliveryDropSummary {
  // …existing fields…
  window: string | null;                 // existed since 049, always null; now "5 pm – 7 pm"
  deliveryWindow?: { startAt: string; endAt: string } | null;
}
```

The round's stops (`StopDTO`) carry the same `deliveryWindow`, and each drop's `dueAt` is its
window's start (previously always null). Due and late are derived by the app from `deliveryWindow`
and the clock (R11). A late drop is completed through the unchanged proof routes (FR-034).

⚠ Named `deliveryWindow`, not `window`: `DeliveryDropSummary.window` already existed as a display
string, and one name for two shapes on sibling types is how a client reads the wrong one.

## 3. Back-office — `edge-api/fleet` (back-office authorizer)

| Route | Who | Body / result |
|---|---|---|
| `GET /fleet/v1/delivery-slots` | any active staff | `{ items: DeliverySlotDTO[] }` incl. today's `booked` |
| `POST /fleet/v1/delivery-slots` | admin | `DeliverySlotInput` → `DeliverySlotDTO` |
| `PATCH /fleet/v1/delivery-slots/{slotId}` | admin | partial `DeliverySlotInput` + `status` |
| `GET /fleet/v1/delivery-days` | any active staff | `DeliveryDaysDTO` |
| `PUT /fleet/v1/delivery-days` | admin | `DeliveryDaysInput` → `DeliveryDaysDTO` |
| `POST /fleet/v1/delivery-days/dates` | admin | `{ day, label? }` → `{ day, label, affectedOrders }` |
| `DELETE /fleet/v1/delivery-days/dates/{day}` | admin | `204` |

```ts
interface DeliverySlotDTO {
  id: string;
  startTime: string;     // "17:00"
  endTime: string;       // "19:00"
  cutoffTime: string;    // "15:00"
  capacity: number;
  status: "active" | "disabled";
  bookedToday: number;   // confirmed + live holds
  overCapacityToday: number;
  updatedAt: string;
}
type DeliverySlotInput = Pick<DeliverySlotDTO, "startTime" | "endTime" | "cutoffTime" | "capacity">;

interface DeliveryDaysDTO {
  lookaheadDays: number;
  noDeliveryWeekdays: number[];          // ISO 1–7
  carrierLeadDays: number;
  slotHoldMin: number;
  hubTurnaroundMin: number;
  dates: { day: string; label: string | null; affectedOrders: number }[];
}
```

Refusals (`422`, named field): end not after start; cutoff after start; capacity below 1;
duplicate window; all seven weekdays excluded; look-ahead outside 1–30. There is no delete route
for a slot.

## 4. Back-office — `edge-api/orders`

- `GET /orders/v1/orders/{orderId}` — each package gains `promisedDate`, `window`, `overCapacity`,
  `handoverDueOn`, `atRisk` and, once arrived, `onTime: boolean | null`.
- `POST /orders/v1/fulfillments/{id}/handoff` — unchanged request; response echoes `promisedDate`.
- **New** `GET /orders/v1/handovers?due=today|overdue|upcoming` — any active staff:

```ts
interface HandoverRowDTO {
  fulfillmentId: string;
  orderNumber: string;
  promisedDate: string;
  handoverDueOn: string;
  atRisk: boolean;
  atHub: boolean;          // checked in; false means it has not reached the hub yet
}
```

## 5. What must never appear

| Where | Never |
|---|---|
| Any customer DTO | capacity, bookings count, shop identity, `overCapacity` |
| Shop reads (`edge-api/shop`) | the window, the chosen day, the slot — a guard test names any file that selects them |
| Telemetry | an address, an order id beyond the auth subject, free text |
