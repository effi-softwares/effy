// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,favorite}.ts — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types commerce-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded (019).

package com.effyshopping.customer.mobile.commerce.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * POST /v1/cart/items — add or INCREMENT a line.
 *
 * ⚠ The only non-idempotent cart write, because "Add to cart" twice must mean two.
 * `changeId` is therefore REQUIRED: a client-generated UUIDv4 minted once per shopper
 * action and reused by every retry of it, so a request that arrived without its response
 * reaching the client cannot apply twice (FR-018).
 */
@Serializable
data class AddToCartRequest (
    @SerialName("changeId")
    val changeID: String,

    @SerialName("productId")
    val productID: String,

    val quantity: Long
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
 * POST /v1/cart/promo — apply a promotional code. Signed-in only (a per-shopper cap needs
 * identity).
 */
@Serializable
data class ApplyPromoRequest (
    val code: String
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
 * A promotional banner on Home — the shopper-facing face of an advertised promotion (028).
 *
 * ⚠ Every field added in 028 is OPTIONAL, so `customer-web`'s existing consumer keeps
 * typechecking without an edit. What is NOT backward compatible is the LIST: this used to
 * always contain one derived "welcome" stub and is now empty whenever no promotion is
 * advertised. Any layout that assumed at least one banner has to handle `[]`.
 */
@Serializable
data class BannerDTO (
    /**
     * The code a shopper types in the cart. Shown so the banner is actionable, not just
     * decorative.
     */
    val code: String? = null,

    /**
     * Retained for `customer-web`. Mobile ignores it in favour of `target`.
     */
    val href: String? = null,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * The promotion id. Stable across reads — clients use it as a list key.
     */
    val key: String,

    /**
     * Where this banner sits in Home's section sequence: 0 above the first section, n after the
     * nth.
     *
     * ⚠ `WireInt`, NOT `number`. 027 lost days to Kotlin serialising a quantity as `Double`,
     * the wire carrying `1.0`, and Go's `encoding/json` refusing `1.0` into an `int` — while
     * every unit test passed, because the fakes spoke Kotlin at both ends and never crossed the
     * wire. The fix was made at the contract so the generated Kotlin cannot regress; this field
     * takes the same treatment.
     */
    val position: Long? = null,

    val subtitle: String? = null,
    val target: BannerTarget? = null,

    /**
     * The condition sentence, e.g. `"On orders over $30"` — COMPOSED SERVER-SIDE from the
     * promotion's minimum, so both surfaces phrase one promotion identically. Null when it has
     * no conditions.
     *
     * FR-037d: a shopper must learn of a condition from the banner or from where it leads —
     * never first at payment.
     */
    val terms: String? = null,

    val title: String
)

@Serializable
data class BannerTarget (
    val kind: Kind,
    val categoryKey: String? = null,

    @SerialName("productId")
    val productID: String? = null
)

@Serializable
enum class Kind(val value: String) {
    @SerialName("category") Category("category"),
    @SerialName("product") Product("product"),
    @SerialName("sale") Sale("sale"),
    @SerialName("search") Search("search");
}

/**
 * The full cart — returned by GET /v1/cart AND by every mutating response, so a client
 * never has to guess the outcome of a change or issue a follow-up read (FR-007).
 */
@Serializable
data class CartDTO (
    val checkout: CartCheckoutStateDTO,
    val currency: String,

    /**
     * Always "0.00" here: delivery is priced at the delivery step, once a destination exists
     * (FR-063).
     */
    val deliveryFeeAmount: String,

    val discount: CartDiscountDTO? = null,

    /**
     * "0.00" when no code applies.
     */
    val discountAmount: String,

    /**
     * itemSubtotal − discount.
     */
    val grandTotalAmount: String,

    /**
     * Payable, available lines only — unavailable items are never charged for (FR-022).
     */
    val itemSubtotalAmount: String,

    val limits: CartLimitsDTO,
    val lines: List<CartLineDTO>,
    val notices: List<CartNoticeDTO>,

    /**
     * Monotonic, bumped by every mutation. The client mirror adopts a response only when this
     * exceeds what it holds, which is how an out-of-order reply cannot overwrite a newer cart
     * (FR-009).
     */
    val revision: Long,

    /**
     * Set aside for later: kept, shown honestly, and counted in NO total (FR-028…FR-031).
     */
    val savedLines: List<CartLineDTO>
)

/**
 * Whether the shopper may proceed, and if not, why — so the cart can say it up front
 * instead of letting them walk into a refusal at payment (FR-054). Also enforced
 * server-side at intent (FR-056).
 */
@Serializable
data class CartCheckoutStateDTO (
    val allowed: Boolean,
    val blockedReason: CartBlockedReason? = null,

    /**
     * Null when no minimum is in force; then nothing is shown at all (FR-057).
     */
    val minimumSubtotalAmount: String? = null,

    /**
     * How much more is needed to reach the minimum. Null unless `blockedReason` is
     * "below_minimum".
     */
    val remainingAmount: String? = null
)

/**
 * Why checkout is unavailable, when it is.
 */
@Serializable
enum class CartBlockedReason(val value: String) {
    @SerialName("below_minimum") BelowMinimum("below_minimum"),
    @SerialName("empty") Empty("empty"),
    @SerialName("no_payable_items") NoPayableItems("no_payable_items");
}

/**
 * The discount currently applying, recomputed on every read — never a stored or client-sent
 * amount.
 */
@Serializable
data class CartDiscountDTO (
    /**
     * The computed reduction, capped so the payable total can never fall below zero.
     */
    val amount: String,

    val code: String,
    val kind: CartDiscountKind,

    /**
     * e.g. "20% off" — display only, and shop-free.
     */
    val label: String
)

/**
 * What a discount takes off. A NAMED type on purpose: an inline `"percentage" | "fixed"`
 * union makes the Kotlin generator emit a class called `Kind`, which is the same
 * generic-name trap that produced 019's bare `Line` class. Named here, it generates
 * `CartDiscountKind`.
 */
@Serializable
enum class CartDiscountKind(val value: String) {
    @SerialName("fixed") Fixed("fixed"),
    @SerialName("percentage") Percentage("percentage");
}

/**
 * The platform's ceilings, sent so the client can explain them rather than guess them
 * (FR-037/038).
 */
@Serializable
data class CartLimitsDTO (
    val maxDistinctItems: Long,
    val maxLineQuantity: Long
)

/**
 * A cart line, or a set-aside line — the same shape; re-priced against the catalog on every
 * read.
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
     * The price this line was added at, when it differs from `unitPriceAmount` — so the shopper
     * is told what it *was* rather than being surprised at payment (FR-023). Null when
     * unchanged, and null for a line added before the platform recorded add-time prices (a
     * pre-migration row must not fabricate a change). The shopper always pays
     * `unitPriceAmount`, in both directions.
     */
    val priceChangedFrom: String? = null,

    @SerialName("productId")
    val productID: String,

    val quantity: Long,
    val unitPriceAmount: String
)

@Serializable
data class CartNoticeDTO (
    /**
     * Human-readable specifics where the kind alone is not enough. NEVER names or implies a
     * shop.
     */
    val detail: String? = null,

    val kind: CartNoticeKind,

    @SerialName("productId")
    val productID: String? = null
)

/**
 * A notice the cart surfaces before checkout. `productId` is null for a cart-level notice
 * (a promotional code that stopped applying) — a widening of 019's shape, inert for
 * existing readers, which match on `kind` and `productId` together.
 */
@Serializable
enum class CartNoticeKind(val value: String) {
    @SerialName("cart_full") CartFull("cart_full"),
    @SerialName("price_changed") PriceChanged("price_changed"),
    @SerialName("promo_no_longer_applies") PromoNoLongerApplies("promo_no_longer_applies"),
    @SerialName("quantity_clamped") QuantityClamped("quantity_clamped"),
    @SerialName("removed") Removed("removed"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * One line of a client-supplied set (merge, preview).
 */
@Serializable
data class CartLineInput (
    @SerialName("productId")
    val productID: String,

    val quantity: Long
)

/**
 * GET /v1/cart/policy — PUBLIC. The minimum and the ceilings, so a guest cart can gate and
 * explain honestly without a server cart to read them from.
 */
@Serializable
data class CartPolicyDTO (
    val currency: String,
    val maxDistinctItems: Long,
    val maxLineQuantity: Long,
    val minimumSubtotalAmount: String
)

/**
 * POST /v1/cart/preview — PUBLIC. Re-price a guest's device cart with full notices and
 * write nothing, so a restored guest cart shows current prices and availability too (FR-004
 * applies to guests).
 */
@Serializable
data class CartPreviewRequest (
    val lines: List<CartLineInput>
)

/**
 * A browse/filter category, customer projection (GET /v1/storefront/categories). Distinct
 * from the admin/shop `CategoryDTO` in catalog.ts — this carries no internal
 * id/status/order.
 */
@Serializable
data class StorefrontCategoryDTO (
    /**
     * Representative image, DERIVED from a product in the category — categories store no
     * imagery, and 025 FR-001 forbids adding a column for it. Null → the client renders a brand
     * tile, never a broken frame. The choice is deterministic so a category does not change its
     * face between page loads.
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    val key: String,
    val name: String,
    val parentKey: String? = null,

    /**
     * Active products in this category (025). Drives "N items" and the empty-category case.
     */
    val productCount: Double
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
 * POST /v1/cart/merge — fold a device cart into the account cart at sign-in.
 *
 * ⚠ UNION WITH MAXIMUM QUANTITY per product. This is NOT 019's original `/v1/cart/merge`,
 * which SUMMED quantities and was removed on 2026-07-23 after it tripled carts. Taking the
 * maximum makes the operation idempotent AND commutative: signing in twice, or retrying an
 * interrupted merge, leaves exactly the same cart (FR-011, FR-012). Nothing from either
 * side is dropped.
 */
@Serializable
data class MergeCartRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    val lines: List<CartLineInput>
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

    /**
     * The promotional discount applied at payment (027 FR-049). The platform's own computation
     * at that moment, stored on the order — so a receipt stays explainable years later even if
     * the code has since been changed or disabled. "0.00" (or absent, on a pre-027 order) when
     * no code was used. Invariant: grandTotal = itemSubtotal + deliveryFee − discount.
     */
    val discountAmount: String? = null,

    val fulfillments: List<OrderFulfillmentDTO>,
    val grandTotalAmount: String,
    val id: String,
    val items: List<OrderItemDTO>,
    val itemSubtotalAmount: String,
    val orderNumber: String,
    val paymentStatus: PaymentStatus,
    val placedAt: String? = null,

    /**
     * The literal code used, denormalised beside the discount so the receipt can still say
     * "SPRING20" independently of the promotion record. Null/absent when no code was used.
     */
    val promoCode: String? = null,

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

    /**
     * 027 — set when a promotional code was used, so history can mark a discounted order.
     */
    val promoCode: String? = null,

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

    /**
     * The primary category's key — drives the related-products rail (025 FR-026).
     * `categoryPath` carries display NAMES, which cannot be used to query.
     */
    val categoryKey: String,

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
 * The orderings a result set can be presented in (025 FR-016).
 *
 * `relevance` is only meaningful alongside a text query; without one the server falls back
 * to `newest` and reports what it actually did in `ProductSearchResultDTO.sort`.
 *
 * The ordering ACTUALLY applied — may differ from the request. Render the sort control from
 * this, not from what was asked for, or the control will misdescribe the list beneath it.
 */
@Serializable
enum class ProductSort(val value: String) {
    @SerialName("newest") Newest("newest"),
    @SerialName("price_asc") PriceAsc("price_asc"),
    @SerialName("price_desc") PriceDesc("price_desc"),
    @SerialName("relevance") Relevance("relevance");
}

/**
 * POST /v1/cart/reorder — put a past order's items back in the cart (FR-034).
 * Union-with-maximum against the current cart, so a double tap cannot double quantities.
 */
@Serializable
data class ReorderRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    @SerialName("orderId")
    val orderID: String
)

/**
 * The reorder outcome: the resulting cart plus exactly what could not come back, so the
 * shopper is told rather than left to notice (FR-035). The report names no shop.
 */
@Serializable
data class ReorderResultDTO (
    val cart: CartDTO,
    val skipped: List<ReorderSkippedDTO>
)

@Serializable
data class ReorderSkippedDTO (
    val name: String? = null,

    @SerialName("productId")
    val productID: String,

    val reason: ReorderSkipReason
)

/**
 * Why an item from a past order could not be added back.
 */
@Serializable
enum class ReorderSkipReason(val value: String) {
    @SerialName("cart_full") CartFull("cart_full"),
    @SerialName("clamped") Clamped("clamped"),
    @SerialName("removed") Removed("removed"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * A page of search results with a keyset cursor for infinite scroll.
 *
 * ⚠ `cursor` is OPAQUE and sort-tagged. Do not construct one, and do not carry one across a
 * sort change — the server rejects a cursor issued under a different ordering with 400
 * `cursor_sort_mismatch`, because honouring it would silently drop and repeat products
 * (FR-016b).
 */
@Serializable
data class ProductSearchResultDTO (
    val items: List<StorefrontProductCardDTO>,
    val nextCursor: String? = null,

    /**
     * The ordering ACTUALLY applied — may differ from the request. Render the sort control from
     * this, not from what was asked for, or the control will misdescribe the list beneath it.
     */
    val sort: ProductSort,

    /**
     * Total products matching the refinements, ignoring pagination (025 FR-016a).
     */
    val total: Double
)

/**
 * Whether Effy delivers to a location, answered BEFORE a cart exists (025 FR-014).
 *
 * ⚠ Deliberately just the answer. No delivery fee or window (FR-014a — both depend on cart
 * contents, so anything shown here is an estimate checkout would revise), and no zone id or
 * name (FR-006 — zone names are geographic and would disclose where Effy fulfils from).
 */
@Serializable
data class ServiceabilityDTO (
    /**
     * The normalised postcode the answer applies to.
     */
    val postcode: String,

    val serviced: Boolean
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
 * PATCH /v1/cart/items/{productId} — set an ABSOLUTE line quantity; 0 removes.
 *
 * Absolute, not a delta, which is what lets the client debounce ten taps into one request
 * and drop the intermediate values safely (FR-016). Idempotent, so `changeId` is optional;
 * clients send it anyway so the queue has no special cases.
 */
@Serializable
data class UpdateCartLineRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    val quantity: Long
)
