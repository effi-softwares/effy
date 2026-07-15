package com.effyshopping.shop.mobile.app

import com.effyshopping.shop.mobile.core.auth.AuthDriver
import com.effyshopping.shop.mobile.core.config.AppConfig
import com.effyshopping.shop.mobile.core.http.createHttpClient
import com.effyshopping.shop.mobile.core.nav.AppNavigator
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.shop.mobile.features.auth.domain.RequestSignInCode
import com.effyshopping.shop.mobile.features.shop.data.HttpShopRepository
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.GetOperator
import com.effyshopping.shop.mobile.features.shop.domain.ShopRepository
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

    // ── domain (use cases) — the layer the ViewModels and SessionManager depend on ──────────────────
    val requestSignInCode by lazy { RequestSignInCode(authDriver) }
    val confirmSignIn by lazy { ConfirmSignIn(authDriver) }
    val getOperator by lazy { GetOperator(shop) }
    val checkManagerAccess by lazy { CheckManagerAccess(shop) }

    // ── app services / presentation wiring ──────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getOperator, appScope) }

    val navigator: AppNavigator = AppNavigator()
}
