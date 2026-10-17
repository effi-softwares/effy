package com.effyshopping.driver.mobile.app

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.features.manifest.presentation.LocalManifestOpened
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.driver.mobile.core.nav.AccountRoot
import com.effyshopping.driver.mobile.core.nav.CollectionRunRoute
import com.effyshopping.driver.mobile.core.nav.DeliveryRunRoute
import com.effyshopping.driver.mobile.core.nav.DriverTab
import com.effyshopping.driver.mobile.core.nav.DropRoute
import com.effyshopping.driver.mobile.core.nav.HistoryDetailRoute
import com.effyshopping.driver.mobile.core.nav.HistoryRoot
import com.effyshopping.driver.mobile.core.nav.HubCheckinRoute
import com.effyshopping.driver.mobile.core.nav.ShopStopRoute
import com.effyshopping.driver.mobile.core.nav.TodayRoot
import com.effyshopping.driver.mobile.core.nav.ReturnHubRoute
import com.effyshopping.driver.mobile.core.nav.driverNavJson
import com.effyshopping.driver.mobile.core.nav.driverStartRoute
import com.effyshopping.driver.mobile.core.session.SessionState
import com.effyshopping.driver.mobile.features.account.AccountScreen
import com.effyshopping.driver.mobile.features.onboarding.PermissionDeniedScreen
import com.effyshopping.driver.mobile.features.account.HelpScreen
import com.effyshopping.driver.mobile.core.nav.PermissionDeniedRoute
import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.core.nav.HelpRoute
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionRunScreen
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionViewModel
import com.effyshopping.driver.mobile.features.collection.presentation.HubCheckinScreen
import com.effyshopping.driver.mobile.features.collection.presentation.ShopStopScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryRunScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryViewModel
import com.effyshopping.driver.mobile.features.delivery.presentation.DropScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.ReturnHubScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryDetailScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryViewModel
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.presentation.TodayScreen
import com.effyshopping.driver.mobile.features.today.presentation.TodayViewModel
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.mobile.kit.nav.rememberTabBackStacks
import kotlinx.coroutines.launch
import com.effyshopping.mobile.kit.live.LiveState
import com.effyshopping.driver.mobile.core.presentation.DriverBannerState
import com.effyshopping.driver.mobile.core.presentation.DriverBanners
import com.effyshopping.driver.mobile.core.presentation.DriverIcon
import com.effyshopping.driver.mobile.core.presentation.DriverTabBar
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import com.effyshopping.driver.mobile.core.presentation.DriverSnack
import com.effyshopping.driver.mobile.core.presentation.DriverSnackbar
import androidx.compose.foundation.layout.fillMaxSize
import com.effyshopping.driver.mobile.core.presentation.rememberLivePaused
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import com.effyshopping.driver.mobile.resources.lucide_history
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_user_round
import kotlinx.coroutines.flow.map

/**
 * The signed-in driver shell: an adaptive bottom bar / navigation rail (mobile-kit) with three tabs —
 * Today, History, Account (092). Login-first: the whole shell is gated, so every tab is authenticated.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun DriverShell(
    container: AppContainer,
    session: SessionState.SignedIn,
    mapLauncher: com.effyshopping.driver.mobile.core.platform.MapLauncher =
        com.effyshopping.driver.mobile.core.platform.NoOpMapLauncher(),
    // 060 FR-009 — the OS-level reduced-motion preference, honoured by skeleton shimmer and the
    // idle pulse. Already plumbed to the sign-in flow since 049; the shell never received it.
    reducedMotion: Boolean = false,
) {
    val tabs = rememberTabBackStacks(
        tabs = DriverTab.entries.toList(),
        initialTab = DriverTab.TODAY,
        tabId = { it.name },
        tabById = DriverTab::valueOf,
        startRoute = ::driverStartRoute,
        json = driverNavJson,
    )
    val scope = rememberCoroutineScope()
    val appearanceMode by container.appearance.mode.collectAsState()
    var signingOut by remember { mutableStateOf(false) }
    // 092 — one snackbar for the whole shell, over the content and above the tab bar.
    var snack by remember { mutableStateOf<DriverSnack?>(null) }

    BackHandler(enabled = tabs.canGoBack || tabs.currentTab != DriverTab.TODAY) {
        if (tabs.canGoBack) tabs.pop() else tabs.selectTab(DriverTab.TODAY)
    }

    // Which SCREEN is up — its kind only, never the run or drop it is showing.
    val screenName = tabs.currentRoute::class.simpleName.orEmpty().removeSuffix("Route").removeSuffix("Root")
    LaunchedEffect(screenName) {
        if (screenName.isNotEmpty()) container.analyticsDriver.screen(screenName.lowercase())
    }

    // A tapped notification is about the driver's work, and Today is where their work is. One about
    // a round opens that round (backlog D4) — when Today still holds it, which also says its kind.
    val analyticsOn by container.analyticsConsent.collectAsState()
    val openedNotification by container.openedNotification.collectAsState()
    LaunchedEffect(openedNotification) {
        val opened = openedNotification ?: return@LaunchedEffect
        container.analyticsDriver.capture(AnalyticsEvent.NotificationOpened(opened.type))
        tabs.selectTab(DriverTab.TODAY)
        while (tabs.canGoBack) tabs.pop()
        container.openedNotification.value = null
        val runId = opened.entityId?.takeIf { opened.type.startsWith("run_") } ?: return@LaunchedEffect
        val today = runCatching { container.getToday() }.getOrNull() ?: return@LaunchedEffect
        val phase = if (today.activeRunId == runId) today.phase else today.upcoming.firstOrNull { it.runId == runId }?.phase
        when (phase) {
            Phase.COLLECTION -> tabs.push(CollectionRunRoute(runId))
            Phase.DELIVERY -> tabs.push(DeliveryRunRoute(runId))
            else -> Unit // no longer theirs, or finished: Today says what is
        }
    }

    // 092 rev 2 — the tab bar shows ONLY on the three tab roots; every screen pushed from a tab is a
    // full-screen inner view with its own back bar (the redesign's navigation rule).
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
        AnimatedContent(
            targetState = NavFrame(tabs.currentTab, tabs.currentStack.size, tabs.currentRoute),
            transitionSpec = { navTransition(initialState, targetState, reducedMotion) },
            contentKey = { Triple(it.tab, it.depth, it.route::class) },
        ) { frame ->
            val route = frame.route
            when (route) {
                TodayRoot -> {
                    val vm = viewModel(key = "today") { newTodayVm(container, session) }
                    val state by vm.state.collectAsState()
                    // FALLBACK only — the driver's own writes already re-read Today (`WorkChanges`); this
                    // catches anything that slipped past it (a write made before the app last closed, say).
                    LaunchedEffect(Unit) { vm.shown() }
                    TodayScreen(
                        driver = session.driver,
                        state = state,
                        onToggleDuty = {
                            container.analyticsDriver.capture(
                                AnalyticsEvent.DutyToggled(on = state.dutyStatus == DutyStatus.OFF_DUTY),
                            )
                            vm.toggleDuty()
                        },
                        onRefresh = vm::refresh,
                        onSubmitVehicleCheck = vm::submitVehicleCheck,
                        onOpenReturn = { runId, scan -> tabs.push(ReturnHubRoute(runId, scan)) },
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                        onOpenRun = { runId, phase ->
                            container.analyticsDriver.capture(
                                if (phase == Phase.COLLECTION) AnalyticsEvent.CollectionRunOpened(runId)
                                else AnalyticsEvent.DeliveryRunOpened(runId),
                            )
                            tabs.push(if (phase == Phase.COLLECTION) CollectionRunRoute(runId) else DeliveryRunRoute(runId))
                        },
                        onOpenItem = { item, scan ->
                            tabs.push(
                                when (item.kind) {
                                    TodayItem.Kind.COLLECTION_STOP -> ShopStopRoute(item.runId, item.id, scan)
                                    TodayItem.Kind.HUB_CHECKIN -> HubCheckinRoute(item.runId)
                                    TodayItem.Kind.DELIVERY_DROP -> DropRoute(item.runId, item.id, scan)
                                },
                            )
                        },
                        banners = {
                            ConnectionBanners(container, offline = state.offline, syncedAt = state.syncedAtEpochMillis, onRefresh = vm::refresh, onDial = mapLauncher::dial)
                        },
                    )
                }

                is CollectionRunRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    LaunchedEffect(route.runId) { vm.showRun() }
                    CollectionRunScreen(
                        state = st,
                        hubName = session.driver.hub,
                        onBack = { tabs.pop() },
                        onOpenStop = { stopId -> tabs.push(ShopStopRoute(route.runId, stopId)) },
                        onCheckIn = { tabs.push(HubCheckinRoute(route.runId)) },
                        onRefresh = { vm.loadRun() },
                    )
                }
                is ShopStopRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    // The ViewModel is keyed per RUN, so `loadStop` is what drops one stop's ticks when
                    // a different stop opens — and keeps them when this one is come back to.
                    LaunchedEffect(route.stopId) {
                        vm.showRun(quiet = true)
                        vm.loadStop(route.stopId)
                    }
                    CompositionLocalProvider(LocalManifestOpened provides manifestOpened(container, "pickup")) {
                        ShopStopScreen(
                            state = st,
                            position = st.run?.stops?.firstOrNull { it.stopId == route.stopId }?.sequence,
                            stopCount = st.run?.stops?.size ?: 0,
                            onBack = { tabs.pop() },
                            onCollect = {
                                vm.collect(route.stopId) {
                                    container.analyticsDriver.capture(AnalyticsEvent.ShopStopCollected(route.runId))
                                    snack = DriverSnack("Collected · ${st.stop?.shopName ?: "shop stop"}")
                                    tabs.pop()
                                }
                            },
                            onScanCollect = { methods ->
                                vm.collect(route.stopId, methods) {
                                    container.analyticsDriver.capture(AnalyticsEvent.ShopStopCollected(route.runId))
                                    snack = DriverSnack("Collected · ${st.stop?.shopName ?: "shop stop"}")
                                    tabs.pop()
                                }
                            },
                            onTogglePackage = vm::togglePackage,
                            onReport = vm::reportPackage,
                            onWithdrawReport = vm::withdrawReport,
                            onRetry = { vm.loadStop(route.stopId) },
                            onNavigate = { address -> mapLauncher.navigateTo(address) },
                            onCallDispatch = AppConfig.dispatchPhone?.let { number -> { mapLauncher.dial(number) } },
                            startScanning = route.scan,
                        )
                    }
                }
                is HubCheckinRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    // Backlog F2 — after the system reclaims the app, this screen is restored on its own,
                    // with no run screen before it to have loaded the counts.
                    LaunchedEffect(route.runId) { vm.showRun(quiet = true) }
                    val todayVm = viewModel(key = "today") { newTodayVm(container, session) }
                    val todaySt by todayVm.state.collectAsState()
                    HubCheckinScreen(
                        state = st,
                        hubName = session.driver.hub,
                        nextRun = todaySt.today?.nextDeliveryRun(route.runId),
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                        onBack = { tabs.pop() },
                        onCheckIn = { handed, missing ->
                            container.analyticsDriver.capture(AnalyticsEvent.HubCheckedIn(route.runId))
                            vm.checkIn(handed, missing)
                        },
                        onDone = { while (tabs.canGoBack) tabs.pop() },
                    )
                }
                is DeliveryRunRoute -> {
                    val vm = viewModel(key = "del-${route.runId}") { newDeliveryVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    LaunchedEffect(route.runId) { vm.showRun() }
                    LaunchedEffect(st.notice) {
                        st.notice?.let { snack = DriverSnack(it); vm.clearNotice() }
                    }
                    DeliveryRunScreen(
                        state = st,
                        hubName = session.driver.hub,
                        onBack = { tabs.pop() },
                        onOpenDrop = { dropId -> tabs.push(DropRoute(route.runId, dropId)) },
                        onRefresh = { vm.loadRun() },
                        onLoadVan = { handed, notLoaded -> vm.loadVan(handed, notLoaded) },
                        onOpenReturn = { scan -> tabs.push(ReturnHubRoute(route.runId, scan)) },
                    )
                }
                is ReturnHubRoute -> {
                    val vm = viewModel(key = "del-${route.runId}") { newDeliveryVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    LaunchedEffect(route.runId) { vm.showRun() }
                    LaunchedEffect(st.notice) {
                        st.notice?.let { snack = DriverSnack(it); vm.clearNotice(); tabs.pop() }
                    }
                    ReturnHubScreen(
                        state = st,
                        hubName = session.driver.hub,
                        backLabel = if (tabs.currentStack.size > 2) "Run" else "Today",
                        startScanning = route.scan,
                        onBack = { tabs.pop() },
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                        onReturn = { handed -> vm.returnParcels(handed) },
                    )
                }
                is DropRoute -> {
                    val vm = viewModel(key = "del-${route.runId}") { newDeliveryVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    LaunchedEffect(route.dropId) {
                        vm.showRun()
                        vm.loadDrop(route.dropId)
                    }
                    CompositionLocalProvider(LocalManifestOpened provides manifestOpened(container, "drop")) {
                        DropScreen(
                            state = st,
                            hubName = session.driver.hub,
                            onBack = { tabs.pop() },
                            onNavigate = { address -> mapLauncher.navigateTo(address) },
                            onCall = { phone -> mapLauncher.dial(phone) },
                            onDeliver = { method, bytes, note, handed ->
                                container.analyticsDriver.capture(AnalyticsEvent.DropCompleted(method.name.lowercase()))
                                vm.deliver(route.dropId, method, bytes, note, handed)
                            },
                            onFail = { reason, note -> vm.fail(route.dropId, reason, note) },
                            onNext = {
                                val next = vm.nextOpenDrop(route.dropId)
                                tabs.pop()
                                if (next != null) tabs.push(DropRoute(route.runId, next))
                            },
                            onBackToRun = { tabs.pop() },
                            onRetry = { vm.loadDrop(route.dropId) },
                            // The camera was refused: say what is lost and how to turn it back on.
                            onCameraDenied = { tabs.push(PermissionDeniedRoute) },
                            onCallDispatch = AppConfig.dispatchPhone?.let { number -> { mapLauncher.dial(number) } },
                            startScanning = route.scan,
                        )
                    }
                }

                HistoryRoot -> {
                    val vm = viewModel(key = "history") { newHistoryVm(container) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(Unit) { vm.load() }
                    HistoryScreen(
                        state = st,
                        onOpenDrop = { dropId -> tabs.push(HistoryDetailRoute("drop", dropId, "Delivery")) },
                        onOpenRun = { runId, title -> tabs.push(HistoryDetailRoute("run", runId, title)) },
                        onRefresh = vm::load,
                    )
                }
                is HistoryDetailRoute -> {
                    val vm = viewModel(key = "history") { newHistoryVm(container) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.id) { vm.loadDetail(route.kind, route.id) }
                    HistoryDetailScreen(
                        state = st, title = route.title, kind = route.kind, onBack = { tabs.pop() }, hubName = session.driver.hub,
                        onOpenDrop = { dropId -> tabs.push(HistoryDetailRoute("drop", dropId, "Delivery")) },
                    )
                }
                AccountRoot -> {
                    val todayVm = viewModel(key = "today") { newTodayVm(container, session) }
                    val todaySt by todayVm.state.collectAsState()
                    val pending by container.offlineQueue.pending.collectAsState()
                    val proofs by container.proofOutbox.pending.collectAsState()
                    AccountScreen(
                        // The duty row follows the toggle, not the value the session started with.
                        driver = session.driver.copy(dutyStatus = todaySt.dutyStatus),
                        appearanceMode = appearanceMode,
                        onAppearanceChange = container.appearance::setMode,
                        signingOut = signingOut,
                        onOpenHelp = { tabs.push(HelpRoute) },
                        appVersion = container.appVersion,
                        dispatchPhone = AppConfig.dispatchPhone,
                        hubDeskPhone = AppConfig.hubDeskPhone,
                        handbookUrl = AppConfig.handbookUrl,
                        onDial = mapLauncher::dial,
                        onOpenLink = mapLauncher::openLink,
                        outstandingWork = todaySt.today?.remainingCount,
                        parcelsToReturn = todaySt.today?.toReturn?.count,
                        pendingUpdates = pending.size + proofs.size,
                        analyticsOn = analyticsOn,
                        onToggleAnalytics = { container.setAnalyticsConsent(!analyticsOn) },
                        onOpenDuty = { tabs.selectTab(DriverTab.TODAY) },
                        onSignOut = {
                            if (!signingOut) {
                                signingOut = true
                                tabs.resetForSignOut(DriverTab.TODAY)
                                scope.launch {
                                    // Signing out sets the driver off duty, so they stop being given work.
                                    // Best-effort — signing out never waits on it.
                                    if (todaySt.dutyStatus == DutyStatus.ON_DUTY) {
                                        runCatching { container.setDuty(false, container.newChangeId()) }
                                    }
                                    container.session.signOutLocally()
                                }
                            }
                        },
                    )
                }
                HelpRoute -> HelpScreen(
                    driver = session.driver,
                    onBack = { tabs.pop() },
                    dispatchPhone = AppConfig.dispatchPhone,
                    hubDeskPhone = AppConfig.hubDeskPhone,
                    handbookUrl = AppConfig.handbookUrl,
                    onDial = mapLauncher::dial,
                    onOpenLink = mapLauncher::openLink,
                )
                PermissionDeniedRoute -> PermissionDeniedScreen(onBack = { tabs.pop() })

                // ⚠ `ComingSoonScreen` is DELETED (FR-003, SC-002): no destination in this app may
                // show a placeholder. This branch is unreachable — every AppNavKey above is
                // handled and RouteSerializerGuardTest enumerates them — so it renders nothing
                // rather than inventing a screen for a route that cannot occur.
                else -> Unit
            }
        }
        DriverSnackbar(snack, onDismiss = { snack = null }, modifier = Modifier.align(Alignment.BottomCenter))
        }
        if (!tabs.canGoBack) {
            DriverTabBar(selected = tabs.currentTab, onSelect = tabs::selectTab)
        }
    }
}

/** Where the shell is: which tab, how deep, and the route on top. */
private data class NavFrame(val tab: DriverTab, val depth: Int, val route: com.effyshopping.mobile.kit.nav.AppNavKey)

/**
 * 092 — the canvas's Motion: a pushed screen slides in from the right over the one it leaves (which
 * drifts left), a pop is the reverse, and switching tabs is a short fade. ⚠ Reduced motion: nothing moves.
 */
private fun navTransition(from: NavFrame, to: NavFrame, reducedMotion: Boolean): androidx.compose.animation.ContentTransform {
    if (reducedMotion) return androidx.compose.animation.EnterTransition.None togetherWith androidx.compose.animation.ExitTransition.None
    val ease = androidx.compose.animation.core.CubicBezierEasing(0.2f, 0.9f, 0.3f, 1f)
    val spec = tween<androidx.compose.ui.unit.IntOffset>(320, easing = ease)
    return when {
        from.tab != to.tab -> fadeIn(tween(160)) togetherWith fadeOut(tween(160))
        to.depth > from.depth -> (androidx.compose.animation.slideInHorizontally(spec) { it } togetherWith
            androidx.compose.animation.slideOutHorizontally(spec) { -it / 4 } + fadeOut(tween(320)))
        to.depth < from.depth -> (androidx.compose.animation.slideInHorizontally(spec) { -it / 4 } + fadeIn(tween(320)) togetherWith
            androidx.compose.animation.slideOutHorizontally(spec) { it })
        else -> fadeIn(tween(160)) togetherWith fadeOut(tween(160))
    }.apply { targetContentZIndex = if (to.depth >= from.depth) 1f else 0f }
}


private fun newTodayVm(container: AppContainer, session: SessionState.SignedIn) = TodayViewModel(
    initialDuty = session.driver.dutyStatus,
    getToday = container.getToday,
    setDuty = container.setDuty,
    newChangeId = container::newChangeId,
    syncFlush = { container.syncCoordinator.flush() },
    liveChanges = container.work.changes,
    returnToHub = { runId, changeId -> container.returnToHub(runId, changeId) },
    initialVehicleCheck = session.driver.vehicleCheck,
    initialVehicleLabel = session.driver.vehicleLabel,
    submitCheck = { changeId, answers -> container.submitVehicleCheck(changeId, answers) },
    readMe = { container.readMe() },
)

/**
 * 092 — the delivery run that follows a collection run, in the words the check-in screen says it:
 * "Your delivery run opens at 3:15 pm" / "finish by 6 pm · 7 drops · it's on Today".
 */
private fun com.effyshopping.driver.mobile.features.today.domain.Today.nextDeliveryRun(collectionRunId: String): Pair<String, String>? {
    val current = activeRunId?.takeIf { it != collectionRunId && phase == Phase.DELIVERY }
    if (current != null) {
        val title = opening?.let { "Your delivery run opens at ${it.label}" } ?: "Your delivery run is ready"
        return title to listOfNotNull(dueLabel?.let { "finish by $it" }, "$remainingCount ${if (remainingCount == 1) "drop" else "drops"}", "it's on Today").joinToString(" · ")
    }
    val next = upcoming.firstOrNull { it.phase == Phase.DELIVERY } ?: return null
    val title = next.opening?.let { "Your delivery run opens at ${it.label}" } ?: "Your delivery run is ready"
    return title to "finish by ${next.dueLabel} · ${next.stopCount} ${if (next.stopCount == 1) "drop" else "drops"} · it's on Today"
}

private fun newHistoryVm(container: AppContainer) = HistoryViewModel(
    container.getHistory, container.getHistoryDetail, container.work.changes,
)

/** A driver opened a package's item list on [surface] (`pickup` | `drop`). No item, no order. */
private fun manifestOpened(container: AppContainer, surface: String): (Boolean, Int) -> Unit =
    { hasCold, lineCount -> container.analyticsDriver.capture(AnalyticsEvent.ManifestOpened(surface, hasCold, lineCount)) }

/** The connection banners over Today: offline, waiting to send, refused, live updates paused. */
@Composable
private fun ConnectionBanners(container: AppContainer, offline: Boolean, syncedAt: Long?, onRefresh: () -> Unit, onDial: (String) -> Unit) {
    val pending by container.offlineQueue.pending.collectAsState()
    val proofs by container.proofOutbox.pending.collectAsState()
    val refused by container.offlineQueue.refused.collectAsState()
    val live by container.live.state.collectAsState()
    val paused = rememberLivePaused(live == LiveState.LIVE)
    DriverBanners(
        state = DriverBannerState(
            offline = offline,
            syncedAtEpochMillis = syncedAt,
            waitingLabels = pending.map { it.label },
            waitingProofs = proofs.size,
            refusedLabels = refused.map { it.label },
            livePaused = paused,
        ),
        onRefresh = onRefresh,
        onClearRefused = container.offlineQueue::clearRefused,
        onCallDispatch = AppConfig.dispatchPhone?.let { number -> { onDial(number) } },
    )
}

private fun newCollectionVm(container: AppContainer, runId: String) = CollectionViewModel(
    runId = runId,
    getRun = container.getCollectionRun,
    getStop = container.getShopStop,
    collectStop = container.collectStop,
    checkInHub = container.checkInHub,
    newChangeId = container::newChangeId,
    liveChanges = container.work.changes,
    drafts = container.stopDrafts,
    pendingChangeIds = container.offlineQueue.pending.map { list -> list.mapTo(mutableSetOf()) { it.changeId } },
)

private fun newDeliveryVm(container: AppContainer, runId: String) = DeliveryViewModel(
    runId = runId,
    getRun = container.getDeliveryRun,
    getDrop = container.getDrop,
    advanceDrop = container.advanceDrop,
    completeWithMedia = container.completeWithMedia,
    failDrop = container.failDrop,
    newChangeId = container::newChangeId,
    liveChanges = container.work.changes,
    returnToHub = container.returnToHub,
    loadVan = container.loadVan,
)

