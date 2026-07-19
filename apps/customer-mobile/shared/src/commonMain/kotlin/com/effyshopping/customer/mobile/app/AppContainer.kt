package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.http.createHttpClient
import com.effyshopping.customer.mobile.core.nav.AppNavigator
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.features.cart.data.HttpCartRepository
import com.effyshopping.customer.mobile.features.checkout.data.HttpCheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.CreateAddress
import com.effyshopping.customer.mobile.features.checkout.domain.GetReceipt
import com.effyshopping.customer.mobile.features.checkout.domain.ListAddresses
import com.effyshopping.customer.mobile.features.checkout.domain.ListOrders
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.features.favorites.domain.ListFavorites
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.account.data.HttpCustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.ChangePassword
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.GetCustomer
import com.effyshopping.customer.mobile.features.account.domain.RequestPasswordChallenge
import com.effyshopping.customer.mobile.features.account.domain.SetPassword
import com.effyshopping.customer.mobile.features.account.domain.SignOutEverywhere
import com.effyshopping.customer.mobile.features.account.domain.UpdateName
import com.effyshopping.customer.mobile.features.catalog.data.HttpCatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.customer.mobile.features.catalog.domain.GetCategories
import com.effyshopping.customer.mobile.features.catalog.domain.GetHome
import com.effyshopping.customer.mobile.features.catalog.domain.GetProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.SearchProducts
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.favorites.data.HttpFavoritesRepository
import com.effyshopping.customer.mobile.features.favorites.domain.FavoritesRepository
import com.effyshopping.customer.mobile.features.favorites.domain.RemoveFavorite
import com.effyshopping.customer.mobile.features.favorites.domain.SaveFavorite
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
        createHttpClient(AppConfig.edgeApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    // Commerce → the hot path (core-api), the routing law (019). Public reads send no auth when a guest;
    // the two-token plugin adds headers only for a signed-in session (harmless on public routes).
    private val coreClient by lazy {
        createHttpClient(AppConfig.coreApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    private val customers: CustomerRepository by lazy { HttpCustomerRepository(edgeClient) }
    private val catalog: CatalogRepository by lazy { HttpCatalogRepository(coreClient) }
    private val favorites: FavoritesRepository by lazy { HttpFavoritesRepository(coreClient) }
    private val checkoutRepo by lazy { HttpCheckoutRepository(coreClient) }

    // The device-local guest cart — ONE instance so the badge and cart screen share state (019 US2).
    val guestCart: GuestCartStore = GuestCartStore()
    val cartRepository by lazy { HttpCartRepository(coreClient) }

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
    val searchProducts by lazy { SearchProducts(catalog) }

    // Favorites (019 US2).
    val saveFavorite by lazy { SaveFavorite(favorites) }
    val removeFavorite by lazy { RemoveFavorite(favorites) }
    val listFavorites by lazy { ListFavorites(favorites) }

    // Checkout (019 US3) — create intent → native PaymentSheet (paymentDriver) → confirm → receipt.
    val listAddresses by lazy { ListAddresses(checkoutRepo) }
    val createAddress by lazy { CreateAddress(checkoutRepo) }
    val payForOrder by lazy { PayForOrder(checkoutRepo, paymentDriver) }
    val getReceipt by lazy { GetReceipt(checkoutRepo) }
    val listOrders by lazy { ListOrders(checkoutRepo) }

    val getCustomer by lazy { GetCustomer(customers) }
    val updateName by lazy { UpdateName(customers) }
    val requestPasswordChallenge by lazy { RequestPasswordChallenge(customers) }
    val setPassword by lazy { SetPassword(customers) }
    val changePassword by lazy { ChangePassword(customers) }
    val signOutEverywhere by lazy { SignOutEverywhere(customers) }

    // ── app services / presentation wiring ──────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getCustomer, appScope) }

    val navigator: AppNavigator = AppNavigator()
}
