package com.effyshopping.shop.mobile.app

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.config.AppConfig
import com.effyshopping.shop.mobile.core.draft.DraftStore
import com.effyshopping.shop.mobile.core.draft.SettingsDraftStore
import com.effyshopping.shop.mobile.core.http.createHttpClient
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.core.theme.AppearancePreferenceStore
import com.effyshopping.shop.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.shop.mobile.features.auth.domain.RequestSignInCode
import com.effyshopping.shop.mobile.features.catalog.data.HttpCatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.AssignSections
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.ChangeProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.CreateProduct
import com.effyshopping.shop.mobile.features.catalog.domain.DeleteProduct
import com.effyshopping.shop.mobile.features.catalog.domain.GetCatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ListShopSections
import com.effyshopping.shop.mobile.features.catalog.domain.UpdateProduct
import com.effyshopping.shop.mobile.features.home.data.DummyHomeDashboardRepository
import com.effyshopping.shop.mobile.features.orders.data.HttpOrderRepository
import com.effyshopping.shop.mobile.features.orders.domain.AdvanceFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.GetFulfillment
import com.effyshopping.shop.mobile.features.orders.domain.ListFulfillments
import com.effyshopping.shop.mobile.features.orders.domain.OrderRepository
import com.effyshopping.shop.mobile.features.orders.domain.RecordItemProgress
import com.effyshopping.shop.mobile.features.home.domain.GetHomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboardRepository
import com.effyshopping.shop.mobile.features.shop.data.HttpShopRepository
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.GetOperator
import com.effyshopping.shop.mobile.features.shop.domain.ShopRepository
import com.russhwolf.settings.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * The ONE hand-wired dependency container (Principle VI — no DI framework); the whole graph is greppable
 * here, read top-to-bottom. The platform's [AuthDriver] is injected in (Amplify Android on Android, a
 * Swift driver on iOS). One client, for the shop API only (cross-pool isolation, FR-029).
 *
 * The graph is layered: data (repository) → domain (use cases) → presentation (ViewModels wire to the
 * use cases). The repository is **private** — nothing above the domain layer reaches it directly.
 */
class AppContainer(
    val authDriver: AuthDriver,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // ── data ──────────────────────────────────────────────────────────────────────────────────────
    private val shopClient by lazy {
        createHttpClient(AppConfig.shopApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    private val shop: ShopRepository by lazy { HttpShopRepository(shopClient) }
    private val homeDashboard: HomeDashboardRepository by lazy { DummyHomeDashboardRepository() }
    // The catalog repository reuses the SAME shop client (single bearer, cross-pool isolation) — private,
    // reached only through the use cases below (Principle VI).
    private val catalog: CatalogRepository by lazy { HttpCatalogRepository(shopClient) }
    // Order fulfillment (020) reuses the SAME shop client — the shop is resolved server-side from the
    // bearer, so nothing here can name a shop even by accident (FR-019).
    private val orders: OrderRepository by lazy { HttpOrderRepository(shopClient) }
    // Device-local create draft (FR-012). `Settings()` is the no-arg factory (NSUserDefaults / SharedPrefs);
    // the draft is device-only, never synced.
    val draftStore: DraftStore by lazy { SettingsDraftStore(Settings()) }
    val appearance: AppearancePreferenceStore by lazy { AppearancePreferenceStore(Settings()) }

    // ── domain (use cases) — the layer the ViewModels and SessionManager depend on ──────────────────
    val requestSignInCode by lazy { RequestSignInCode(authDriver) }
    val confirmSignIn by lazy { ConfirmSignIn(authDriver) }
    val getOperator by lazy { GetOperator(shop) }
    val checkManagerAccess by lazy { CheckManagerAccess(shop) }
    val getHomeDashboard by lazy { GetHomeDashboard(homeDashboard) }

    // catalog (016 US2–US5)
    val getCatalogSchema by lazy { GetCatalogSchema(catalog) }
    val listProducts by lazy { ListProducts(catalog) }
    val getProduct by lazy { GetProduct(catalog) }
    val createProduct by lazy { CreateProduct(catalog) }
    val updateProduct by lazy { UpdateProduct(catalog) }
    val changeProductStatus by lazy { ChangeProductStatus(catalog) }
    val deleteProduct by lazy { DeleteProduct(catalog) }
    val listShopSections by lazy { ListShopSections(catalog) }
    val assignSections by lazy { AssignSections(catalog) }

    // order fulfillment (020 US1–US4)
    val listFulfillments by lazy { ListFulfillments(orders) }
    val getFulfillment by lazy { GetFulfillment(orders) }
    val advanceFulfillment by lazy { AdvanceFulfillment(orders) }
    val recordItemProgress by lazy { RecordItemProgress(orders) }

    // ── app services / presentation wiring ──────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getOperator, appScope) }
    // Navigation state (per-tab back stacks) lives in the composition via `rememberTabBackStacks` (015),
    // not here — so it is saveable across configuration change and process death.
}
