/**
 * The customer COMMERCE wire contract, as a single barrel + aggregator — 019-customer-commerce-flow.
 *
 * This exists so the KMP customer mobile app generates its Kotlin DTOs from EXACTLY the commerce types
 * it consumes (storefront, cart, address, checkout, order, saved-item) — the same discipline as
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
  ProductSort,
  ProductSearchResultDTO,
  ServiceabilityDTO,
  LocalityDTO,
  PromotionDTO,
} from "./storefront";
import type {
  CartLineDTO,
  CartNoticeDTO,
  CartNoticeKind,
  CartDiscountDTO,
  CartDiscountKind,
  CartBlockedReason,
  CartCheckoutStateDTO,
  CartLimitsDTO,
  CartDTO,
  CartLineInput,
  AddToCartRequest,
  UpdateCartLineRequest,
  MergeCartRequest,
  ReorderRequest,
  ReorderSkipReason,
  ReorderSkippedDTO,
  ReorderResultDTO,
  ApplyPromoRequest,
  CartPreviewRequest,
  CartPolicyDTO,
  WireInt,
} from "./cart";
import type { AddressDTO, CreateAddressRequest, UpdateAddressRequest } from "./address";
import type {
  CreateCheckoutIntentRequest,
  CreateCheckoutIntentResponse,
  ConfirmCheckoutRequest,
  DeliveryQuoteRequest,
  DeliveryQuoteResponse,
  QuotePackageDTO,
  QuotePackageItemDTO,
  DeliveryMethodOptionDTO,
  DeliverySelectionDTO,
  DeliveryBreakdownLineDTO,
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
import type {
  SavedVerdict,
  SavedItemDTO,
  SavedMembershipDTO,
  SavedMergeItem,
  SavedMergeRequest,
  SavedSkip,
  SavedMergeResultDTO,
  SavedAddToCartRequest,
  SavedAddToCartResultDTO,
} from "./saved-item";

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
  ProductSort,
  ProductSearchResultDTO,
  ServiceabilityDTO,
  LocalityDTO,
  PromotionDTO,
  CartLineDTO,
  CartNoticeDTO,
  CartNoticeKind,
  CartDiscountDTO,
  CartDiscountKind,
  CartBlockedReason,
  CartCheckoutStateDTO,
  CartLimitsDTO,
  CartDTO,
  CartLineInput,
  AddToCartRequest,
  UpdateCartLineRequest,
  MergeCartRequest,
  ReorderRequest,
  ReorderSkipReason,
  ReorderSkippedDTO,
  ReorderResultDTO,
  ApplyPromoRequest,
  CartPreviewRequest,
  CartPolicyDTO,
  WireInt,
  AddressDTO,
  CreateAddressRequest,
  UpdateAddressRequest,
  CreateCheckoutIntentRequest,
  CreateCheckoutIntentResponse,
  ConfirmCheckoutRequest,
  DeliveryQuoteRequest,
  DeliveryQuoteResponse,
  QuotePackageDTO,
  QuotePackageItemDTO,
  DeliveryMethodOptionDTO,
  DeliverySelectionDTO,
  DeliveryBreakdownLineDTO,
  OrderStatus,
  PaymentStatus,
  OrderSummaryDTO,
  OrderItemDTO,
  OrderAddressDTO,
  OrderFulfillmentDTO,
  OrderDTO,
  SavedVerdict,
  SavedItemDTO,
  SavedMembershipDTO,
  SavedMergeItem,
  SavedMergeRequest,
  SavedSkip,
  SavedMergeResultDTO,
  SavedAddToCartRequest,
  SavedAddToCartResultDTO,
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
  productSort: ProductSort;
  serviceability: ServiceabilityDTO;
  // ⚠ Referencing LocalityDTO here is what makes it EXIST in Kotlin. Declaring it in storefront.ts
  // alone is not enough — the generator walks this aggregator, so an unreferenced type is silently
  // never generated and the drift check then passes trivially (030 T022a).
  locality: LocalityDTO;
  promotion: PromotionDTO;
  cart: CartDTO;
  cartLine: CartLineDTO;
  cartNotice: CartNoticeDTO;
  cartNoticeKind: CartNoticeKind;
  cartDiscount: CartDiscountDTO;
  cartDiscountKind: CartDiscountKind;
  cartBlockedReason: CartBlockedReason;
  cartCheckoutState: CartCheckoutStateDTO;
  cartLimits: CartLimitsDTO;
  cartLineInput: CartLineInput;
  addToCart: AddToCartRequest;
  updateCartLine: UpdateCartLineRequest;
  mergeCart: MergeCartRequest;
  reorderRequest: ReorderRequest;
  reorderSkipReason: ReorderSkipReason;
  reorderSkipped: ReorderSkippedDTO;
  reorderResult: ReorderResultDTO;
  applyPromo: ApplyPromoRequest;
  cartPreview: CartPreviewRequest;
  cartPolicy: CartPolicyDTO;
  address: AddressDTO;
  createAddress: CreateAddressRequest;
  updateAddress: UpdateAddressRequest;
  createCheckoutIntent: CreateCheckoutIntentRequest;
  createCheckoutIntentResponse: CreateCheckoutIntentResponse;
  confirmCheckout: ConfirmCheckoutRequest;
  deliveryQuoteRequest: DeliveryQuoteRequest;
  deliveryQuoteResponse: DeliveryQuoteResponse;
  quotePackage: QuotePackageDTO;
  quotePackageItem: QuotePackageItemDTO;
  deliveryMethodOption: DeliveryMethodOptionDTO;
  deliverySelection: DeliverySelectionDTO;
  deliveryBreakdownLine: DeliveryBreakdownLineDTO;
  orderSummary: OrderSummaryDTO;
  order: OrderDTO;
  orderItem: OrderItemDTO;
  orderAddress: OrderAddressDTO;
  orderFulfillment: OrderFulfillmentDTO;
  // ⚠ 033. Referencing these here is what makes them EXIST in Kotlin. Declaring them in
  // saved-item.ts alone is not enough — the generator walks this aggregator, so an unreferenced type
  // is silently never generated and `commerce-contract:check` then passes TRIVIALLY (both the
  // regenerated and the committed file are equally missing it). That is 030 T022a, and it stays
  // invisible until a client needs the class. SavedVerdict, SavedMergeItem and SavedSkip are reached
  // transitively and need no field of their own.
  savedItem: SavedItemDTO;
  savedMembership: SavedMembershipDTO;
  savedMergeRequest: SavedMergeRequest;
  savedMergeResult: SavedMergeResultDTO;
  savedAddToCartRequest: SavedAddToCartRequest;
  savedAddToCartResult: SavedAddToCartResultDTO;
}
