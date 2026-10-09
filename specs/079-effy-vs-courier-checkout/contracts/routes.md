# Contracts: Delivered by Effy vs Courier Delivery (079)

**No route is added or removed on either gateway** (shared 158, staff 146 of 300). Existing routes
change shape, additively. Types live once in `@effy/shared-types` and are regenerated into the Kotlin
contracts.

| Route | Service · gateway | Change |
|---|---|---|
| `POST /commerce/v1/checkout/quote` | commerce · shared | response gains `courier` |
| `POST /commerce/v1/checkout/intent` | commerce · shared | request gains `deliveryType`; new refusal `delivery_type_changed` |
| `GET /commerce/v1/orders`, `GET …/orders/{id}`, receipt | commerce · shared | gain `delivery` |
| `GET /storefront/v1/serviceability` | storefront · shared | may now answer `coverage: "courier"` |
| shop order list / detail / today / pick lists | shop · shared | gain `deliveredBy`; list gains `deliveredBy` filter |
| `GET /orders/v1/orders`, `GET …/orders/{orderId}` | orders · staff | gain `deliveryType` (+ filter); detail gains reason, estimate, history |
| `GET /admin/v1/delivery/coverage`, `PUT …/coverage/courier` | admin · staff | courier estimate + no-window fallback |

---

## 1. Words — `packages/shared-types/src/delivery-type.ts` (new)

```ts
export type DeliveryType = "effy" | "courier";
export type DeliveryTypeReason = "in_coverage" | "out_of_coverage" | "no_window" | "staff_change";

export const DELIVERY_TYPE_WORDS = {
  effy: "Delivered by Effy",                       // = COVERAGE_LABEL.effy
  courier: "Courier delivery",                     // = COVERAGE_LABEL.courier
  courierPartner: "Delivered by a courier partner.",
  courierEstimatePrefix: "Usually arrives in",     // + " {estimate}"
  courierEstimateSuffix: "— an estimate, not a guaranteed date.",
  noWindowsLeft: "There are no Effy delivery windows available in the next few days.",
  courierInsteadOfWindows: "We can send this order by courier instead.",
  sameDay: "Same-day delivery",                    // = DELIVERY_WINDOW_WORDS.sectionSameDay
  standard: "Standard delivery",                   // = DELIVERY_WINDOW_WORDS.sectionStandard
} as const;

/** What every customer surface prints for an order's delivery. */
export function deliverySummary(
  o: { delivery?: OrderDeliveryDTO | null; arrivalEstimates: readonly ArrivalEstimateDTO[] }, now: Date,
): { heading: string; lines: string[] };
```

| Order | `heading` | `lines` |
|---|---|---|
| courier | Courier delivery | two lines (`courierLines`): `Delivered by a courier partner.` · `Usually arrives in 2–4 business days — an estimate, not a guaranteed date.` |
| effy, window today | Delivered by Effy | `Same-day delivery · Today, 4 pm – 6 pm` |
| effy, later day | Delivered by Effy | `Standard delivery · Thu 9 Oct, 4 pm – 6 pm` |
| legacy (no `delivery`) | *(none)* | one line per distinct arrival, as today |

Kotlin twin `DeliveryTypeWords.kt` (customer-mobile), both pinned to `delivery-type.fixtures.json`.
Shop words — `DELIVERED_BY_WORDS = { effy_driver: "Effy driver", courier: "Courier" }` — also in
`delivery-type.ts`, twin `DeliveredByWords.kt` in shop-mobile, held by the same test.

*As built:* the receipt EMAIL keeps its own "Arriving / when · method" layout for an order Effy
delivers (its output is unchanged) and prints `courierLines` for a courier order; the website's receipt
panel keeps its short pill ("Same-day" / "Standard") for the same reason — nothing a customer already
sees changes on release.

## 2. Quote — `DeliveryQuoteDTO.courier` (`delivery.ts`)

```ts
/**
 * 079 — PRESENT exactly when `coverage === "courier"`. Then `packages`, `sameDaySlots`,
 * `standardDays` are empty and `effyWindows` is absent: there is nothing to choose.
 */
courier?: {
  /** The business's estimate text, e.g. "2–4 business days". Print through DELIVERY_TYPE_WORDS. */
  estimate: string;
  fee: DeliveryFeeDTO;                 // the courier fee for the order (077 lines + total)
  /** "no_window": an Effy address with no window left — show the no-windows sentence first. */
  reason: "out_of_coverage" | "no_window";
};
```

`serviced: true`, `coverage: "courier"`. `freeDeliveryRemainingAmount` is the courier table's own, or
null. ⚠ No distance, no courier name, no shop count. ⚠ While the model switch is off the server never
returns `coverage: "courier"` — here or from serviceability.

## 3. Intent — `CheckoutIntentRequestDTO.deliveryType` (`checkout.ts`)

```ts
/** 079 — the delivery type the client is SHOWING. Required for a courier order. */
deliveryType?: "effy" | "courier";
```

| Server's answer | Client sent | Result |
|---|---|---|
| courier | `"courier"` | order written: type courier, reason, estimate; no hold; `slotHeldUntil: null` |
| courier | absent or `"effy"` | `409 delivery_type_changed` + fresh `quote` — nothing written |
| effy | `"courier"` | `409 delivery_type_changed` + fresh `quote` — nothing written |
| effy | absent or `"effy"` | 078 rules (`deliveryWindow` required, etc.) |
| none | anything | `422 address_not_covered` (076), unchanged |

`DeliveryChoiceRefusalCode` gains `"delivery_type_changed"`. `shownDeliveryAmount` (077) still applies.
Response gains `deliveryType`.

## 4. Customer orders — `OrderDTO`, `OrderListItemDTO` (`order.ts`)

```ts
/** 079 — ABSENT on an order placed before the feature. */
delivery?: OrderDeliveryDTO;
export interface OrderDeliveryDTO { type: DeliveryType; courierEstimate: string | null }
```

⚠ For a courier order `arrivalEstimates` is `[]` (a client built before 079 then prints no arrival
rather than "Standard delivery"). Status words are unchanged (073).

## 5. Shop — `shop-order-console.ts`, `shop-insights.ts`, `shop-order.ts`

```ts
deliveredBy: "effy_driver" | "courier";          // every package, old or new
/** @deprecated 079 — the customer's word; shops are shown `deliveredBy`. Removed at the cutover. */
deliveryMethod: "same_day" | "standard" | null;
```

Order list query: `deliveredBy=any|effy_driver|courier` (the `method` filter stays, deprecated).
The queue contract the shop APP reads (`DeliveryPromiseDTO`, 020) gains an optional `deliveredBy`; its
`serviceLevel` — a constant "standard" the app used to print — is deprecated and no longer shown.
⚠ Still no window, day, estimate or delivery money (`delivery-isolation.contract.test.ts`).

## 6. Back-office orders — `order-admin.ts`

```ts
// list query
deliveryType?: "effy" | "courier" | "legacy";
// list row + detail
deliveryType: DeliveryType | null;               // null = placed before 079
// detail only
deliveryTypeReason: DeliveryTypeReason | null;
courierEstimate: string | null;
deliveryTypeHistory: { from: DeliveryType | null; to: DeliveryType; reason: DeliveryTypeReason;
                       actor: { kind: "checkout" } | { kind: "staff"; sub: string };
                       note: string | null; at: string }[];
// per package (replaces reading `method` + `window` to decide)
deliveredBy: DeliveryType;
```

Read: any active staff. No write in this feature.

## 7. Admin coverage — `delivery-admin.ts`

```ts
interface CourierReachDTO {
  offered: boolean;
  /** Text completing "Usually arrives in …"; null until set. */
  estimateText: string | null;
  whenNoWindows: boolean;
  /** Why `offered` cannot be switched on yet; empty when it can. */
  blockedBy: ("no_fee_table" | "no_estimate")[];
  /** True while offered but the new delivery model is not on yet — customers are not offered it. */
  pending: boolean;
  exclusions: CourierExclusionDTO[];
  /** @deprecated = blockedBy.length === 0 */ canBeOffered: boolean;
}
```

`PUT /admin/v1/delivery/coverage/courier` body: any of `{ offered, estimateText, whenNoWindows }`.
Refusals: `409 courier_plan_missing` (existing), `409 courier_estimate_missing`,
`422 invalid_estimate`, `409 courier_estimate_in_use` (clearing while offered). *As built:* there is no
route that deactivates a fee table — one is only ever replaced by activating another of its kind — so
no `courier_plan_in_use` refusal was needed.
`CoverageReason` gains `"courier_pending" | "courier_not_ready"`. Mutate = admin/manager; audited;
announces as the coverage routes do today.

## Live

No new kind. Placement and (E7) a type change announce through `announceOrder`; coverage settings
announce as 076's.
