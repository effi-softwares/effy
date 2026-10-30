package com.effyshopping.customer.mobile.core.nav

import androidx.navigation3.runtime.NavKey
import androidx.savedstate.serialization.SavedStateConfiguration
import kotlinx.serialization.Serializable
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic
import kotlinx.serialization.modules.subclass

/**
 * Every destination in the customer app, as a Navigation 3 [NavKey]: typed keys the compiler checks,
 * with an exhaustive `when` in the entry provider.
 *
 * Every route must be registered in [customerNavSavedState]: Kotlin/Native has no reflection-based saved
 * state, so iOS needs an explicit polymorphic [SerializersModule], and an unregistered route fails to
 * restore on iOS only (`CustomerNavKeySerializationTest` guards it).
 */
@Serializable
sealed interface CustomerNavKey : NavKey {

    // Tab roots - the four primary destinations. Always show the bar.

    @Serializable data object Home : CustomerNavKey
    @Serializable data object Search : CustomerNavKey
    @Serializable data object Orders : CustomerNavKey
    @Serializable data object Account : CustomerNavKey

    // Commerce

    /** [variantId]: the size to open on - a filtered result's matching size (101 FR-031); null = the default. */
    @Serializable
    data class Product(val productId: String, val variantId: String? = null) : CustomerNavKey

    /**
     * A scoped result set (Home's "see all", a category shortcut): the ordinary Search screen with an entry
     * refinement. Pushed onto the current tab, never `selectTab(Search)`, so Back returns where the shopper
     * came from. [title] says what the list is filtered to.
     */
    @Serializable
    data class Results(
        val title: String,
        val categoryKey: String? = null,
        val saleOnly: Boolean = false,
    ) : CustomerNavKey

    /**
     * One level of the category tree (101): the categories under [parentKey], down to five levels. A leaf (or
     * "All in …") opens [Results] scoped to it.
     */
    @Serializable
    data class CategoryBrowse(val parentKey: String, val title: String) : CustomerNavKey

    /**
     * One promotion in full. Carries the id only: the screen re-reads it, so an offer that ended meanwhile
     * says so (and no expired presigned image URL is restored).
     */
    @Serializable
    data class Promotion(val promotionId: String) : CustomerNavKey

    @Serializable data object Cart : CustomerNavKey

    @Serializable data object Checkout : CustomerNavKey

    /**
     * Paying - Effy's own payment screen around the provider's in-app element.
     *
     * It carries no arguments on purpose. Every route here is `@Serializable` and persisted across
     * process death, and the thing this screen needs is a payment intent holding a client secret.
     * Persisting that to device storage would be a durable secret written for no reason, so the intent
     * travels in memory through `PaymentHandoff` and this key is a bare marker. No handoff ⇒ the screen
     * says so and sends the shopper back to checkout, which is the correct outcome after a process kill.
     */
    @Serializable data object Payment : CustomerNavKey

    @Serializable
    data class Receipt(val orderId: String) : CustomerNavKey

    @Serializable
    data class OrderDetail(val orderId: String) : CustomerNavKey

    // Auth

    @Serializable
    data class SignIn(val returnTo: CustomerNavKey? = null) : CustomerNavKey

    /**
     * The password step of sign-in.
     *
     * A separate destination, not a mode flag on [SignIn]. The whole point of the step form is that
     * choosing "use a password" moves you somewhere - with a back arrow that returns you, and with the
     * address already known so it is never asked twice.
     */
    @Serializable
    data class SignInPassword(val email: String, val returnTo: CustomerNavKey? = null) : CustomerNavKey

    @Serializable data object SignUp : CustomerNavKey

    /** The password step of sign-up. Asks for the password only - the email is known. */
    @Serializable
    data class SignUpPassword(val email: String) : CustomerNavKey

    /**
     * "What should we call you?" - the last step of registration, on every route.
     *
     * Reached only once the account exists and the shopper is signed in. It completes a profile; it
     * does not gate access. Abandoning it must never lock anyone out.
     */
    @Serializable data object ProfileName : CustomerNavKey

    @Serializable
    data class VerifyOtp(
        val email: String,
        val purpose: OtpPurpose,
        val returnTo: CustomerNavKey? = null,
    ) : CustomerNavKey

    @Serializable data object Recovery : CustomerNavKey

    // Account sub-screens

    @Serializable data object Saved : CustomerNavKey
    @Serializable data object AddressBook : CustomerNavKey

    /**
     * Payment methods: the cards a shopper kept, beside the address book. Removal is also on the payment
     * step, but a shopper removes a card when not shopping.
     */
    @Serializable data object PaymentMethods : CustomerNavKey
    /** The customer's Effy points: balance and history. */
    @Serializable data object Points : CustomerNavKey
    @Serializable data object Notifications : CustomerNavKey
    @Serializable data object Faqs : CustomerNavKey
    @Serializable data object HelpCenter : CustomerNavKey
    @Serializable data object CustomerService : CustomerNavKey

    /** Give feedback - reachable from the Account tab, guest or signed-in. */
    @Serializable data object Feedback : CustomerNavKey

    @Serializable data object MyDetails : CustomerNavKey

    // The account centre's new destinations
    /** How you sign in - composed from the credentials the account actually holds. */
    @Serializable data object Security : CustomerNavKey
    /** Privacy & data. Hosts the deletion control, as its last item. */
    @Serializable data object Privacy : CustomerNavKey
    /** The account-deletion flow itself. */
    @Serializable data object DeleteAccount : CustomerNavKey

    /**
     * Resetting a forgotten password from inside the account.
     *
     * A separate route from [Recovery], deliberately. Recovery is the public, signed-out journey and
     * has to ask for an email address because it does not know who is asking. This one is reached by a
     * signed-in shopper who simply cannot remember their current password - the platform already knows
     * their address, so asking for it would be a question with a known answer, and typing the wrong one
     * would fail confusingly.
     */
    @Serializable data object PasswordReset : CustomerNavKey

    @Serializable
    data class Password(val setFirst: Boolean) : CustomerNavKey

    // Legal & informational documents
    /** The `/legal` index - lists every document. */
    @Serializable data object LegalIndex : CustomerNavKey

    /**
     * Any one legal/informational document, by slug (privacy-policy, terms-of-service, …). One route
     * renders all 11 from the generated `LEGAL_DOCUMENTS`, so About = `LegalDocument("about")` and
     * Licenses = `LegalDocument("acknowledgements")` need no keys of their own.
     */
    @Serializable data class LegalDocument(val slug: String) : CustomerNavKey
}

/** What an emailed code is for - so the verify screen knows which flow to complete. */
@Serializable
enum class OtpPurpose { SIGN_IN, SIGN_UP, RECOVERY }

/** The four tab roots, in bar order. The single source for what a "tab" is. */
val CUSTOMER_TAB_ROOTS: List<CustomerNavKey> = listOf(
    CustomerNavKey.Home,
    CustomerNavKey.Search,
    // 087 FR-006/FR-007 - the cart is a TAB (operator direction: "cart button should be in bottom
    // nav"). Its key is unchanged, so saved stacks and the serializer are unaffected; it is simply a
    // tab root now instead of a pushed route, and every way into it selects this tab.
    CustomerNavKey.Cart,
    CustomerNavKey.Orders,
    CustomerNavKey.Account,
)

/**
 * The saved-state configuration Nav3 uses to persist back stacks across process death; the iOS path, used
 * on both platforms. A route needs registering here (the serialization test fails otherwise) and an
 * `entry<CustomerNavKey.X> { … }` in `CustomerShell`'s `NavDisplay`, or the first tap throws "Unknown
 * screen X"; `mobile-guard` checks both.
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
            subclass(CustomerNavKey.CategoryBrowse::class, CustomerNavKey.CategoryBrowse.serializer())
            subclass(CustomerNavKey.Promotion::class, CustomerNavKey.Promotion.serializer())
            subclass(CustomerNavKey.Cart::class, CustomerNavKey.Cart.serializer())
            subclass(CustomerNavKey.Checkout::class, CustomerNavKey.Checkout.serializer())
            subclass(CustomerNavKey.Payment::class, CustomerNavKey.Payment.serializer())
            subclass(CustomerNavKey.Receipt::class, CustomerNavKey.Receipt.serializer())
            subclass(CustomerNavKey.OrderDetail::class, CustomerNavKey.OrderDetail.serializer())
            subclass(CustomerNavKey.SignIn::class, CustomerNavKey.SignIn.serializer())
            subclass(CustomerNavKey.SignInPassword::class, CustomerNavKey.SignInPassword.serializer())
            subclass(CustomerNavKey.SignUp::class, CustomerNavKey.SignUp.serializer())
            subclass(CustomerNavKey.SignUpPassword::class, CustomerNavKey.SignUpPassword.serializer())
            subclass(CustomerNavKey.ProfileName::class, CustomerNavKey.ProfileName.serializer())
            subclass(CustomerNavKey.VerifyOtp::class, CustomerNavKey.VerifyOtp.serializer())
            subclass(CustomerNavKey.Recovery::class, CustomerNavKey.Recovery.serializer())
            subclass(CustomerNavKey.Saved::class, CustomerNavKey.Saved.serializer())
            subclass(CustomerNavKey.AddressBook::class, CustomerNavKey.AddressBook.serializer())
            subclass(CustomerNavKey.PaymentMethods::class, CustomerNavKey.PaymentMethods.serializer())
            subclass(CustomerNavKey.Points::class, CustomerNavKey.Points.serializer())
            subclass(CustomerNavKey.Notifications::class, CustomerNavKey.Notifications.serializer())
            subclass(CustomerNavKey.Faqs::class, CustomerNavKey.Faqs.serializer())
            subclass(CustomerNavKey.HelpCenter::class, CustomerNavKey.HelpCenter.serializer())
            subclass(CustomerNavKey.CustomerService::class, CustomerNavKey.CustomerService.serializer())
            subclass(CustomerNavKey.Feedback::class, CustomerNavKey.Feedback.serializer())
            subclass(CustomerNavKey.MyDetails::class, CustomerNavKey.MyDetails.serializer())
            subclass(CustomerNavKey.Security::class, CustomerNavKey.Security.serializer())
            subclass(CustomerNavKey.Privacy::class, CustomerNavKey.Privacy.serializer())
            subclass(CustomerNavKey.DeleteAccount::class, CustomerNavKey.DeleteAccount.serializer())
            subclass(CustomerNavKey.PasswordReset::class, CustomerNavKey.PasswordReset.serializer())
            subclass(CustomerNavKey.Password::class, CustomerNavKey.Password.serializer())
            subclass(CustomerNavKey.LegalIndex::class, CustomerNavKey.LegalIndex.serializer())
            subclass(CustomerNavKey.LegalDocument::class, CustomerNavKey.LegalDocument.serializer())
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
    CustomerNavKey.CategoryBrowse(parentKey = "dairy", title = "Dairy"),
    CustomerNavKey.Promotion("promo1"),
    CustomerNavKey.Cart,
    CustomerNavKey.Checkout,
    CustomerNavKey.Payment,
    CustomerNavKey.Receipt("o1"),
    CustomerNavKey.OrderDetail("o1"),
    CustomerNavKey.SignIn(),
    CustomerNavKey.SignInPassword("a@b.c"),
    CustomerNavKey.SignUp,
    CustomerNavKey.SignUpPassword("a@b.c"),
    CustomerNavKey.ProfileName,
    CustomerNavKey.VerifyOtp("a@b.c", OtpPurpose.SIGN_IN),
    CustomerNavKey.Recovery,
    CustomerNavKey.Saved,
    CustomerNavKey.AddressBook,
    CustomerNavKey.PaymentMethods,
    CustomerNavKey.Points,
    CustomerNavKey.Notifications,
    CustomerNavKey.Faqs,
    CustomerNavKey.HelpCenter,
    CustomerNavKey.CustomerService,
    CustomerNavKey.Feedback,
    CustomerNavKey.MyDetails,
    CustomerNavKey.Security,
    CustomerNavKey.Privacy,
    CustomerNavKey.DeleteAccount,
    CustomerNavKey.PasswordReset,
    CustomerNavKey.Password(setFirst = true),
    CustomerNavKey.LegalIndex,
    CustomerNavKey.LegalDocument("privacy-policy"),
)
