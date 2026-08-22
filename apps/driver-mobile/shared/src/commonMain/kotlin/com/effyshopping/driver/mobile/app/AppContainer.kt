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
import com.effyshopping.driver.mobile.features.collection.data.HttpCollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.CheckInHub
import com.effyshopping.driver.mobile.features.collection.domain.CollectStop
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRepository
import com.effyshopping.driver.mobile.features.collection.domain.GetCollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.GetShopStop
import com.effyshopping.driver.mobile.features.collection.domain.ReportCollectionIssue
import com.effyshopping.driver.mobile.features.delivery.data.HttpDeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteContactless
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithCode
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
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
    private val collection: CollectionRepository by lazy { HttpCollectionRepository(driverClient) }
    private val delivery: DeliveryRepository by lazy { HttpDeliveryRepository(driverClient) }

    val appearance: AppearancePreferenceStore by lazy { AppearancePreferenceStore(Settings()) }

    // ── domain (use cases) — the layer ViewModels + SessionManager depend on ─────────────────────────
    val requestSignInCode by lazy { RequestSignInCode(authDriver) }
    val confirmSignIn by lazy { ConfirmSignIn(authDriver) }
    val getDriverIdentity by lazy { GetDriverIdentity(driver) }
    val setDuty by lazy { SetDuty(driver) }
    val getToday by lazy { GetToday(today) }

    // collection (US1)
    val getCollectionRun by lazy { GetCollectionRun(collection) }
    val getShopStop by lazy { GetShopStop(collection) }
    val collectStop by lazy { CollectStop(collection) }
    val reportCollectionIssue by lazy { ReportCollectionIssue(collection) }
    val checkInHub by lazy { CheckInHub(collection) }

    // same-day delivery (US2)
    val getDeliveryRun by lazy { GetDeliveryRun(delivery) }
    val getDrop by lazy { GetDrop(delivery) }
    val advanceDrop by lazy { AdvanceDrop(delivery) }
    val completeWithCode by lazy { CompleteWithCode(delivery) }
    val completeContactless by lazy { CompleteContactless(delivery) }
    val failDrop by lazy { FailDrop(delivery) }

    // ── app services / presentation wiring ───────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getDriverIdentity, appScope) }

    /** A per-action idempotency id for driver writes (offline queue + retries, research R10). */
    @OptIn(ExperimentalUuidApi::class)
    fun newChangeId(): String = Uuid.random().toString()
}
