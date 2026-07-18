# Contract: Shared DTOs (`@effy/shared-types`) — the single source of truth

These wire shapes are authored **once** in `@effy/shared-types`, consumed directly by `apps/customer-web`,
regenerated to Kotlin `@Serializable` DTOs for `apps/customer-mobile` (via `customer-commerce-contract.ts`),
and **mirrored** by core-api's hand-authored Go wire structs (Go cannot import TS — the established platform
reality; this file is the contract a Go mapping test guards against). Full field lists live in
[../data-model.md](../data-model.md) §3; this file pins the conventions and the module layout.

## Conventions (identical to existing `catalog.ts`)

- **Money**: decimal **string** amount + separate `currency: string` (e.g. `{ priceAmount: "12.50", currency: "AUD" }`). Never a float. Minor-unit integer conversion happens only inside core-api at the Stripe boundary.
- **Timestamps**: ISO-8601 **strings**.
- **Nullability**: explicit `T | null` on the wire (Kotlin `T?`).
- **Enums**: string unions + a `readonly[]` constant + a tolerant-reader narrowing helper (the `toShopRoles`
  pattern) so a value authored elsewhere never throws a client.
- **Paging**: keyset — responses carry `nextCursor: string | null`; requests carry `cursor?`.
- **Images**: `imageUrl` fields are **already-presigned** absolute URLs (opaque to the client; expire ~15 min).

## New source files

| File | Exports (summary) | Reaches mobile? |
|---|---|---|
| `storefront.ts` | `StorefrontProductCardDTO`, `StorefrontProductDetailDTO`, `StorefrontHomeDTO`, `BannerDTO`, `MediaDTO`, `ProductBadge`, `ProductSearchQuery`, `ProductSearchResultDTO` | ✅ |
| `cart.ts` | `CartDTO`, `CartLineDTO`, `CartNoticeDTO`, `AddToCartRequest`, `UpdateCartLineRequest`, `MergeCartRequest` | ✅ |
| `address.ts` | `AddressDTO`, `CreateAddressRequest`, `UpdateAddressRequest` | ✅ |
| `checkout.ts` | `CreateCheckoutIntentRequest`, `CreateCheckoutIntentResponse`, `ConfirmCheckoutRequest` | ✅ |
| `order.ts` | `OrderSummaryDTO`, `OrderDTO` / `ReceiptDTO`, `OrderItemDTO`, `OrderFulfillmentDTO` | ✅ |
| `favorite.ts` | `FavoriteDTO` | ✅ |
| `customer-commerce-contract.ts` | KMP codegen entry re-exporting the above subset | — |

`src/index.ts` gains barrel exports for all six DTO files. The KMP generator target is added alongside the
existing `customer-contract.ts` → `contract/Dto.kt` pipeline.

## Never on the wire to a client

- The Stripe **secret key** / **webhook secret** (core-api only).
- Raw card data (Stripe-hosted; never touches Effy).
- A shop's **identity** to a customer (orders expose only anonymous per-shop fulfillment status/count/subtotal).
- `product_media.storage_key` (only the presigned URL is exposed).
- Any PII beyond what the customer authored (name/address) and the auth subject id.

## Drift guards

- **Web**: `pnpm -r typecheck` fails if customer-web uses a shape not exported here.
- **Mobile**: the generated Kotlin DTOs are diff-guarded like the existing `Dto.kt` (regeneration must be
  clean in CI).
- **Go**: a `core-api` mapping/unit test asserts each handler DTO's JSON tags match this contract (field
  names + nullability), so a Go struct can't silently drift from the TS SSOT.
