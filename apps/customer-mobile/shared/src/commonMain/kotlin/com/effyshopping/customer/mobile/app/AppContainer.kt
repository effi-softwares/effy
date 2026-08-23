package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.http.BearerToken
import com.effyshopping.customer.mobile.core.http.createHttpClient
import com.effyshopping.customer.mobile.core.observability.AnalyticsDriver
import com.effyshopping.customer.mobile.core.observability.CrashReporter
import com.effyshopping.customer.mobile.core.observability.NoOpAnalyticsDriver
import com.effyshopping.customer.mobile.core.observability.NoOpCrashReporter
import com.effyshopping.customer.mobile.core.platform.platformTag
import com.effyshopping.customer.mobile.core.push.DeviceRepository
import com.effyshopping.customer.mobile.core.push.HttpDeviceRepository
import com.effyshopping.customer.mobile.core.push.NoOpPushTokenProvider
import com.effyshopping.customer.mobile.core.push.PushTokenProvider
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.nav.CustomerNavigator
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.features.cart.data.HttpCartRepository
import com.effyshopping.customer.mobile.features.saved.data.HttpSavedRepository
import com.effyshopping.customer.mobile.features.feedback.data.HttpFeedbackRepository
import com.effyshopping.customer.mobile.features.feedback.domain.FeedbackRepository
import com.effyshopping.customer.mobile.features.feedback.domain.SubmitFeedback
import com.effyshopping.customer.mobile.features.feedback.presentation.FeedbackViewModel
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
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
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
import com.effyshopping.customer.mobile.features.account.domain.CloseAccount
import com.effyshopping.customer.mobile.features.account.domain.PreviewAccountClosure
import com.effyshopping.customer.mobile.features.account.domain.RequestClosureCode
import com.effyshopping.customer.mobile.features.account.domain.RestoreAccount
import com.effyshopping.customer.mobile.features.account.domain.UpdateProfile
import com.effyshopping.customer.mobile.features.account.data.HttpClosureRepository
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
import com.effyshopping.customer.mobile.features.catalog.domain.GetFacets
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
import com.effyshopping.customer.mobile.features.auth.domain.ResendSignInCode
import com.effyshopping.customer.mobile.features.auth.domain.ResendSignUpCode
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
import com.effyshopping.customer.mobile.core.storage.DevicePreferences
import com.effyshopping.customer.mobile.core.storage.clearGuestData

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
    // Observability + push (050) — injected per platform like the drivers above. Android provides the
    // Firebase/PostHog implementations; iOS defaults to no-ops until its Swift bridges land. NoOp
    // defaults keep every capability fail-open when unconfigured (FR-005/FR-027).
    val crashReporter: CrashReporter = NoOpCrashReporter,
    val analyticsDriver: AnalyticsDriver = NoOpAnalyticsDriver,
    val pushTokenProvider: PushTokenProvider = NoOpPushTokenProvider,
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
    /**
     * The device store, exposed so the guest landing can offer "clear data on this device"
     * (034 FR-046). One instance — `devicePreferences()` returns the platform store, and two callers
     * building their own would be two views of the same underlying prefs, which is only confusing.
     */
    val preferences: DevicePreferences by lazy { devicePreferences() }

    val cart: CartStore by lazy { CartStore(CartLocalStore(preferences), appScope) }

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
    val resendSignInCode by lazy { ResendSignInCode(authDriver) }
    val resendSignUpCode by lazy { ResendSignUpCode(authDriver) }
    val startPasswordReset by lazy { StartPasswordReset(authDriver) }
    val confirmPasswordReset by lazy { ConfirmPasswordReset(customers) }

    // Catalog (019 US1/US2) — the customer storefront reads on the hot path.
    val getHome by lazy { GetHome(catalog) }
    val getCategories by lazy { GetCategories(catalog) }
    val getProductDetail by lazy { GetProductDetail(catalog) }
    val getPromotion by lazy { GetPromotion(catalog) }
    val searchProducts by lazy { SearchProducts(catalog) }
    val getFacets by lazy { GetFacets(catalog) }
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
    private val savedLocal by lazy { SavedLocalStore(preferences) }
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

    // Feedback (046 US1) → the COLD path (edge-api/customer). The ViewModel reads `signedIn` at submit
    // time to choose the authed vs public route.
    private val feedbackRepository: FeedbackRepository by lazy { HttpFeedbackRepository(edgeClient) }
    val submitFeedback by lazy { SubmitFeedback(feedbackRepository) }
    fun feedbackViewModel(): FeedbackViewModel = FeedbackViewModel(submitFeedback, isSignedIn = signedIn)


    // Checkout (019 US3) — create intent → native PaymentSheet (paymentDriver) → confirm → receipt.
    // The address picker + add-new reuse the 022 Address Book use cases below (023 US1–US4) — the same
    // saved addresses the account page manages, on the cold path.
    // The client carries its OWN publishable key (019 R3) — not the backend echo on the intent.
    val payForOrder by lazy { PayForOrder(checkoutRepo, paymentDriver, AppConfig.stripePublishableKey) }
    val quoteDelivery by lazy { QuoteDelivery(checkoutRepo) } // 047: delivery quote at checkout
    val getReceipt by lazy { GetReceipt(checkoutRepo) }
    val listOrders by lazy { ListOrders(checkoutRepo) }

    // Address book (022) — view / add / edit / set-default / delete over the reused CRUD.
    val listSavedAddresses by lazy { ListSavedAddresses(addressBookRepo) }

    val addSavedAddress by lazy { AddAddress(addressBookRepo) }
    val updateSavedAddress by lazy { UpdateAddress(addressBookRepo) }
    val setDefaultAddress by lazy { SetDefault(addressBookRepo) }
    val deleteSavedAddress by lazy { DeleteAddress(addressBookRepo) }

    val getCustomer by lazy { GetCustomer(customers) }
    val updateProfile by lazy { UpdateProfile(customers) }

    // 034 — account closure. Same cold-path client; a separate repository because closure is a
    // different capability from the profile, not a fifth method on it.
    private val closures by lazy { HttpClosureRepository(edgeClient) }
    val previewAccountClosure by lazy { PreviewAccountClosure(closures) }
    val requestClosureCode by lazy { RequestClosureCode(closures) }
    val closeAccount by lazy { CloseAccount(closures) }
    val restoreAccount by lazy { RestoreAccount(closures) }
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
                // 050 — associate telemetry with the subject and register this device for push. The
                // record id is a stable, opaque, non-PII identifier (Principle VII). Best-effort:
                // failures must never break sign-in (FR-024/FR-027).
                (session.state as? SessionState.Authenticated)?.customer?.id?.let { id ->
                    runCatching { analyticsDriver.identify(id) }
                    runCatching { crashReporter.setSubject(id) }
                }
                runCatching { registerDeviceToken() }
            },
            // ⚠ SIGN-OUT CLEARS EVERYTHING THIS DEVICE HOLDS FOR THE SHOPPER (FR-031, 034).
            //
            // The in-memory stores are reset AND the persisted keys are removed. The store resets
            // alone write an empty envelope back to preferences, which is functionally clear but
            // leaves the keys behind; the offline CART QUEUE was not covered by either, so a change
            // made just before signing out could still have been drained afterwards — on a shared
            // device, into the next person's session.
            //
            // An account's cart and saved items must not stay readable, or replayable, once its owner
            // has signed out.
            onSignedOut = {
                cart.reset()
                savedStore.reset()
                preferences.clearGuestData()
                // 050 — clear telemetry identity and this device's push token so a shared device does
                // not deliver the previous user's notifications (FR-020). Best-effort.
                runCatching { analyticsDriver.reset() }
                runCatching { crashReporter.setSubject(null) }
                appScope.launch { runCatching { unregisterDeviceToken() } }
            },
        )
    }

    // ── observability & push (050) ──────────────────────────────────────────────────────────────
    private val devices: DeviceRepository by lazy { HttpDeviceRepository(edgeClient) }

    /**
     * Start crash reporting (always on — independent of analytics consent, clarification Q1) and, when
     * [analyticsConsented], product analytics. Called by each platform entry point after first frame.
     * All init runs off the main thread (performance, R11).
     */
    fun startObservability(analyticsConsented: Boolean) {
        appScope.launch { runCatching { crashReporter.init() } }
        if (analyticsConsented && AppConfig.telemetryEnabled) appScope.launch { runCatching { analyticsDriver.init() } }
        // Re-register the device whenever FCM rotates its token, but only for a signed-in session
        // (the endpoint is authenticated; a guest post would 401). Best-effort (FR-024/FR-027).
        pushTokenProvider.onTokenRefresh { token ->
            if (session.state is SessionState.Authenticated) {
                appScope.launch { runCatching { devices.register(token, platformTag()) } }
            }
        }
    }

    /**
     * Grant/withdraw analytics consent at runtime (customer opt-in, FR-023). Granting initialises the
     * SDK; withdrawing opts out. Crash reporting is unaffected.
     */
    fun setAnalyticsConsent(granted: Boolean) {
        if (granted && AppConfig.telemetryEnabled) appScope.launch { runCatching { analyticsDriver.init() } }
        else runCatching { analyticsDriver.optOut() }
    }

    /** Register this device's push token (if one/permission exists). Best-effort. */
    private suspend fun registerDeviceToken() {
        val token = pushTokenProvider.currentToken() ?: return
        devices.register(token, platformTag())
    }

    /** Remove this device's token on sign-out. Best-effort. */
    private suspend fun unregisterDeviceToken() {
        val token = pushTokenProvider.currentToken() ?: return
        runCatching { devices.unregister(token) }
        pushTokenProvider.deleteToken()
    }

    val navigator: CustomerNavigator = CustomerNavigator()
}
