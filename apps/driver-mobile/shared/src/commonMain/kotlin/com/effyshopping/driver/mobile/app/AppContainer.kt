package com.effyshopping.driver.mobile.app

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.core.http.createHttpClient
import com.effyshopping.driver.mobile.core.session.SessionManager
import com.effyshopping.driver.mobile.core.theme.AppearancePreferenceStore
import com.effyshopping.driver.mobile.features.auth.domain.ConfirmSignIn
import com.effyshopping.driver.mobile.features.auth.domain.RequestSignInCode
import com.effyshopping.driver.mobile.features.driver.data.HttpDriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.DriverRepository
import com.effyshopping.driver.mobile.features.driver.domain.GetDriverIdentity
import com.effyshopping.driver.mobile.features.driver.domain.SetDuty
import com.effyshopping.driver.mobile.features.today.data.HttpTodayRepository
import com.effyshopping.driver.mobile.features.today.domain.GetToday
import com.effyshopping.driver.mobile.features.today.domain.TodayRepository
import com.russhwolf.settings.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * The ONE hand-wired dependency container (Principle VI — no DI framework); the whole graph is greppable
 * here, read top to bottom. The platform's [AuthDriver] is injected in (Amplify Android on Android, a
 * Swift driver on iOS). ONE client, for the driver API only (cross-pool isolation, Principle IV).
 *
 * Layered: data (repository, private) → domain (use cases) → presentation (ViewModels wire to use cases).
 */
class AppContainer(
    val authDriver: AuthDriver,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // ── data ──────────────────────────────────────────────────────────────────────────────────────
    private val driverClient by lazy {
        createHttpClient(AppConfig.driverApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    private val driver: DriverRepository by lazy { HttpDriverRepository(driverClient) }
    private val today: TodayRepository by lazy { HttpTodayRepository(driverClient) }

    val appearance: AppearancePreferenceStore by lazy { AppearancePreferenceStore(Settings()) }

    // ── domain (use cases) — the layer ViewModels + SessionManager depend on ─────────────────────────
    val requestSignInCode by lazy { RequestSignInCode(authDriver) }
    val confirmSignIn by lazy { ConfirmSignIn(authDriver) }
    val getDriverIdentity by lazy { GetDriverIdentity(driver) }
    val setDuty by lazy { SetDuty(driver) }
    val getToday by lazy { GetToday(today) }

    // ── app services / presentation wiring ───────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getDriverIdentity, appScope) }

    /** A per-action idempotency id for driver writes (offline queue + retries, research R10). */
    @OptIn(ExperimentalUuidApi::class)
    fun newChangeId(): String = Uuid.random().toString()
}
