package com.effyshopping.customer.mobile.features.checkout.domain

/**
 * Delivery quote domain (021 US1/US2/US3) — the app's OWN types, mapped from the generated wire DTOs in
 * the data layer (Principle VI: DTOs never leak past `data`). Everything here is ANONYMOUS: a package is
 * a set of items + its available/chosen methods, never a shop (FR-019, SC-006). The client never carries
 * a fee — the server prices every method (FR-008, SC-004); the fee strings here are display-only reads of
 * the server's own quote.
 */

/** The three service levels (021). Availability per package is server-decided from origin/dest zones. */
enum class DeliveryMethod { SAME_DAY, SCHEDULED, STANDARD }

/** One selectable option for a package — server-computed price + window; scheduled carries pickable dates. */
data class DeliveryOption(
    val method: DeliveryMethod,
    val serviceLevel: String,
    val feeAmount: String,
    val window: String?,
    val scheduleDates: List<String>,
)

/** One item inside an anonymous package. */
data class QuotePackageItem(
    val productId: String,
    val name: String,
    val imageUrl: String?,
    val quantity: Int,
)

/** One anonymous package (021 FR-019) — items from a single shop, shown with no shop identity. */
data class QuotePackage(
    val packageKey: String,
    val items: List<QuotePackageItem>,
    val serviceable: Boolean,
    val options: List<DeliveryOption>,
) {
    fun optionFor(method: DeliveryMethod): DeliveryOption? = options.firstOrNull { it.method == method }
}

/**
 * The captured server quote for a cart + address (021). Honored until [expiresAt]; after it the client
 * must re-quote (FR-011a). Splits packages into the ones we can deliver and the auto-set-aside ones.
 */
data class DeliveryQuote(
    val quoteId: String,
    val expiresAt: String,
    val packages: List<QuotePackage>,
) {
    val serviceablePackages: List<QuotePackage> get() = packages.filter { it.serviceable }
    val undeliverablePackages: List<QuotePackage> get() = packages.filterNot { it.serviceable }

    /** The exact set the client must confirm proceeding WITHOUT — must match the server's set (SC-011a). */
    val excludedPackageKeys: List<String> get() = undeliverablePackages.map { it.packageKey }

    /** Nothing can reach the address → the customer is blocked entirely (US2 scenario 2, FR-006c). */
    val fullyUndeliverable: Boolean get() = packages.isNotEmpty() && serviceablePackages.isEmpty()

    /** Some deliverable, some set aside → explicit confirm required before pay (FR-006b). */
    val hasSetAside: Boolean get() = undeliverablePackages.isNotEmpty() && serviceablePackages.isNotEmpty()
}

/** The customer's chosen method for one package (021). Carries NO fee — the server prices it. */
data class DeliverySelection(
    val packageKey: String,
    val method: DeliveryMethod,
    val scheduledDate: String?,
)

/**
 * The full placement request (021 US3, extended 023). Sends the captured [quoteId], the per-package
 * [selections], and the [excludedPackageKeys] the customer confirmed proceeding without — never a fee.
 *
 * [addressId] is the SHIPPING address. [billingAddressId] (023 US4) is set ONLY when the customer
 * diverged billing from shipping; null means "same as shipping" (the server stores NULL). Billing never
 * affects the amount or the quote.
 */
data class PlaceOrder(
    val addressId: String,
    val quoteId: String?,
    val selections: List<DeliverySelection>,
    val excludedPackageKeys: List<String>,
    val billingAddressId: String? = null,
)

/** Fetch the per-package delivery quote for an address (021 US1). */
class QuoteDelivery(private val checkout: CheckoutRepository) {
    suspend operator fun invoke(addressId: String): DeliveryQuote = checkout.quote(addressId)
}
