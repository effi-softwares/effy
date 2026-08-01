package com.effyshopping.customer.mobile.core.nav

import androidx.navigation3.runtime.NavKey
import androidx.savedstate.serialization.SavedStateConfiguration
import kotlinx.serialization.Serializable
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic
import kotlinx.serialization.modules.subclass

/**
 * Every destination in the customer app, as a Navigation 3 [NavKey] (026).
 *
 * ── Why this replaced `AppRoute` + a hand-rolled stack ──────────────────────────────────────────
 *
 * 015 built a `List<AppRoute>` navigator and a delimiter-joined `String` back stack for the Home tab,
 * because Navigation 3 was alpha and unverified on iOS at the time. Nav3 went **stable in Nov 2025**
 * and Compose Multiplatform **1.10** shipped it for iOS/desktop/web; this app is on **1.11.1**. The
 * deviation's reason expired, so the mechanism goes with it.
 *
 * The concrete win is not tidiness: the Home tab's stack was encoded as `"homeproduct:42"` and
 * parsed with `startsWith("product:")`. A typo in a prefix was a runtime blank screen. These are typed
 * keys the compiler checks, and the `when` in the entry provider is exhaustive.
 *
 * ── ⚠ EVERY ROUTE MUST BE REGISTERED IN [customerNavSavedState] ─────────────────────────────────
 *
 * Kotlin/Native has no reflection-based saved state, so Nav3's convenient `rememberNavBackStack(key)`
 * overload is **Android-only**. iOS needs the `SavedStateConfiguration` overload with an explicit
 * polymorphic [SerializersModule]. An unregistered route silently fails to restore **on iOS only** —
 * it passes every Android test — which is exactly the class of bug 015 predicted (research R6) and
 * `CustomerNavKeySerializationTest` guards.
 */
@Serializable
sealed interface CustomerNavKey : NavKey {


    // ── Tab roots — the four primary destinations. Always show the bar. ─────────────────────────

    @Serializable data object Home : CustomerNavKey
    @Serializable data object Search : CustomerNavKey
    @Serializable data object Orders : CustomerNavKey
    @Serializable data object Account : CustomerNavKey

    // ── Commerce ───────────────────────────────────────────────────────────────────────────────

    @Serializable
    data class Product(val productId: String) : CustomerNavKey

    /**
     * A SCOPED result set — Home's "see all" on a section, and a category shortcut (028 US2/US3).
     *
     * Renders the ordinary Search screen with an entry refinement applied, so there is exactly one
     * results implementation in the app (FR-009). `SearchViewModel` already supports both
     * refinements; 025 built that seam and 026 removed its only caller.
     *
     * ⚠ PUSHED onto the current tab, never `selectTab(Search)`. A shopper who taps "see all" on Home
     * came from Home, and Back has to take them there — switching tabs would strand them at the
     * Search tab's root instead.
     *
     * [title] is what the destination shows so the shopper can see the scope they are now in
     * (FR-018/FR-027) — a filtered list that does not say what it is filtered to is a list that
     * looks broken.
     */
    @Serializable
    data class Results(
        val title: String,
        val categoryKey: String? = null,
        val saleOnly: Boolean = false,
    ) : CustomerNavKey

    @Serializable data object Cart : CustomerNavKey

    @Serializable data object Checkout : CustomerNavKey

    @Serializable
    data class Receipt(val orderId: String) : CustomerNavKey

    @Serializable
    data class OrderDetail(val orderId: String) : CustomerNavKey


    // ── Auth ───────────────────────────────────────────────────────────────────────────────────

    @Serializable
    data class SignIn(val returnTo: CustomerNavKey? = null) : CustomerNavKey

    @Serializable data object SignUp : CustomerNavKey

    @Serializable
    data class VerifyOtp(
        val email: String,
        val purpose: OtpPurpose,
        val returnTo: CustomerNavKey? = null,
    ) : CustomerNavKey

    @Serializable data object Recovery : CustomerNavKey

    // ── Account sub-screens ────────────────────────────────────────────────────────────────────

    @Serializable data object Favorites : CustomerNavKey
    @Serializable data object AddressBook : CustomerNavKey
    @Serializable data object Notifications : CustomerNavKey
    @Serializable data object Faqs : CustomerNavKey
    @Serializable data object HelpCenter : CustomerNavKey
    @Serializable data object CustomerService : CustomerNavKey

    @Serializable data object MyDetails : CustomerNavKey

    @Serializable
    data class Password(val setFirst: Boolean) : CustomerNavKey
}

/** What an emailed code is for — so the verify screen knows which flow to complete. */
@Serializable
enum class OtpPurpose { SIGN_IN, SIGN_UP, RECOVERY }

/** The four tab roots, in bar order. The single source for what a "tab" is. */
val CUSTOMER_TAB_ROOTS: List<CustomerNavKey> = listOf(
    CustomerNavKey.Home,
    CustomerNavKey.Search,
    CustomerNavKey.Orders,
    CustomerNavKey.Account,
)

/**
 * The saved-state configuration Nav3 uses to persist back stacks across process death.
 *
 * ⚠ THIS IS THE iOS PATH. Android could use the reflection-based overload; iOS cannot, so every app
 * uses this one and the two platforms stay identical. A route missing from the polymorphic module
 * below throws at restore time on iOS and works fine on Android — never add a route without adding it
 * here, and the serialization test will tell you if you forget.
 */
val customerNavSavedState: SavedStateConfiguration = SavedStateConfiguration {
    serializersModule = SerializersModule {
        polymorphic(NavKey::class) {
            subclass(CustomerNavKey.Home::class, CustomerNavKey.Home.serializer())
            subclass(CustomerNavKey.Search::class, CustomerNavKey.Search.serializer())
            subclass(CustomerNavKey.Orders::class, CustomerNavKey.Orders.serializer())
            subclass(CustomerNavKey.Account::class, CustomerNavKey.Account.serializer())
            subclass(CustomerNavKey.Product::class, CustomerNavKey.Product.serializer())
            subclass(CustomerNavKey.Results::class, CustomerNavKey.Results.serializer())
            subclass(CustomerNavKey.Cart::class, CustomerNavKey.Cart.serializer())
            subclass(CustomerNavKey.Checkout::class, CustomerNavKey.Checkout.serializer())
            subclass(CustomerNavKey.Receipt::class, CustomerNavKey.Receipt.serializer())
            subclass(CustomerNavKey.OrderDetail::class, CustomerNavKey.OrderDetail.serializer())
            subclass(CustomerNavKey.SignIn::class, CustomerNavKey.SignIn.serializer())
            subclass(CustomerNavKey.SignUp::class, CustomerNavKey.SignUp.serializer())
            subclass(CustomerNavKey.VerifyOtp::class, CustomerNavKey.VerifyOtp.serializer())
            subclass(CustomerNavKey.Recovery::class, CustomerNavKey.Recovery.serializer())
            subclass(CustomerNavKey.Favorites::class, CustomerNavKey.Favorites.serializer())
            subclass(CustomerNavKey.AddressBook::class, CustomerNavKey.AddressBook.serializer())
            subclass(CustomerNavKey.Notifications::class, CustomerNavKey.Notifications.serializer())
            subclass(CustomerNavKey.Faqs::class, CustomerNavKey.Faqs.serializer())
            subclass(CustomerNavKey.HelpCenter::class, CustomerNavKey.HelpCenter.serializer())
            subclass(CustomerNavKey.CustomerService::class, CustomerNavKey.CustomerService.serializer())
            subclass(CustomerNavKey.MyDetails::class, CustomerNavKey.MyDetails.serializer())
            subclass(CustomerNavKey.Password::class, CustomerNavKey.Password.serializer())
        }
    }
}

/** Every route, for the serialization round-trip test. Keep in step with the module above. */
val ALL_CUSTOMER_ROUTES: List<CustomerNavKey> = listOf(
    CustomerNavKey.Home,
    CustomerNavKey.Search,
    CustomerNavKey.Orders,
    CustomerNavKey.Account,
    CustomerNavKey.Product("p1"),
    CustomerNavKey.Results(title = "On sale", categoryKey = null, saleOnly = true),
    CustomerNavKey.Cart,
    CustomerNavKey.Checkout,
    CustomerNavKey.Receipt("o1"),
    CustomerNavKey.OrderDetail("o1"),
    CustomerNavKey.SignIn(),
    CustomerNavKey.SignUp,
    CustomerNavKey.VerifyOtp("a@b.c", OtpPurpose.SIGN_IN),
    CustomerNavKey.Recovery,
    CustomerNavKey.Favorites,
    CustomerNavKey.AddressBook,
    CustomerNavKey.Notifications,
    CustomerNavKey.Faqs,
    CustomerNavKey.HelpCenter,
    CustomerNavKey.CustomerService,
    CustomerNavKey.MyDetails,
    CustomerNavKey.Password(setFirst = true),
)
