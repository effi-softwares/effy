# Contract: Today, Insights, Team activity, Pick lists (edge-shop, cold path)

Four new routes on `apis/edge-api/shop`, attached to the shared HTTP API behind the **shop** JWT
authorizer (004 A3). DTOs live in **`packages/shared-types/src/shop-insights.ts`** (Principle II);
shop-web imports them, nothing redefines them. Money is a 2-dp decimal **string** (platform rule).
Counts are `WireInt`. Instants are ISO-8601 UTC strings.

Every route: scope comes from `gate()` (active operator at an active shop); **no request carries a
shop id**; refusals are RFC 9457 problems as elsewhere on the service; the response carries an `ETag`
and `Cache-Control: private, no-cache`, and honours `If-None-Match` with `304`.

---

## `GET /shop/v1/today`

The live operational snapshot (research R8, R12; data-model §4.1). Any shop role.

```ts
export interface ShopTodayDTO {
  now: string                 // server clock — the client formats the subtitle from this, not its own
  timezone: string            // IANA, e.g. "Australia/Melbourne"
  backlog: {
    awaitingPick: {
      orders: WireInt         // ⚠ THE value behind FR-006 — every awaiting-pick figure renders from it
      units: WireInt
      oldestPaidAt: string | null
    }
    readyForPickup: WireInt
    lowStock: { skus: WireInt; outOfStock: WireInt }
  }
  attention: ShopAttentionItemDTO[]   // ≤ 8, ordered per research R12
  attentionMore: WireInt              // items beyond the 8 shown
  oldestWaitingAt: string | null      // "Oldest item waiting {age}"
  live: ShopLiveOrderDTO[]            // ≤ 5, newest paid first
}

export type ShopAttentionItemDTO =
  | { kind: "awaiting_pick"; orders: WireInt; units: WireInt; since: string }
  | { kind: "out_of_stock"; productId: string; name: string; soldLast7Days: WireInt; since: string }
  | { kind: "low_stock"; productId: string; name: string; onHand: WireInt;
      daysOfCover: WireInt | null; since: string }
  | { kind: "refund_proposed"; fulfillmentId: string; orderNumber: string; amount: string;
      since: string }                // present ONLY for shop_manager — filtered server-side

export interface ShopLiveOrderDTO {
  fulfillmentId: string       // the id the row opens — never another order's
  orderNumber: string
  customerName: string        // the delivery recipient's name, as the Orders list shows it
  paidAt: string
  itemCount: WireInt          // units on THIS shop's lines
  deliveryMethod: "same_day" | "standard" | null
  total: string               // the order total — the same figure the Orders list shows (057 A3)
}
```

Copy is the client's: the server sends kinds and numbers, the client renders "3 orders awaiting pick" /
"11 units to pack · oldest 3 h 12 m" etc. (Part A verbatim).

---

## `GET /shop/v1/insights?range=today|7d|30d`

Figures from rollups only (FR-026). Any shop role.

```ts
export type InsightsRange = "today" | "7d" | "30d"
export type ComparisonBasis = "same_weekday_last_week" | "previous_7_days" | "previous_30_days"

export interface InsightsFigureDTO {
  value: string               // money as decimal string; counts as integer string
  previous: string | null
  change: { kind: "pct" | "abs" | "none"; amount: string | null }   // server-computed (FR-024)
}

export interface ShopInsightsDTO {
  range: InsightsRange
  timezone: string
  window: { from: string; to: string }           // [from, to) — for the subtitle
  comparison: { basis: ComparisonBasis; from: string; to: string } // basis "same_weekday_last_week"
                                                                   // is "up to the same local time"
  computedAt: string                             // "updated a moment ago"
  currency: "AUD"
  primary: {
    revenue: InsightsFigureDTO
    orders: InsightsFigureDTO & { perDay: string | null; lastHour: WireInt | null }
    averageOrderValue: InsightsFigureDTO
    // ⚠ Awaiting pick / Unfulfilled units are NOT here — the client reads them from ShopTodayDTO so
    //    they cannot differ from Today (FR-006, FR-017).
  }
  secondary: {
    refunds: InsightsFigureDTO & { orders: WireInt }
    cantSupply: InsightsFigureDTO & { units: WireInt }
    cancelled: InsightsFigureDTO
    // Low stock SKUs and Ready for pickup are live values from ShopTodayDTO.
  }
  series: {
    grain: "hour" | "day" | "week"
    buckets: Array<{
      start: string            // bucket start instant
      label: string            // "14", "Mon 8", "W35" — mono axis label
      partial: boolean         // a week cut by the window edge
      revenue: string
      orders: WireInt
    }>
    revenueTotal: InsightsFigureDTO
    ordersTotal: InsightsFigureDTO
  }
  topProducts: Array<{
    productId: string
    name: string
    sku: string | null
    thumbnailUrl: string | null   // presigned, short-lived (the catalog's existing media rule)
    units: WireInt
    revenue: string
    share: number                 // 0..1 of the top row — a bar width, not a figure
  }>
}
```

`400` with `errors.range` for any other `range`.

---

## `GET /shop/v1/team-activity`

Newest 50 from the last 14 days (research R14). Any shop role.

```ts
export interface TeamActivityEntryDTO {
  id: string                  // stable per source row, for React keys
  at: string
  actor: { kind: "staff"; name: string } | { kind: "former_staff" } | { kind: "effy" }
  action:
    | { kind: "state_changed"; orderNumber: string; to: string }
    | { kind: "item_gathered" | "item_unavailable" | "item_restored";
        orderNumber: string; productName: string; quantity: WireInt }
    | { kind: "note_added" | "tags_changed"; orderNumber: string }
    | { kind: "stock_changed"; productName: string; reason: string; delta: WireInt }
    | { kind: "refund_issued"; orderNumber: string; amount: string }
  tone: "done" | "problem" | "neutral"   // → dot marker; never text colour
}
export interface ShopTeamActivityDTO { entries: TeamActivityEntryDTO[] }
```

⚠ No back-office staff name ever crosses (`actor.kind = "effy"`).

---

## `GET /shop/v1/pick-lists`

Pick-list data for every awaiting-pick portion, oldest first, ≤ 100 (research R13). Any shop role.

```ts
export interface ShopPickListsDTO {
  lists: Array<{
    fulfillmentId: string
    orderNumber: string
    customerName: string
    paidAt: string
    deliveryMethod: "same_day" | "standard" | null
    lines: Array<{ name: string; sku: string | null; quantity: WireInt }>
  }>
  more: WireInt               // portions beyond the 100 returned
}
```

No money (a pick list is a warehouse document — 020's rule for the pick contract).

---

## Refusals

| Status | When |
|---|---|
| `401` | No/invalid shop token (gateway authorizer) |
| `403` | Gate refused — inactive operator, no shop, inactive shop. Uniform; never says which term failed (007) |
| `400` | Invalid `range` |
| `304` | `If-None-Match` matches |
