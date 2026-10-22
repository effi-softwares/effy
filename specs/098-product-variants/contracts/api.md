# API Contract — 098 Product Variants

Wire types live in `@effy/shared-types` (Principle II); Kotlin DTOs are regenerated from them
(`gen-kotlin-commerce-contract.mjs`). Money is a 2-dp string, as everywhere. Only CHANGES are listed.

## Shared types (new)

```ts
// packages/shared-types/src/variants.ts
export type UnitBasis = "per_100g" | "per_kg" | "per_100ml" | "per_l" | "each";
export type PackUnit = "g" | "kg" | "ml" | "l" | "each";
export type VariantState = "active" | "inactive" | "removed";

export interface UnitPriceDTO { amount: string; basis: UnitBasis }      // R12 — server-computed

export interface OptionDTO { id: string; position: 1 | 2; name: string; values: OptionValueDTO[] }
export interface OptionValueDTO { id: string; value: string; position: number }

/** Shopper view of one variant. Inactive and removed variants are never sent to shoppers. */
export interface StorefrontVariantDTO {
  id: string;
  optionValueIds: [string | null, string | null];
  label: string | null;                       // "Spiced / 500 g"; null when the product has no options
  priceAmount: string;
  compareAtAmount: string | null;
  unitPrice: UnitPriceDTO | null;
  available: boolean;                          // purchasable now (R5)
  imageUrl: string | null; imageWidths?: number[];   // own picture, else null → product gallery
}

/** Shop/back-office view of one variant. */
export interface ShopVariantDTO {
  id: string; position: number; optionValueIds: [string | null, string | null]; label: string | null;
  sku: string | null; gtin: string | null;
  shopPriceAmount: string; shopCompareAtAmount: string | null;
  customerPriceAmount: string | null; customerCompareAtAmount: string | null;   // null until approved
  weightGrams: number; weightIsAssumed: boolean;
  packQuantity: string | null; packUnit: PackUnit | null;
  mediaId: string | null;
  state: VariantState;
  stock: ProductStockDTO;                        // 054's DTO, now per variant
}

/** Create/edit input for one variant (shop). `id` is client-generated for a new one (R6). */
export interface VariantInputDTO {
  id: string; position: number; optionValueIds: [string | null, string | null];
  sku?: string | null; gtin?: string | null;
  shopPriceAmount: string; shopCompareAtAmount?: string | null;
  weightGrams?: number | null; packQuantity?: string | null; packUnit?: PackUnit | null;
  mediaStorageKey?: string | null;
}
export interface OptionInputDTO { id: string; position: 1 | 2; name: string; values: { id: string; value: string; position: number }[] }
```

`unit-price.ts` exports `unitPriceCents(priceCents, packQuantity, packUnit, basis)` and
`UNIT_BASIS_WORDS` ("/ 100 g", "/ kg", "/ 100 ml", "/ L", "each"); pinned by `unit-price.fixtures.json`
with a Kotlin twin test in the customer app.

## Storefront (shared gateway, `storefront`) — shapes only, no new routes

- `StorefrontProductCardDTO` + `priceVaries: boolean` ("From"), `variantId: string` (the variant the card
  stands for: the code-matched one in a search, else the default), `variantCount: number`,
  `unitPrice: UnitPriceDTO | null` (of the shown price). `priceAmount`/`compareAtAmount` are the
  product's list price (R4).
- `StorefrontProductDetailDTO` + `options: OptionDTO[]`, `variants: StorefrontVariantDTO[]` (active only,
  display order), `defaultVariantId: string` (FR-014), `unitBasis: UnitBasis | null`.
- `GET /storefront/v1/products/{id}` — `defaultVariantId` is the first variant that can be bought (else the first).
  The page's `?variant={variantId}` is resolved by the CLIENT (`initialVariantId`): a named variant on sale wins,
  anything else falls back to `defaultVariantId`. The server read takes no variant parameter, so it stays cacheable.
- `GET /storefront/v1/products?q=` — matches an active variant's exact SKU or barcode (R13).

## Commerce (shared gateway, `commerce`) — path params renamed, no new routes

| Before | After |
|---|---|
| `PATCH/DELETE /commerce/v1/cart/items/{productId}` | `/commerce/v1/cart/items/{variantId}` |
| `POST /commerce/v1/cart/items/{productId}/set-aside` | `…/items/{variantId}/set-aside` |
| `POST /commerce/v1/cart/saved/{productId}/restore`, `DELETE …/saved/{productId}` | `{variantId}` |

- `AddToCartRequest { variantId; quantity; changeId }`, `CartLineInput { variantId; quantity }`.
- `CartLineDTO` + `variantId`, `variantLabel: string | null`, `unitPrice: UnitPriceDTO | null` (of the
  effective unit price after the line's discount), keeps `productId`.
- Reorder: lines by `variantId`; a variant no longer active is a `ReorderSkipReason` `"variant_unavailable"`.
- Saved: `PUT /commerce/v1/saved/{productId}` body gains `variantId?: string`; `SavedItemDTO` +
  `variantId: string | null` (the size "Add to cart" adds: the remembered one, else the product's only one;
  null when several are sold and none is remembered), `variantLabel: string | null`, `variantCount`,
  `unitPrice`. Add-to-cart results skip such an item with reason `"choose_variant"` (FR-015a). Lists:
  `SavedListCreateRequest` / `SavedListEntryRequest` + `variantId?` — it updates the product's saved item;
  a list entry itself has NO variant column (lists hold products).
- Checkout: payment intent refuses a cart line whose variant is not purchasable (`409 item_unavailable`
  as today, naming the line).
- `OrderItemDTO` + `variantId`, `variantLabel: string | null`.

## Shop (shared gateway, `shop`)

- `CreateProductRequest`: removes `sku`, `gtin`, `priceAmount`, `compareAtAmount`, `weightGrams`;
  adds `options: OptionInputDTO[]` (0–2), `variants: VariantInputDTO[]` (1–50), `unitBasis?: UnitBasis | null`.
- `UpdateProductRequest`: same removals; adds optional `options`, `variants`, `unitBasis` — whole target
  sets when present. Draft → written live; approved → into the pending change (R6).
- `ProductDetailDTO`: removes the moved fields; adds `options`, `variants: ShopVariantDTO[]` (all states,
  removed last), `unitBasis`. `ProductChangeProposalDTO` adds `options?`, `variants?`, `unitBasis?`.
- `ProductListItemDTO`: `priceAmount` → list price; + `variantCount`, `priceVaries`; `sku` removed.
- **NEW** `POST /shop/v1/products/{id}/variants/{variantId}/state` `{ state: "active" | "inactive" | "removed" }`
  → `ProductDetailDTO`. Immediate; `409 last_variant` when it would leave no active-or-inactive variant;
  announces `{"k":"stock"}` to the shop (its stock and attention lists change). Product edits announce
  nothing today and still do not — catalogue reads are not live (071's change map is unchanged).
- Order console, pick lists, fulfilments, team activity: every item line + `variantLabel`, `sku`, `gtin`
  from the order-line snapshot.

## Inventory (shared + staff gateways) — renamed keys, same counts

`/inventory/v1/products/{productId}/stock[/tracking|/adjustments|/threshold]` →
`/inventory/v1/variants/{variantId}/stock[…]`; staff:
`/inventory/v1/admin/shops/{shopId}/variants/{variantId}/stock[…]`. `LowStockRowDTO` + `variantId`,
`variantLabel`. Bodies unchanged.

## Catalog (staff gateway, `catalog`) — shapes only

- Review item: `variants: { id, label, shopPriceAmount, shopCompareAtAmount, resultingPriceAmount,
  resultingCompareAtAmount, sku, gtin, weightGrams, packQuantity, packUnit }[]`, recomputed live as the
  reviewer edits the margin (the client calls the existing pure `customerPrice` in shared-types).
- Diff rows for a change: `variantsAdded`, `variantsRemoved`, `variantsChanged: { id, label, field, before, after }[]`,
  `optionsChanged`.
- Approve and `PUT /catalog/v1/products/{productId}/margin` price every variant, then `refreshListing`.

## Driver, orders, notifications, documents

Item lines gain `variantLabel` (string | null) from the snapshot: driver manifest DTO (`driver.ts`;
optional field — installed driver apps ignore it), back-office `order-admin.ts`, receipt/email models,
delivery note and tax invoice line text ("Basmati Rice — 1 kg").

## Live updates (071)

No new kind. Every write that moves a variant's stock or state announces `stock` to the owning shop,
as 054's writes do; `change-map.guard.test.ts` covers the new state route.
