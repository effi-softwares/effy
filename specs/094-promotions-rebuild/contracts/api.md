# API Contracts: Promotions Rebuilt (094)

DTOs live in `packages/shared-types/src/promotion.ts` (rewritten) and are mirrored for the customer app
in its Kotlin wire types. Money is a decimal string. Every list is paged `{ items, total, page, pageSize }`
unless stated.

## Shared shapes

```ts
type PromotionKind = "cart" | "item" | "bxgy" | "delivery";
type PromotionTrigger = "automatic" | "code";
type PromotionState = "draft" | "scheduled" | "active" | "paused" | "used_up" | "out_of_budget" | "ended" | "archived";
type PromotionAudience = "everyone" | "first_order" | "new_customers" | "chosen";

/** What a shopper is shown — the same on both read routes, both clients. */
interface ShopperPromotionDTO {
  id: string;
  kind: PromotionKind;
  headline: string;
  supportingLine: string | null;
  label: string | null;
  /** The shared code, or null (automatic, or single-use codes only). */
  code: string | null;
  /** Composed server-side, one composer: "On orders over $30.00 · Effy delivery only · Weekdays 11am–2pm". */
  terms: string | null;
  /** "Ends in 3 days" / "Ends tomorrow" / null. */
  endsIn: string | null;
  /** Where a tap goes: the products it covers, the offers page, or the promotion itself. */
  target: BannerTarget;
}

interface PromotionGroupDTO { key: string; promotions: ShopperPromotionDTO[] }
```

## Customer-facing (shared gateway)

| Method & path | Service | Auth | Notes |
|---|---|---|---|
| `GET /storefront/v1/promotion-groups?keys=a,b` | storefront | public | → `{ groups: PromotionGroupDTO[] }` in the order asked. Everyone-audience, Active, applicable now or later today. `Cache-Control` listing tier (60 s). Unknown key → `{ key, promotions: [] }`. |
| `GET /commerce/v1/promotion-groups?keys=a,b` | commerce | customer | Same shape, personal: adds first-order / new / chosen promotions the shopper qualifies for; drops ones over their per-customer cap. Not cached. |
| `GET /storefront/v1/promotions/{id}` | storefront | public | Kept. Returns `PromotionDTO` from the new tables; 404 unless Active and everyone-audience. |
| `GET /storefront/v1/home` | storefront | public | `banners` kept `@deprecated — compatibility (094)`, built from `home-hero` (placement `carousel`) and `home-between` (`inline`). |
| `POST /commerce/v1/cart/promo` `{ code }` | commerce | customer | Kept. Refusal reasons extended: `promo_unknown`, `promo_not_started`, `promo_ended`, `promo_used_up`, `promo_out_of_budget`, `promo_already_used`, `promo_below_minimum`, `promo_wrong_delivery`, `promo_not_eligible`, `promo_sign_in`, `promo_code_used` (single-use). |
| `DELETE /commerce/v1/cart/promo` | commerce | customer | Kept. |

### Cart DTO additions

```ts
interface CartPromotionLineDTO {
  promotionId: string;
  headline: string;            // or the internal name's shopper fallback "Promotion"
  code: string | null;
  goodsAmount: string;         // what it took off goods
  deliveryAmount: string;      // what it took off delivery (only known once a quote exists)
}
interface CartNotAppliedDTO { promotionId: string; headline: string; reason: "not_combined" | "below_minimum" | "below_quantity" | "wrong_time" | "wrong_delivery" | "sign_in"; detail: string }

CartDTO.promotions: CartPromotionLineDTO[]       // NEW
CartDTO.promotionsNotApplied: CartNotAppliedDTO[] // NEW
CartDTO.lines[].discountAmount: string            // NEW, per line
CartDTO.discount: CartDiscountDTO | null          // KEPT (compat): the entered code's line, as today
CartDTO.totals.discountAmount                     // KEPT: goods discount total
```

### Payment intent

`POST /commerce/v1/checkout/intent` gains optional `expectedDiscount: string` (goods + delivery promotion
total shown). Mismatch → **409 `promotions_changed`** `{ cart }`, nothing written (R6). The response adds
`deliveryDiscount`. Holds uses (R5).

### Orders and receipts

Customer order DTO adds `promotions: { headline, code, goodsAmount, deliveryAmount }[]` and per-line
`discountAmount`; `discountAmount` / `promoCode` kept. Old orders: one synthesised entry from
`order.promo_code` / `discount_amount`.

### Products

`StorefrontProductCardDTO.offer?: { promotionId: string; label: string }` and the same on the product
detail DTO (R11). `label` is composed server-side: "15% off", "Buy 2 get 1 free", "$2 off".

## Back-office (staff gateway, `admin` service)

All reads: any active staff. All writes: manager or admin. Every write audits and announces ops `promotions`.

| Method & path | Body / query | Result |
|---|---|---|
| `GET /admin/v1/promotions` | `q, state, kind, trigger, groupId, page, pageSize` | `{ items: AdminPromotionListItemDTO[], counts: Record<PromotionState, number>, total, page, pageSize }` |
| `POST /admin/v1/promotions` | `AdminPromotionWriteDTO` | `AdminPromotionDTO` (draft unless `publish: true`) |
| `GET /admin/v1/promotions/{id}` | | `AdminPromotionDTO` (incl. targets, groups, codes summary, `used`) |
| `PATCH /admin/v1/promotions/{id}` | partial `AdminPromotionWriteDTO` + `expectedUpdatedAt` | 409 `promotion_used` for frozen fields; 409 `stale` |
| `POST /admin/v1/promotions/{id}/actions` | `{ action: "publish" \| "pause" \| "resume" \| "end" \| "archive" }` | `AdminPromotionDTO` |
| `DELETE /admin/v1/promotions/{id}` | | 204; 409 `promotion_used` |
| `GET /admin/v1/promotions/{id}/audit` | | `AuditEntryDTO[]` |
| `GET /admin/v1/promotions/{id}/performance` | | `{ lifetime, last7, last30: { uses, customers, discount, orders, sales } , budgetLeft }` |
| `POST /admin/v1/promotions/{id}/codes` | `{ count, prefix? }` | `{ batchId, created }` |
| `GET /admin/v1/promotions/{id}/codes` | `state, page` | paged `{ code, state: "unused" \| "held" \| "used", orderId? }` |
| `GET /admin/v1/promotions/{id}/codes/export` | | `text/csv` |
| `GET /admin/v1/promotions/{id}/customers` | `page` | paged `{ customerId, name, email }` |
| `POST /admin/v1/promotions/{id}/customers` | `{ customerIds?: string[], emails?: string[] }` | `{ added, unknownEmails }` |
| `DELETE /admin/v1/promotions/{id}/customers/{customerId}` | | 204 |
| `GET /admin/v1/promotion-groups` | | `{ key, name, description, sort, count }[]` |
| `POST /admin/v1/promotion-groups` | `{ key, name, description? }` | group; 409 `key_taken` |
| `PATCH /admin/v1/promotion-groups/{id}` | `{ name?, description?, sort? }` | group (key immutable) |
| `DELETE /admin/v1/promotion-groups/{id}` | | 204 (members removed, promotions untouched) |
| `PUT /admin/v1/promotion-groups/{id}/members` | `{ promotionIds: string[] }` (order = position) | members; 422 `headline_required` |
| `GET /admin/v1/promotion-groups/{id}/preview` | | `{ shown: ShopperPromotionDTO[], hidden: { promotionId, name, why: PromotionState \| "personal" }[] }` |
| `GET/PUT /admin/v1/order-policy` | | unchanged |

Removed: `POST /admin/v1/promotions/{id}/banner-image/presign`, `POST /admin/v1/promotions/{id}/status`
(replaced by `/actions`).

```ts
interface AdminPromotionWriteDTO {
  name: string; kind: PromotionKind; trigger: PromotionTrigger;
  valueType: "percent" | "amount" | "free"; percentOff?: number; amountOff?: string; maxDiscount?: string | null;
  bxgy?: { buy: number; get: number; maxPerOrder?: number | null };
  appliesTo?: "cart" | "products" | "categories" | "brands";
  targets?: { productIds?: string[]; categoryIds?: string[]; brands?: string[] };
  deliveryTypes: ("effy" | "courier")[];
  audience: PromotionAudience;
  minSubtotal: string; minQuantity?: number | null;
  startsAt?: string | null; endsAt?: string | null;
  daysOfWeek?: number[] | null; timeFrom?: string | null; timeTo?: string | null;
  maxUses?: number | null; maxUsesPerCustomer?: number | null; budget?: string | null;
  combinable: boolean;
  sharedCode?: string | null;   // trigger=code with one shared code
  headline?: string | null; supportingLine?: string | null; label?: string | null;
  groupIds?: string[];
  publish?: boolean;
}
```
