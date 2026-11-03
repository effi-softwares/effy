# Data Model: Guided Tours in Back-Office (107)

## Stored: nothing new

`public.console_tour_state` (106) already allows `audience = 'admin'`. A back-office person's row is
`('admin', <their admin-pool sub>)`, written and read only through `@effy/edge-shared/tours`. **No migration.**

## Wire: unchanged

`ConsoleTourStateDTO` / `ConsoleTourPatch` (`@effy/shared-types/tours.ts`), the same as 106.

## Client: `TourDef` / `TourStepDef` change (`@effy/web-kit/tour/define.ts`)

| Field | Before (106) | After (107) |
|---|---|---|
| `TourStepDef.managersOnly?: boolean` | Manager-only step | **Removed** |
| `TourStepDef.roles?: readonly string[]` | - | Shown when the person holds any of them |
| `TourDef.roles?: readonly string[]` | - | The whole tour exists only for these roles: no auto-start, Help, search or All tours for anyone else |
| `TourDef.needsRecord?: "order" \| "product"` | Two kinds | `string`: the app's own record kinds (R6) |

**Spec mark → `roles`**: Admin or manager → `["admin","manager"]` · Admin → `["admin"]` · Customer support → `["csa"]`
· (shop) Manager → `["shop_manager"]`.

`TourProviderProps.roles` becomes `readonly string[]`; `analyticsRole?: string` is added (R7). `TourEvent` gains
`role?: string` on all four events.

## Back-office tour keys (49)

`welcome`, `overview`, `orders`, `order`, `dispatch`, `round`, `handover-report`, `courier-parcels`, `exceptions`,
`hub-station` (roles admin, manager), `customers`, `points-settings`, `customer`, `feedback`, `feedback-item`,
`drivers`, `driver`, `vehicles`, `vehicle`, `shops`, `shop`, `products`, `product`, `product-new`,
`imports` (admin, manager), `import` (admin, manager), `product-finish`, `review-queue`, `review-item`,
`missing-details`, `taxonomy`, `promotions`, `promotion-editor`, `promotion`, `display-groups`, `display-group`,
`skins`, `skin`, `order-rules`, `delivery-coverage`, `delivery-courier`, `delivery-pricing`, `delivery-windows`,
`delivery-days`, `delivery-hub`, `tax` (admin), `deliverability`, `deliverability-address`, `admin-access` (admin).
