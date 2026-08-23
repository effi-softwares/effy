package com.effyshopping.driver.mobile.app

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.core.http.createHttpClient
import com.effyshopping.driver.mobile.core.observability.AnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.CrashReporter
import com.effyshopping.driver.mobile.core.observability.NoOpAnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.NoOpCrashReporter
import com.effyshopping.driver.mobile.core.offline.OfflineQueue
import com.effyshopping.driver.mobile.core.offline.SyncCoordinator
import com.effyshopping.driver.mobile.core.platform.platformTag
import com.effyshopping.driver.mobile.core.push.DeviceRepository
import com.effyshopping.driver.mobile.core.push.HttpDeviceRepository
import com.effyshopping.driver.mobile.core.push.NoOpPushTokenProvider
import com.effyshopping.driver.mobile.core.push.PushTokenProvider
import com.effyshopping.driver.mobile.core.session.SessionManager
import com.effyshopping.driver.mobile.core.session.SessionState
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
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
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithMedia
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
import com.effyshopping.driver.mobile.features.history.data.HttpHistoryRepository
import com.effyshopping.driver.mobile.features.history.domain.GetHistory
import com.effyshopping.driver.mobile.features.history.domain.GetHistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryRepository
import com.effyshopping.driver.mobile.features.activity.data.HttpActivityRepository
import com.effyshopping.driver.mobile.features.activity.domain.ActivityRepository
import com.effyshopping.driver.mobile.features.activity.domain.GetActivity
import com.effyshopping.driver.mobile.features.activity.domain.MarkActivityRead
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
    // 050 — observability + push, injected per platform (Android real, iOS NoOp until Swift bridges).
    val crashReporter: CrashReporter = NoOpCrashReporter,
    val analyticsDriver: AnalyticsDriver = NoOpAnalyticsDriver,
    val pushTokenProvider: PushTokenProvider = NoOpPushTokenProvider,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
) {
    // ── data ──────────────────────────────────────────────────────────────────────────────────────
    private val driverClient by lazy {
        createHttpClient(AppConfig.driverApiBaseUrl, sessionProvider = { authDriver.currentSession() }, debug = debugLogging)
    }
    // Offline write queue + drain coordinator (US6, FR-039/040). Persisted; survives process death.
    val offlineQueue: OfflineQueue by lazy { OfflineQueue(Settings()) }
    val syncCoordinator: SyncCoordinator by lazy { SyncCoordinator(driverClient, offlineQueue) }

    private val driver: DriverRepository by lazy { HttpDriverRepository(driverClient) }
    private val today: TodayRepository by lazy { HttpTodayRepository(driverClient) }
    private val collection: CollectionRepository by lazy { HttpCollectionRepository(driverClient, offlineQueue) }
    private val delivery: DeliveryRepository by lazy { HttpDeliveryRepository(driverClient, offlineQueue) }
    private val historyRepo: HistoryRepository by lazy { HttpHistoryRepository(driverClient) }
    private val activityRepo: ActivityRepository by lazy { HttpActivityRepository(driverClient) }

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
    val completeWithMedia by lazy { CompleteWithMedia(delivery) }
    val failDrop by lazy { FailDrop(delivery) }

    // history (US5)
    val getHistory by lazy { GetHistory(historyRepo) }
    val getHistoryDetail by lazy { GetHistoryDetail(historyRepo) }

    // activity feed (US6)
    val getActivity by lazy { GetActivity(activityRepo) }
    val markActivityRead by lazy { MarkActivityRead(activityRepo) }

    // ── app services / presentation wiring ───────────────────────────────────────────────────────────
    val session: SessionManager by lazy { SessionManager(authDriver, getDriverIdentity, appScope) }

    /** A per-action idempotency id for driver writes (offline queue + retries, research R10). */
    @OptIn(ExperimentalUuidApi::class)
    fun newChangeId(): String = Uuid.random().toString()

    // Permission priming shown once (FR-004). Persisted so it does not re-appear every launch.
    private val prefs by lazy { Settings() }
    fun hasPrimedPermissions(): Boolean = prefs.getBoolean("driver.permissions.primed", false)
    fun markPermissionsPrimed() = prefs.putBoolean("driver.permissions.primed", true)

    // ── observability & push (050) ──────────────────────────────────────────────────────────────
    private val devices: DeviceRepository by lazy { HttpDeviceRepository(driverClient) }

    /**
     * Start crash reporting (always on — independent of analytics consent, Q1) and, when
     * [analyticsConsented], product analytics. Observes the session: on sign-in it identifies the
     * driver (by record id — non-PII) + registers this device; on sign-out it resets + unregisters
     * (shared-device safety, FR-020). Called by the Android entry point; off the main thread; best-effort.
     */
    fun startObservability(analyticsConsented: Boolean) {
        appScope.launch { runCatching { crashReporter.init() } }
        if (analyticsConsented && AppConfig.telemetryEnabled) appScope.launch { runCatching { analyticsDriver.init() } }
        pushTokenProvider.onTokenRefresh { token ->
            if (session.state.value is SessionState.SignedIn) {
                appScope.launch { runCatching { devices.register(token, platformTag()) } }
            }
        }
        appScope.launch {
            var lastSubject: String? = null
            session.state.collectLatest { state ->
                when (state) {
                    is SessionState.SignedIn -> {
                        val sub = state.driver.id
                        if (sub != lastSubject) {
                            lastSubject = sub
                            runCatching { analyticsDriver.identify(sub) }
                            runCatching { crashReporter.setSubject(sub) }
                            pushTokenProvider.currentToken()?.let { token ->
                                runCatching { devices.register(token, platformTag()) }
                            }
                        }
                    }
                    SessionState.SignedOut, SessionState.Refused -> {
                        if (lastSubject != null) {
                            lastSubject = null
                            runCatching { analyticsDriver.reset() }
                            runCatching { crashReporter.setSubject(null) }
                            pushTokenProvider.currentToken()?.let { token ->
                                runCatching { devices.unregister(token) }
                            }
                            runCatching { pushTokenProvider.deleteToken() }
                        }
                    }
                    SessionState.Restoring -> Unit
                }
            }
        }
    }

    /** Grant/withdraw analytics consent at runtime; crash reporting is unaffected (FR-023). */
    fun setAnalyticsConsent(granted: Boolean) {
        if (granted && AppConfig.telemetryEnabled) appScope.launch { runCatching { analyticsDriver.init() } }
        else runCatching { analyticsDriver.optOut() }
    }
}
