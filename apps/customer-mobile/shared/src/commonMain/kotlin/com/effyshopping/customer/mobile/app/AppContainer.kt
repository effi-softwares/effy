package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.http.BearerToken
import com.effyshopping.customer.mobile.core.http.createHttpClient
import com.effyshopping.customer.mobile.core.nav.CustomerNavigator
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.features.cart.data.HttpCartRepository
import com.effyshopping.customer.mobile.features.saved.data.HttpSavedRepository
import com.effyshopping.customer.mobile.core.storage.nowIsoTimestamp
import com.effyshopping.customer.mobile.features.saved.data.SavedLocalStore
import com.effyshopping.customer.mobile.features.saved.domain.GuestPersistence
import com.effyshopping.customer.mobile.features.saved.domain.AddAllSavedToCart
import com.effyshopping.customer.mobile.features.saved.domain.MergeSavedOnSignIn
import com.effyshopping.customer.mobile.features.saved.domain.SavedGuestEntry
import com.effyshopping.customer.mobile.features.saved.domain.ListSaved
import com.effyshopping.customer.mobile.features.saved.domain.LoadSavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.RemoveSaved
import com.effyshopping.customer.mobile.features.saved.domain.SavedRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedStore
import com.effyshopping.customer.mobile.features.saved.domain.ToggleSaved
import com.effyshopping.customer.mobile.features.saved.domain.UndoRemoveSaved
import com.effyshopping.customer.mobile.features.checkout.data.HttpCheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ListOrders
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.storage.devicePreferences
import com.effyshopping.customer.mobile.features.account.data.HttpCustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.ChangePassword
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.GetCustomer
import com.effyshopping.customer.mobile.features.account.domain.RequestPasswordChallenge
import com.effyshopping.customer.mobile.features.account.domain.SetPassword
import com.effyshopping.customer.mobile.features.account.domain.SignOutEverywhere
import com.effyshopping.customer.mobile.features.account.domain.UpdateName
import com.effyshopping.customer.mobile.features.addresses.data.HttpAddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.DeleteAddress
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses as ListSavedAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SetDefault
import com.effyshopping.customer.mobile.features.addresses.domain.UpdateAddress
import com.effyshopping.customer.mobile.features.catalog.data.HttpCatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.GetCategories
import com.effyshopping.customer.mobile.features.catalog.domain.GetHome
import com.effyshopping.customer.mobile.features.catalog.domain.GetProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.GetPromotion
import com.effyshopping.customer.mobile.features.catalog.domain.SearchProducts
import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import com.effyshopping.customer.mobile.features.cart.domain.AddToCart
import com.effyshopping.customer.mobile.features.cart.domain.ApplyPromoCode
import com.effyshopping.customer.mobile.features.cart.domain.RemovePromoCode
import com.effyshopping.customer.mobile.features.cart.domain.CartRepository
import com.effyshopping.customer.mobile.features.cart.domain.ClearCart
import com.effyshopping.customer.mobile.features.cart.domain.DeleteSaved
import com.effyshopping.customer.mobile.features.cart.domain.ReorderPastOrder
import com.effyshopping.customer.mobile.features.cart.domain.RestoreSaved
import com.effyshopping.customer.mobile.features.cart.domain.SetAside
import com.effyshopping.customer.mobile.features.cart.domain.MergeCartOnSignIn
import com.effyshopping.customer.mobile.features.cart.domain.RemoveFromCart
import com.effyshopping.customer.mobile.features.cart.domain.SetCartQuantity
import com.effyshopping.customer.mobile.features.cart.domain.SyncCart
import com.effyshopping.customer.mobile.features.cart.domain.CartStore
import com.effyshopping.customer.mobile.features.cart.domain.CartSyncCoordinator
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmOtp
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmPasswordReset
import com.effyshopping.customer.mobile.features.auth.domain.ConfirmSignUp
import com.effyshopping.customer.mobile.features.auth.domain.RegisterPasswordless
import com.effyshopping.customer.mobile.features.auth.domain.RegisterWithPassword
import com.effyshopping.customer.mobile.features.auth.domain.SignInWithEmailOtp
import com.effyshopping.customer.mobile.features.auth.domain.SignInWithPassword
import com.effyshopping.customer.mobile.features.auth.domain.StartPasswordReset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * The ONE hand-wired dependency container (constitution Principle VI — no DI framework). The whole
 * graph is greppable here, read top-to-bottom. The platform's [AuthDriver] is injected in (Amplify
 * Android on Android, a Swift driver on iOS), because it is the one dependency that cannot live in
 * common code (D5).
 *
 * The graph is layered: data (repository) → domain (use cases) → presentation (ViewModels wire to the
 * use cases). The repository is **private** — nothing above the domain layer reaches it directly.
 */
class AppContainer(
    val authDriver: AuthDriver,
    // The payment capability (019 US3) — injected per platform, like [authDriver]: Android provides the
    // Stripe PaymentSheet driver, iOS a Swift bridge over StripePaymentSheet.
    val paymentDriver: PaymentDriver,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // ── data ──────────────────────────────────────────────────────────────────────────────────────
    // One client per base URL (the routing law). Only edge has endpoints today; core is built so the
    // law is structural. Both carry the two-token protocol, sourced from the driver's current session.
    private val edgeClient by lazy {
        createHttpClient(
            AppConfig.edgeApiBaseUrl,
            sessionProvider = { authDriver.currentSession() },
            bearer = BearerToken.Edge,
            debug = debugLogging,
        )
    }
    // Commerce → the hot path (core-api), the routing law (019). Public reads send no auth when a guest;
    // the two-token plugin adds headers only for a signed-in session (harmless on public routes).
    private val coreClient by lazy {
        createHttpClient(
            AppConfig.coreApiBaseUrl,
            sessionProvider = { authDriver.currentSession() },
            // ⚠ The hot path verifies an ACCESS token. Sending the ID token here 401s every request —
            // which is exactly what happened from 019 until 027 (research R12).
            bearer = BearerToken.Core,
            debug = debugLogging,
        )
    }
    private val customers: CustomerRepository by lazy { HttpCustomerRepository(edgeClient) }
    private val catalog: CatalogRepository by lazy { HttpCatalogRepository(coreClient) }
    private val checkoutRepo by lazy { HttpCheckoutRepository(coreClient) }
    // The address book (022) — customer profile management → the COLD path (edge-api/customer,
    // `/customer/v1/addresses`), per the routing law (011 FR-028). A full-CRUD repo, distinct from
    // checkout's slim pick-an-address `AddressRepository` (which stays on the hot path).
    private val addressBookRepo: AddressRepository by lazy { HttpAddressRepository(edgeClient) }

    // The cart mirror — ONE instance so the badge, the cart screen and checkout all read the same state.
    //
    // ⚠ 027: this replaced 019's in-memory `GuestCartStore`. It is hydrated from `DevicePreferences`
    // before the first frame, so a force-quit no longer loses the shopper's cart (FR-001), and it is
    // reconciled against the platform by [cartSync] rather than being the authority itself (FR-006).
    val cart: CartStore by lazy { CartStore(CartLocalStore(devicePreferences()), appScope) }

    private val cartRepository: CartRepository by lazy { HttpCartRepository(coreClient) }
    private val savedHttp: HttpSavedRepository by lazy { HttpSavedRepository(coreClient) }
    private val savedRepository: SavedRepository get() = savedHttp

    /**
     * Keeps the mirror and the platform in agreement: sends what the shopper does, and re-prices what they
     * come back to. `isSignedIn` is a lambda ON PURPOSE — it is read at call time, so a sign-in or sign-out
     * that happens between two taps is respected without anything having to re-wire itself.
     */
    val cartSync: CartSyncCoordinator by lazy {
        CartSyncCoordinator(
            repo = cartRepository,
            store = cart,
            isSignedIn = { session.state.value is SessionState.Authenticated },
            scope = appScope,
        )
    }

    // ── domain (use cases) — the layer the ViewModels and SessionManager depend on ──────────────────
    val registerWithPassword by lazy { RegisterWithPassword(authDriver) }
    val registerPasswordless by lazy { RegisterPasswordless(authDriver) }
    val confirmSignUp by lazy { ConfirmSignUp(authDriver) }
    val signInWithPassword by lazy { SignInWithPassword(authDriver) }
    val signInWithEmailOtp by lazy { SignInWithEmailOtp(authDriver) }
    val confirmOtp by lazy { ConfirmOtp(authDriver) }
    val startPasswordReset by lazy { StartPasswordReset(authDriver) }
    val confirmPasswordReset by lazy { ConfirmPasswordReset(customers) }

    // Catalog (019 US1/US2) — the customer storefront reads on the hot path.
    val getHome by lazy { GetHome(catalog) }
    val getCategories by lazy { GetCategories(catalog) }
    val getProductDetail by lazy { GetProductDetail(catalog) }
    val getPromotion by lazy { GetPromotion(catalog) }
    val searchProducts by lazy { SearchProducts(catalog) }
    // Cart (027). Every mutation is: apply to the mirror, then submit to the coordinator — in that order,
    // so a tap never waits on the network.
    val addToCart by lazy { AddToCart(cart, cartSync) }
    val setCartQuantity by lazy { SetCartQuantity(cart, cartSync) }
    val removeFromCart by lazy { RemoveFromCart(cart, cartSync) }
    val clearCart by lazy { ClearCart(cart, cartSync) }
    private val signedIn: () -> Boolean = { session.state.value is SessionState.Authenticated }
    val setAside by lazy { SetAside(cart, cartRepository, signedIn) }
    val restoreSaved by lazy { RestoreSaved(cart, cartRepository, signedIn) }
    val deleteSaved by lazy { DeleteSaved(cart, cartRepository, signedIn) }
    val reorderPastOrder by lazy { ReorderPastOrder(cart, cartRepository, signedIn) }
    val applyPromoCode by lazy { ApplyPromoCode(cart, cartRepository, signedIn) }
    val removePromoCode by lazy { RemovePromoCode(cart, cartRepository, signedIn) }
    val syncCart by lazy { SyncCart(cartSync) }
    private val mergeCartOnSignIn by lazy { MergeCartOnSignIn(cart, cartRepository) }

    // Saved items (033) — the watchlist. `savedStore` is the ONE mirror every save control on every
    // screen reads, which is what stops two controls for the same product from disagreeing (FR-013)
    // and what makes the heart tell the truth on first render (FR-019).
    // ⚠ REAL persistence, not GuestPersistence.None. 030 shipped a whole feature whose store had this
    // exact seam and got the no-op — nothing was ever written and three comments then explained the
    // absence as "this app has no key-value persistence", which had been false since 026.
    private val savedLocal by lazy { SavedLocalStore(devicePreferences()) }
    val savedStore: SavedStore by lazy {
        SavedStore(object : GuestPersistence {
            override fun load(): List<SavedGuestEntry> = savedLocal.load()
            override fun save(items: List<SavedGuestEntry>) = savedLocal.save(items)
            override fun clear() = savedLocal.clear()
        })
    }
    val toggleSaved by lazy {
        ToggleSaved(savedRepository, savedStore, signedIn) { nowIsoTimestamp() }
    }
    private val mergeSavedOnSignIn by lazy { MergeSavedOnSignIn(savedHttp, savedStore) }
    val addAllSavedToCart by lazy { AddAllSavedToCart(savedHttp) }
    val loadSavedMembership by lazy { LoadSavedMembership(savedRepository, savedStore) }
    val listSaved by lazy { ListSaved(savedRepository) }
    val removeSaved by lazy { RemoveSaved(savedRepository, savedStore) }
    val undoRemoveSaved by lazy { UndoRemoveSaved(savedRepository, savedStore) }


    // Checkout (019 US3) — create intent → native PaymentSheet (paymentDriver) → confirm → receipt.
    // The address picker + add-new reuse the 022 Address Book use cases below (023 US1–US4) — the same
    // saved addresses the account page manages, on the cold path.
    // The client carries its OWN publishable key (019 R3) — not the backend echo on the intent.
    val payForOrder by lazy { PayForOrder(checkoutRepo, paymentDriver, AppConfig.stripePublishableKey) }
    val getReceipt by lazy { GetReceipt(checkoutRepo) }
    val listOrders by lazy { ListOrders(checkoutRepo) }

    // Address book (022) — view / add / edit / set-default / delete over the reused CRUD.
    val listSavedAddresses by lazy { ListSavedAddresses(addressBookRepo) }

    val addSavedAddress by lazy { AddAddress(addressBookRepo) }
    val updateSavedAddress by lazy { UpdateAddress(addressBookRepo) }
    val setDefaultAddress by lazy { SetDefault(addressBookRepo) }
    val deleteSavedAddress by lazy { DeleteAddress(addressBookRepo) }

    val getCustomer by lazy { GetCustomer(customers) }
    val updateName by lazy { UpdateName(customers) }
    val requestPasswordChallenge by lazy { RequestPasswordChallenge(customers) }
    val setPassword by lazy { SetPassword(customers) }
    val changePassword by lazy { ChangePassword(customers) }
    val signOutEverywhere by lazy { SignOutEverywhere(customers) }

    // ── app services / presentation wiring ──────────────────────────────────────────────────────────
    /**
     * ⚠ The two cart hooks are what make a cart cross devices (027 US2/US3).
     *
     * On SIGN-IN the device's lines are merged into the account cart and the result adopted — union with
     * maximum quantity, so nothing is lost from either side and a repeated sign-in changes nothing. Without
     * this hook a shopper signing in on a second phone correctly sees an empty cart, because their device
     * cart was never sent anywhere.
     *
     * On SIGN-OUT the mirror resets to an empty guest cart. The ACCOUNT cart is untouched — it is a row in
     * the platform, and signing back in restores it (FR-013).
     */
    val session: SessionManager by lazy {
        SessionManager(
            authDriver = authDriver,
            getCustomer = getCustomer,
            scope = appScope,
            // ⚠ BOTH merges run on sign-in. The saved merge is idempotent, so it is safe on every
            // sign-in including a repeat on a device that already merged (FR-029).
            onAuthenticated = {
                mergeCartOnSignIn()
                runCatching { mergeSavedOnSignIn() }
            },
            // ⚠ Sign-out clears BOTH — an account's saved items must not stay readable on a shared
            // device (FR-031).
            onSignedOut = {
                cart.reset()
                savedStore.reset()
            },
        )
    }

    val navigator: CustomerNavigator = CustomerNavigator()
}
