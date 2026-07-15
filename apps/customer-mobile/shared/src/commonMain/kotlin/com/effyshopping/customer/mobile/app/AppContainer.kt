package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.auth.AuthDriver
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.http.createHttpClient
import com.effyshopping.customer.mobile.core.nav.AppNavigator
import com.effyshopping.customer.mobile.core.session.SessionManager
import com.effyshopping.customer.mobile.features.account.data.HttpCustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.ChangePassword
import com.effyshopping.customer.mobile.features.account.domain.CustomerRepository
import com.effyshopping.customer.mobile.features.account.domain.GetCustomer
import com.effyshopping.customer.mobile.features.account.domain.RequestPasswordChallenge
import com.effyshopping.customer.mobile.features.account.domain.SetPassword
import com.effyshopping.customer.mobile.features.account.domain.SignOutEverywhere
import com.effyshopping.customer.mobile.features.account.domain.UpdateName
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
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // ── data ──────────────────────────────────────────────────────────────────────────────────────
    // One client per base URL (the routing law). Only edge has endpoints today; core is built so the
    // law is structural. Both carry the two-token protocol, sourced from the driver's current session.
    private val edgeClient by lazy {
        createHttpClient(AppConfig.edgeApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    private val customers: CustomerRepository by lazy { HttpCustomerRepository(edgeClient) }

    // ── domain (use cases) — the layer the ViewModels and SessionManager depend on ──────────────────
    val registerWithPassword by lazy { RegisterWithPassword(authDriver) }
    val registerPasswordless by lazy { RegisterPasswordless(authDriver) }
    val confirmSignUp by lazy { ConfirmSignUp(authDriver) }
    val signInWithPassword by lazy { SignInWithPassword(authDriver) }
    val signInWithEmailOtp by lazy { SignInWithEmailOtp(authDriver) }
    val confirmOtp by lazy { ConfirmOtp(authDriver) }
    val startPasswordReset by lazy { StartPasswordReset(authDriver) }
    val confirmPasswordReset by lazy { ConfirmPasswordReset(customers) }

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
