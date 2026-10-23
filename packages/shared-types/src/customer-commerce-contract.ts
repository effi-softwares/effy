/**
 * The customer commerce wire contract: a barrel and aggregator the customer app's Kotlin DTOs are
 * generated from. The `*.ts` files stay the source of truth. `CustomerCommerceContract` is not used at
 * runtime; it makes the schema generator (`--expose all`) pull every referenced DTO in. No shop, driver
 * or admin types.
 */
import type {
  CustomerRefundDTO,
  RefundRequestDTO,
  RefundRequestStatus,
  CreateRefundRequestBody,
  CancelOrderBody,
} from "./refund";
import type {
  ProductBadge,
  MediaDTO,
  StorefrontProductCardDTO,
  ProductAttributeGroupDTO,
  StorefrontProductDetailDTO,
  StorefrontRailDTO,
  StorefrontHomeDTO,
  StorefrontCategoryDTO,
  ProductSort,
  ProductSearchResultDTO,
  FacetType,
  FacetOptionDTO,
  FacetDTO,
  FacetSetDTO,
  PromotionDTO,
} from "./storefront";
import type { PromotionGroupsDTO, PromotionGroupDTO, ShopperPromotionDTO } from "./promotions";
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
} from "./checkout";
import type {
  PaymentMethodDTO,
  ListPaymentMethodsResponse,
  BillingDetailsDTO,
  BillingAddressDTO,
} from "./payment";
import type { BusinessIdentityRequest, DeliveryNoteDTO, OrderTaxDocumentsDTO } from "./documents";
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
  SavedListDTO,
  SavedListCreateRequest,
  SavedListRenameRequest,
  SavedListEntryRequest,
  SavedListRefusal,
  SaveItemRequest,
} from "./saved-item";
import type { OptionDTO, OptionValueDTO, StorefrontVariantDTO, VariantState } from "./variants";
import type { UnitBasis, UnitPriceDTO } from "./unit-price";
import type {
  DeliveryMethod,
  AustralianState,
  DeliveryQuoteDTO,
  DeliveryChoiceRefusalDTO,
} from "./delivery";

export type {
  ProductBadge,
  MediaDTO,
  StorefrontProductCardDTO,
  ProductAttributeGroupDTO,
  StorefrontProductDetailDTO,
  StorefrontRailDTO,
  StorefrontHomeDTO,
  StorefrontCategoryDTO,
  ProductSort,
  ProductSearchResultDTO,
  FacetType,
  FacetOptionDTO,
  FacetDTO,
  FacetSetDTO,
  PromotionDTO,
  PromotionGroupsDTO,
  PromotionGroupDTO,
  ShopperPromotionDTO,
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
  PaymentMethodDTO,
  ListPaymentMethodsResponse,
  BillingDetailsDTO,
  BillingAddressDTO,
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
  SavedListDTO,
  SavedListCreateRequest,
  SavedListRenameRequest,
  SavedListEntryRequest,
  SavedListRefusal,
  DeliveryMethod,
  AustralianState,
  DeliveryQuoteDTO,
};

/** Codegen entry only. Every field forces a type into the schema. */
export type {
  CustomerRefundDTO,
  RefundRequestDTO,
  RefundRequestStatus,
  CreateRefundRequestBody,
  CancelOrderBody,
};

export interface CustomerCommerceContract {
  home: StorefrontHomeDTO;
  productCard: StorefrontProductCardDTO;
  productDetail: StorefrontProductDetailDTO;
  rail: StorefrontRailDTO;
  media: MediaDTO;
  attributeGroup: ProductAttributeGroupDTO;
  category: StorefrontCategoryDTO;
  searchResult: ProductSearchResultDTO;
  productSort: ProductSort;
  facetSet: FacetSetDTO;
  facet: FacetDTO;
  facetOption: FacetOptionDTO;
  facetType: FacetType;
  promotion: PromotionDTO;
  /** Display groups by key (storefront public, commerce personal). */
  promotionGroups: PromotionGroupsDTO;
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
  orderSummary: OrderSummaryDTO;
  order: OrderDTO;
  orderItem: OrderItemDTO;
  orderAddress: OrderAddressDTO;
  orderFulfillment: OrderFulfillmentDTO;
  // A type is generated only if this aggregator reaches it; an unreferenced one is silently missing and
  // `commerce-contract:check` still passes. SavedVerdict, SavedMergeItem and SavedSkip are reached
  // transitively.
  savedItem: SavedItemDTO;
  savedMembership: SavedMembershipDTO;
  savedMergeRequest: SavedMergeRequest;
  savedMergeResult: SavedMergeResultDTO;
  savedAddToCartRequest: SavedAddToCartRequest;
  savedAddToCartResult: SavedAddToCartResultDTO;
  // Lists.
  savedList: SavedListDTO;
  savedListCreateRequest: SavedListCreateRequest;
  savedListRenameRequest: SavedListRenameRequest;
  savedListEntryRequest: SavedListEntryRequest;
  savedListRefusal: SavedListRefusal;
  // Delivery. DeliveryMethod and AustralianState are reached transitively.
  deliveryQuote: DeliveryQuoteDTO;
  // The windows are reached through the quote; the refusal body from nothing, so it is named here.
  deliveryChoiceRefusal: DeliveryChoiceRefusalDTO;
  // Payment. PaymentMethodDTO and ListPaymentMethodsResponse are reached from nothing else; BillingDetails
  // is named anyway so a refactor of the intent response cannot drop it.
  paymentMethod: PaymentMethodDTO;
  listPaymentMethods: ListPaymentMethodsResponse;
  billingDetails: BillingDetailsDTO;
  billingAddress: BillingAddressDTO;
  // Refunds: the customer-facing shapes only (`RefundDTO` carries provider failure text).
  customerRefund: CustomerRefundDTO;
  refundRequest: RefundRequestDTO;
  createRefundRequest: CreateRefundRequestBody;
  cancelOrder: CancelOrderBody;
  // Order documents
  deliveryNote: DeliveryNoteDTO;
  orderTaxDocuments: OrderTaxDocumentsDTO;
  businessIdentity: BusinessIdentityRequest;
  // Product variants, reached through the product detail and the cart, named so a refactor cannot drop them.
  option: OptionDTO;
  optionValue: OptionValueDTO;
  storefrontVariant: StorefrontVariantDTO;
  variantState: VariantState;
  unitPrice: UnitPriceDTO;
  unitBasis: UnitBasis;
  saveItemRequest: SaveItemRequest;
}
