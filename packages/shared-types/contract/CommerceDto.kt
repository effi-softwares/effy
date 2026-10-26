// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,saved-item}.ts — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types commerce-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded (019).

package com.effyshopping.customer.mobile.commerce.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * POST /v1/cart/items: add or increment a line, the one non-idempotent cart write.
 * `changeId` is required: a UUIDv4 minted once per shopper action and reused by every
 * retry, so a lost response cannot apply twice.
 */
@Serializable
data class AddToCartRequest (
    @SerialName("changeId")
    val changeID: String,

    val quantity: Long,

    /**
     * The variant chosen; a product with no options has exactly one.
     */
    @SerialName("variantId")
    val variantID: String
)

/**
 * A saved delivery address (GET /v1/addresses).
 */
@Serializable
data class AddressDTO (
    val city: String,
    val country: String,

    /**
     * Who delivers to this address today: decided when read, never saved with it.
     */
    val coverage: CoverageKind? = null,

    /**
     * The instructions this address prefills at checkout, or null. A placed order never reads
     * this.
     */
    val defaultDeliveryInstructions: DeliveryInstructionsDTO? = null,

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
 * Who delivers to this address today: decided when read, never saved with it.
 *
 * Who delivers to an address:  effy the postcode is on Effy's list; Effy's drivers deliver
 * courier not on the list, and courier delivery is offered there  none neither reaches it
 * Decided only by `public.coverage_for_postcode`, when asked, never stored against an
 * address. A customer contract carries this value and nothing about why.
 *
 * Who delivers to this address. `none` means not serviced; `courier` only when a courier
 * order can be placed.
 */
@Serializable
enum class CoverageKind(val value: String) {
    @SerialName("courier") Courier("courier"),
    @SerialName("effy") Effy("effy"),
    @SerialName("none") None("none");
}

@Serializable
data class DeliveryInstructionsDTO (
    val handover: HandoverPreference? = null,

    /**
     * Plain text, already normalised; never interpreted as markup.
     */
    val note: String? = null
)

/**
 * Delivery instructions: how to hand the order over, and a short note. The vocabulary, the
 * length limit and the normalisation rule live here only; the customer surfaces use them
 * for a remaining-characters count and checkout calls `normaliseDeliveryInstructions`
 * itself, so client and server agree. `delivery-instructions.fixtures.json` is the rule's
 * table of cases.
 */
@Serializable
enum class HandoverPreference(val value: String) {
    @SerialName("leave_at_door") LeaveAtDoor("leave_at_door"),
    @SerialName("meet_at_door") MeetAtDoor("meet_at_door");
}

/**
 * POST /v1/cart/promo: applies a code. Signed-in only (a per-shopper cap needs identity).
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
    val items: List<AttributeGroupItem>
)

@Serializable
data class AttributeGroupItem (
    val label: String,
    val value: String
)

@Serializable
data class BillingAddressDTO (
    val city: String,

    /**
     * ISO-3166 alpha-2. Always "AU" while Effy sells in one country.
     */
    val country: String,

    val line1: String,
    val line2: String? = null,
    val postalCode: String,
    val state: String
)

/**
 * The billing details Effy supplies at confirmation, so the payment step asks for no
 * country, postcode or name: the order's billing snapshot (the delivery address, or the
 * chosen billing one) and the profile name. Derived, never accepted: a `billingDetails` key
 * in a request is ignored.
 */
@Serializable
data class BillingDetailsDTO (
    val address: BillingAddressDTO,
    val email: String? = null,
    val name: String? = null
)

/**
 * `PUT /commerce/v1/orders/{id}/business-identity`: the buyer's own business, for its
 * invoice.
 */
@Serializable
data class BusinessIdentityRequest (
    val abn: String? = null,
    val businessName: String? = null
)

@Serializable
data class CancelOrderBody (
    val reason: String? = null
)

/**
 * The full cart, returned by GET /v1/cart and by every mutation, so a client never guesses
 * an outcome.
 */
@Serializable
data class CartDTO (
    val checkout: CartCheckoutStateDTO,
    val currency: String,

    /**
     * The entered code's line, for the code field. `promotions` lists every promotion applying.
     */
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
     * Payable, available lines only: unavailable items are never charged for.
     */
    val itemSubtotalAmount: String,

    val limits: CartLimitsDTO,
    val lines: List<CartLineDTO>,
    val notices: List<CartNoticeDTO>,

    /**
     * Every promotion applying, automatic and by code.
     */
    val promotions: List<CartPromotionLineDTO>,

    /**
     * Promotions the shopper might expect that do not apply, each with its sentence.
     */
    val promotionsNotApplied: List<CartNotAppliedDTO>? = null,

    /**
     * Bumped by every mutation; the mirror adopts a response only when this is newer, so a late
     * reply cannot win.
     */
    val revision: Long,

    /**
     * Set aside for later: kept, shown, and counted in no total.
     */
    val savedLines: List<CartLineDTO>
)

/**
 * Whether the shopper may proceed and, if not, why, so the cart says it up front. The
 * intent enforces it too.
 */
@Serializable
data class CartCheckoutStateDTO (
    val allowed: Boolean,
    val blockedReason: CartBlockedReason? = null,

    /**
     * Null when no minimum is in force; then nothing is shown.
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
 * The discount applying, recomputed on every read; never stored or client-sent.
 */
@Serializable
data class CartDiscountDTO (
    /**
     * Capped so the payable total never falls below zero.
     */
    val amount: String,

    val code: String,
    val kind: CartDiscountKind,

    /**
     * e.g. "20% off"; display only.
     */
    val label: String
)

/**
 * What a discount takes off. Named, so the Kotlin generator emits `CartDiscountKind` rather
 * than `Kind`.
 */
@Serializable
enum class CartDiscountKind(val value: String) {
    @SerialName("fixed") Fixed("fixed"),
    @SerialName("percentage") Percentage("percentage");
}

/**
 * The platform's ceilings, so the client can explain them.
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
    /**
     * Sold to adults only: show the 18+ label.
     */
    val ageRestricted: Boolean,

    val available: Boolean,

    /**
     * What promotions take off this line, in cents as allocated; "0.00" when none.
     */
    val discountAmount: String? = null,

    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val lineSubtotalAmount: String,
    val name: String,

    /**
     * An opaque package grouping key: lines sharing it ship together as one package (one per
     * fulfilling shop). Not a shop id, name or location.
     */
    val packageKey: String,

    /**
     * The price this line was added at, when it differs from `unitPriceAmount`, so the shopper
     * is told what it was. Null when unchanged. The shopper always pays `unitPriceAmount`.
     */
    val priceChangedFrom: String? = null,

    @SerialName("productId")
    val productID: String,

    val quantity: Long,

    /**
     * The comparison price of one unit after this line's discount; null without a pack size.
     */
    val unitPrice: UnitPriceDTO? = null,

    val unitPriceAmount: String,

    /**
     * The variant this line buys; lines are keyed by it (two sizes of one product are two
     * lines).
     */
    @SerialName("variantId")
    val variantID: String,

    /**
     * "Spiced / 500 g"; null for a product with no options.
     */
    val variantLabel: String? = null
)

/**
 * A server-computed comparison price. `amount` is a 2-dp money string, like every price on
 * the wire.
 */
@Serializable
data class UnitPriceDTO (
    val amount: String,
    val basis: UnitBasis
)

/**
 * Unit pricing. A product says how its sizes are compared (`UnitBasis`: per 100 g, per kg,
 * per 100 mL, per L, each); each variant says how much is in its pack. The comparison price
 * is the price scaled to the basis ($3.20 for 500 g → $0.64 / 100 g), as the Unit Pricing
 * Code asks.
 *
 * One sum, here: the server computes `UnitPriceDTO`; clients only format it
 * (`unitPriceText`), the app's Kotlin formatter pinned to `unit-price.fixtures.json`.
 * Integer arithmetic: whole cents, quantities in thousandths, one half-up rounding at the
 * end.
 */
@Serializable
enum class UnitBasis(val value: String) {
    @SerialName("each") Each("each"),
    @SerialName("per_100g") Per100G("per_100g"),
    @SerialName("per_100ml") Per100Ml("per_100ml"),
    @SerialName("per_kg") PerKg("per_kg"),
    @SerialName("per_l") PerL("per_l");
}

@Serializable
data class CartNoticeDTO (
    /**
     * Specifics where the kind alone is not enough. Never names or implies a shop.
     */
    val detail: String? = null,

    val kind: CartNoticeKind,

    @SerialName("productId")
    val productID: String? = null,

    /**
     * The line's variant, when the notice is about a line.
     */
    @SerialName("variantId")
    val variantID: String? = null
)

/**
 * A notice shown before checkout. `productId` is null for a cart-level notice (a code that
 * stopped applying).
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
 * A promotion applying to this cart, and what it takes off.
 */
@Serializable
data class CartPromotionLineDTO (
    /**
     * The code the shopper entered for it; null for an automatic promotion.
     */
    val code: String? = null,

    /**
     * Known once a delivery quote exists (checkout); "0.00" in the cart.
     */
    val deliveryAmount: String,

    val goodsAmount: String,

    /**
     * The shopper's words (the headline, or the offer label when there is none).
     */
    val headline: String,

    @SerialName("promotionId")
    val promotionID: String
)

@Serializable
data class CartNotAppliedDTO (
    /**
     * The sentence to show, composed server-side.
     */
    val detail: String,

    val headline: String,

    @SerialName("promotionId")
    val promotionID: String,

    val reason: CartPromotionNotAppliedReason
)

/**
 * Why a promotion the shopper could expect does not apply. Named for the Kotlin generator.
 */
@Serializable
enum class CartPromotionNotAppliedReason(val value: String) {
    @SerialName("below_minimum") BelowMinimum("below_minimum"),
    @SerialName("below_quantity") BelowQuantity("below_quantity"),
    @SerialName("not_combined") NotCombined("not_combined"),
    @SerialName("sign_in") SignIn("sign_in"),
    @SerialName("wrong_delivery") WrongDelivery("wrong_delivery"),
    @SerialName("wrong_time") WrongTime("wrong_time");
}

/**
 * One line of a client-supplied set (merge, preview).
 */
@Serializable
data class CartLineInput (
    val quantity: Long,

    /**
     * A line is a variant.
     */
    @SerialName("variantId")
    val variantID: String
)

/**
 * GET /v1/cart/policy (public): the minimum and the ceilings, for a guest cart.
 */
@Serializable
data class CartPolicyDTO (
    val currency: String,
    val maxDistinctItems: Long,
    val maxLineQuantity: Long,
    val minimumSubtotalAmount: String
)

/**
 * POST /v1/cart/preview (public): re-prices a guest's device cart with notices and writes
 * nothing.
 */
@Serializable
data class CartPreviewRequest (
    val lines: List<CartLineInput>
)

/**
 * A browse category, customer projection (GET /storefront/v1/categories): no internal id,
 * status or order.
 */
@Serializable
data class StorefrontCategoryDTO (
    /**
     * 1 for a department, up to 5.
     */
    val depth: Long,

    /**
     * A `CATEGORY_ICONS` key (a Lucide name); null shows the fallback glyph. Unknown keys also
     * show it.
     */
    val icon: String? = null,

    /**
     * The category's own picture, else one derived from a product in it, chosen
     * deterministically; null renders a brand tile.
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    /**
     * No sub-categories: its page lists products only.
     */
    val isLeaf: Boolean,

    val key: String,
    val name: String,
    val parentKey: String? = null,

    /**
     * Purchasable products in this category and everything under it, so an aisle's number is
     * what its page shows.
     */
    val productCount: Double
)

/**
 * POST /v1/checkout/confirm: the fallback finalizer for a delayed or missed webhook.
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

    /**
     * On update the key's presence is read: absent leaves the default, `null` clears it, a
     * value replaces it.
     */
    val defaultDeliveryInstructions: DeliveryInstructionsDTO? = null,

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
 * POST /v1/checkout/intent: create or locate the pending order and its PaymentIntent.
 */
@Serializable
data class CreateCheckoutIntentRequest (
    /**
     * The shipping address (required), snapshotted onto the order.
     */
    @SerialName("addressId")
    val addressID: String,

    /**
     * The billing address, when it differs; absent, null or equal to `addressId` means same as
     * shipping. Never affects the amount.
     */
    @SerialName("billingAddressId")
    val billingAddressID: String? = null,

    /**
     * What the customer tells the driver for this order, or null. Normalised by the server with
     * the client's own rule (`normaliseDeliveryInstructions`); refused with a field error,
     * never truncated. The server stores what this request carries and never reads the
     * address's saved default.
     */
    val deliveryInstructions: DeliveryInstructionsDTO? = null,

    /**
     * "As soon as possible", sent instead of `deliveryWindow` when the quote carried
     * `effyWindows.asap`; both or neither is `slot_required`. A day with no time is
     * `deliveryWindow` naming its `anyTime`.
     */
    val deliveryPromise: DeliveryPromise? = null,

    /**
     * The delivery type the client is showing; required for a courier order. A mismatch with
     * what applies now (or a courier quote answered without it) is 409 `delivery_type_changed`
     * with a fresh quote.
     */
    val deliveryType: DeliveryType? = null,

    /**
     * The window chosen, one for the whole order. Required when the quote carried `effyWindows`
     * (else `slot_required`). The server holds a place when it accepts it (`slotHeldUntil`).
     */
    val deliveryWindow: DeliveryWindow? = null,

    /**
     * The promotions total (goods + delivery) the client is showing. A different server total
     * is 409 `promotions_changed` with the current cart, nothing written.
     */
    val expectedDiscount: String? = null,

    /**
     * Points to pay with (whole, absent = 0). Refused rather than clamped: over usable is 409
     * `points_balance_changed`, over the total 422 `points_exceed_total`, a card remainder
     * under the provider minimum 422 `points_card_remainder_too_small`; each says what is
     * possible.
     */
    val pointsToUse: Long? = null,

    /**
     * The delivery total the client is showing. A different server total is 409
     * `delivery_fee_changed` with a fresh quote, nothing written, so the customer sees it
     * before paying.
     */
    val shownDeliveryAmount: String? = null,

    /**
     * Set by a client rendering a provider-owned payment-method list (mobile), which needs a
     * customer session; always minted for the authenticated subject. There is no
     * `billingDetails` here: they derive from the order's snapshot.
     */
    val wantsProviderMethodList: Boolean? = null
)

@Serializable
enum class DeliveryPromise(val value: String) {
    @SerialName("asap") Asap("asap");
}

/**
 * The delivery type the client is showing; required for a courier order. A mismatch with
 * what applies now (or a courier quote answered without it) is 409 `delivery_type_changed`
 * with a fresh quote.
 *
 * The delivery type the order was written with.
 *
 * Who delivers an order. One per order, whatever number of suppliers fill it.
 */
@Serializable
enum class DeliveryType(val value: String) {
    @SerialName("courier") Courier("courier"),
    @SerialName("effy") Effy("effy");
}

@Serializable
data class DeliveryWindow (
    val date: String,

    @SerialName("slotId")
    val slotID: String
)

@Serializable
data class CreateCheckoutIntentResponse (
    /**
     * The billing details the client passes back at confirmation, derived from the order (the
     * confirmed delivery or billing address, plus the profile name), never from the request.
     */
    val billingDetails: BillingDetailsDTO? = null,

    val cardAmount: String? = null,

    /**
     * Authorizes confirming exactly this PaymentIntent. Never a secret key.
     */
    val clientSecret: String,

    val currency: String,

    /**
     * The provider customer the session belongs to, present only beside `customerSessionSecret`
     * (the mobile SDKs take both). The secret is the credential; this id alone reaches no API.
     * Never logged or accepted as input.
     */
    @SerialName("customerId")
    val customerID: String? = null,

    /**
     * Authorizes a provider-owned payment-method list for this shopper. Mobile only (the web
     * lists cards from `GET /v1/payment-methods`); null elsewhere.
     */
    val customerSessionSecret: String? = null,

    /**
     * What delivery promotions took off the fee; absent or "0.00" when none.
     */
    val deliveryDiscountAmount: String? = null,

    /**
     * The delivery charge inside `grandTotalAmount`, as lines.
     */
    val deliveryFee: DeliveryFeeDTO? = null,

    /**
     * The delivery type the order was written with.
     */
    val deliveryType: DeliveryType? = null,

    val grandTotalAmount: String,

    @SerialName("orderId")
    val orderID: String,

    val orderNumber: String,

    /**
     * True when points covered the whole order: already paid, `clientSecret` empty; go to the
     * confirmation.
     */
    val paidWithPoints: Boolean? = null,

    /**
     * Whether the provider offers an instalment option for this intent, as the provider answers
     * it.
     */
    val payOverTimeAvailable: Boolean? = null,

    val pointsAmount: String? = null,

    /**
     * The points this order uses, their value, and what is left for the card.
     */
    val pointsUsed: Long? = null,

    val publishableKey: String,

    /**
     * Until when the window place is held. Once passed, call intent again before confirming
     * payment: it is the last moment the server can say the place has gone.
     */
    val slotHeldUntil: String? = null
)

/**
 * The delivery charge inside `grandTotalAmount`, as lines.
 *
 * What a customer is charged, in lines summing exactly to `totalAmount`; zero lines are
 * omitted. Nothing else: no distance, band, weight or plan, so nobody can work out where
 * the hub is or how pricing works.
 *
 * The courier fee for the whole order: lines and a total.
 *
 * Never carries a window or a delivery-today surcharge.
 *
 * The order's delivery charge with this window chosen.
 *
 * The same charge as lines (delivery, window surcharge, small-order fee, free delivery), as
 * sold and never recomputed.
 */
@Serializable
data class DeliveryFeeDTO (
    val lines: List<DeliveryFeeLineDTO>,

    /**
     * What this shopper's delivery promotions take off this option's fee. `totalAmount` is
     * unchanged; the promotions total is compared separately.
     */
    val promotionAmount: String? = null,

    val totalAmount: String
)

/**
 * `amount` is a signed 2-dp decimal string; only `free_delivery` is negative.
 */
@Serializable
data class DeliveryFeeLineDTO (
    val amount: String,
    val kind: DeliveryFeeLineKind
)

/**
 * One line of what a customer is charged for delivery:  delivery the fee for distance and
 * weight, before any window surcharge  window_surcharge what the chosen window adds
 * small_order the extra fee under the small-order amount  free_delivery the saving at the
 * free-delivery amount (negative)
 */
@Serializable
enum class DeliveryFeeLineKind(val value: String) {
    @SerialName("delivery") Delivery("delivery"),
    @SerialName("free_delivery") FreeDelivery("free_delivery"),
    @SerialName("small_order") SmallOrder("small_order"),
    @SerialName("window_surcharge") WindowSurcharge("window_surcharge");
}

/**
 * No destination field, ever: the refund goes to the order's payment method.
 */
@Serializable
data class CreateRefundRequestBody (
    val items: List<CreateRefundRequestItem>,
    val message: String
)

@Serializable
data class CreateRefundRequestItem (
    @SerialName("orderItemId")
    val orderItemID: String,

    val quantity: Long
)

/**
 * One refund as the customer sees it: three states, no failure text.
 */
@Serializable
data class CustomerRefundDTO (
    val amount: String,
    val refundedAt: String? = null,
    val state: State
)

@Serializable
enum class State(val value: String) {
    @SerialName("completed") Completed("completed"),
    @SerialName("on_its_way") OnItsWay("on_its_way"),
    @SerialName("there_was_a_problem") ThereWasAProblem("there_was_a_problem");
}

/**
 * The body of a delivery-choice refusal.
 */
@Serializable
data class DeliveryChoiceRefusalDTO (
    val code: DeliveryChoiceRefusalCode,

    /**
     * The options as they stand now. Absent on `slot_required` when no slot was sent.
     */
    val quote: DeliveryQuoteDTO? = null
)

/**
 * Why an intent was refused over the delivery choice: the `code` of a 409, with a fresh
 * `quote`. A refusal never substitutes a window or a day; the customer chooses again.
 */
@Serializable
enum class DeliveryChoiceRefusalCode(val value: String) {
    @SerialName("date_unavailable") DateUnavailable("date_unavailable"),
    @SerialName("delivery_type_changed") DeliveryTypeChanged("delivery_type_changed"),
    @SerialName("no_windows_available") NoWindowsAvailable("no_windows_available"),
    @SerialName("slot_required") SlotRequired("slot_required"),
    @SerialName("slot_unavailable") SlotUnavailable("slot_unavailable");
}

/**
 * The delivery quote shown at checkout, captured server-side so the order is honoured at it
 * (the client never sends a fee). A serviced address answers `effyWindows` or `courier`. No
 * package list.
 */
@Serializable
data class DeliveryQuoteDTO (
    /**
     * Present exactly when `coverage` is `"courier"`: nothing to choose; show "Courier
     * delivery", the estimate and the fee, and send `deliveryType: "courier"`. No distance,
     * company or supplier count.
     */
    val courier: CourierQuoteDTO? = null,

    /**
     * Who delivers to this address. `none` means not serviced; `courier` only when a courier
     * order can be placed.
     */
    val coverage: CoverageKind? = null,

    /**
     * Present exactly when `coverage` is `"effy"`: today's windows ("Same-day delivery") and
     * later days' ("Standard delivery"). The choice goes back as `deliveryWindow`.
     */
    val effyWindows: EffyWindowsDTO? = null,

    /**
     * ISO datetime with the Australia/Melbourne offset; "" when not serviced.
     */
    val expiresAt: String,

    /**
     * How much more the basket needs for free delivery; null when there is no such amount or it
     * is reached.
     */
    val freeDeliveryRemainingAmount: String? = null,

    /**
     * The customer's spendable points, when they have any.
     */
    val points: CheckoutPointsDTO? = null,

    val postcode: String,
    val serviced: Boolean
)

/**
 * Present exactly when `coverage` is `"courier"`: nothing to choose; show "Courier
 * delivery", the estimate and the fee, and send `deliveryType: "courier"`. No distance,
 * company or supplier count.
 *
 * What a customer is told and charged when a courier delivers the order.
 */
@Serializable
data class CourierQuoteDTO (
    /**
     * The courier's usual timeframe in the business's words ("2–4 business days"); always
     * printed through `courierLines`.
     */
    val estimate: String,

    /**
     * The courier fee for the whole order: lines and a total.
     */
    val fee: DeliveryFeeDTO,

    /**
     * `out_of_coverage`: Effy does not deliver there. `no_window`: it does, but no window is
     * available and the business sends it by courier; the client says there are no windows
     * first.
     */
    val reason: CourierQuoteReason
)

/**
 * `out_of_coverage`: Effy does not deliver there. `no_window`: it does, but no window is
 * available and the business sends it by courier; the client says there are no windows
 * first.
 *
 * Why a courier delivers this order. Named, so the generated Kotlin enum is too.
 */
@Serializable
enum class CourierQuoteReason(val value: String) {
    @SerialName("no_window") NoWindow("no_window"),
    @SerialName("out_of_coverage") OutOfCoverage("out_of_coverage");
}

@Serializable
data class EffyWindowsDTO (
    /**
     * "As soon as possible", when some day can take an untimed order. Carries no day; chosen
     * with `deliveryPromise: "asap"`.
     */
    val asap: EffyAsapDTO? = null,

    /**
     * Today first, then the next delivery days. Never empty.
     */
    val days: List<EffyDayDTO>,

    /**
     * Set when no window is open on any day: `no_windows` (closed or taken) or `none_defined`
     * (none switched on).
     */
    val unavailable: Unavailable? = null
)

@Serializable
data class EffyAsapDTO (
    /**
     * The business's words, e.g. "usually within 2–3 days". Print it only as an estimate.
     */
    val estimate: String,

    /**
     * Never carries a window or a delivery-today surcharge.
     */
    val fee: DeliveryFeeDTO
)

/**
 * One day on offer: today (`same_day`) or a later delivery day (`standard`).
 */
@Serializable
data class EffyDayDTO (
    /**
     * This day sold with no time, sent back as `deliveryWindow`; the order is promised the day.
     * Always null for today, never in `windows`.
     */
    val anyTime: EffyWindowDTO? = null,

    /**
     * Why `windows` is empty; null when it is not.
     */
    val closedReason: EffyDayClosedReason? = null,

    val date: String,
    val section: DeliveryMethod,

    /**
     * Open windows only, earliest first.
     */
    val windows: List<EffyWindowDTO>
)

/**
 * One window on one day. No capacity or remaining count: a full window is absent.
 */
@Serializable
data class EffyWindowDTO (
    /**
     * After this the window can no longer be chosen.
     */
    val cutoffAt: String,

    /**
     * yyyy-mm-dd (Melbourne).
     */
    val date: String,

    val endAt: String,

    /**
     * The order's delivery charge with this window chosen.
     */
    val fee: DeliveryFeeDTO,

    /**
     * Opaque. Sent back with `date` as `deliveryWindow` on the intent request.
     */
    @SerialName("slotId")
    val slotID: String,

    /**
     * ISO datetimes with the Australia/Melbourne offset.
     */
    val startAt: String,

    /**
     * What this window adds over the plain later-day fee; "0.00" when nothing.
     */
    val surchargeAmount: String
)

/**
 * Why a day has no window to choose. A later day is only ever "full".
 */
@Serializable
enum class EffyDayClosedReason(val value: String) {
    @SerialName("closed") Closed("closed"),
    @SerialName("full") Full("full"),
    @SerialName("not_delivery_day") NotDeliveryDay("not_delivery_day");
}

/**
 * The customer's words for when an Effy order arrives: `same_day` (a window today) or
 * `standard` (a later day). No price of its own.
 */
@Serializable
enum class DeliveryMethod(val value: String) {
    @SerialName("same_day") SameDay("same_day"),
    @SerialName("standard") Standard("standard");
}

@Serializable
enum class Unavailable(val value: String) {
    @SerialName("no_windows") NoWindows("no_windows"),
    @SerialName("none_defined") NoneDefined("none_defined");
}

/**
 * The customer's spendable points, when they have any.
 *
 * What a customer can spend at checkout, on the quote; absent with no points. Offer up to
 * min(usable, total); the card part must be 0 or at least `cardMinimumAmount`.
 */
@Serializable
data class CheckoutPointsDTO (
    val cardMinimumAmount: String,
    val centsPerPoint: Long,
    val usable: Long
)

/**
 * `GET /commerce/v1/orders/{id}/delivery-note` — what was supplied, line by line.
 */
@Serializable
data class DeliveryNoteDTO (
    /**
     * Always `DOCUMENT_CONTACT`.
     */
    val contact: String,

    /**
     * When the last of the order arrived.
     */
    val deliveredAt: String,

    /**
     * Merged by product across packages, so nothing reveals how many suppliers filled it.
     */
    val lines: List<DeliveryNoteLineDTO>,

    val orderNumber: String,
    val placedAt: String
)

/**
 * One line of the delivery note: a product, merged across the order's packages.
 */
@Serializable
data class DeliveryNoteLineDTO (
    val name: String,
    val ordered: Long,
    val status: DeliveryNoteLineStatus,
    val supplied: Long
)

@Serializable
enum class DeliveryNoteLineStatus(val value: String) {
    @SerialName("part") Part("part"),
    @SerialName("supplied") Supplied("supplied"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * One refinable dimension: category, brand, an attribute key, or `offers`.
 */
@Serializable
data class FacetDTO (
    /**
     * `"category"`, `"brand"`, `"offers"`, or an attribute key (e.g. `"allergens"`). Choice
     * values are allowed-value ids.
     */
    val key: String,

    val label: String,

    /**
     * Empty for a `range` facet.
     */
    val options: List<FacetOptionDTO>,

    /**
     * `range` facets only: the smallest and largest value in view, in `unit` (null when the
     * attribute has none).
     */
    val range: Range? = null,

    val type: FacetType
)

/**
 * One value within a facet, with its count in the current result set. Zero-count options
 * are omitted, so `count` is ≥ 1.
 */
@Serializable
data class FacetOptionDTO (
    /**
     * `WireInt`, so the generated Kotlin reads an Int.
     */
    val count: Long,

    val label: String,
    val value: String
)

/**
 * `range` facets only: the smallest and largest value in view, in `unit` (null when the
 * attribute has none).
 */
@Serializable
data class Range (
    val max: String,
    val min: String,
    val unit: String? = null
)

/**
 * The control a facet drives: `single_select` pick one (category; reuses the `categoryKey`
 * filter). `multi_select` tick many, OR within one facet, AND across facets (brand, choice
 * and yes/no attributes). `toggle` on/off (offers). `range` a minimum and maximum (number
 * attributes), sent as `range.<key>=<min>..<max>` in `range.unit`. A client meeting an
 * unknown value renders nothing for that facet.
 */
@Serializable
enum class FacetType(val value: String) {
    @SerialName("multi_select") MultiSelect("multi_select"),
    @SerialName("range") Range("range"),
    @SerialName("single_select") SingleSelect("single_select"),
    @SerialName("toggle") Toggle("toggle");
}

/**
 * The facets for a query and its filters, with per-option counts. Computed on filter
 * change, not per page; `priceBounds` is null for an empty set.
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
 * The composed Home payload (GET /storefront/v1/home).
 */
@Serializable
data class StorefrontHomeDTO (
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
 * The product card used in rails, search results, saved items and recently viewed.
 */
@Serializable
data class StorefrontProductCardDTO (
    /**
     * Sold to adults only: show the 18+ label.
     */
    val ageRestricted: Boolean,

    /**
     * Some variant can be bought now (the one availability rule).
     */
    val available: Boolean,

    val badges: List<ProductBadge>,
    val brand: String? = null,

    /**
     * The "was" price of the variant `priceAmount` came from.
     */
    val compareAtAmount: String? = null,

    val currency: String,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val name: String,

    /**
     * An item or buy-X-get-Y promotion open to everyone that covers this product.
     */
    val offer: ProductOfferDTO? = null,

    /**
     * The listing price: the lowest among active variants (say "From" when `priceVaries`).
     * Selling out one size never moves it.
     */
    val priceAmount: String,

    /**
     * Active variants' prices differ: show "From".
     */
    val priceVaries: Boolean,

    /**
     * The comparison price of `priceAmount`, with a unit basis and a pack size.
     */
    val unitPrice: UnitPriceDTO? = null,

    /**
     * Active variants; above 1 the tile offers "Choose" instead of quick-add.
     */
    val variantCount: Long,

    /**
     * The variant this tile stands for (the one a stock-code or barcode search matched, else
     * the default); quick-add adds it when `variantCount` is 1.
     */
    @SerialName("variantId")
    val variantID: String
)

/**
 * A badge on a product card, derived server-side (on_sale = has compare-at; new = newest).
 */
@Serializable
enum class ProductBadge(val value: String) {
    @SerialName("new") New("new"),
    @SerialName("on_sale") OnSale("on_sale");
}

/**
 * A product's offer badge on listings and its page.
 */
@Serializable
data class ProductOfferDTO (
    /**
     * "15% off", "Buy 2 get 1 free", "$2 off".
     */
    val label: String,

    @SerialName("promotionId")
    val promotionID: String
)

/**
 * GET /v1/payment-methods — the shopper's kept cards.
 */
@Serializable
data class ListPaymentMethodsResponse (
    /**
     * Empty means no kept cards and nothing else; a provider outage is an error, never `[]`.
     */
    val paymentMethods: List<PaymentMethodDTO>
)

/**
 * A card the shopper chose to keep, read live from the provider when needed and never
 * persisted (a copy would go stale).
 */
@Serializable
data class PaymentMethodDTO (
    /**
     * Network, for the mark and the label (e.g. "visa", "mastercard", "amex").
     */
    val brand: String,

    /**
     * `WireInt`, so the generated Kotlin is an `Int`.
     */
    val expMonth: Long,

    val expYear: Long,

    /**
     * The provider's payment-method reference. Opaque.
     */
    val id: String,

    /**
     * Which card the payment step pre-selects.
     */
    val isDefault: Boolean,

    /**
     * The only part of a card number that may leave the provider.
     */
    val last4: String,

    /**
     * Why the card cannot be used, when it cannot.
     */
    val unusableReason: String? = null,

    /**
     * Server-computed: the client never infers it from the expiry.
     */
    val usable: Boolean
)

/**
 * A product image: its permanent public address and alt text.
 */
@Serializable
data class MediaDTO (
    val alt: String? = null,

    @SerialName("imageUrl")
    val imageURL: String,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null
)

/**
 * POST /v1/cart/merge: folds a device cart into the account cart at sign-in, taking the
 * maximum quantity per variant, so a repeat or retried merge leaves the same cart. Nothing
 * from either side is dropped.
 */
@Serializable
data class MergeCartRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    val lines: List<CartLineInput>
)

@Serializable
data class OptionDTO (
    /**
     * The library attribute (attribute options); null for Pack size.
     */
    @SerialName("attributeId")
    val attributeID: String? = null,

    val id: String,
    val kind: OptionKind,

    /**
     * The attribute's name, or "Pack size".
     */
    val name: String,

    /**
     * 1 or 2.
     */
    val position: Long,

    val values: List<OptionValueDTO>
)

@Serializable
enum class OptionKind(val value: String) {
    @SerialName("attribute") Attribute("attribute"),
    @SerialName("pack_size") PackSize("pack_size");
}

@Serializable
data class OptionValueDTO (
    /**
     * The library value it is (attribute options); null for a pack size.
     */
    @SerialName("allowedValueId")
    val allowedValueID: String? = null,

    val id: String,
    val position: Long,

    /**
     * The label shoppers see: the attribute value's label, or a pack size ("500 g").
     */
    val value: String
)

/**
 * Full order / receipt (GET /v1/orders/{id}).
 */
@Serializable
data class OrderDTO (
    /**
     * What the shopper is out of pocket after refunds. Not a correction to `grandTotalAmount`,
     * which is what was charged: a receipt must reconcile against a bank statement.
     */
    val amountPaidAfterRefunds: String? = null,

    /**
     * When the order is expected to arrive. Carries no shop reference. Empty for a courier
     * order, which has no window or day: read `delivery` and print `deliverySummary`.
     */
    val arrivalEstimates: List<ArrivalEstimateDTO>,

    /**
     * The billing address snapshot; `null` means same as shipping. Never exposed to a shop.
     */
    val billingAddress: OrderAddressDTO? = null,

    /**
     * May the shopper still cancel this order themselves? Server-derived and advisory: the
     * server decides again under a row lock. `false` does not mean it can never be cancelled
     * (staff can, before it leaves), so wording must leave that door open.
     */
    val cancellable: Boolean,

    val currency: String,

    /**
     * Who delivers the order, and for a courier the estimate sold; printed through
     * `deliverySummary`.
     */
    val delivery: OrderDeliveryDTO,

    /**
     * The shipping address snapshot, where the order is delivered.
     */
    val deliveryAddress: OrderAddressDTO,

    /**
     * What delivery promotions took off the fee.
     */
    val deliveryDiscountAmount: String,

    /**
     * The same charge as lines (delivery, window surcharge, small-order fee, free delivery), as
     * sold and never recomputed.
     */
    val deliveryFee: DeliveryFeeDTO,

    /**
     * The delivery fee as charged.
     */
    val deliveryFeeAmount: String,

    /**
     * What the customer told the driver, or null. Fixed once paid. Render nothing for null, and
     * `note` as plain text.
     */
    val deliveryInstructions: DeliveryInstructionsDTO? = null,

    /**
     * The promotional discount as computed at payment and stored, so the receipt stays
     * explainable after a promotion changes. "0.00" when none.
     */
    val discountAmount: String,

    val fulfillments: List<OrderFulfillmentDTO>,

    /**
     * Derived from the totals, never stored, so line-by-line and all-at-once reach the same
     * fact.
     */
    val fullyRefunded: Boolean? = null,

    val grandTotalAmount: String,
    val id: String,
    val items: List<OrderItemDTO>,
    val itemSubtotalAmount: String,
    val orderNumber: String,

    /**
     * How the order was paid, safe to display; null when the post-commit capture failed (the
     * receipt omits the line).
     */
    val paymentMethod: PaymentMethodSummaryDTO? = null,

    /**
     * How the order was paid when points were part of it, and what has come back. Absent with
     * no points; points are a way of paying, never a discount.
     */
    val paymentSplit: OrderPaymentSplitDTO? = null,

    val paymentStatus: PaymentStatus,
    val placedAt: String? = null,

    /**
     * The code used, kept beside the discount so the receipt can still say "SPRING20"; null
     * when none.
     */
    val promoCode: String? = null,

    /**
     * Each promotion applied and what it took off.
     */
    val promotions: List<OrderPromotionDTO>,

    /**
     * What has been returned or is on its way. Absent with no refunds.
     */
    val refundedTotal: String? = null,

    /**
     * Every refund on this order, newest first. Absent entirely (not an empty array) when
     * nothing was refunded. No failure reason, kind or provider reference (see
     * [CustomerRefundDTO]).
     */
    val refunds: List<CustomerRefundDTO>? = null,

    /**
     * The customer-facing progress stage, always server-derived (never computed from
     * `fulfillments`). A rollup, not a max: a two-shop order with one portion delivered and one
     * being picked is `packing`.
     */
    val stage: OrderStage,

    val status: OrderStatus
)

/**
 * When one package is expected to arrive, as shown at checkout. Not `DeliveryPromiseDTO`
 * (shop-order.ts), which is the shop's ready-by and must never reach a customer.
 *
 * `promisedFrom`/`promisedTo` are the delivery day (yyyy-mm-dd), equal for a sold window or
 * day; null means the date will be confirmed (never invent one). `windowStart`/`windowEnd`
 * are the window sold, null for an untimed day. Render through `formatArrival`.
 */
@Serializable
data class ArrivalEstimateDTO (
    /**
     * The method the customer chose for this package.
     */
    val method: Method,

    val promisedFrom: String? = null,
    val promisedTo: String? = null,
    val windowEnd: String? = null,

    /**
     * ISO datetimes with the Australia/Melbourne offset, or null.
     */
    val windowStart: String? = null
)

/**
 * The method the customer chose for this package.
 */
@Serializable
enum class Method(val value: String) {
    @SerialName("same_day") SameDay("same_day"),
    @SerialName("scheduled") Scheduled("scheduled"),
    @SerialName("standard") Standard("standard");
}

/**
 * The snapshotted delivery address on the receipt.
 *
 * The shipping address snapshot, where the order is delivered.
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
 * Who delivers the order, and for a courier the estimate sold; printed through
 * `deliverySummary`.
 *
 * An order's delivery, as a customer contract carries it.
 *
 * Who delivers it.
 */
@Serializable
data class OrderDeliveryDTO (
    /**
     * Present exactly when `promise` is `asap`.
     */
    val asapEstimate: String? = null,

    /**
     * The courier's usual timeframe as it was sold ("2–4 business days"); null for an Effy
     * order.
     */
    val courierEstimate: String? = null,

    /**
     * Present only after back-office moved the order to the other type: the latest move and
     * what the customer received. Never the reason, the courier fee, the difference or Effy's
     * cost.
     */
    val moved: OrderDeliveryMoveDTO? = null,

    /**
     * Absent on a courier order. `day`: the arrival has the day and no hours. `asap`: no
     * arrival, only `asapEstimate`.
     */
    val promise: PromiseEnum? = null,

    /**
     * How the customer follows a courier order: `link` (one consignment with a tracking link)
     * or `email` (several, each tracking emailed). Absent otherwise. Never a count or anything
     * per parcel.
     */
    val tracking: TrackingClass? = null,

    val type: DeliveryType
)

/**
 * Present only after back-office moved the order to the other type: the latest move and
 * what the customer received. Never the reason, the courier fee, the difference or Effy's
 * cost.
 *
 * The latest move of an order's delivery type by back-office, as the customer reads it.
 */
@Serializable
data class OrderDeliveryMoveDTO (
    val at: String,
    val compensation: CustomerCompensationDTO? = null,
    val to: DeliveryType
)

@Serializable
data class CustomerCompensationDTO (
    val amount: String,
    val kind: CompensationKind,
    val points: Double? = null
)

@Serializable
enum class CompensationKind(val value: String) {
    @SerialName("points") Points("points"),
    @SerialName("refund") Refund("refund");
}

/**
 * Absent on a courier order. `day`: the arrival has the day and no hours. `asap`: no
 * arrival, only `asapEstimate`.
 *
 * What an Effy order was sold: a time on a day, a day with no time, or "as soon as
 * possible".
 */
@Serializable
enum class PromiseEnum(val value: String) {
    @SerialName("asap") Asap("asap"),
    @SerialName("day") Day("day"),
    @SerialName("window") Window("window");
}

/**
 * How the customer follows a courier order: `link` (one consignment with a tracking link)
 * or `email` (several, each tracking emailed). Absent otherwise. Never a count or anything
 * per parcel.
 */
@Serializable
data class TrackingClass (
    val courierName: String? = null,
    val kind: TrackingKind,
    val url: String? = null
)

@Serializable
enum class TrackingKind(val value: String) {
    @SerialName("email") Email("email"),
    @SerialName("link") Link("link");
}

/**
 * An anonymous fulfilment portion: no shop name, id, or anything implying who fulfils it.
 */
@Serializable
data class OrderFulfillmentDTO (
    val itemCount: Double,
    val status: Status,
    val subtotalAmount: String,

    /**
     * Present only once the portion is terminal; absent while picking.
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
 * An item the customer paid for and will not receive, disclosed only once the portion is
 * terminal (a flag raised and undone mid-pick never reaches the customer). Carries no
 * refund promise.
 */
@Serializable
data class OrderShortfallDTO (
    val productName: String,
    val quantity: Double
)

/**
 * A line on the receipt: a product snapshot, never a shop.
 */
@Serializable
data class OrderItemDTO (
    /**
     * Sold to adults only (from the live catalogue): show the 18+ label.
     */
    val ageRestricted: Boolean,

    /**
     * What promotions took off this line, as sold. Absent or "0.00" when none.
     */
    val discountAmount: String? = null,

    /**
     * A short-lived presigned URL for the product's primary image, or null. Decoration only: a
     * line is complete without it. It comes from the live catalogue; every other field is the
     * order's snapshot, so a renamed product still shows what was bought.
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val lineSubtotalAmount: String,

    /**
     * This line's own id. Not interchangeable with `productId`: two lines of one product cannot
     * be told apart by product id, and a refund request naming a product would silently match
     * nothing. Discloses nothing about fulfilment.
     */
    @SerialName("orderItemId")
    val orderItemID: String,

    @SerialName("productId")
    val productID: String,

    val productName: String,
    val quantity: Double,
    val unitPriceAmount: String,

    /**
     * The variant sold.
     */
    @SerialName("variantId")
    val variantID: String,

    /**
     * The variant's label as sold ("Spiced / 500 g"); null for a product with no options.
     */
    val variantLabel: String? = null
)

/**
 * How an order was paid, safe to show. No card data beyond `last4`, ever.
 */
@Serializable
data class PaymentMethodSummaryDTO (
    /**
     * Network or wallet for the label ("visa", "apple_pay"). Null when the family carries no
     * brand.
     */
    val brand: String? = null,

    /**
     * The only part of a card number allowed to leave the provider; null for non-card families.
     */
    val last4: String? = null,

    /**
     * Effy's own family, never the provider's string.
     */
    val type: Type
)

/**
 * Effy's own family, never the provider's string.
 */
@Serializable
enum class Type(val value: String) {
    @SerialName("card") Card("card"),
    @SerialName("other") Other("other"),
    @SerialName("pay_over_time") PayOverTime("pay_over_time"),
    @SerialName("wallet") Wallet("wallet");
}

/**
 * How the order was paid when points were part of it, and what has come back. Absent with
 * no points; points are a way of paying, never a discount.
 *
 * How an order was paid and what has come back, on customer and staff order reads.
 */
@Serializable
data class OrderPaymentSplitDTO (
    val cardAmount: String,
    val cardReturned: String,
    val pointsAmount: String,
    val pointsReturned: Long,
    val pointsUsed: Long
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
 * One promotion applied to an order, as sold (never re-derived).
 */
@Serializable
data class OrderPromotionDTO (
    val code: String? = null,
    val deliveryAmount: String,
    val goodsAmount: String,
    val headline: String
)

/**
 * The customer-facing progress stage, always server-derived (never computed from
 * `fulfillments`). A rollup, not a max: a two-shop order with one portion delivered and one
 * being picked is `packing`.
 *
 * The customer-facing progress vocabulary: a closed union rolled up server-side from every
 * `shop_fulfillment.status` (`stageFor` in
 * `apis/edge-api/shared/src/lib/order-completion.ts`).
 *
 * The one word for where a paid order is. Absent on an unpaid, failed or cancelled order.
 */
@Serializable
enum class OrderStage(val value: String) {
    @SerialName("confirmed") Confirmed("confirmed"),
    @SerialName("delivered") Delivered("delivered"),
    @SerialName("on_the_way") OnTheWay("on_the_way"),
    @SerialName("packing") Packing("packing");
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
    /**
     * The promise the order was sold, as on the receipt. Absent for a courier order.
     */
    val arrivalEstimates: List<ArrivalEstimateDTO>? = null,

    val currency: String,

    /**
     * When the whole order had arrived (ISO); only once `stage` is `delivered`.
     */
    val deliveredAt: String? = null,

    /**
     * Who delivers it.
     */
    val delivery: OrderDeliveryDTO,

    /**
     * The whole amount has gone back.
     */
    val fullyRefunded: Boolean? = null,

    val grandTotalAmount: String,
    val id: String,
    val itemCount: Double,
    val orderNumber: String,
    val placedAt: String? = null,

    /**
     * Set when a promotional code was used, so history can mark a discounted order.
     */
    val promoCode: String? = null,

    /**
     * What has gone back to the customer so far. Absent when nothing has.
     */
    val refundedTotal: String? = null,

    /**
     * The one word for where a paid order is. Absent on an unpaid, failed or cancelled order.
     */
    val stage: OrderStage? = null,

    val status: OrderStatus,

    /**
     * The primary picture of the order's first few lines (at most four), for the order list:
     * short-lived presigned URLs from the live catalogue; `null` where a line has none. Never a
     * shop, a package, or a supplier count.
     */
    val thumbnails: List<String?>? = null,

    /**
     * Index-aligned with `thumbnails`: each one's smaller copies (see `imageWidths`).
     */
    val thumbnailWidths: List<List<Double>>? = null
)

/**
 * `GET /commerce/v1/orders/{id}/tax-documents`.
 */
@Serializable
data class OrderTaxDocumentsDTO (
    val adjustments: List<TaxDocumentDTO>,
    val invoice: TaxDocumentDTO? = null
)

/**
 * A tax invoice or adjustment note exactly as issued: the frozen snapshot the PDF renders.
 * Money is a decimal string; it never changes.
 */
@Serializable
data class TaxDocumentDTO (
    /**
     * The buyer's identity, printed at $1,000 or more; null below it.
     */
    val buyer: Buyer? = null,

    val fees: List<Fee>,
    val issuedAt: String,
    val issuer: Issuer,
    val kind: TaxDocumentDTOKind,
    val lines: List<Line>,
    val number: String,
    val orderNumber: String,
    val payments: List<Payment>,

    /**
     * An adjustment's invoice number.
     */
    val refersTo: String? = null,

    val totals: Totals
)

@Serializable
data class Buyer (
    val abn: String? = null,
    val businessName: String? = null,
    val name: String
)

@Serializable
data class Fee (
    val amount: String,
    val label: String,
    val taxable: Boolean
)

@Serializable
data class Issuer (
    val abn: String,
    val legalName: String
)

@Serializable
enum class TaxDocumentDTOKind(val value: String) {
    @SerialName("adjustment") Adjustment("adjustment"),
    @SerialName("invoice") Invoice("invoice");
}

@Serializable
data class Line (
    val amount: String,
    val name: String,
    val quantity: Long,
    val taxable: Boolean
)

@Serializable
data class Payment (
    val amount: String,
    val label: String
)

@Serializable
data class Totals (
    val gst: String,
    val gstFreeTotal: String,
    val taxableTotal: String,
    val total: String
)

/**
 * Full product detail (gallery, description, category path; each variant carries its own
 * details).
 */
@Serializable
data class StorefrontProductDetailDTO (
    /**
     * Sold to adults only: show the 18+ label.
     */
    val ageRestricted: Boolean,

    /**
     * Some variant can be bought now (the one availability rule).
     */
    val available: Boolean,

    val badges: List<ProductBadge>,
    val brand: String? = null,

    /**
     * The primary category's key, for the related-products rail (`categoryPath` carries display
     * names, which cannot be queried).
     */
    val categoryKey: String,

    val categoryPath: List<String>,

    /**
     * The "was" price of the variant `priceAmount` came from.
     */
    val compareAtAmount: String? = null,

    val currency: String,

    /**
     * The variant to open on: the one the link named if active, else the first that can be
     * bought, else the first.
     */
    @SerialName("defaultVariantId")
    val defaultVariantID: String,

    val gallery: List<MediaDTO>,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val longDescription: String? = null,
    val name: String,

    /**
     * An item or buy-X-get-Y promotion open to everyone that covers this product.
     */
    val offer: ProductOfferDTO? = null,

    /**
     * The product's options in the shop's order; empty when none (no selector).
     */
    val options: List<OptionDTO>,

    /**
     * The listing price: the lowest among active variants (say "From" when `priceVaries`).
     * Selling out one size never moves it.
     */
    val priceAmount: String,

    /**
     * Active variants' prices differ: show "From".
     */
    val priceVaries: Boolean,

    val unitBasis: UnitBasis? = null,

    /**
     * The comparison price of `priceAmount`, with a unit basis and a pack size.
     */
    val unitPrice: UnitPriceDTO? = null,

    /**
     * Active variants; above 1 the tile offers "Choose" instead of quick-add.
     */
    val variantCount: Long,

    /**
     * The variant this tile stands for (the one a stock-code or barcode search matched, else
     * the default); quick-add adds it when `variantCount` is 1.
     */
    @SerialName("variantId")
    val variantID: String,

    /**
     * Active variants only, in display order.
     */
    val variants: List<StorefrontVariantDTO>
)

/**
 * A shopper's view of one variant. Inactive and removed variants are never sent to shoppers.
 */
@Serializable
data class StorefrontVariantDTO (
    /**
     * Purchasable now (the one availability rule).
     */
    val available: Boolean,

    val compareAtAmount: String? = null,

    /**
     * Customer-visible details for this variant (the product's merged with its own), grouped by
     * section.
     */
    val details: List<ProductAttributeGroupDTO>,

    val id: String,

    /**
     * The variant's own picture, or null — show the product's gallery.
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending.
     */
    val imageWidths: List<Double>? = null,

    /**
     * "Spiced / 500 g"; null when the product has no options.
     */
    val label: String? = null,

    @SerialName("optionValueIds")
    val optionValueIDS: List<String?>,

    val priceAmount: String,
    val unitPrice: UnitPriceDTO? = null
)

/**
 * How a result set can be ordered. `relevance` needs a text query; without one the server
 * uses `newest` and says so in `ProductSearchResultDTO.sort`.
 *
 * The ordering actually applied (may differ from the request): render the sort control from
 * this.
 */
@Serializable
enum class ProductSort(val value: String) {
    @SerialName("newest") Newest("newest"),
    @SerialName("price_asc") PriceAsc("price_asc"),
    @SerialName("price_desc") PriceDesc("price_desc"),
    @SerialName("relevance") Relevance("relevance");
}

/**
 * One promotion in full, the destination of a tap (`GET /storefront/v1/promotions/{id}`).
 * Served through the same visibility rule as Home, so one that ended meanwhile is 404, not
 * stale terms (hence uncached).
 */
@Serializable
data class PromotionDTO (
    /**
     * Non-nullable: a screen whose purpose is to hand over a code must have one.
     */
    val code: String,

    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val subtitle: String? = null,

    /**
     * The terms sentence, from the server-side composer.
     */
    val terms: String? = null,

    val title: String,

    /**
     * How long is left ("Ends in 3 days"), composed server-side; null when it never ends.
     */
    val validity: String? = null
)

/**
 * Display groups by key (storefront public, commerce personal).
 *
 * `GET /storefront/v1/promotion-groups?keys=` and `GET /commerce/v1/promotion-groups?keys=`.
 */
@Serializable
data class PromotionGroupsDTO (
    val groups: List<PromotionGroupDTO>
)

@Serializable
data class PromotionGroupDTO (
    val key: String,
    val promotions: List<ShopperPromotionDTO>
)

/**
 * One promotion as both customer clients show it, from either group read.
 */
@Serializable
data class ShopperPromotionDTO (
    /**
     * The shared code; null for an automatic promotion or one with single-use codes only.
     */
    val code: String? = null,

    /**
     * "Ends in 3 days" / "Ends tomorrow" / "Ends today" / null.
     */
    val endsIn: String? = null,

    val headline: String,
    val id: String,
    val kind: PromotionKind,
    val label: String? = null,

    /**
     * How this promotion looks in this place. A client that does not know `skin.layout` draws
     * its built-in look, as for `classic`.
     */
    val skin: ShopperSkinDTO? = null,

    val supportingLine: String? = null,

    /**
     * Where a tap goes.
     */
    val target: BannerTarget,

    /**
     * The conditions sentence, composed server-side ("On orders over $30.00 · Effy delivery
     * only").
     */
    val terms: String? = null
)

/**
 * Promotions: an offer of one of four kinds, applied automatically or by code, limited by
 * who, when and how much, and shown in display groups the clients ask for by key. Its state
 * is never stored (`public.promotion_state`). One evaluator: `@effy/edge-shared/promotions`
 * (engine.ts).
 */
@Serializable
enum class PromotionKind(val value: String) {
    @SerialName("bxgy") Bxgy("bxgy"),
    @SerialName("cart") Cart("cart"),
    @SerialName("delivery") Delivery("delivery"),
    @SerialName("item") Item("item");
}

/**
 * How this promotion looks in this place. A client that does not know `skin.layout` draws
 * its built-in look, as for `classic`.
 *
 * The skin a placement wears, with the picture it shows.
 */
@Serializable
data class ShopperSkinDTO (
    val id: String,
    val layout: SkinLayout,
    val picture: ShopperSkinPictureDTO? = null,

    /**
     * Absent for `classic`.
     */
    val settings: SkinSettings? = null,

    /**
     * The size of the place the group fills.
     */
    val size: GroupSize,

    val version: Double
)

@Serializable
enum class SkinLayout(val value: String) {
    @SerialName("classic") Classic("classic"),
    @SerialName("full_picture") FullPicture("full_picture"),
    @SerialName("header_card") HeaderCard("header_card"),
    @SerialName("panel") Panel("panel"),
    @SerialName("picture_beside") PictureBeside("picture_beside"),
    @SerialName("strip") Strip("strip"),
    @SerialName("tile") Tile("tile");
}

@Serializable
data class ShopperSkinPictureDTO (
    val alt: String,

    /**
     * 0–1 from the left / top: the point every crop keeps in view.
     */
    val focusX: Double,

    val focusY: Double,
    val height: Double,

    /**
     * Widths of the WebP copies; build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val url: String,
    val width: Double
)

/**
 * Absent for `classic`.
 *
 * The settings of a designed skin. Layout-only fields are present on their layout alone.
 */
@Serializable
data class SkinSettings (
    val align: Align,
    val background: SkinBackground,

    /**
     * `header_card`: the body under the header, and the colour of its "Code"/"Offer" tag.
     */
    val body: SettingsBody? = null,

    val button: SettingsButton,
    val chip: SettingsChip,

    /**
     * The customer app's dark appearance. Absent → the skin looks the same in both.
     */
    val dark: Dark? = null,

    val decorations: SettingsDecorations,
    val headline: TextStyle,
    val label: SettingsLabel,
    val pictureFit: PictureFit? = null,

    /**
     * `picture_beside`: which side the picture is on, and how it fills its half.
     */
    val pictureSide: PictureSide? = null,

    val shape: Shape,
    val supporting: SettingsSupporting,

    /**
     * `full_picture`: where the words sit.
     */
    val textCorner: TextCorner? = null
)

@Serializable
enum class Align(val value: String) {
    @SerialName("center") Center("center"),
    @SerialName("end") End("end"),
    @SerialName("start") Start("start");
}

@Serializable
data class SkinBackground (
    val colour: String,

    /**
     * Show the promotion's picture. Required layouts (`full_picture`, `picture_beside`) always
     * do.
     */
    val picture: Picture,

    /**
     * Laid over the picture under the words. Strength 0–0.9.
     */
    val tint: Tint? = null
)

/**
 * Show the promotion's picture. Required layouts (`full_picture`, `picture_beside`) always
 * do.
 */
@Serializable
enum class Picture(val value: String) {
    @SerialName("none") None("none"),
    @SerialName("show") Show("show");
}

/**
 * Laid over the picture under the words. Strength 0–0.9.
 */
@Serializable
data class Tint (
    val colour: String,
    val strength: Double
)

/**
 * `header_card`: the body under the header, and the colour of its "Code"/"Offer" tag.
 */
@Serializable
data class SettingsBody (
    val colour: String,
    val tagColour: String
)

@Serializable
data class SettingsButton (
    val fill: String,
    val icon: Boolean,
    val style: ButtonStyle,
    val text: String,
    val words: String
)

@Serializable
enum class ButtonStyle(val value: String) {
    @SerialName("filled") Filled("filled"),
    @SerialName("link") Link("link"),
    @SerialName("none") None("none"),
    @SerialName("outline") Outline("outline");
}

@Serializable
data class SettingsChip (
    val fill: String,
    val show: Boolean,
    val style: ChipStyle,
    val text: String
)

@Serializable
enum class ChipStyle(val value: String) {
    @SerialName("dashed") Dashed("dashed"),
    @SerialName("filled") Filled("filled"),
    @SerialName("solid") Solid("solid");
}

/**
 * The customer app's dark appearance. Absent → the skin looks the same in both.
 */
@Serializable
data class Dark (
    val background: SkinBackground? = null,
    val body: DarkBody? = null,
    val button: DarkButton? = null,
    val chip: DarkChip? = null,
    val decorations: DarkDecorations? = null,
    val headline: TextStyle? = null,
    val label: DarkLabel? = null,
    val supporting: DarkSupporting? = null
)

@Serializable
data class DarkBody (
    val colour: String,
    val tagColour: String
)

@Serializable
data class DarkButton (
    val fill: String,
    val icon: Boolean,
    val style: ButtonStyle,
    val text: String,
    val words: String
)

@Serializable
data class DarkChip (
    val fill: String,
    val show: Boolean,
    val style: ChipStyle,
    val text: String
)

@Serializable
data class DarkDecorations (
    val colour: String,
    val set: DecorationSet,
    val show: Boolean,
    val strength: Double
)

@Serializable
enum class DecorationSet(val value: String) {
    @SerialName("bakery") Bakery("bakery"),
    @SerialName("celebration") Celebration("celebration"),
    @SerialName("drinks") Drinks("drinks"),
    @SerialName("food") Food("food"),
    @SerialName("produce") Produce("produce"),
    @SerialName("seasonal-summer") SeasonalSummer("seasonal-summer"),
    @SerialName("seasonal-winter") SeasonalWinter("seasonal-winter");
}

@Serializable
data class TextStyle (
    val colour: String,
    val lines: Double,
    val size: TextSize,
    val weight: Weight
)

@Serializable
enum class TextSize(val value: String) {
    @SerialName("lg") Lg("lg"),
    @SerialName("md") Md("md"),
    @SerialName("sm") Sm("sm"),
    @SerialName("2xl") The2Xl("2xl"),
    @SerialName("xl") Xl("xl"),
    @SerialName("xs") Xs("xs");
}

@Serializable
enum class Weight(val value: String) {
    @SerialName("bold") Bold("bold"),
    @SerialName("medium") Medium("medium"),
    @SerialName("regular") Regular("regular"),
    @SerialName("semibold") Semibold("semibold");
}

@Serializable
data class DarkLabel (
    val colour: String,
    val show: Boolean,
    val size: Size,
    val tracking: TrackingEnum,
    val words: String
)

@Serializable
enum class Size(val value: String) {
    @SerialName("sm") Sm("sm"),
    @SerialName("xs") Xs("xs");
}

@Serializable
enum class TrackingEnum(val value: String) {
    @SerialName("normal") Normal("normal"),
    @SerialName("wide") Wide("wide");
}

@Serializable
data class DarkSupporting (
    val colour: String,
    val lines: Double,
    val show: Boolean,
    val size: TextSize,
    val weight: Weight
)

@Serializable
data class SettingsDecorations (
    val colour: String,
    val set: DecorationSet,
    val show: Boolean,
    val strength: Double
)

@Serializable
data class SettingsLabel (
    val colour: String,
    val show: Boolean,
    val size: Size,
    val tracking: TrackingEnum,
    val words: String
)

@Serializable
enum class PictureFit(val value: String) {
    @SerialName("contain") Contain("contain"),
    @SerialName("cover") Cover("cover");
}

/**
 * `picture_beside`: which side the picture is on, and how it fills its half.
 */
@Serializable
enum class PictureSide(val value: String) {
    @SerialName("end") End("end"),
    @SerialName("start") Start("start");
}

@Serializable
data class Shape (
    val outline: String? = null,
    val radius: Radius,
    val spacing: Spacing
)

@Serializable
enum class Radius(val value: String) {
    @SerialName("lg") Lg("lg"),
    @SerialName("md") Md("md"),
    @SerialName("none") None("none"),
    @SerialName("sm") Sm("sm"),
    @SerialName("xl") Xl("xl");
}

@Serializable
enum class Spacing(val value: String) {
    @SerialName("compact") Compact("compact"),
    @SerialName("regular") Regular("regular"),
    @SerialName("roomy") Roomy("roomy");
}

@Serializable
data class SettingsSupporting (
    val colour: String,
    val lines: Double,
    val show: Boolean,
    val size: TextSize,
    val weight: Weight
)

/**
 * `full_picture`: where the words sit.
 */
@Serializable
enum class TextCorner(val value: String) {
    @SerialName("bottom-end") BottomEnd("bottom-end"),
    @SerialName("bottom-start") BottomStart("bottom-start"),
    @SerialName("center") Center("center"),
    @SerialName("top-start") TopStart("top-start");
}

/**
 * The size of the place the group fills.
 */
@Serializable
enum class GroupSize(val value: String) {
    @SerialName("large") Large("large"),
    @SerialName("medium") Medium("medium"),
    @SerialName("small") Small("small"),
    @SerialName("strip") Strip("strip");
}

/**
 * Where a tap goes.
 *
 * Where a promotion tile leads: a closed vocabulary (mobile has no URL router), mapped
 * exhaustively by each client; an unrecognised value renders the tile non-tappable.
 */
@Serializable
data class BannerTarget (
    val kind: BannerTargetKind,
    val categoryKey: String? = null,

    @SerialName("productId")
    val productID: String? = null,

    @SerialName("promotionId")
    val promotionID: String? = null
)

@Serializable
enum class BannerTargetKind(val value: String) {
    @SerialName("category") Category("category"),
    @SerialName("product") Product("product"),
    @SerialName("promotion") Promotion("promotion"),
    @SerialName("sale") Sale("sale"),
    @SerialName("search") Search("search");
}

/**
 * A customer's ask: no amount, no provider reference, no money moved. One statement, one
 * outcome, not a thread.
 */
@Serializable
data class RefundRequestDTO (
    val createdAt: String,
    val decidedAt: String? = null,
    val id: String,
    val items: List<RefundRequestItem>,
    val message: String,
    val outcomeNote: String? = null,
    val status: RefundRequestStatus
)

@Serializable
data class RefundRequestItem (
    @SerialName("orderItemId")
    val orderItemID: String,

    val productName: String,
    val quantity: Long
)

@Serializable
enum class RefundRequestStatus(val value: String) {
    @SerialName("declined") Declined("declined"),
    @SerialName("open") Open("open"),
    @SerialName("refunded") Refunded("refunded");
}

/**
 * POST /v1/cart/reorder: puts a past order's items back, taking the maximum against the
 * current cart.
 */
@Serializable
data class ReorderRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    @SerialName("orderId")
    val orderID: String
)

/**
 * The reorder outcome: the cart plus exactly what could not come back. Names no shop.
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

    val reason: ReorderSkipReason,

    @SerialName("variantId")
    val variantID: String,

    /**
     * The label it was sold with.
     */
    val variantLabel: String? = null
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
 * PUT /commerce/v1/saved/{productId}: save (idempotent). `variantId` remembers the selected
 * variant; saving again updates it.
 */
@Serializable
data class SaveItemRequest (
    /**
     * Set only by undo.
     */
    val restoreSavedAt: String? = null,

    @SerialName("variantId")
    val variantID: String? = null
)

@Serializable
data class SavedAddToCartRequest (
    @SerialName("changeId")
    val changeID: String? = null
)

/**
 * The result of adding every purchasable saved item to the cart. Every omission is in
 * `skipped`, with a reason.
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
     * `cap_reached` | `not_found` | a `SavedVerdict` | a cart refusal reason | `choose_variant`
     * (open the product and choose).
     */
    val reason: String
)

/**
 * One entry in the saved list. Name, image and current price are read live; only
 * `savedPriceAmount` is remembered, so a drop is detectable. It does not extend
 * `StorefrontProductCardDTO`: that card's `available` flag is catalogue status only, and
 * `verdict` replaces it, so the card fields are repeated.
 */
@Serializable
data class SavedItemDTO (
    val badges: List<ProductBadge>,
    val brand: String? = null,

    /**
     * For grouping by aisle; absent when the product has no primary category.
     */
    val categoryKey: String? = null,

    val compareAtAmount: String? = null,
    val currency: String,
    val id: String,

    @SerialName("imageUrl")
    val imageURL: String? = null,

    /**
     * Widths (px) of this picture's smaller copies, ascending; absent or [] means only
     * `imageUrl`. Build each with `renditionUrl`.
     */
    val imageWidths: List<Double>? = null,

    val name: String,
    val priceAmount: String,

    /**
     * Present and `true` only when the current price is below the save-time price. No
     * `priceRose`: a rise is not actionable.
     */
    val priceDropped: Boolean? = null,

    /**
     * When it was saved: list order (newest first) and undo's restore position.
     */
    val savedAt: String,

    /**
     * The price when saved: the baseline for `priceDropped`.
     */
    val savedPriceAmount: String,

    val unitPrice: UnitPriceDTO? = null,

    /**
     * More than one active variant: adding without a remembered one asks the shopper to choose.
     */
    val variantCount: Long,

    /**
     * The variant "Add to cart" adds: the one remembered when saved, else the product's only
     * one. Null when there are several sizes and none is remembered (or it is no longer sold):
     * the shopper chooses. Price, verdict and image are the remembered variant's when there is
     * one.
     */
    @SerialName("variantId")
    val variantID: String? = null,

    /**
     * Its label ("1 kg"); null when none, or with no options.
     */
    val variantLabel: String? = null,

    val verdict: SavedVerdict
)

/**
 * Whether the shopper can buy a saved item now, each value implying a next action:
 * purchasable → buy now  temporarily_unavailable → sold, not in stock: wait  no_longer_sold
 * → withdrawn: give up
 */
@Serializable
enum class SavedVerdict(val value: String) {
    @SerialName("no_longer_sold") NoLongerSold("no_longer_sold"),
    @SerialName("purchasable") Purchasable("purchasable"),
    @SerialName("temporarily_unavailable") TemporarilyUnavailable("temporarily_unavailable");
}

/**
 * One of the shopper's lists. `name` is `null` for the default list ("Saved" is each
 * client's display text).
 */
@Serializable
data class SavedListDTO (
    /**
     * Present only when the read named a product: whether this list holds it.
     */
    val containsProduct: Boolean? = null,

    val count: Long,

    /**
     * A uuid, or `"default"` for the default list.
     */
    val id: String,

    val isDefault: Boolean,
    val name: String? = null,

    /**
     * How many of this list's products are in no other list: deleting it unsaves them, and the
     * confirmation says so.
     */
    val onlyHereCount: Long
)

@Serializable
data class SavedListCreateRequest (
    val name: String,

    /**
     * Place this product in the new list in the same action.
     */
    @SerialName("productId")
    val productID: String? = null,

    /**
     * With `productId`: the variant to remember.
     */
    @SerialName("variantId")
    val variantID: String? = null
)

@Serializable
data class SavedListEntryRequest (
    /**
     * Set only by undo, to return the product to its position in this list.
     */
    val restoreAddedAt: String? = null,

    /**
     * The variant the shopper had selected; it becomes the remembered one.
     */
    @SerialName("variantId")
    val variantID: String? = null
)

/**
 * Why the platform refused a list request. A closed set; clients switch on these and
 * nothing else. Carried as the last path segment of the problem's `type`, with `_` written
 * as `-`.
 */
@Serializable
enum class SavedListRefusal(val value: String) {
    @SerialName("default_list") DefaultList("default_list"),
    @SerialName("in_named_lists") InNamedLists("in_named_lists"),
    @SerialName("invalid_name") InvalidName("invalid_name"),
    @SerialName("list_limit") ListLimit("list_limit"),
    @SerialName("list_not_found") ListNotFound("list_not_found"),
    @SerialName("name_taken") NameTaken("name_taken"),
    @SerialName("saved_items_cap_reached") SavedItemsCapReached("saved_items_cap_reached");
}

@Serializable
data class SavedListRenameRequest (
    val name: String
)

/**
 * The shopper's whole set of saved product ids, fetched once per screen and answering for
 * every product on it (catalogue reads stay shopper-neutral). The 200-item cap keeps it
 * cheap.
 */
@Serializable
data class SavedMembershipDTO (
    /**
     * `WireInt`.
     */
    val count: Long,

    /**
     * The ids also held in a named list. A tap on a filled heart un-saves a product only in
     * "Saved"; one in a named list opens the list chooser (the platform refuses the removal
     * with 409 anyway).
     */
    @SerialName("namedProductIds")
    val namedProductIDS: List<String>,

    @SerialName("productIds")
    val productIDS: List<String>
)

@Serializable
data class SavedMergeRequest (
    val items: List<SavedMergeItem>
)

/**
 * One device-held saved item offered to an account.
 */
@Serializable
data class SavedMergeItem (
    @SerialName("productId")
    val productID: String,

    val savedAt: String,
    val savedCurrency: String? = null,

    /**
     * The guest's save-time price travels with it, so the watchlist keeps the movement. Absent
     * means the device never saw a price: the platform then uses the current price, as an
     * ordinary save does (never send "0").
     */
    val savedPriceAmount: String? = null,

    /**
     * The variant the device remembered, if any.
     */
    @SerialName("variantId")
    val variantID: String? = null
)

/**
 * The result of joining a device-held list into an account: the resulting set (so the
 * client seeds its store from it) and `added`, so the surface discloses the join by count.
 */
@Serializable
data class SavedMergeResultDTO (
    /**
     * `WireInt`.
     */
    val added: Long,

    @SerialName("productIds")
    val productIDS: List<String>,

    val skipped: List<SavedSkip>
)

/**
 * A page of results with a keyset cursor. `cursor` is opaque and sort-tagged: one from
 * another ordering is 400 `cursor_sort_mismatch`.
 */
@Serializable
data class ProductSearchResultDTO (
    val items: List<StorefrontProductCardDTO>,
    val nextCursor: String? = null,

    /**
     * The ordering actually applied (may differ from the request): render the sort control from
     * this.
     */
    val sort: ProductSort,

    /**
     * Total products matching the refinements, ignoring pagination.
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

    /**
     * On update the key's presence is read: absent leaves the default, `null` clears it, a
     * value replaces it.
     */
    val defaultDeliveryInstructions: DeliveryInstructionsDTO? = null,

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
 * PATCH /v1/cart/items/{variantId}: sets an absolute quantity (0 removes), so the client
 * can debounce taps safely. Idempotent; `changeId` is optional.
 */
@Serializable
data class UpdateCartLineRequest (
    @SerialName("changeId")
    val changeID: String? = null,

    val quantity: Long
)

@Serializable
enum class VariantState(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("inactive") Inactive("inactive"),
    @SerialName("removed") Removed("removed");
}
