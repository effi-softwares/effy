package com.effyshopping.driver.mobile.app

import com.effyshopping.driver.mobile.core.auth.AuthDriver
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.mobile.kit.live.KtorLiveTransport
import com.effyshopping.mobile.kit.live.LiveClient
import com.effyshopping.mobile.kit.live.LiveKind
import com.effyshopping.driver.mobile.core.live.SignallingCollectionRepository
import com.effyshopping.driver.mobile.core.live.SignallingDeliveryRepository
import com.effyshopping.driver.mobile.core.live.SignallingDriverRepository
import com.effyshopping.driver.mobile.core.live.WorkChanges
import com.effyshopping.mobile.kit.live.fetchLiveDescriptor
import com.effyshopping.driver.mobile.core.http.createHttpClient
import com.effyshopping.driver.mobile.core.http.liveEngine
import com.effyshopping.driver.mobile.core.observability.AnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.CrashReporter
import com.effyshopping.driver.mobile.core.observability.NoOpAnalyticsDriver
import com.effyshopping.driver.mobile.core.observability.NoOpCrashReporter
import com.effyshopping.driver.mobile.core.offline.LastCopies
import com.effyshopping.driver.mobile.core.push.OpenedNotification
import com.effyshopping.driver.mobile.core.offline.OfflineQueue
import com.effyshopping.driver.mobile.core.offline.ProofFiles
import com.effyshopping.driver.mobile.core.offline.ProofOutbox
import com.effyshopping.driver.mobile.core.offline.SyncCoordinator
import com.effyshopping.driver.mobile.core.platform.Connectivity
import com.effyshopping.driver.mobile.core.platform.NoConnectivity
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
import com.effyshopping.driver.mobile.features.delivery.data.HttpDeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithMedia
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnToHub
import com.effyshopping.driver.mobile.features.delivery.domain.LoadVan
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
import com.effyshopping.driver.mobile.features.history.data.HttpHistoryRepository
import com.effyshopping.driver.mobile.features.history.domain.GetHistory
import com.effyshopping.driver.mobile.features.history.domain.GetHistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryRepository
import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis
import com.effyshopping.driver.mobile.features.collection.data.SettingsStopDrafts
import com.effyshopping.driver.mobile.features.collection.domain.StopDrafts
import kotlinx.coroutines.flow.MutableStateFlow
import com.russhwolf.settings.Settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * The one hand-wired dependency container (Principle VI - no DI framework); the whole graph is greppable
 * here, read top to bottom. The platform's [AuthDriver] is injected in (Amplify Android on Android, a
 * Swift driver on iOS). One client, for the driver API only (cross-pool isolation, Principle IV).
 *
 * Layered: data (repository, private) → domain (use cases) → presentation (ViewModels wire to use cases).
 */
class AppContainer(
    val authDriver: AuthDriver,
    // Observability + push, injected per platform (Android real, iOS NoOp until Swift bridges).
    val crashReporter: CrashReporter = NoOpCrashReporter,
    val analyticsDriver: AnalyticsDriver = NoOpAnalyticsDriver,
    val pushTokenProvider: PushTokenProvider = NoOpPushTokenProvider,
    private val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    debugLogging: Boolean = false,
    /**
     * The version the installed app reports about itself, read by each platform's entry point. Help
     * showed a version typed into the source ("0.1.0 (dev)") that no build had ever carried.
     */
    val appVersion: String? = null,
    /**
     * Where proof photos taken with no signal wait to be sent (backlog B3) - a directory the app owns,
     * per platform, so they survive the app being killed.
     */
    private val proofFiles: ProofFiles,
    /** Backlog C6 - the connection coming back sends what is waiting, without the driver doing anything. */
    val connectivity: Connectivity = NoConnectivity,
) {
    // data
    private val driverClient by lazy {
        createHttpClient(
            AppConfig.driverApiBaseUrl,
            sessionProvider = { authDriver.currentSession() },
            debug = debugLogging,
            // A 401 or 403 mid-shift re-checks the session, so a driver disabled during a shift is
            // taken to the refusal screen on their next request (backlog C4).
            onRejected = { session.onRequestRejected() },
        )
    }

    /**
     * The live-update channel: tells the app when this driver's work is assigned, reassigned, withdrawn or
     * re-ordered, so Today and an open round re-read. Independent of push. Held only while foregrounded
     * and signed in (`LiveLifecycle` in [App]).
     */
    val live: LiveClient by lazy {
        LiveClient(
            scope = appScope,
            loadDescriptor = { fetchLiveDescriptor(driverClient, "driver/v1/live") },
            token = { authDriver.currentSession()?.accessToken },
            transport = KtorLiveTransport(liveEngine()),
        )
    }
    /**
     * Rev 2 - the one "work changed, read now" stream: the live channel's word, plus each write of
     * the driver's once the platform has it (the `Signalling…Repository` wrappers below and the sync
     * coordinator). Every ViewModel that shows work collects [WorkChanges.changes].
     */
    val work: WorkChanges by lazy { WorkChanges(live.changes(LiveKind.WORK)) }

    // Offline write queue + drain coordinator. Persisted; survives process death.
    val offlineQueue: OfflineQueue by lazy { OfflineQueue(Settings()) }
    /** Proof captured with no signal (backlog B3): the images live in [proofFiles], the list in settings. */
    val proofOutbox: ProofOutbox by lazy { ProofOutbox(Settings(), proofFiles) }
    val syncCoordinator: SyncCoordinator by lazy {
        SyncCoordinator(
            driverClient, offlineQueue, proofOutbox,
            sendProofs = { httpDelivery.flushProofs() },
            onDelivered = { work.changed() },
        )
    }

    /** The driver record and Today, kept so the app opens with no signal (backlog C3). */
    private val lastCopies by lazy { LastCopies(Settings()) }
    // The three repositories that write are wrapped so each write that lands says so (092 rev 2).
    private val driver: DriverRepository by lazy { SignallingDriverRepository(HttpDriverRepository(driverClient, lastCopies), work) }
    private val today: TodayRepository by lazy { HttpTodayRepository(driverClient, lastCopies) }
    private val collection: CollectionRepository by lazy { SignallingCollectionRepository(HttpCollectionRepository(driverClient, offlineQueue), work) }
    private val delivery: DeliveryRepository by lazy { SignallingDeliveryRepository(httpDelivery, work) }
    private val httpDelivery: HttpDeliveryRepository by lazy {
        HttpDeliveryRepository(
            driverClient,
            offlineQueue,
            proofOutbox,
            // Only the phone can see this: the image goes straight to storage, so when the upload
            // fails the platform receives nothing at all.
            onProofUploadFailed = { reason -> analyticsDriver.capture(AnalyticsEvent.ProofUploadFailed(reason)) },
        )
    }
    private val historyRepo: HistoryRepository by lazy { HttpHistoryRepository(driverClient) }

    val appearance: AppearancePreferenceStore by lazy { AppearancePreferenceStore(Settings()) }

    // Kept on the phone: the stop in progress.
    val stopDrafts: StopDrafts by lazy { SettingsStopDrafts(Settings()) }

    // domain (use cases) - the layer ViewModels + SessionManager depend on
    val requestSignInCode by lazy { RequestSignInCode(authDriver) }
    val confirmSignIn by lazy { ConfirmSignIn(authDriver) }
    val getDriverIdentity by lazy { GetDriverIdentity(driver) }
    val setDuty by lazy { SetDuty(driver) }
    // The daily vehicle check, and the record read that tells when a dispatcher has cleared it.
    val submitVehicleCheck by lazy { com.effyshopping.driver.mobile.features.driver.domain.SubmitVehicleCheck(driver) }
    suspend fun readMe() = driver.me()
    val getToday by lazy { GetToday(today) }

    // collection
    val getCollectionRun by lazy { GetCollectionRun(collection) }
    val getShopStop by lazy { GetShopStop(collection) }
    val collectStop by lazy { CollectStop(collection) }
    val checkInHub by lazy { CheckInHub(collection) }

    // same-day delivery
    val getDeliveryRun by lazy { GetDeliveryRun(delivery) }
    val getDrop by lazy { GetDrop(delivery) }
    val advanceDrop by lazy { AdvanceDrop(delivery) }
    val completeWithMedia by lazy { CompleteWithMedia(delivery) }
    val failDrop by lazy { FailDrop(delivery) }
    val returnToHub by lazy { ReturnToHub(delivery) }
    val loadVan by lazy { LoadVan(delivery) }

    // history
    val getHistory by lazy { GetHistory(historyRepo) }
    val getHistoryDetail by lazy { GetHistoryDetail(historyRepo) }

    /**
     * A notification the driver tapped, waiting for the shell to act on it; null when there is none.
     * Set by the platform's entry point, cleared by the shell once it has gone where the tap leads.
     */
    val openedNotification = MutableStateFlow<OpenedNotification?>(null)

    // app services / presentation wiring
    val session: SessionManager by lazy {
        SessionManager(authDriver, getDriverIdentity, appScope, onSignedOut = { lastCopies.clear() }, workChanges = work.changes)
    }

    /** A per-action idempotency id for driver writes (offline queue + retries, research R10). */
    @OptIn(ExperimentalUuidApi::class)
    fun newChangeId(): String = Uuid.random().toString()

    // Permission priming shown once. Persisted so it does not re-appear every launch.
    private val prefs by lazy { Settings() }
    fun hasPrimedPermissions(): Boolean = prefs.getBoolean("driver.permissions.primed", false)
    fun markPermissionsPrimed() = prefs.putBoolean("driver.permissions.primed", true)

    /**
     * Every label read names the install it was made on: an id made once and kept on the phone
     * (never a hardware id), and the app's version. Set as soon as the container exists.
     */
    @OptIn(ExperimentalUuidApi::class)
    private val readLogReady = run {
        val key = "driver.scan.device_id"
        val id = prefs.getStringOrNull(key) ?: Uuid.random().toString().also { prefs.putString(key, it) }
        com.effyshopping.driver.mobile.core.scan.ReadLog.deviceId = id
        com.effyshopping.driver.mobile.core.scan.ReadLog.appVersion = appVersion
    }

    // observability & push
    private val devices: DeviceRepository by lazy { HttpDeviceRepository(driverClient) }

    /**
     * Start crash reporting (always on) and, when [analyticsConsented], product analytics. On sign-in it
     * identifies the driver by record id and registers this device; on sign-out it resets and unregisters
     * (shared devices). Off the main thread; best-effort.
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

    /**
     * The driver's analytics choice, kept on the phone (backlog F3 - it was hard-coded `true` at both
     * entry points). On until they turn it off in Account, which is what every build did before.
     */
    val analyticsConsent = MutableStateFlow(prefs.getBoolean(ANALYTICS_CONSENT_KEY, true))

    /** Grant/withdraw analytics consent at runtime; crash reporting is unaffected. */
    fun setAnalyticsConsent(granted: Boolean) {
        prefs.putBoolean(ANALYTICS_CONSENT_KEY, granted)
        analyticsConsent.value = granted
        if (granted && AppConfig.telemetryEnabled) appScope.launch { runCatching { analyticsDriver.init() } }
        else runCatching { analyticsDriver.optOut() }
    }

    private companion object {
        const val ANALYTICS_CONSENT_KEY = "driver.analytics.consent"
    }
}
