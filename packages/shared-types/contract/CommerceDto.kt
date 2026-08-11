// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,saved-item}.ts — DO NOT EDIT.
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
     * Which of Home's two placements this banner occupies (029 FR-027). **Exclusive** — never
     * both.
     *
     * ⚠ Optional, and absent means `"carousel"` — matching the column default, so a client
     * reading a server that has not been redeployed degrades to the safe case rather than
     * losing the banner.
     */
    val placement: BannerPlacement? = null,

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

/**
 * Which of Home's two placements this banner occupies (029 FR-027). **Exclusive** — never
 * both.
 *
 * ⚠ Optional, and absent means `"carousel"` — matching the column default, so a client
 * reading a server that has not been redeployed degrades to the safe case rather than
 * losing the banner.
 *
 * Where an advertised promotion appears on Home (029 FR-027). **Exclusive** — never both.
 *
 * ⚠ Declared ONCE, here, and imported by both `storefront.ts` (the shopper-facing banner)
 * and `promotion.ts` (the operator-facing promotion). It was briefly declared in both,
 * which typechecked in each file alone and collided the moment the package re-exported them
 * — the same union in two places is precisely the drift Principle II exists to prevent.
 */
@Serializable
enum class BannerPlacement(val value: String) {
    @SerialName("carousel") Carousel("carousel"),
    @SerialName("inline") Inline("inline");
}

@Serializable
data class BannerTarget (
    val kind: Kind,
    val categoryKey: String? = null,

    @SerialName("productId")
    val productID: String? = null,

    @SerialName("promotionId")
    val promotionID: String? = null
)

@Serializable
enum class Kind(val value: String) {
    @SerialName("category") Category("category"),
    @SerialName("product") Product("product"),
    @SerialName("promotion") Promotion("promotion"),
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
     * The SHIPPING address (required). Snapshotted onto the order at placement.
     */
    @SerialName("addressId")
    val addressID: String,

    /**
     * 023: the BILLING address, when the customer diverged from shipping. Absent / null / equal
     * to `addressId` → billing is "same as shipping" (the order stores NULL). Billing never
     * affects the amount.
     */
    @SerialName("billingAddressId")
    val billingAddressID: String? = null
)

@Serializable
data class CreateCheckoutIntentResponse (
    /**
     * Authorizes confirming exactly this PaymentIntent from the client. Never a secret key.
     */
    val clientSecret: String,

    val currency: String,
    val grandTotalAmount: String,

    @SerialName("orderId")
    val orderID: String,

    val orderNumber: String,
    val publishableKey: String
)

/**
 * One refinable dimension: category, brand, an attribute-definition key, or `offers` (043).
 */
@Serializable
data class FacetDTO (
    /**
     * `"category"`, `"brand"`, `"offers"`, or an attribute-definition key (e.g. `"diet"`).
     */
    val key: String,

    val label: String,
    val options: List<FacetOptionDTO>,
    val type: FacetType
)

/**
 * One selectable value within a facet, carrying its count in the CURRENT result set (043
 * FR-008).
 *
 * ⚠ Zero-count options are OMITTED by the server (FR-009) — an option that leads nowhere is
 * not an option. `count` is therefore always ≥ 1 as delivered.
 */
@Serializable
data class FacetOptionDTO (
    /**
     * ⚠ `WireInt` (`@asType integer`) so the generated Kotlin reads an Int, not a Double — the
     * 027 `1.0`-into-an-int lesson, applied to the count field.
     */
    val count: Long,

    val label: String,
    val value: String
)

/**
 * The control a facet drives (043).
 *
 * `single_select` — pick one (category; reuses the `categoryKey` filter param).
 * `multi_select`  — tick many, OR within (brand, single/multi-select + boolean attributes).
 * `toggle`        — an on/off control (offers). Closed vocabulary: a client meeting an
 * unknown value                  renders nothing for that facet (tolerant reader).
 */
@Serializable
enum class FacetType(val value: String) {
    @SerialName("multi_select") MultiSelect("multi_select"),
    @SerialName("single_select") SingleSelect("single_select"),
    @SerialName("toggle") Toggle("toggle");
}

/**
 * The facets available for a query + applied filters, with per-option counts (043 US2).
 *
 * Computed on filter-change, NOT per page — the product grid pages independently via
 * `ProductSearchResultDTO`. `priceBounds` drives the price control's range and is null when
 * the set is empty.
 */
@Serializable
data class FacetSetDTO (
    val facets: List<FacetDTO>,
    val priceBounds: PriceBounds? = null
)

@Serializable
data class PriceBounds (
    val max: String,
    val min: String
)

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
 * The at-a-glance product card used in rails, search results, saved items and
 * recently-viewed.
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
 * A badge shown on a product card. Derived server-side (on_sale = has compare-at; new =
 * newest).
 */
@Serializable
enum class ProductBadge(val value: String) {
    @SerialName("new") New("new"),
    @SerialName("on_sale") OnSale("on_sale");
}

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

    /**
     * The promotional discount applied at payment (027 FR-049). The platform's own computation
     * at that moment, stored on the order — so a receipt stays explainable years later even if
     * the code has since been changed or disabled. "0.00" (or absent, on a pre-027 order) when
     * no code was used. Invariant: grandTotal = itemSubtotal − discount. (There is no delivery
     * fee on this platform.)
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
 * One advertised promotion in full — the destination of a banner tap (`GET
 * /v1/storefront/promotions/:id`).
 *
 * ⚠ WHY A PROMOTION HAS NO OTHER DESTINATION. `promo_code` carries no product or category
 * scoping: a promotion is a whole-cart discount with an optional minimum. There is no set
 * of qualifying products to filter a results list to, so a banner pointed at one was always
 * pointing at nothing in particular. A cart-level code is a message, and the destination
 * for a message is the message itself.
 *
 * ⚠ Served through the SAME visibility predicate Home used, so a promotion that expired,
 * was exhausted or was withdrawn between Home loading and the tap is **404, not stale
 * terms** (028 FR-036). This is also why the response is uncached.
 */
@Serializable
data class PromotionDTO (
    /**
     * NON-nullable, unlike `BannerDTO.code` — a screen whose purpose is to hand over a code
     * must have one.
     */
    val code: String,

    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val subtitle: String? = null,

    /**
     * The same sentence `BannerDTO.terms` carries, from the same server-side composer.
     */
    val terms: String? = null,

    val title: String,

    /**
     * How long is left — `"Ends in 3 days"`, `"Ends tomorrow"`. Null when the promotion never
     * ends.
     *
     * ⚠ RELATIVE, not a calendar date, and composed server-side. A date means nothing without a
     * timezone and the platform has no timezone concept; a duration reads the same from
     * anywhere. Mobile additionally has no date formatting of any kind, so a raw timestamp
     * could not be rendered there.
     */
    val validity: String? = null
)

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

@Serializable
data class SavedAddToCartRequest (
    @SerialName("changeId")
    val changeID: String? = null
)

/**
 * The result of adding every purchasable saved item to the cart.
 *
 * ⚠ `skipped` is the whole point of this shape. FR-052 forbids silent omission: a bulk add
 * that quietly drops what it could not take leaves the shopper believing they bought
 * something they did not. Every omission carries a reason.
 */
@Serializable
data class SavedAddToCartResultDTO (
    val added: List<String>,
    val skipped: List<SavedSkip>
)

/**
 * Why one product could not be taken (a merge or a bulk add).
 */
@Serializable
data class SavedSkip (
    @SerialName("productId")
    val productID: String,

    /**
     * `cap_reached` | `not_found` | a `SavedVerdict` | a cart refusal reason.
     */
    val reason: String
)

/**
 * One entry in the saved list.
 *
 * Name, image and CURRENT price are read live (FR-045) — a renamed or re-imaged product
 * shows its true present identity. Only `savedPriceAmount` is remembered, and only so a
 * drop is detectable.
 *
 * ⚠ THIS DELIBERATELY DOES NOT EXTEND `StorefrontProductCardDTO`, and the reason is the
 * whole point of the feature. That interface carries `available: boolean` — a flag derived
 * from catalogue status alone, which is precisely the field that lied: a product can be
 * `available: true` and still not purchasable at the shopper's address, which is how the
 * predecessor invited people into a checkout that refused them. `verdict` REPLACES it.
 * Extending the card would carry the lying boolean back in beside the five-way answer that
 * supersedes it, and a client would then have two fields disagreeing about the same
 * question — which is how they end up rendering the wrong one.
 *
 * The shared card fields are therefore repeated here on purpose. That is duplication with a
 * reason, not drift.
 */
@Serializable
data class SavedItemDTO (
    val badges: List<ProductBadge>,
    val brand: String? = null,

    /**
     * For client-side grouping by aisle (FR-056). Absent when the product has no primary
     * category.
     */
    val categoryKey: String? = null,

    val compareAtAmount: String? = null,
    val currency: String,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    val name: String,
    val priceAmount: String,

    /**
     * Present and `true` only when the current price is BELOW the save-time price.
     *
     * ⚠ There is deliberately no `priceRose`. The current price is always shown, so nothing is
     * concealed — but a rise is not something a shopper can act on, and badging it would add
     * noise to the one signal this list exists to carry.
     */
    val priceDropped: Boolean? = null,

    /**
     * When it was saved. Drives list order (newest first) and undo's restore position.
     */
    val savedAt: String,

    /**
     * The price at the moment of saving — the baseline `priceDropped` is measured against.
     */
    val savedPriceAmount: String,

    val verdict: SavedVerdict
)

/**
 * Whether the shopper can buy a saved item right now.
 *
 * ⚠ THREE VALUES. `not_delivered_to_your_area` and `not_yet_determined` were both derived
 * from delivery zones, and delivery zones were withdrawn from the platform. The list still
 * tells the truth about stock and withdrawal — it simply has nothing to say about delivery
 * reach, because nothing on the platform knows it. Each remaining value still implies a
 * different next action:
 *
 * purchasable             → buy now   temporarily_unavailable → sold, not in stock — wait
 * no_longer_sold          → withdrawn entirely — give up
 */
@Serializable
enum class SavedVerdict(val value: String) {
    @SerialName("no_longer_sold") NoLongerSold("no_longer_sold"),
    @SerialName("purchasable") Purchasable("purchasable"),
    @SerialName("temporarily_unavailable") TemporarilyUnavailable("temporarily_unavailable");
}

/**
 * The shopper's whole set of saved product ids.
 *
 * ⚠ THIS IS WHAT MAKES THE HEART TELL THE TRUTH. It is fetched ONCE per screen and answers
 * for every product on it. The two alternatives were both rejected: an `isSaved` field on
 * catalogue reads would make every product response shopper-specific and destroy the
 * storefront's static shell, and a per-product lookup would be one request per tile
 * (FR-020).
 *
 * Bounded by the 200-item cap, which is what keeps a whole-set read cheap enough to do this
 * way.
 */
@Serializable
data class SavedMembershipDTO (
    /**
     * ⚠ WireInt, not number — see the note on the import.
     */
    val count: Long,

    @SerialName("productIds")
    val productIDS: List<String>
)

@Serializable
data class SavedMergeRequest (
    val items: List<SavedMergeItem>
)

/**
 * One device-held saved item being offered to an account (FR-028).
 */
@Serializable
data class SavedMergeItem (
    @SerialName("productId")
    val productID: String,

    val savedAt: String,
    val savedCurrency: String? = null,

    /**
     * ⚠ The GUEST's save-time price travels with it. Taking the price at merge time instead
     * would silently erase the movement the watchlist exists to report, for exactly the shopper
     * who saved earliest and has waited longest.
     *
     * ⚠ NULLABLE, and absent is meaningful: it means the device never observed a price, because
     * the surface the shopper tapped on carried only a product id. The platform then uses the
     * product's CURRENT price as the baseline — which is what an ordinary save records. Sending
     * `"0"` instead would report the item as having fallen from nothing: a fabricated fact,
     * worse than an absent one.
     */
    val savedPriceAmount: String? = null
)

/**
 * The result of joining a device-held list into an account.
 *
 * Returns the resulting set so the client seeds its store from this response rather than
 * issuing a second read, and `added` so the surface can DISCLOSE the join by count (FR-032)
 * instead of silently absorbing someone else's saves on a shared device.
 */
@Serializable
data class SavedMergeResultDTO (
    /**
     * ⚠ WireInt, not number.
     */
    val added: Long,

    @SerialName("productIds")
    val productIDS: List<String>,

    val skipped: List<SavedSkip>
)

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
