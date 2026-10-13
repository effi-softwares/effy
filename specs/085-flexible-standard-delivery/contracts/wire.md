# Contracts: Flexible Standard Delivery (085)

Every change is **additive**. A client that ignores the new fields behaves exactly as before 085.
Types live in `packages/shared-types`; nothing here is redefined per surface.

## 1. Quote — `POST /api/checkout/quote` → `commerce` (shared gateway, existing route)

`DeliveryQuoteDTO.effyWindows` gains:

```ts
interface EffyDayDTO {
  // …existing: date, section, windows, closedReason
  /**
   * 085 — this day sold with NO time: the "Any time" window, when it is open on this day.
   * ⚠ Always null for today (`section: "same_day"`), and never also present in `windows`.
   * Its `surchargeAmount` is always "0.00".
   */
  anyTime?: EffyWindowDTO | null;
}

interface EffyWindowsDTO {
  // …existing: days, unavailable
  /**
   * 085 — "as soon as possible": offered when the Any time window is open on some day in the calendar
   * (today included). Carries no day — the customer is not told one.
   */
  asap?: { estimate: string; fee: DeliveryFeeDTO } | null;
}
```

`unavailable` is unchanged in meaning except that a calendar with an open Any-time window is **not**
unavailable, even when every timed window is taken.

## 2. Intent — `POST /api/checkout/intent` → `commerce` (existing route)

```ts
interface CreateCheckoutIntentRequest {
  // …existing
  deliveryWindow?: { slotId: string; date: string } | null; // a window — OR a day's `anyTime` slot
  /** 085 — sent ALONE (no deliveryWindow) for "as soon as possible". */
  deliveryPromise?: "asap";
}
```

| The client sends | The order is |
|---|---|
| `deliveryWindow` naming a timed window | `delivery_promise = 'window'` (as today) |
| `deliveryWindow` naming a later day's `anyTime` slot | `delivery_promise = 'day'` |
| `deliveryPromise: "asap"`, no `deliveryWindow` | `delivery_promise = 'asap'`; the server binds the first open Any-time day |
| both, or neither | 409 `slot_required` |

Refusals reuse the existing codes, each with a fresh `quote`, nothing written, nothing substituted:

- `slot_unavailable` — the window or day chosen has filled or closed; also the Any-time slot named for
  **today** without `asap`; also `asap` when no Any-time day is open any more.
- `date_unavailable`, `no_windows_available`, `delivery_fee_changed`, `delivery_type_changed` — unchanged.

## 3. Customer order — `OrderDeliveryDTO` (existing routes)

```ts
interface OrderDeliveryDTO {
  // …existing
  /** 085 — what was sold. Absent on orders from before 085: read as "window". */
  promise?: "window" | "day" | "asap";
  /** Present exactly when `promise === "asap"`. */
  asapEstimate?: string;
}
```

⚠ For `promise: "asap"` the customer DTO carries **no day and no window**: `arrivalEstimates` is empty,
as it is for a courier order. The planned day is staff's and drivers' business.

## 4. Words — one home, one fixture

`DELIVERY_WINDOW_WORDS` gains (drafts — the operator may edit before build; the fixtures pin whatever
is chosen):

| Key | Draft |
|---|---|
| `anyTimeDay` | "Any time during the day" |
| `timeOptionOpen` | "Need a specific time?" |
| `timeOptionHint` | "Optional. Pick a window and we'll deliver in it." |
| `timeRequired` | "Choose a time for this day." *(the day has no untimed room left, but a window does)* |
| `asapTitle` | "No particular day" |
| `asapHint` | "We'll deliver as soon as we can." |
| `asapEstimatePrefix` | "As soon as possible —" |

`effyWindowsView` returns, per later day, `anyTime: { slotId, date } | null`, and `asap: { title, hint,
estimate } | null`. `deliverySummary` gains the `day` and `asap` forms. Kotlin twins
(`EffyWindowsView.kt`, the delivery-type twin) are held to `effy-windows.fixtures.json` and
`delivery-type.fixtures.json`, which gain cases: *any-time open*, *any-time full but windows open*,
*asap offered*, *asap with today open*, *no any-time window defined (renders as before 085)*.

## 5. Back-office — staff gateway

| Route | Service | Change |
|---|---|---|
| `/fleet/v1/delivery-slots`, `/fleet/v1/delivery-slots/{slotId}` (existing) | `fleet` | `anyTime` on a slot, READ ONLY — no request sets it. Switching the Any time window off → 409 naming `status`; its hours and limit are edited like any window's. |
| `/fleet/v1/delivery-days` settings (existing) | `fleet` | `asapEstimate: string` (1–80 chars). Absent in a PUT keeps it; empty or null → 422. |
| Pricing plans (existing) | `admin` | A surcharge on the Any time window → 422 ("the Any time window takes no surcharge"); the editor does not list it. |
| Orders list/detail (existing) | `orders` | `promise` on each Effy order; `?promise=window\|day\|asap`; detail adds `asapEstimate`. |
| `GET /orders/v1/orders/{orderId}/delivery-move?to=effy` (existing) | `orders` | Lists windows for an order Effy ALREADY delivers too (still `allowed: false`, `already_effy`); each day's Any time window is listed first with `anyTime: true`. |
| **`POST /orders/v1/orders/{orderId}/delivery-window`** (new) | `orders` | Body `{ window: { slotId, date }, reason, expectedUpdatedAt }` → `{ orderId, promise }`. Through `changeEffyWindow`. 409 `window_unavailable` \| `changed` \| `out_for_delivery` \| `handed_over` \| `delivered` \| `already_courier`. admin/manager. |

One new integration on the staff gateway; none on the shared gateway.

## 6. Driver and dispatch — a label, written by the server

| Payload | Change |
|---|---|
| Driver hub check-in `effyGroups[]` | `label` is "Sat 10 Oct · Any time"; optional `anyTime: true` |
| Driver stops and drops (`window`) | "Any time · 12 pm – 9 pm" — the round's hours, so the driver knows the end |
| Driver parcels (`windowLabel`) | "Sat 10 Oct · Any time" |
| Dispatch windows list (`fleet`) | `label` "Sat 10 Oct · Any time (12 pm – 9 pm)"; optional `anyTime: true` |

Installed driver apps print these strings as given — no app update is needed. Compatibility fields
(`kind: "same_day_delivery"`, `sameDayCount`, `standardCount`, shop `deliveryMethod`) are untouched.

## 7. Live updates and telemetry

- No new update kind: these orders announce `orders` / `slots` through the existing functions.
  `changeEffyWindow` calls `announceOrder` after commit (`change-map.guard.test.ts`).
- `checkout_window_selected` gains `promise: "window" | "day" | "asap"`; `section` stays as is
  (`standard` for both new choices). No PII.
