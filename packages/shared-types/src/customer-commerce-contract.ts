/**
 * The customer COMMERCE wire contract, as a single barrel + aggregator — 019-customer-commerce-flow.
 *
 * This exists so the KMP customer mobile app generates its Kotlin DTOs from EXACTLY the commerce types
 * it consumes (storefront, cart, address, checkout, order, favorite) — the same discipline as
 * customer-contract.ts (013). The individual `*.ts` files remain the single source of truth
 * (Principle II); this file only re-exports and aggregates, and is an input to the KMP codegen.
 *
 * The `CustomerCommerceContract` aggregator below is not used at runtime — it exists solely so the
 * schema generator (run with `--expose all`) pulls EVERY referenced DTO into `definitions`. Do NOT add
 * shop/driver/admin types.
 */
import type {
  ProductBadge,
  MediaDTO,
  StorefrontProductCardDTO,
  ProductAttributeGroupDTO,
  StorefrontProductDetailDTO,
  StorefrontRailDTO,
  BannerDTO,
  StorefrontHomeDTO,
  StorefrontCategoryDTO,
  ProductSearchResultDTO,
} from "./storefront";
import type {
  CartLineDTO,
  CartNoticeDTO,
  CartDTO,
  AddToCartRequest,
  UpdateCartLineRequest,
  MergeCartRequest,
} from "./cart";
import type { AddressDTO, CreateAddressRequest, UpdateAddressRequest } from "./address";
import type {
  CreateCheckoutIntentRequest,
  CreateCheckoutIntentResponse,
  ConfirmCheckoutRequest,
} from "./checkout";
import type {
  OrderStatus,
  PaymentStatus,
  OrderSummaryDTO,
  OrderItemDTO,
  OrderAddressDTO,
  OrderFulfillmentDTO,
  OrderDTO,
} from "./order";
import type { FavoriteDTO } from "./favorite";

export type {
  ProductBadge,
  MediaDTO,
  StorefrontProductCardDTO,
  ProductAttributeGroupDTO,
  StorefrontProductDetailDTO,
  StorefrontRailDTO,
  BannerDTO,
  StorefrontHomeDTO,
  StorefrontCategoryDTO,
  ProductSearchResultDTO,
  CartLineDTO,
  CartNoticeDTO,
  CartDTO,
  AddToCartRequest,
  UpdateCartLineRequest,
  MergeCartRequest,
  AddressDTO,
  CreateAddressRequest,
  UpdateAddressRequest,
  CreateCheckoutIntentRequest,
  CreateCheckoutIntentResponse,
  ConfirmCheckoutRequest,
  OrderStatus,
  PaymentStatus,
  OrderSummaryDTO,
  OrderItemDTO,
  OrderAddressDTO,
  OrderFulfillmentDTO,
  OrderDTO,
  FavoriteDTO,
};

/** Aggregator — codegen entry only (see file header). Every field forces a type into the schema. */
export interface CustomerCommerceContract {
  home: StorefrontHomeDTO;
  productCard: StorefrontProductCardDTO;
  productDetail: StorefrontProductDetailDTO;
  rail: StorefrontRailDTO;
  banner: BannerDTO;
  media: MediaDTO;
  attributeGroup: ProductAttributeGroupDTO;
  category: StorefrontCategoryDTO;
  searchResult: ProductSearchResultDTO;
  cart: CartDTO;
  cartLine: CartLineDTO;
  cartNotice: CartNoticeDTO;
  addToCart: AddToCartRequest;
  updateCartLine: UpdateCartLineRequest;
  mergeCart: MergeCartRequest;
  address: AddressDTO;
  createAddress: CreateAddressRequest;
  updateAddress: UpdateAddressRequest;
  createCheckoutIntent: CreateCheckoutIntentRequest;
  createCheckoutIntentResponse: CreateCheckoutIntentResponse;
  confirmCheckout: ConfirmCheckoutRequest;
  orderSummary: OrderSummaryDTO;
  order: OrderDTO;
  orderItem: OrderItemDTO;
  orderAddress: OrderAddressDTO;
  orderFulfillment: OrderFulfillmentDTO;
  favorite: FavoriteDTO;
}
