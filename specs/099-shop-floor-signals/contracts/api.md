# Contracts: Shop Floor Signals (099)

All types live in `@effy/shared-types` (`shop-insights.ts`, `shop-order-console.ts`, a new
`shop-availability.ts`). Every new field is **required** unless it is genuinely absent in some state
(CLAUDE.md "No compatibility fields"). Every route is on the **shared** gateway, shop authorizer, both
shop roles.

## Shared types

```ts
export type CollectionDriver = "none" | "assigned" | "on_the_way" | "collected"

export interface ShopCollectionRunDTO {
  runAt: string            // ISO instant
  dayOffset: WireInt       // 0 today, 1 tomorrow… in the shop's timezone
  driver: CollectionDriver
  opensAt: string | null   // null when driver = "none"
  driverOnDuty: boolean
}

export interface ShopNextCollectionDTO extends ShopCollectionRunDTO {
  due: { ready: WireInt; picking: WireInt }
}

/** An Effy-driver portion still at the shop. Courier portions use `courierPickup`, never this. */
export interface ShopOrderCollectionDTO {
  runAt: string
  driver: CollectionDriver
}

export type StorageClass = "ambient" | "chilled" | "frozen"
export const STORAGE_CLASS_WORDS: Record<StorageClass, string> // Ambient · Chilled · Frozen
```

## `GET /shop/v1/today` - `ShopTodayDTO` gains

```ts
nextCollection: ShopNextCollectionDTO | null   // null: no active collection runs
live: (ShopLiveOrderDTO & { collection?: ShopOrderCollectionDTO })[]
```

## `GET /shop/v1/orders` - `ShopOrderRowDTO` gains

```ts
collection?: ShopOrderCollectionDTO   // present only for an Effy-driver portion still at the shop
```

## `GET /shop/v1/orders/{id}` - `ShopOrderDetailDTO` gains

```ts
collection?: ShopOrderCollectionDTO
lines: (ShopOrderLineDTO & { storageClass: StorageClass })[]
```

## `GET /shop/v1/pick-lists` - each line gains `storageClass: StorageClass`

## `GET /shop/v1/availability` (new)

Query: `q?` (≤ 100 chars) · `filter?` = `needs_look` | `out_of_stock` | `low_stock` | `off_sale` | `all` (default) · `after?`
(opaque cursor) · `limit?` (1–100, default 50).

```ts
export interface ShopAvailabilityRowDTO {
  productId: string
  productName: string
  brand: string | null
  productStatus: "active" | "unavailable"
  variantId: string
  label: string | null
  code: string
  sku: string | null
  gtin: string | null
  onSale: boolean
  lastOnSale: boolean
  stock: ProductStockDTO      // the existing shape
  imageUrl: string | null
}
export interface ShopAvailabilityDTO {
  items: ShopAvailabilityRowDTO[]
  next: string | null
  counts: { needsLook: WireInt; outOfStock: WireInt; lowStock: WireInt; offSale: WireInt; all: WireInt }
}
```

Errors: 400 bad query; 401/403 as every shop route. Read only - the switch is the existing
`POST /shop/v1/products/{id}/variants/{variantId}/state` (unchanged: 409 when it is the last size on
sale; announces `stock`).

## `GET /shop/v1/insights` - `ShopInsightsDTO` gains

```ts
quality: {
  foundRate: InsightsFigureDTO | null        // value "92.5" (percent, 1 dp); change kind "abs" (points)
  cantSupplyRate: InsightsFigureDTO | null   // as above
  averageTimeToReady: InsightsFigureDTO | null // value = whole seconds; change kind "pct"
}
```

`null` when the window has nothing to measure (the screen shows "-").

## Live announcements (no new kinds)

| When | To |
|---|---|
| A planner pass assigns or releases collection work | `shop/orders` for each affected shop |
| A driver goes on or off duty | `shop/orders` for the shops on their open collection rounds |
| (existing) a size goes on/off sale, stock changes | `shop/stock` |
