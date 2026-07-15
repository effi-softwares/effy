package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.http.createHttpClient
import com.effyshopping.customer.mobile.core.nav.AppNavigator
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.account.data.HttpCustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * The ONE hand-wired dependency container (constitution Principle VI — no DI framework). The whole
 * graph is greppable here. The platform's [AuthDriver] is injected in (Amplify Android on Android, a
 * Swift driver on iOS), because it is the one dependency that cannot live in common code (D5).
 *
 * `by lazy` for singletons; the graph is read top-to-bottom.
 */
class AppContainer(
    val authDriver: AuthDriver,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // One client per base URL (the routing law). Only edge has endpoints today; core is built so the
    // law is structural. Both carry the two-token protocol, sourced from the driver's current session.
    private val edgeClient by lazy {
        createHttpClient(AppConfig.edgeApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }

    val customers: CustomerRepository by lazy { HttpCustomerRepository(edgeClient) }

    val session: SessionManager by lazy { SessionManager(authDriver, customers, appScope) }

    val navigator: AppNavigator = AppNavigator()
}
