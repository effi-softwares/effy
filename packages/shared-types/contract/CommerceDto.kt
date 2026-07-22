// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,favorite}.ts — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types commerce-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded (019).

package com.effyshopping.customer.mobile.commerce.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * POST /v1/cart/items — add or increment a line.
 */
@Serializable
data class AddToCartRequest (
    @SerialName("productId")
    val productID: String,

    val quantity: Double
)

/**
 * A saved delivery address (GET /v1/addresses).
 */
@Serializable
data class AddressDTO (
    val city: String,
    val country: String,
    val id: String,
    val isDefault: Boolean,
    val label: String? = null,
    val line1: String,
    val line2: String? = null,
    val phone: String? = null,
    val postalCode: String,
    val recipientName: String,
    val region: String? = null
)

/**
 * A labelled group of attribute rows on the product detail page (never laid out as cards).
 */
@Serializable
data class ProductAttributeGroupDTO (
    val groupLabel: String,
    val items: List<Item>
)

@Serializable
data class Item (
    val label: String,
    val value: String
)

/**
 * A promotional hero banner. Minimal/derived in this slice (no CMS).
 */
@Serializable
data class BannerDTO (
    val href: String? = null,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val key: String,
    val subtitle: String? = null,
    val title: String
)

/**
 * The full cart (GET /v1/cart and every mutating response).
 */
@Serializable
data class CartDTO (
    val currency: String,
    val deliveryFeeAmount: String,
    val grandTotalAmount: String,
    val itemSubtotalAmount: String,
    val lines: List<CartLineDTO>,
    val notices: List<CartNoticeDTO>
)

/**
 * A cart line (re-priced against the catalog on every read).
 */
@Serializable
data class CartLineDTO (
    val available: Boolean,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val lineSubtotalAmount: String,
    val name: String,

    /**
     * OPAQUE package grouping key (021). Items sharing a packageKey ship together as one
     * anonymous "package" (one per fulfilling shop). It is NOT a shop id, name, or location — a
     * meaningless-to-the- customer token that lets the cart show the split (021 FR-005a) while
     * revealing no shop (SC-006).
     */
    val packageKey: String,

    /**
     * When the authoritative price differs from what the client last saw, the prior amount (UX
     * only).
     */
    val priceChangedFrom: String? = null,

    @SerialName("productId")
    val productID: String,

    val quantity: Double,
    val unitPriceAmount: String
)

@Serializable
data class CartNoticeDTO (
    val kind: CartNoticeKind,

    @SerialName("productId")
    val productID: String
)

/**
 * A cart-level notice surfaced at read/checkout (an item went away or changed price).
 */
@Serializable
enum class CartNoticeKind(val value: String) {
    @SerialName("price_changed") PriceChanged("price_changed"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * A browse/filter category, customer projection (GET /v1/storefront/categories). Distinct
 * from the admin/shop `CategoryDTO` in catalog.ts — this carries no internal
 * id/status/order.
 */
@Serializable
data class StorefrontCategoryDTO (
    val key: String,
    val name: String,
    val parentKey: String? = null
)

/**
 * POST /v1/checkout/confirm — fallback finalizer (covers a delayed/missed webhook).
 */
@Serializable
data class ConfirmCheckoutRequest (
    @SerialName("orderId")
    val orderID: String
)

/**
 * POST /v1/addresses — the first address created becomes the default.
 */
@Serializable
data class CreateAddressRequest (
    val city: String,
    val country: String? = null,
    val label: String? = null,
    val line1: String,
    val line2: String? = null,
    val makeDefault: Boolean? = null,
    val phone: String? = null,
    val postalCode: String,
    val recipientName: String,
    val region: String? = null
)

/**
 * POST /v1/checkout/intent — create/locate the pending order and its PaymentIntent (019,
 * extended 021).
 */
@Serializable
data class CreateCheckoutIntentRequest (
    /**
     * The SHIPPING address (required). Serviceability + delivery pricing key off this (021).
     */
    @SerialName("addressId")
    val addressID: String,

    /**
     * 023: the BILLING address, when the customer diverged from shipping. Absent / null / equal
     * to `addressId` → billing is "same as shipping" (the order stores NULL). Billing never
     * affects the amount or the quote.
     */
    @SerialName("billingAddressId")
    val billingAddressID: String? = null,

    /**
     * 021: packages the customer confirmed proceeding WITHOUT (auto-set-aside undeliverable
     * items). MUST exactly match the server's unserviceable set or the intent is refused
     * (FR-006b, SC-011a).
     */
    val excludedPackageKeys: List<String>? = null,

    /**
     * 021: the captured quote being placed. Honored while unexpired; else 409 → re-quote.
     */
    @SerialName("quoteId")
    val quoteID: String? = null,

    /**
     * 021: the customer's per-package method choices (default preference + overrides, resolved).
     */
    val selections: List<DeliverySelectionDTO>? = null
)

/**
 * The customer's chosen method for one package (021). Carries NO fee — the server prices it
 * (SC-004).
 */
@Serializable
data class DeliverySelectionDTO (
    val method: CheckoutDeliveryMethod,
    val packageKey: String,

    /**
     * Required only when method='scheduled'.
     */
    val scheduledDate: String? = null
)

/**
 * The three delivery service levels (021). Availability per package follows from the shop's
 * origin zone and the customer's destination zone — never from shop identity, which the
 * customer never sees.
 */
@Serializable
enum class CheckoutDeliveryMethod(val value: String) {
    @SerialName("same_day") SameDay("same_day"),
    @SerialName("scheduled") Scheduled("scheduled"),
    @SerialName("standard") Standard("standard");
}

@Serializable
data class CreateCheckoutIntentResponse (
    /**
     * Authorizes confirming exactly this PaymentIntent from the client. Never a secret key.
     */
    val clientSecret: String,

    val currency: String,

    /**
     * 021: the per-package delivery breakdown, for the order summary. Anonymous.
     */
    val deliveryBreakdown: List<DeliveryBreakdownLineDTO>? = null,

    val grandTotalAmount: String,

    @SerialName("orderId")
    val orderID: String,

    val orderNumber: String,
    val publishableKey: String
)

/**
 * One line of the per-package delivery breakdown on the intent response (021). Anonymous.
 */
@Serializable
data class DeliveryBreakdownLineDTO (
    val feeAmount: String,
    val packageKey: String,
    val serviceLevel: String,
    val window: String? = null
)

/**
 * One selectable delivery option for a package (021). Server-computed; the client never
 * sends a fee.
 */
@Serializable
data class DeliveryMethodOptionDTO (
    val feeAmount: String,
    val method: CheckoutDeliveryMethod,

    /**
     * Selectable dates for method='scheduled'; null otherwise.
     */
    val scheduleDates: List<String>? = null,

    /**
     * Customer-facing label, e.g. "Same-day".
     */
    val serviceLevel: String,

    /**
     * Derived window, e.g. "Today by 6pm" / "in 2–3 days"; null for a scheduled method (pick a
     * date).
     */
    val window: String? = null
)

/**
 * POST /v1/checkout/quote — per-package delivery options for the cart + address (021 US1).
 */
@Serializable
data class DeliveryQuoteRequest (
    @SerialName("addressId")
    val addressID: String
)

@Serializable
data class DeliveryQuoteResponse (
    /**
     * The captured quote is honored until this instant; after it the customer must re-quote
     * (021 R7).
     */
    val expiresAt: String,

    val packages: List<QuotePackageDTO>,

    @SerialName("quoteId")
    val quoteID: String
)

@Serializable
data class QuotePackageDTO (
    val items: List<QuotePackageItemDTO>,
    val methods: List<DeliveryMethodOptionDTO>,
    val packageKey: String,

    /**
     * False when this package cannot be delivered to the address (021 US2). methods is then
     * empty.
     */
    val serviceable: Boolean
)

/**
 * One ANONYMOUS package in a quote (021) — the items from a single shop, shown without any
 * shop identity or location (FR-019). `packageKey` is an opaque grouping token.
 */
@Serializable
data class QuotePackageItemDTO (
    @SerialName("imageUrl")
    val imageURL: String? = null,

    val name: String,

    @SerialName("productId")
    val productID: String,

    val quantity: Double
)

/**
 * A saved product (product card fields + when it was saved).
 */
@Serializable
data class FavoriteDTO (
    val available: Boolean,
    val badges: List<ProductBadge>,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val currency: String,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val name: String,
    val priceAmount: String,
    val savedAt: String
)

/**
 * A badge shown on a product card. Derived server-side (on_sale = has compare-at; new =
 * newest).
 */
@Serializable
enum class ProductBadge(val value: String) {
    @SerialName("new") New("new"),
    @SerialName("on_sale") OnSale("on_sale");
}

/**
 * The composed Home payload (GET /v1/storefront/home).
 */
@Serializable
data class StorefrontHomeDTO (
    val banners: List<BannerDTO>,
    val rails: List<StorefrontRailDTO>
)

/**
 * A merchandising rail on Home (Featured / On-sale / a category rail).
 */
@Serializable
data class StorefrontRailDTO (
    val key: String,
    val products: List<StorefrontProductCardDTO>,
    val title: String
)

/**
 * The at-a-glance product card used in rails, search results, favorites and recently-viewed.
 */
@Serializable
data class StorefrontProductCardDTO (
    val available: Boolean,
    val badges: List<ProductBadge>,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val currency: String,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val name: String,
    val priceAmount: String
)

/**
 * A product image (presigned GET URL + alt text).
 */
@Serializable
data class MediaDTO (
    val alt: String? = null,

    @SerialName("imageUrl")
    val imageURL: String
)

/**
 * POST /v1/cart/merge — merge a device-local guest cart on sign-in (sums qty per product).
 */
@Serializable
data class MergeCartRequest (
    val lines: List<Line>
)

@Serializable
data class Line (
    @SerialName("productId")
    val productID: String,

    val quantity: Double
)

/**
 * Full order / receipt (GET /v1/orders/{id}).
 */
@Serializable
data class OrderDTO (
    /**
     * The BILLING address snapshot (023). `null` means "same as shipping" — the client renders
     * "Billing: same as shipping" rather than repeating the address. A value is a divergent
     * billing address. NEVER exposed to the shop (FR-018). Absent/null on pre-023 orders.
     */
    val billingAddress: OrderAddressDTO? = null,

    val currency: String,

    /**
     * The SHIPPING address snapshot (the main one — where the order is delivered).
     */
    val deliveryAddress: OrderAddressDTO,

    val deliveryFeeAmount: String,
    val fulfillments: List<OrderFulfillmentDTO>,
    val grandTotalAmount: String,
    val id: String,
    val items: List<OrderItemDTO>,
    val itemSubtotalAmount: String,
    val orderNumber: String,
    val paymentStatus: PaymentStatus,
    val placedAt: String? = null,
    val status: OrderStatus
)

/**
 * The snapshotted delivery address on the receipt.
 *
 * The SHIPPING address snapshot (the main one — where the order is delivered).
 */
@Serializable
data class OrderAddressDTO (
    val city: String,
    val country: String,
    val line1: String,
    val line2: String? = null,
    val phone: String? = null,
    val postalCode: String,
    val recipientName: String,
    val region: String? = null
)

/**
 * An anonymous per-shop fulfillment portion — NO shop identity (FR-033).
 *
 * 020 gave `status` a life: 019 created every portion `pending` and no code path ever
 * changed it. The values now span the shop's real working lifecycle. Still no shop name,
 * id, or count that would imply WHO is fulfilling (FR-018, SC-009).
 */
@Serializable
data class OrderFulfillmentDTO (
    val deliveryFeeAmount: String? = null,

    /**
     * The delivery this portion was bought with (021) — still ANONYMOUS (no shop). The
     * customer's receipt breakdown shows, per package, what they paid to have it delivered and
     * when it is promised. Absent on pre-021 orders.
     */
    val deliveryServiceLevel: String? = null,

    val deliveryWindow: String? = null,
    val itemCount: Double,
    val status: Status,
    val subtotalAmount: String,

    /**
     * Present ONLY when the portion has reached a terminal state (FR-018b). Absent while
     * picking.
     */
    val unavailableItems: List<OrderShortfallDTO>? = null
)

@Serializable
enum class Status(val value: String) {
    @SerialName("collected") Collected("collected"),
    @SerialName("delivered") Delivered("delivered"),
    @SerialName("pending") Pending("pending"),
    @SerialName("picking") Picking("picking"),
    @SerialName("ready_for_pickup") ReadyForPickup("ready_for_pickup"),
    @SerialName("received") Received("received");
}

/**
 * An item the customer paid for and will NOT receive (020 FR-018b).
 *
 * Disclosed at item level, but ONLY once the portion is terminal — a flag raised and then
 * undone mid-pick must never reach the customer (SC-017). Naming the customer's own item
 * discloses nothing about fulfillment structure (FR-018c).
 *
 * Carries NO refund promise: no money moves in 020, and the shortfall is left deliberately
 * visible for a later refunds slice to resolve (FR-010b, FR-018a).
 */
@Serializable
data class OrderShortfallDTO (
    val productName: String,
    val quantity: Double
)

/**
 * A line on the receipt (product snapshot — never a shop).
 */
@Serializable
data class OrderItemDTO (
    val lineSubtotalAmount: String,

    @SerialName("productId")
    val productID: String,

    val productName: String,
    val quantity: Double,
    val unitPriceAmount: String
)

/**
 * Payment outcome mirrored from the Stripe PaymentIntent.
 */
@Serializable
enum class PaymentStatus(val value: String) {
    @SerialName("canceled") Canceled("canceled"),
    @SerialName("failed") Failed("failed"),
    @SerialName("requires_action") RequiresAction("requires_action"),
    @SerialName("requires_payment") RequiresPayment("requires_payment"),
    @SerialName("succeeded") Succeeded("succeeded");
}

/**
 * Order lifecycle mirrored to the client (payment-driven).
 */
@Serializable
enum class OrderStatus(val value: String) {
    @SerialName("canceled") Canceled("canceled"),
    @SerialName("failed") Failed("failed"),
    @SerialName("paid") Paid("paid"),
    @SerialName("pending_payment") PendingPayment("pending_payment");
}

/**
 * A row in the order history (GET /v1/orders).
 */
@Serializable
data class OrderSummaryDTO (
    val currency: String,
    val grandTotalAmount: String,
    val id: String,
    val itemCount: Double,
    val orderNumber: String,
    val placedAt: String? = null,
    val status: OrderStatus
)

/**
 * Full product detail (gallery, description, grouped attributes, category path).
 */
@Serializable
data class StorefrontProductDetailDTO (
    val attributes: List<ProductAttributeGroupDTO>,
    val available: Boolean,
    val badges: List<ProductBadge>,
    val brand: String? = null,
    val categoryPath: List<String>,
    val compareAtAmount: String? = null,
    val currency: String,
    val gallery: List<MediaDTO>,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val longDescription: String? = null,
    val name: String,
    val priceAmount: String
)

/**
 * A page of search results with a keyset cursor for infinite scroll.
 */
@Serializable
data class ProductSearchResultDTO (
    val items: List<StorefrontProductCardDTO>,
    val nextCursor: String? = null
)

/**
 * PATCH /v1/addresses/{id} — partial update / set default.
 */
@Serializable
data class UpdateAddressRequest (
    val city: String? = null,
    val country: String? = null,
    val label: String? = null,
    val line1: String? = null,
    val line2: String? = null,
    val makeDefault: Boolean? = null,
    val phone: String? = null,
    val postalCode: String? = null,
    val recipientName: String? = null,
    val region: String? = null
)

/**
 * PATCH /v1/cart/items/{productId} — set a line quantity (0 removes).
 */
@Serializable
data class UpdateCartLineRequest (
    val quantity: Double
)
