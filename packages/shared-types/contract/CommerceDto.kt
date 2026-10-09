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

    /**
     * 076 — who delivers to this address TODAY: worked out when the address is read, never
     * saved with it, so a postcode that leaves Effy's list changes the answer the next time it
     * is shown.
     */
    val coverage: CoverageKind? = null,

    /**
     * 066 — the instructions this address PREFILLS at checkout, or null. A convenience for the
     * next order only: a placed order stores what its own checkout sent and never reads this.
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
 * 076 — who delivers to this address TODAY: worked out when the address is read, never
 * saved with it, so a postcode that leaves Effy's list changes the answer the next time it
 * is shown.
 *
 * 076 — WHO delivers to an address. The one answer every surface gives (FR-019/FR-020):
 * effy     the postcode is on Effy's list — Effy's own drivers deliver   courier  not on
 * the list, and courier delivery is offered there   none     neither reaches it
 *
 * ⚠ Decided in ONE place — the database function `public.coverage_for_postcode` — at the
 * moment of asking, and never stored against an address (FR-021). ⚠ A customer contract
 * carries this value and NOTHING about why: no group, no distance, no reason, no hub
 * (FR-023). Staff contracts are in `delivery-admin.ts`.
 *
 * 076 — who delivers to this address. `none` ⇔ not serviced. ⚠ `courier` is returned only
 * when a courier order can be placed (079): the new delivery model is on, courier delivery
 * is on, a courier fee table is active and an estimate is set. The quote then carries
 * `courier`.
 *
 * 076 — who delivers. Absent only from a server older than 076.
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
     * Plain text, already normalised. Never interpreted as markup anywhere it is shown.
     */
    val note: String? = null
)

/**
 * Delivery instructions — 066-delivery-instructions.
 *
 * What a customer tells the driver: how to hand the order over, and a short note. The
 * vocabulary, the length limit and the normalisation rule live HERE and nowhere else
 * (Principle II): the two customer surfaces use them to show a remaining-characters count,
 * and the two backends use them to decide. A client holding a looser opinion than the
 * server is how a 300-character note is typed, accepted by the screen and refused at
 * payment.
 *
 * ⚠ THE SERVER IMPORTS THIS FILE. Checkout (`edge-api/commerce`) calls
 * `normaliseDeliveryInstructions` itself, so the client's opinion and the server's are the
 * same function. (Until 070 the server was a second language and carried a mirror, pinned
 * by `delivery-instructions.fixtures.json`; the fixture remains as this rule's table of
 * cases.)
 */
@Serializable
enum class HandoverPreference(val value: String) {
    @SerialName("leave_at_door") LeaveAtDoor("leave_at_door"),
    @SerialName("meet_at_door") MeetAtDoor("meet_at_door");
}

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
    val items: List<AttributeGroupItem>
)

@Serializable
data class AttributeGroupItem (
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
    val kind: TargetKind,
    val categoryKey: String? = null,

    @SerialName("productId")
    val productID: String? = null,

    @SerialName("promotionId")
    val promotionID: String? = null
)

@Serializable
enum class TargetKind(val value: String) {
    @SerialName("category") Category("category"),
    @SerialName("product") Product("product"),
    @SerialName("promotion") Promotion("promotion"),
    @SerialName("sale") Sale("sale"),
    @SerialName("search") Search("search");
}

@Serializable
data class BillingAddressDTO (
    val city: String,

    /**
     * ISO-3166 alpha-2, capitalised. Always "AU" while Effy sells in one country (spec §
     * Assumptions).
     */
    val country: String,

    val line1: String,
    val line2: String? = null,
    val postalCode: String,
    val state: String
)

/**
 * The billing details Effy supplies on the shopper's behalf at confirmation.
 *
 * ⚠ This is why the payment step no longer asks for a country, a postcode or a name. The
 * platform already holds a verified billing address (the order's snapshot — the delivery
 * address where the shopper did not diverge, the chosen billing address where they did) and
 * the profile name, so it sends them itself instead of letting the provider guess a country
 * from the shopper's IP — which is exactly where the reported "Country: Sri Lanka" on an
 * Australia-only storefront came from (research R4).
 *
 * ⚠ DERIVED, NEVER ACCEPTED. A `billingDetails` key in a REQUEST must be ignored: honouring
 * one would let a client contradict the address it confirmed one screen earlier (contract §
 * 1).
 */
@Serializable
data class BillingDetailsDTO (
    val address: BillingAddressDTO,
    val email: String? = null,
    val name: String? = null
)

@Serializable
data class CancelOrderBody (
    val reason: String? = null
)

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

    /**
     * 066 — on UPDATE the key's PRESENCE is what is read: absent leaves the saved default
     * alone, `null` clears it, a value replaces it.
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
    val billingAddressID: String? = null,

    /**
     * 066 — what the customer tells the driver for THIS order: a handover preference and/or a
     * note. Absent or null → none. Validated and normalised by the server with the same rule
     * the client uses (`normaliseDeliveryInstructions`); refused with a field error, never
     * truncated.
     *
     * ⚠ The server stores exactly what THIS request carries. It never reads the address's saved
     * default — prefilling from that is the client's job — which is why editing an address
     * later cannot change a placed order.
     */
    val deliveryInstructions: DeliveryInstructionsDTO? = null,

    /**
     * 047: the shopper's order-level delivery preference — "same_day" or "standard" (absent =
     * standard). Applied per package where that method is offered, standard elsewhere (FR-044).
     * The server prices the chosen method from the captured quote; the client NEVER sends a fee
     * (SC-004).
     */
    val deliveryMethod: String? = null,

    /**
     * 079 — the delivery type the client is SHOWING. REQUIRED for a courier order: the server
     * writes nothing and refuses with 409 `delivery_type_changed` and a fresh quote when this
     * differs from what applies now, or when a courier quote is answered without it — so nobody
     * pays a courier fee for a screen that showed Effy's windows, or the reverse. Optional for
     * an Effy order.
     */
    val deliveryType: DeliveryType? = null,

    /**
     * 078 — the window the customer chose: ONE for the whole order (`EffyWindowDTO.slotId` +
     * `date`). REQUIRED when the quote carried `effyWindows` (refused with `slot_required`
     * without it); the three 047/069 fields above are then ignored and the server derives
     * same-day vs standard from the date. Ignored while the new model is off.
     */
    val deliveryWindow: DeliveryWindow? = null,

    /**
     * 074 — how many points the customer chose to pay with (a whole number, absent = 0). The
     * server refuses rather than clamps: more than is usable → 409 `points_balance_changed`;
     * more than the order total → 422 `points_exceed_total`; a card remainder under the
     * provider minimum → 422 `points_card_remainder_too_small`. Each refusal carries what IS
     * possible.
     */
    val pointsToUse: Long? = null,

    /**
     * 069 — the same-day slot the customer chose (`DeliverySlotOptionDTO.slotId`). REQUIRED
     * when any package will go same-day; the intent is refused with `slot_required` without it
     * and with `slot_unavailable` if it has closed or filled. ⚠ The server holds a place for
     * this order when it accepts the slot — see `slotHeldUntil` on the response.
     */
    @SerialName("sameDaySlotId")
    val sameDaySlotID: String? = null,

    /**
     * 077 — the delivery total the client is SHOWING (the chosen option's `totalAmount`). If
     * the server now works out a different one — a new fee plan went live, the basket crossed a
     * threshold — it writes nothing and refuses with 409 `delivery_fee_changed` and a fresh
     * quote, so the customer sees the new total before they can pay (FR-031). Absent from a
     * client built before 077, which is priced without the check.
     */
    val shownDeliveryAmount: String? = null,

    /**
     * 069 — the day the customer chose for standard delivery (yyyy-mm-dd). Absent → the
     * earliest available day, which is also what the UI preselects. Refused with
     * `date_unavailable` if it is not among the days currently offered.
     */
    val standardDate: String? = null,

    /**
     * 051 — set by a client that renders a PROVIDER-OWNED payment-method list (the mobile
     * in-app element) and therefore needs a customer session. Web renders Effy's own list and
     * leaves this unset.
     *
     * ⚠ Asking is not authorization to get someone else's: the session is always minted for the
     * AUTHENTICATED subject, so the worst a hostile client achieves is a session for itself.
     *
     * ⚠ There is deliberately NO `billingDetails` on this request. Billing details are DERIVED
     * from the order's own snapshot; accepting them here would let a client contradict the
     * address it confirmed one screen earlier (contract § 1, FR-016).
     */
    val wantsProviderMethodList: Boolean? = null
)

/**
 * 079 — the delivery type the client is SHOWING. REQUIRED for a courier order: the server
 * writes nothing and refuses with 409 `delivery_type_changed` and a fresh quote when this
 * differs from what applies now, or when a courier quote is answered without it — so nobody
 * pays a courier fee for a screen that showed Effy's windows, or the reverse. Optional for
 * an Effy order.
 *
 * 079 — the delivery type the order was written with. Absent while the new delivery model
 * is off.
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
     * 051 — the billing details the CLIENT must pass back at confirmation, because the payment
     * step no longer asks the shopper for them (FR-014/FR-015).
     *
     * ⚠ DERIVED FROM THE ORDER, NEVER FROM THE REQUEST. This is the address the shopper already
     * confirmed one screen earlier — the delivery address where they did not diverge, the
     * chosen billing address where they did — plus the profile name. Sending it means the
     * provider stops guessing a country from the shopper's IP, which is where "Country: Sri
     * Lanka" on an Australia-only storefront came from.
     *
     * ⚠ Removing the fields does NOT weaken authorization: the same data still reaches the
     * bank, sourced from Effy instead of from the shopper's keyboard (research R4).
     */
    val billingDetails: BillingDetailsDTO? = null,

    val cardAmount: String? = null,

    /**
     * Authorizes confirming exactly this PaymentIntent from the client. Never a secret key.
     */
    val clientSecret: String,

    val currency: String,

    /**
     * 051 — the provider customer the session belongs to. Present ONLY beside
     * `customerSessionSecret`, i.e. only for a client that renders a provider-owned method list
     * (mobile).
     *
     * ⚠ REQUIRED BY THE MOBILE SDKs, which take the id and the secret together
     * (`createWithCustomerSession(id, clientSecret)`); a session without its id cannot be
     * attached. The SECRET is the credential — this id alone reaches no API, because every call
     * that reads a customer needs a secret key that never leaves the server. Absent from the
     * web response, never logged, never in telemetry, and never accepted as request input
     * (data-model § 1, amended).
     */
    @SerialName("customerId")
    val customerID: String? = null,

    /**
     * 051 — authorizes a provider-owned payment-method list for THIS shopper only.
     *
     * ⚠ MOBILE ONLY, and null everywhere else. The mobile embedded element renders the
     * saved-card list itself and needs a session to do it; the web card route renders that list
     * from `GET /v1/payment-methods` and confirms with a payment-method id, so minting a
     * session there would be an unused provider round trip on a path 027 already found
     * latency-sensitive. Spike S2 — see specs/051-customer-payment-experience/research.md § R5
     * AMENDED.
     */
    val customerSessionSecret: String? = null,

    /**
     * 077 — the delivery charge inside `grandTotalAmount`, as lines.
     */
    val deliveryFee: DeliveryFeeDTO? = null,

    /**
     * 079 — the delivery type the order was written with. Absent while the new delivery model
     * is off.
     */
    val deliveryType: DeliveryType? = null,

    val grandTotalAmount: String,

    @SerialName("orderId")
    val orderID: String,

    val orderNumber: String,

    /**
     * 074 — TRUE when points covered the whole order: it is ALREADY PAID, no card is involved,
     * and `clientSecret` is empty. The client goes straight to the confirmation.
     */
    val paidWithPoints: Boolean? = null,

    /**
     * 051 US4 — whether the provider offers any instalment option for THIS intent.
     *
     * ⚠ ANSWERED BY THE PROVIDER, NOT GUESSED. Availability depends on the basket total and on
     * account eligibility, neither of which a client knows. A guess produces exactly what
     * FR-010/FR-011 forbid: an option offered and then refused after the shopper commits, or
     * one that vanishes unexplained.
     *
     * ⚠ A boolean, not the list — which providers appear is the payment element's business, and
     * sending the raw list would leak account configuration to a client with no use for it.
     */
    val payOverTimeAvailable: Boolean? = null,

    val pointsAmount: String? = null,

    /**
     * 074 — the points this order uses, their value, and what is left for the card.
     */
    val pointsUsed: Long? = null,

    val publishableKey: String,

    /**
     * 069 — until when the customer's place in their same-day slot is held. Absent when no
     * package is same-day. ⚠ A client MUST call intent again before confirming payment once
     * this has passed: the place may have gone, and the intent call is the last moment the
     * server can say so before the customer is charged.
     */
    val slotHeldUntil: String? = null
)

/**
 * 077 — the delivery charge inside `grandTotalAmount`, as lines.
 *
 * What a customer is charged for delivery, in lines that sum EXACTLY to `totalAmount`
 * (FR-028). A zero line is omitted.
 *
 * ⚠ Lines and a total — nothing else. No distance, band, weight or plan may be added: a
 * customer must not be able to work out where the hub is or how the business prices
 * (FR-032).
 *
 * The courier fee for the whole order (077): lines and a total.
 *
 * The order's delivery charge with this window chosen.
 *
 * 077 — the order's delivery charge with this window chosen.
 *
 * 077 — the delivery charge for the order when NO window is chosen (a standard day). Absent
 * when not serviced, and from a server older than 077.
 *
 * 077 — the same charge as lines (delivery, window surcharge, small-order fee, free
 * delivery), exactly as sold. ⚠ ABSENT on an order placed before 077: render the single
 * `deliveryFeeAmount` row instead. Stored with the order and never recomputed, so it reads
 * the same after the business changes its prices.
 */
@Serializable
data class DeliveryFeeDTO (
    val lines: List<DeliveryFeeLineDTO>,
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
 * 077 — one line of what a customer is charged for delivery.   delivery          the fee
 * for the distance and weight, before any window surcharge   window_surcharge  what the
 * chosen window adds   small_order       the extra fee on a basket under the business's
 * small-order amount   free_delivery     the saving when the basket reaches the
 * free-delivery amount (NEGATIVE)
 */
@Serializable
enum class DeliveryFeeLineKind(val value: String) {
    @SerialName("delivery") Delivery("delivery"),
    @SerialName("free_delivery") FreeDelivery("free_delivery"),
    @SerialName("small_order") SmallOrder("small_order"),
    @SerialName("window_surcharge") WindowSurcharge("window_surcharge");
}

/**
 * ⚠ NO DESTINATION FIELD, AND THERE MUST NEVER BE ONE. The refund goes to the payment
 * method on the order (FR-006). A request that could name where the money goes would be a
 * way to redirect somebody else's (A4).
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
 * One refund, as the CUSTOMER sees it.
 *
 * ⚠ THREE states, not five, and no failure text. "Your bank rejected the refund" invites a
 * shopper to argue with a message they cannot act on, and the difference between
 * `submitting` and `submitted` is a fact about our integration.
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
     * The options as they stand NOW. Absent on `slot_required` from a client that sent no slot.
     */
    val quote: DeliveryQuoteDTO? = null
)

/**
 * 069 — why a checkout intent was refused over the delivery choice. Carried as `code` on a
 * 409 problem, with a fresh `quote` so the client can re-offer without a second request.
 *
 * ⚠ A refusal NEVER substitutes a slot, a day or a method (FR-010). The customer chooses
 * again.
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
 * The delivery quote shown at checkout, captured server-side so the order is honoured at
 * the quoted fee — the client never sends a fee (FR-036). When `serviced` is false there
 * are NO packages and one reason: the postcode is in no served zone (FR-002).
 */
@Serializable
data class DeliveryQuoteDTO (
    /**
     * 079 — PRESENT EXACTLY WHEN `coverage` is `"courier"`. There is then nothing to choose:
     * `packages`, `sameDaySlots` and `standardDays` are empty and `effyWindows` is absent. The
     * client shows "Courier delivery", the estimate and the fee, and sends `deliveryType:
     * "courier"` on the intent. ⚠ No distance, no courier company, nothing about how many
     * suppliers fill the order.
     */
    val courier: CourierQuoteDTO? = null,

    /**
     * 076 — who delivers to this address. `none` ⇔ not serviced. ⚠ `courier` is returned only
     * when a courier order can be placed (079): the new delivery model is on, courier delivery
     * is on, a courier fee table is active and an estimate is set. The quote then carries
     * `courier`.
     */
    val coverage: CoverageKind? = null,

    /**
     * 078 — the windows a customer may choose once the new delivery model is on: today's under
     * "Same-day delivery", the following delivery days' under "Standard delivery". ⚠ ABSENT
     * WHILE THE MODEL IS OFF — the response is then byte for byte what it was, and every field
     * above means what it did. When present, the choice is sent back as `deliveryWindow` on the
     * intent, and `standardDays` may be empty.
     */
    val effyWindows: EffyWindowsDTO? = null,

    val expiresAt: String,

    /**
     * 077 — how much more the basket needs for free delivery. Null when no free-delivery amount
     * is set or it is already reached.
     */
    val freeDeliveryRemainingAmount: String? = null,

    val packages: List<DeliveryPackageDTO>,

    /**
     * 074 — the customer's spendable points, when they have any.
     */
    val points: CheckoutPointsDTO? = null,

    val postcode: String,

    /**
     * ISO datetime with the Australia/Melbourne offset, or null. ⚠ Kept for clients built
     * before 069; it now carries the latest OPEN SLOT's cutoff. New clients read `sameDaySlots`.
     */
    val sameDayAvailableUntil: String? = null,

    /**
     * 069 — the same-day time slots still open for THIS order, earliest first. Empty when there
     * are none, and then no package carries a `same_day` option. A slot is offered only if it
     * is open for every package that would go same-day, so one choice covers the order (FR-005).
     */
    val sameDaySlots: List<DeliverySlotOptionDTO>,

    /**
     * 069 — why same-day is not offered, when it is not (FR-004). The two are different
     * sentences to a customer: "not in your area" will still be true tomorrow; "today's times
     * are taken" will not.
     */
    val sameDayUnavailableReason: SameDayUnavailableReason? = null,

    val serviced: Boolean,

    /**
     * 069 — the days a standard delivery can arrive, earliest first. The first is the default.
     * ⚠ Never empty when `serviced` (FR-020) — while `effyWindows` is null.
     */
    val standardDays: List<StandardDayOptionDTO>,

    /**
     * 077 — the delivery charge for the order when NO window is chosen (a standard day). Absent
     * when not serviced, and from a server older than 077.
     */
    val standardFee: DeliveryFeeDTO? = null
)

/**
 * 079 — PRESENT EXACTLY WHEN `coverage` is `"courier"`. There is then nothing to choose:
 * `packages`, `sameDaySlots` and `standardDays` are empty and `effyWindows` is absent. The
 * client shows "Courier delivery", the estimate and the fee, and sends `deliveryType:
 * "courier"` on the intent. ⚠ No distance, no courier company, nothing about how many
 * suppliers fill the order.
 *
 * 079 — what a customer is told and charged when a courier delivers the order.
 */
@Serializable
data class CourierQuoteDTO (
    /**
     * The courier's usual timeframe, in the business's words ("2–4 business days"). ⚠ An
     * estimate, never a promise: print it through `courierLines` (`delivery-type.ts`), never on
     * its own.
     */
    val estimate: String,

    /**
     * The courier fee for the whole order (077): lines and a total.
     */
    val fee: DeliveryFeeDTO,

    /**
     * `out_of_coverage` — Effy does not deliver to the address. `no_window` — it does, but no
     * window is available on any offered day and the business sends such an order by courier:
     * the client says there are no delivery windows FIRST, then offers this.
     */
    val reason: CourierQuoteReason
)

/**
 * `out_of_coverage` — Effy does not deliver to the address. `no_window` — it does, but no
 * window is available on any offered day and the business sends such an order by courier:
 * the client says there are no delivery windows FIRST, then offers this.
 *
 * 079 — why a courier delivers this order. Named, so the generated Kotlin enum is too.
 */
@Serializable
enum class CourierQuoteReason(val value: String) {
    @SerialName("no_window") NoWindow("no_window"),
    @SerialName("out_of_coverage") OutOfCoverage("out_of_coverage");
}

@Serializable
data class EffyWindowsDTO (
    /**
     * Today first, then the next delivery days. Never empty.
     */
    val days: List<EffyDayDTO>,

    /**
     * Set when no window is open on ANY day: `no_windows` (all closed or taken) or
     * `none_defined` (the business has switched none on). The customer reads
     * `DELIVERY_WINDOW_WORDS.noWindows`.
     */
    val unavailable: Unavailable? = null
)

/**
 * 078 — one day on offer: today (`same_day`) or a following delivery day (`standard`).
 */
@Serializable
data class EffyDayDTO (
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
 * Why a day has no window to choose. A later day is only ever "full".
 */
@Serializable
enum class EffyDayClosedReason(val value: String) {
    @SerialName("closed") Closed("closed"),
    @SerialName("full") Full("full"),
    @SerialName("not_delivery_day") NotDeliveryDay("not_delivery_day");
}

/**
 * The two delivery methods. ⚠ Since 077 the method has no price of its own: the fee is ONE
 * amount for the order, and a delivery today costs more only through the plan's window
 * surcharge.
 */
@Serializable
enum class DeliveryMethod(val value: String) {
    @SerialName("same_day") SameDay("same_day"),
    @SerialName("standard") Standard("standard");
}

/**
 * 078 — one window on one day.
 *
 * ⚠ NO CAPACITY, no remaining count, and a full window is simply ABSENT (069 FR-050).
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

@Serializable
enum class Unavailable(val value: String) {
    @SerialName("no_windows") NoWindows("no_windows"),
    @SerialName("none_defined") NoneDefined("none_defined");
}

/**
 * One portion of the order and the methods it can have. `shopRef` is an OPAQUE handle —
 * never a shop id (FR-033). A served package ALWAYS carries a `standard` option (FR-029);
 * `same_day` appears only where it can go today (FR-044). ⚠ Not priced: see
 * `DeliveryOptionDTO.feeAmount`.
 */
@Serializable
data class DeliveryPackageDTO (
    val options: List<DeliveryOptionDTO>,
    val shopRef: String
)

/**
 * One method a package can have.
 *
 * ⚠ `feeAmount` IS COMPATIBILITY ONLY since 077. Delivery is priced once per order
 * (`DeliveryQuoteDTO.standardFee`, `DeliverySlotOptionDTO.fee`); these per-package figures
 * are an arrangement that makes a client built before 077 — which sums the chosen method
 * per package — show no less than it is charged. They mean nothing about any one package.
 * Removed by the checkout feature (E5).
 */
@Serializable
data class DeliveryOptionDTO (
    val feeAmount: String,
    val method: DeliveryMethod,
    val promisedFrom: String? = null,
    val promisedTo: String? = null
)

/**
 * 074 — the customer's spendable points, when they have any.
 *
 * 074 — what a customer can spend at checkout, on the delivery quote. Absent when they have
 * no points. The client offers up to min(usable, order total); the card part must be 0 or
 * at least `cardMinimumAmount` (the provider cannot charge less).
 */
@Serializable
data class CheckoutPointsDTO (
    val cardMinimumAmount: String,
    val centsPerPoint: Long,
    val usable: Long
)

/**
 * One open same-day delivery window (069).
 *
 * ⚠ 077 REVERSED "a slot has no fee": the order's delivery charge with THIS window is
 * `fee`, and what the window adds over a standard day is `surchargeAmount` — shown before
 * it is chosen. ⚠ NO CAPACITY and no remaining count: how full a slot is is Effy's
 * operational business, and "2 left" would be a pressure tactic nobody asked for (FR-050).
 */
@Serializable
data class DeliverySlotOptionDTO (
    /**
     * After this the slot can no longer be chosen. Lets a client grey it out without a round
     * trip.
     */
    val cutoffAt: String,

    /**
     * The delivery day, yyyy-mm-dd (Melbourne).
     */
    val date: String,

    val endAt: String,

    /**
     * 077 — the order's delivery charge with this window chosen.
     */
    val fee: DeliveryFeeDTO? = null,

    /**
     * Opaque. Sent back as `sameDaySlotId` on the intent request (`deliveryWindow.slotId` once
     * `effyWindows` is present).
     */
    @SerialName("slotId")
    val slotID: String,

    /**
     * ISO datetimes with the Australia/Melbourne offset.
     */
    val startAt: String,

    /**
     * 077 — what this window adds to the delivery charge; "0.00" when nothing.
     */
    val surchargeAmount: String? = null
)

/**
 * Why same-day is not on offer: the zone or shop does not do it, or every slot today is
 * closed or full.
 */
@Serializable
enum class SameDayUnavailableReason(val value: String) {
    @SerialName("not_eligible") NotEligible("not_eligible"),
    @SerialName("slots_closed") SlotsClosed("slots_closed");
}

/**
 * One day a standard delivery can arrive (069). Its charge is the quote's `standardFee`
 * (077).
 */
@Serializable
data class StandardDayOptionDTO (
    /**
     * yyyy-mm-dd (Melbourne).
     */
    val date: String
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
 * GET /v1/payment-methods — the shopper's kept cards.
 */
@Serializable
data class ListPaymentMethodsResponse (
    /**
     * ⚠ An empty array means "this shopper has no kept cards" and NOTHING ELSE. A provider
     * outage MUST surface as an error rather than as `[]` — "you have no cards" and "we could
     * not ask" are different facts, and conflating them is the FR-036 failure mode (contract §
     * 2).
     */
    val paymentMethods: List<PaymentMethodDTO>
)

/**
 * A card the shopper explicitly chose to keep.
 *
 * ⚠ NEVER PERSISTED BY EFFY. This is read live from the provider at the moment it is
 * needed, because a mirrored copy rots: a card removed at the provider, expired, or
 * replaced by the issuer's auto-updater would keep being offered from a stale row
 * (data-model § 2).
 */
@Serializable
data class PaymentMethodDTO (
    /**
     * Network, for the mark and the label (e.g. "visa", "mastercard", "amex").
     */
    val brand: String,

    /**
     * ⚠ WireInt, not number. Kotlin serialises a plain `number` as `Double`, so the wire
     * carries `4.0` and Go's encoding/json refuses it into an `int` — the defect that silently
     * rejected every mobile cart write in 019 and took three stacked fixes to find (027 R13).
     * The `@asType integer` annotation is what makes the generated Kotlin an `Int`.
     */
    val expMonth: Long,

    val expYear: Long,

    /**
     * Provider payment-method reference. Opaque — never parse it.
     */
    val id: String,

    /**
     * Which card the payment step pre-selects (FR-022).
     */
    val isDefault: Boolean,

    /**
     * The ONLY part of a card number that may leave the provider.
     */
    val last4: String,

    /**
     * Why the card cannot be used, when it cannot. Stated, never left for the shopper to work
     * out.
     */
    val unusableReason: String? = null,

    /**
     * ⚠ SERVER-COMPUTED (FR-023). The client must NOT infer this from the expiry — the rules
     * for what counts as unusable belong in one place, and a client that decides for itself
     * will disagree with the server the moment those rules change.
     */
    val usable: Boolean
)

/**
 * The locality typeahead result (030): ≤ 8, alphabetical, never ordered by serviceability.
 */
@Serializable
data class LocalitiesResultDTO (
    val items: List<LocalityDTO>
)

/**
 * One place, fully identified — the only selectable unit (FR-007).
 */
@Serializable
data class LocalityDTO (
    val name: String,
    val postcode: String,
    val state: AustralianState
)

/**
 * Australian state / territory — the closed set the place record uses.
 */
@Serializable
enum class AustralianState(val value: String) {
    @SerialName("ACT") Act("ACT"),
    @SerialName("NT") NT("NT"),
    @SerialName("NSW") Nsw("NSW"),
    @SerialName("QLD") Qld("QLD"),
    @SerialName("SA") Sa("SA"),
    @SerialName("TAS") Tas("TAS"),
    @SerialName("VIC") Vic("VIC"),
    @SerialName("WA") Wa("WA");
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
     * What the shopper is out of pocket after refunds.
     *
     * ⚠ NOT A CORRECTION TO `grandTotalAmount` (FR-024). That figure is what was CHARGED — a
     * historical record. A receipt that silently rewrote itself after a refund could not be
     * reconciled against a bank statement, which is the one thing a receipt is for.
     */
    val amountPaidAfterRefunds: String? = null,

    /**
     * 052 — when the order is expected to arrive (FR-007), one entry per package.
     *
     * ⚠ More than one entry means the order arrives in more than one delivery — a fact about
     * the CUSTOMER'S experience, not about fulfilment structure. It carries no shop reference
     * of any kind (FR-009), and the entries are deliberately unordered with respect to any
     * internal grouping.
     *
     * ⚠ 079 — EMPTY for a courier order, which has no window and no day: read `delivery` and
     * print `deliverySummary`. (Empty, not "standard", so a client built before 079 prints no
     * arrival rather than a wrong one.)
     */
    val arrivalEstimates: List<ArrivalEstimateDTO>,

    /**
     * The BILLING address snapshot (023). `null` means "same as shipping" — the client renders
     * "Billing: same as shipping" rather than repeating the address. A value is a divergent
     * billing address. NEVER exposed to the shop (FR-018). Absent/null on pre-023 orders.
     */
    val billingAddress: OrderAddressDTO? = null,

    /**
     * 055 — may the SHOPPER still cancel this order themselves? (FR-012)
     *
     * ⚠ SERVER-DERIVED, for exactly the reason `stage` above is: a client computing it from
     * `fulfillments` would be a second implementation of one rule, and the divergence would be
     * silent because both surfaces still render *something*. Here the cost is a shopper shown a
     * cancel button that refuses, or denied one that would have worked.
     *
     * ⚠ ADVISORY, NOT THE GATE. It was true when the page loaded; a shop may have begun picking
     * since, and the server re-decides inside a row lock when the cancel actually arrives
     * (FR-017).
     *
     * ⚠ `false` DOES NOT MEAN "this order can never be cancelled" — staff can cancel at any
     * pre-departure stage (FR-018). Any wording built on this must leave that door open, or a
     * shopper who would have rung up simply gives up.
     */
    val cancellable: Boolean,

    val currency: String,

    /**
     * 079 — who delivers the order, and for a courier the estimate it was sold. ⚠ ABSENT on an
     * order placed before 079. Every surface prints this through `deliverySummary`
     * (`delivery-type.ts`).
     */
    val delivery: OrderDeliveryDTO? = null,

    /**
     * The SHIPPING address snapshot (the main one — where the order is delivered).
     */
    val deliveryAddress: OrderAddressDTO,

    /**
     * 077 — the same charge as lines (delivery, window surcharge, small-order fee, free
     * delivery), exactly as sold. ⚠ ABSENT on an order placed before 077: render the single
     * `deliveryFeeAmount` row instead. Stored with the order and never recomputed, so it reads
     * the same after the business changes its prices.
     */
    val deliveryFee: DeliveryFeeDTO? = null,

    /**
     * 051 FR-043 — the delivery fee as charged.
     *
     * ⚠ The column has existed since 019 and the receipt read never selected it, so delivery
     * sat inside the total and appeared nowhere. A receipt whose lines do not add up to its
     * total is not one a shopper can check — and for a GST-inclusive Australian sale that is a
     * real gap, not a cosmetic one.
     */
    val deliveryFeeAmount: String? = null,

    /**
     * 066 — what the customer told the driver when the order was placed, or null/absent when
     * they said nothing (every pre-066 order). Fixed once the order is paid. Render NOTHING for
     * null — no placeholder — and render `note` as plain text only.
     */
    val deliveryInstructions: DeliveryInstructionsDTO? = null,

    /**
     * The promotional discount applied at payment (027 FR-049). The platform's own computation
     * at that moment, stored on the order — so a receipt stays explainable years later even if
     * the code has since been changed or disabled. "0.00" (or absent, on a pre-027 order) when
     * no code was used. Invariant: grandTotal = itemSubtotal − discount. (There is no delivery
     * fee on this platform.)
     */
    val discountAmount: String? = null,

    val fulfillments: List<OrderFulfillmentDTO>,

    /**
     * ⚠ DERIVED FROM THE TOTALS, never a stored flag — so reaching it line by line and reaching
     * it in one act are the same fact. A flag could be true while the numbers disagreed, and
     * then nobody knows which to believe.
     */
    val fullyRefunded: Boolean? = null,

    val grandTotalAmount: String,
    val id: String,
    val items: List<OrderItemDTO>,
    val itemSubtotalAmount: String,
    val orderNumber: String,

    /**
     * 052 — how the order was paid, in a form safe to display (FR-006). Null when not captured:
     * a pre-052 order, or an order whose post-commit capture failed. The receipt omits the line
     * rather than showing a blank.
     */
    val paymentMethod: PaymentMethodSummaryDTO? = null,

    /**
     * 074 — how the order was paid when points were part of it, and what has come back of each.
     * ⚠ ABSENT on an order that used no points. Points are a way of paying — never a discount.
     */
    val paymentSplit: OrderPaymentSplitDTO? = null,

    val paymentStatus: PaymentStatus,
    val placedAt: String? = null,

    /**
     * The literal code used, denormalised beside the discount so the receipt can still say
     * "SPRING20" independently of the promotion record. Null/absent when no code was used.
     */
    val promoCode: String? = null,

    /**
     * What has actually been returned or is on its way. Absent when there are no refunds.
     */
    val refundedTotal: String? = null,

    /**
     * 055 — every refund on this order, newest first (FR-023).
     *
     * ⚠ ABSENT ENTIRELY when nothing was refunded — not an empty array (FR-028, SC-011). An
     * order with no refunds serialises byte-identically to its pre-055 self, so a client that
     * has never seen one cannot tell this slice shipped, and renders nothing rather than an
     * empty section.
     *
     * ⚠ NO FAILURE REASON, NO KIND, NO PROVIDER REFERENCE. See [CustomerRefundDTO].
     */
    val refunds: List<CustomerRefundDTO>? = null,

    /**
     * 052 — the customer-facing progress stage (FR-008).
     *
     * ⚠ SERVER-DERIVED, ALWAYS. Clients render this; no client computes it from `fulfillments`.
     * Two clients deriving one answer independently is 029's banner target and 033's
     * `available` flag, and the failure is silent because both surfaces still render
     * *something*.
     *
     * ⚠ It is a ROLLUP, NOT A MAX: a two-shop order with one portion delivered and one still
     * being picked is `packing`. The customer has not received their order.
     */
    val stage: OrderStage,

    val status: OrderStatus
)

/**
 * 052 — when one package is expected to ARRIVE, as the customer was shown at checkout.
 *
 * ⚠ NOT `DeliveryPromiseDTO`, which already exists in `shop-order.ts` and is a DIFFERENT
 * FACT FOR A DIFFERENT AUDIENCE: that one carries `readyBy`, the time this shop must have
 * the package ready at the fulfilment node. Research R4 records that the ready-by must
 * never reach the customer — it means something else, and it is fulfilment structure
 * (FR-009). The names are kept apart deliberately so the two can never be swapped by
 * autocomplete.
 *
 * `promisedFrom`/`promisedTo` are ISO dates (yyyy-mm-dd): the delivery DAY. From 069 they
 * are equal — today for same-day, the customer's chosen day for standard. ⚠ Both are null
 * on every order placed before 069, which never recorded a day at all; a client then says
 * the date will be confirmed and MUST NOT invent one.
 *
 * `windowStart`/`windowEnd` are the same-day time window the customer was sold (069). Null
 * for standard deliveries and for every earlier order. Render all four through
 * `formatArrival`.
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
 * 079 — who delivers the order, and for a courier the estimate it was sold. ⚠ ABSENT on an
 * order placed before 079. Every surface prints this through `deliverySummary`
 * (`delivery-type.ts`).
 *
 * An order's delivery, as a customer contract carries it. ABSENT on an order placed before
 * 079.
 *
 * 079 — who delivers it. ⚠ ABSENT on an order placed before 079.
 */
@Serializable
data class OrderDeliveryDTO (
    /**
     * The courier's usual timeframe as it was sold ("2–4 business days"); null for an Effy
     * order.
     */
    val courierEstimate: String? = null,

    /**
     * 081 — present only after back-office moved the order to the other delivery type: the
     * LATEST move, and what the customer received for it. ⚠ Never the staff reason, the courier
     * fee, the difference or Effy's cost — a customer is told what happened and what they got,
     * nothing else.
     */
    val moved: OrderDeliveryMoveDTO? = null,

    /**
     * 080 — how the customer follows a courier order (Q8). `link`: the order travels as ONE
     * consignment and the courier gave a tracking link. `email`: it travels as more than one,
     * and each parcel's tracking is emailed. Absent otherwise (not handed over yet, or no link
     * given). ⚠ Never a count, a reference without a link, or anything per parcel.
     */
    val tracking: Tracking? = null,

    val type: DeliveryType
)

/**
 * 081 — present only after back-office moved the order to the other delivery type: the
 * LATEST move, and what the customer received for it. ⚠ Never the staff reason, the courier
 * fee, the difference or Effy's cost — a customer is told what happened and what they got,
 * nothing else.
 *
 * 081 — the latest move of an order's delivery type by back-office, as the customer reads
 * it.
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
 * 080 — how the customer follows a courier order (Q8). `link`: the order travels as ONE
 * consignment and the courier gave a tracking link. `email`: it travels as more than one,
 * and each parcel's tracking is emailed. Absent otherwise (not handed over yet, or no link
 * given). ⚠ Never a count, a reference without a link, or anything per parcel.
 */
@Serializable
data class Tracking (
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
    /**
     * 052 — a short-lived presigned URL for the product's primary image, or null.
     *
     * ⚠ DECORATION ONLY, and never a carrier of meaning (FR-003). A line renders complete
     * without it, and a client MUST NOT gate any fact on its presence. It is resolved by a LEFT
     * JOIN to the live `product_media`; every other field on this line comes from the order's
     * own immutable snapshot, which is why a renamed or re-photographed product still shows
     * what was actually bought (FR-011).
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    val lineSubtotalAmount: String,

    /**
     * 055 — this LINE's own id.
     *
     * ⚠ NOT INTERCHANGEABLE WITH `productId`, and the difference is load-bearing. `order_item`
     * has no uniqueness on (order, product), so two lines of the same product cannot be told
     * apart by product id. A refund request that named a product where a line was expected
     * would not error — the join would simply match nothing, and every item the shopper named
     * would be SILENTLY DROPPED.
     *
     * ⚠ It discloses nothing: a row id on the shopper's own order, carrying no shop and no
     * fulfilment structure. The back-office contract already speaks this language.
     */
    @SerialName("orderItemId")
    val orderItemID: String,

    @SerialName("productId")
    val productID: String,

    val productName: String,
    val quantity: Double,
    val unitPriceAmount: String
)

/**
 * 052 — a short, non-sensitive description of how an order was paid.
 *
 * ⚠ NO CARD DATA BEYOND `last4`, ever (051 `payment.ts`). There is no field for a card
 * number, an expiry, or a cardholder name, and none may be added.
 */
@Serializable
data class PaymentMethodSummaryDTO (
    /**
     * Network or wallet for the label ("visa", "apple_pay"). Null when the family carries no
     * brand.
     */
    val brand: String? = null,

    /**
     * The ONLY part of a card number permitted to leave the provider. Null for non-card
     * families.
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
 * 074 — how the order was paid when points were part of it, and what has come back of each.
 * ⚠ ABSENT on an order that used no points. Points are a way of paying — never a discount.
 *
 * How an order was paid and what has come back — on customer and staff order reads.
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
 * 052 — the customer-facing progress stage (FR-008).
 *
 * ⚠ SERVER-DERIVED, ALWAYS. Clients render this; no client computes it from `fulfillments`.
 * Two clients deriving one answer independently is 029's banner target and 033's
 * `available` flag, and the failure is silent because both surfaces still render
 * *something*.
 *
 * ⚠ It is a ROLLUP, NOT A MAX: a two-shop order with one portion delivered and one still
 * being picked is `packing`. The customer has not received their order.
 *
 * 052 — the customer-facing progress vocabulary (FR-008). A CLOSED union, derived
 * server-side from every `shop_fulfillment.status` on the order. See `stageFor` in
 * `apis/edge-api/shared/src/lib/order-completion.ts` for the single rollup that produces it.
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
    val currency: String,

    /**
     * 079 — who delivers it. ⚠ ABSENT on an order placed before 079.
     */
    val delivery: OrderDeliveryDTO? = null,

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
 * A customer's ask.
 *
 * ⚠ IT IS NOT A REFUND. It carries no amount and no provider reference, and it moves no
 * money (FR-005r). It replaces "email support and hope" — today "Get help" opens a generic
 * feedback form with no order reference attached. ⚠ Deliberately NOT a message thread: one
 * statement, one outcome.
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
 * One of the shopper's lists.
 *
 * ⚠ `name` is `null` for the default list. "Saved" is display text and each client supplies
 * it.
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
     * How many of this list's products are in NO other list. Deleting the list stops those
     * being saved at all, and the confirmation must say so (068 FR-006).
     */
    val onlyHereCount: Long
)

@Serializable
data class SavedListCreateRequest (
    val name: String,

    /**
     * Place this product in the new list in the same action (068 FR-015).
     */
    @SerialName("productId")
    val productID: String? = null
)

@Serializable
data class SavedListEntryRequest (
    /**
     * Set ONLY by undo, to return the product to the position it held in this list.
     */
    val restoreAddedAt: String? = null
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

    /**
     * The subset of `productIds` held in at least one NAMED list (068).
     *
     * ⚠ This is what the heart reads to decide what a tap on a FILLED heart means: a product
     * only in "Saved" is un-saved; a product in a named list opens the list chooser instead,
     * because one tap must never remove something from a list the shopper built (068 FR-020).
     * The platform enforces the same rule (`409`), so a client that ignores this field is safe,
     * just less graceful.
     *
     * Optional: a backend older than 068 omits it, and absent reads as empty.
     */
    @SerialName("namedProductIds")
    val namedProductIDS: List<String>? = null,

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
 * The single serviceability decision (FR-001), answered before a cart exists and again at
 * checkout by the SAME predicate (FR-004). ⚠ No zone id, name, fee, or window may be added.
 */
@Serializable
data class ServiceabilityDTO (
    /**
     * 076 — who delivers. Absent only from a server older than 076.
     */
    val coverage: CoverageKind? = null,

    /**
     * 077 — the basket offer, when Effy delivers here. Absent for `courier` and `none`, and
     * from a server older than 077. ⚠ An offer, never a fee: the fee needs the basket and the
     * window.
     */
    val offer: DeliveryOfferDTO? = null,

    val postcode: String,

    /**
     * Kept for clients released before 076. Always `coverage !== "none"`.
     */
    val serviced: Boolean
)

/**
 * 077 — the basket offer, when Effy delivers here. Absent for `courier` and `none`, and
 * from a server older than 077. ⚠ An offer, never a fee: the fee needs the basket and the
 * window.
 *
 * The business's public basket offer (077): what a cart can say before there is an address
 * to price. A null value means the rule is not set.
 */
@Serializable
data class DeliveryOfferDTO (
    val freeDeliveryOverAmount: String? = null,
    val smallOrderFeeAmount: String? = null,
    val smallOrderUnderAmount: String? = null
)

/**
 * PATCH /v1/addresses/{id} — partial update / set default.
 */
@Serializable
data class UpdateAddressRequest (
    val city: String? = null,
    val country: String? = null,

    /**
     * 066 — on UPDATE the key's PRESENCE is what is read: absent leaves the saved default
     * alone, `null` clears it, a value replaces it.
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
