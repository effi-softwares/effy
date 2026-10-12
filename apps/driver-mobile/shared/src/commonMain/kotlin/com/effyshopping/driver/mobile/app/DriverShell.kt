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
import com.effyshopping.mobile.kit.live.LiveKind
import com.effyshopping.mobile.kit.live.LiveStatusLine
import com.effyshopping.driver.mobile.core.nav.AccountRoot
import com.effyshopping.driver.mobile.core.nav.ActivityRoute
import com.effyshopping.driver.mobile.core.nav.CollectionRunRoute
import com.effyshopping.driver.mobile.core.nav.DeliveryRunRoute
import com.effyshopping.driver.mobile.core.nav.DriverTab
import com.effyshopping.driver.mobile.core.nav.DropRoute
import com.effyshopping.driver.mobile.core.nav.HistoryDetailRoute
import com.effyshopping.driver.mobile.core.nav.HistoryRoot
import com.effyshopping.driver.mobile.core.nav.HubCheckinRoute
import com.effyshopping.driver.mobile.core.nav.MapRoot
import com.effyshopping.driver.mobile.core.nav.ShopProblemRoute
import com.effyshopping.driver.mobile.core.nav.ShopStopRoute
import com.effyshopping.driver.mobile.core.nav.TodayRoot
import com.effyshopping.driver.mobile.core.nav.driverNavJson
import com.effyshopping.driver.mobile.core.nav.driverStartRoute
import com.effyshopping.driver.mobile.core.session.SessionState
import com.effyshopping.driver.mobile.features.map.presentation.MapUiState
import com.effyshopping.driver.mobile.features.map.presentation.MapStop
import com.effyshopping.driver.mobile.features.map.presentation.MapScreen
import com.effyshopping.driver.mobile.features.map.presentation.MapMode
import androidx.compose.runtime.saveable.rememberSaveable
import com.effyshopping.driver.mobile.features.account.AccountScreen
import com.effyshopping.driver.mobile.features.onboarding.PermissionDeniedScreen
import com.effyshopping.driver.mobile.features.account.HelpScreen
import com.effyshopping.driver.mobile.features.account.AppearanceScreen
import com.effyshopping.driver.mobile.core.nav.PermissionDeniedRoute
import com.effyshopping.driver.mobile.core.observability.AnalyticsEvent
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import com.effyshopping.driver.mobile.core.nav.HelpRoute
import com.effyshopping.driver.mobile.core.nav.AppearanceRoute
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionRunScreen
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionViewModel
import com.effyshopping.driver.mobile.features.collection.presentation.HubCheckinScreen
import com.effyshopping.driver.mobile.features.collection.presentation.ShopProblemScreen
import com.effyshopping.driver.mobile.features.collection.presentation.ShopStopScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryRunScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryViewModel
import com.effyshopping.driver.mobile.features.delivery.presentation.DropDetailScreen
import com.effyshopping.driver.mobile.features.activity.presentation.ActivityScreen
import com.effyshopping.driver.mobile.features.activity.presentation.ActivityViewModel
import com.effyshopping.driver.mobile.features.history.presentation.HistoryDetailScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryViewModel
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.presentation.TodayScreen
import com.effyshopping.driver.mobile.features.today.presentation.TodayViewModel
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.ic_account_outlined
import com.effyshopping.driver.mobile.resources.ic_account_selected
import com.effyshopping.driver.mobile.resources.ic_history_outlined
import com.effyshopping.driver.mobile.resources.ic_history_selected
import com.effyshopping.driver.mobile.resources.ic_map_outlined
import com.effyshopping.driver.mobile.resources.ic_map_selected
import com.effyshopping.driver.mobile.resources.ic_today_outlined
import com.effyshopping.driver.mobile.resources.ic_today_selected
import org.jetbrains.compose.resources.painterResource
import com.effyshopping.mobile.kit.nav.rememberTabBackStacks
import com.effyshopping.mobile.kit.shell.ResponsiveDestination
import com.effyshopping.mobile.kit.shell.ResponsiveNavigation
import kotlinx.coroutines.launch

/**
 * The signed-in driver shell (049 §4 IA): an adaptive bottom bar / navigation rail (mobile-kit) with four
 * tabs — Today (the phase-aware home), Map, History, Account. Login-first: the whole shell is gated, so
 * every tab is authenticated. Map/History are placeholders in this foundation (their slices are US4/US5).
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

    BackHandler(enabled = tabs.canGoBack || tabs.currentTab != DriverTab.TODAY) {
        if (tabs.canGoBack) tabs.pop() else tabs.selectTab(DriverTab.TODAY)
    }

    // Which SCREEN is up — its kind only, never the run or drop it is showing.
    val screenName = tabs.currentRoute::class.simpleName.orEmpty().removeSuffix("Route").removeSuffix("Root")
    LaunchedEffect(screenName) {
        if (screenName.isNotEmpty()) container.analyticsDriver.screen(screenName.lowercase())
    }

    // A tapped notification is about the driver's work, and Today is where their work is.
    val openedNotification by container.openedNotification.collectAsState()
    LaunchedEffect(openedNotification) {
        val type = openedNotification ?: return@LaunchedEffect
        container.analyticsDriver.capture(AnalyticsEvent.NotificationOpened(type))
        tabs.selectTab(DriverTab.TODAY)
        while (tabs.canGoBack) tabs.pop()
        container.openedNotification.value = null
    }

    val destinations = DriverTab.entries.map { tab ->
        ResponsiveDestination(
            tab = tab,
            label = tab.label,
            icon = { selected -> TabIcon(tab, selected) },
        )
    }

    ResponsiveNavigation(
        destinations = destinations,
        selectedTab = tabs.currentTab,
        onSelectTab = tabs::selectTab,
        railFooter = { RailAvatar(session.driver.railInitials()) },
    ) {
        AnimatedContent(
            targetState = tabs.currentRoute,
            transitionSpec = { fadeIn(tween(160)) togetherWith fadeOut(tween(160)) },
            contentKey = { it::class },
        ) { route ->
            when (route) {
                TodayRoot -> {
                    // One ViewModel for Today, the Map and the sign-out question — keyed, so the three
                    // read one copy of the driver's work instead of fetching it three times.
                    val vm = viewModel(key = "today") { newTodayVm(container, session) }
                    val state by vm.state.collectAsState()
                    // Coming back to Today (from the feed, from a finished stop): the count of new
                    // activity and today's figures are re-read. The round itself is the channel's job.
                    LaunchedEffect(Unit) { vm.refreshSideInfo() }
                    androidx.compose.foundation.layout.Column {
                        // 071 FR-015 — if the live channel cannot be held, say so: a work list that
                        // has stopped updating must not look current. Nothing is shown while live.
                        LiveStatusLine(container.live, onRefresh = vm::refresh)
                        PendingWritesLine(container)
                        RefusedWritesLine(container)
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
                            onOpenRun = { runId, phase ->
                                container.analyticsDriver.capture(
                                    if (phase == Phase.COLLECTION) AnalyticsEvent.CollectionRunOpened(runId)
                                    else AnalyticsEvent.DeliveryRunOpened(runId),
                                )
                                tabs.push(if (phase == Phase.COLLECTION) CollectionRunRoute(runId) else DeliveryRunRoute(runId))
                            },
                            onOpenActivity = { tabs.push(ActivityRoute) },
                            reducedMotion = reducedMotion,
                        )
                    }
                }
                ActivityRoute -> {
                    val vm = viewModel(key = "activity") {
                        ActivityViewModel(
                            container.getActivity, container.markActivityRead, container.activitySeen,
                            container.live.changes(LiveKind.WORK),
                        )
                    }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(Unit) { vm.load() }
                    ActivityScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onRefresh = vm::load,
                        onOpen = { item ->
                            when {
                                item.dropId != null && item.runId != null -> tabs.push(DropRoute(item.runId, item.dropId))
                                item.runId != null -> tabs.push(CollectionRunRoute(item.runId))
                            }
                        },
                    )
                }

                is CollectionRunRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.runId) { vm.loadRun() }
                    CollectionRunScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onOpenStop = { stopId -> tabs.push(ShopStopRoute(route.runId, stopId)) },
                        onCheckIn = { tabs.push(HubCheckinRoute(route.runId)) },
                        onRefresh = { vm.loadRun() },
                        hubName = session.driver.hub,
                    )
                }
                is ShopStopRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    // The ViewModel is keyed per RUN, so `loadStop` is what drops one stop's ticks when
                    // a different stop opens — and keeps them when this one is come back to.
                    androidx.compose.runtime.LaunchedEffect(route.stopId) { vm.loadStop(route.stopId) }
                    CompositionLocalProvider(LocalManifestOpened provides manifestOpened(container, "pickup")) {
                    ShopStopScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onCollect = {
                            vm.collect(route.stopId) {
                                container.analyticsDriver.capture(AnalyticsEvent.ShopStopCollected(route.runId))
                                tabs.pop()
                            }
                        },
                        onTogglePackage = vm::togglePackage,
                        onOpenProblem = { tabs.push(ShopProblemRoute(route.runId, route.stopId)) },
                        onRetry = { vm.loadStop(route.stopId) },
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                    )
                    }
                }
                is ShopProblemRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    // No load of its own: it reports on the stop the driver came from, already held.
                    ShopProblemScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onSubmit = { key, kind, note ->
                            vm.reportPackage(key, kind, note)
                            tabs.pop()
                        },
                    )
                }
                is HubCheckinRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    HubCheckinScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onCheckIn = {
                            container.analyticsDriver.capture(AnalyticsEvent.HubCheckedIn(route.runId))
                            vm.checkIn()
                        },
                        onDone = { while (tabs.canGoBack) tabs.pop() },
                    )
                }
                is DeliveryRunRoute -> {
                    val vm = viewModel(key = "del-${route.runId}") { newDeliveryVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.runId) { vm.loadRun() }
                    DeliveryRunScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onOpenDrop = { dropId -> tabs.push(DropRoute(route.runId, dropId)) },
                        onRefresh = { vm.loadRun() },
                    )
                }
                is DropRoute -> {
                    val vm = viewModel(key = "del-${route.runId}") { newDeliveryVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.dropId) { vm.loadDrop(route.dropId) }
                    CompositionLocalProvider(LocalManifestOpened provides manifestOpened(container, "drop")) {
                    DropDetailScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                        onAdvance = { to -> vm.advance(route.dropId, to) },
                        onDeliverContactless = { bytes, note ->
                            container.analyticsDriver.capture(AnalyticsEvent.DropCompleted("contactless"))
                            vm.deliverContactless(route.dropId, bytes, note)
                        },
                        onDeliverPhoto = { bytes, note ->
                            container.analyticsDriver.capture(AnalyticsEvent.DropCompleted("photo"))
                            vm.deliverWithPhoto(route.dropId, bytes, note)
                        },
                        onDeliverSignature = { bytes, note ->
                            container.analyticsDriver.capture(AnalyticsEvent.DropCompleted("signature"))
                            vm.deliverWithSignature(route.dropId, bytes, note)
                        },
                        // The camera was refused: say what is lost and how to turn it back on.
                        onCameraDenied = { tabs.push(PermissionDeniedRoute) },
                        onFail = { reason, note -> vm.fail(route.dropId, reason, note) },
                        // ⚠ "Next drop" used to do exactly what "Back to run" does.
                        onNext = {
                            val next = vm.nextOpenDrop(route.dropId)
                            tabs.pop()
                            if (next != null) tabs.push(DropRoute(route.runId, next))
                        },
                        onBackToRun = { tabs.pop() },
                        reducedMotion = reducedMotion,
                        onRetry = { vm.loadDrop(route.dropId) },
                        onCallDispatch = AppConfig.dispatchPhone?.let { number -> { mapLauncher.dial(number) } },
                    )
                    }
                }

                MapRoot -> {
                    // ⚠ The map draws the round the driver ALREADY has, from the same ViewModel Today
                    // uses — it carries no read of its own and cannot disagree with Today.
                    // Null = follow the phase the driver is in; a tap on a mode pins it.
                    var pickedMode by rememberSaveable { mutableStateOf<MapMode?>(null) }
                    val todayVm = viewModel(key = "today") { newTodayVm(container, session) }
                    val todaySt by todayVm.state.collectAsState()
                    val today = todaySt.today
                    val mapMode = pickedMode
                        ?: if (today?.phase == Phase.SAME_DAY_DELIVERY) MapMode.SAME_DAY else MapMode.COLLECTION
                    // ⚠ A mode shows ITS round only. Both modes used to list whatever Today held, so
                    // "Delivery" showed the shops of a collection round.
                    val modeIsCurrent = when (mapMode) {
                        MapMode.COLLECTION -> today?.phase == Phase.COLLECTION
                        MapMode.SAME_DAY -> today?.phase == Phase.SAME_DAY_DELIVERY
                    }
                    val items = if (modeIsCurrent) listOfNotNull(today?.active) + today?.upNext.orEmpty() else emptyList()
                    val stops = items.mapIndexed { i, item ->
                        val isHub = item.kind == TodayItem.Kind.HUB_CHECKIN
                        MapStop(
                            id = item.id,
                            sequence = i + 1,
                            title = if (isHub) session.driver.hub?.takeIf { it.isNotBlank() } ?: item.title else item.title,
                            subtitle = if (isHub) "Check in every package · ends the run" else item.subtitle.orEmpty(),
                            isHub = isHub,
                        )
                    }
                    MapScreen(
                        state = MapUiState(mode = mapMode, stops = stops),
                        onModeChange = { pickedMode = it },
                        // ⚠ Opens the stop that was tapped. Every row used to open the whole run.
                        onOpenStop = { stop ->
                            items.firstOrNull { it.id == stop.id }?.let { item ->
                                tabs.push(
                                    when (item.kind) {
                                        TodayItem.Kind.COLLECTION_STOP -> ShopStopRoute(item.runId, item.id)
                                        TodayItem.Kind.HUB_CHECKIN -> CollectionRunRoute(item.runId)
                                        TodayItem.Kind.DELIVERY_DROP -> DropRoute(item.runId, item.id)
                                    },
                                )
                            }
                        },
                    )
                }
                HistoryRoot -> {
                    val vm = viewModel(key = "history") { newHistoryVm(container) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(Unit) { vm.load() }
                    HistoryScreen(
                        state = st,
                        onOpenDrop = { dropId -> tabs.push(HistoryDetailRoute("drop", dropId, "Delivery")) },
                        onOpenRun = { runId -> tabs.push(HistoryDetailRoute("run", runId, "Run")) },
                        onRefresh = vm::load,
                    )
                }
                is HistoryDetailRoute -> {
                    val vm = viewModel(key = "history") { newHistoryVm(container) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.id) { vm.loadDetail(route.kind, route.id) }
                    HistoryDetailScreen(state = st, title = route.title, kind = route.kind, onBack = { tabs.pop() })
                }
                AccountRoot -> {
                    val todayVm = viewModel(key = "today") { newTodayVm(container, session) }
                    val todaySt by todayVm.state.collectAsState()
                    AccountScreen(
                        // The duty row follows the toggle, not the value the session started with.
                        driver = session.driver.copy(dutyStatus = todaySt.dutyStatus),
                        appearanceMode = appearanceMode,
                        signingOut = signingOut,
                        onOpenAppearance = { tabs.push(AppearanceRoute) },
                        onOpenHelp = { tabs.push(HelpRoute) },
                        outstandingWork = todaySt.today?.remainingCount,
                        onSignOut = {
                            if (!signingOut) {
                                signingOut = true
                                tabs.resetForSignOut(DriverTab.TODAY)
                                scope.launch {
                                    // ⚠ The dialog says signing out sets the driver off duty, and
                                    // nothing did: a signed-out driver stayed on duty and kept being
                                    // given work. Best-effort — signing out never waits on it.
                                    if (todaySt.dutyStatus == DutyStatus.ON_DUTY) {
                                        runCatching { container.setDuty(false, container.newChangeId()) }
                                    }
                                    container.session.signOutLocally()
                                }
                            }
                        },
                    )
                }
                AppearanceRoute -> AppearanceScreen(
                    mode = appearanceMode,
                    onModeChange = container.appearance::setMode,
                    onBack = { tabs.pop() },
                )
                HelpRoute -> HelpScreen(
                    driver = session.driver,
                    onBack = { tabs.pop() },
                    appVersion = container.appVersion,
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
    }
}

/**
 * A tab's icon (060 FR-008).
 *
 * ⚠ This replaced `TabGlyph`, which rendered **the first letter of the tab's label** — "T", "M",
 * "H", "A". That was a placeholder that shipped, and it survived four features because the driver app
 * was never wired into the shared `mobile-assets` SSOT: `sync-mobile-assets.mjs` gave it fonts only,
 * on a comment saying it would "gain `drawable` when it gets its shell". It got a shell in 049.
 * `mobile-assets:check` stayed green the whole time — it verifies an app matches the SSOT for the
 * kinds it is configured to take, and an app taking nothing is trivially in sync.
 *
 * The filled variant marks the selected tab in addition to the colour change, so selection does not
 * rely on colour alone.
 */
@Composable
private fun TabIcon(tab: DriverTab, selected: Boolean) {
    val icon = when (tab) {
        DriverTab.TODAY -> if (selected) Res.drawable.ic_today_selected else Res.drawable.ic_today_outlined
        DriverTab.MAP -> if (selected) Res.drawable.ic_map_selected else Res.drawable.ic_map_outlined
        DriverTab.HISTORY -> if (selected) Res.drawable.ic_history_selected else Res.drawable.ic_history_outlined
        DriverTab.ACCOUNT -> if (selected) Res.drawable.ic_account_selected else Res.drawable.ic_account_outlined
    }
    Icon(
        painter = painterResource(icon),
        // null: the destination's own label is already announced by the navigation item, so a
        // description here would make a screen reader say the tab's name twice.
        contentDescription = null,
        modifier = Modifier.size(24.dp),
        tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun RailAvatar(initials: String) {
    Box(
        modifier = Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimary)
    }
}

private fun newTodayVm(container: AppContainer, session: SessionState.SignedIn) = TodayViewModel(
    initialDuty = session.driver.dutyStatus,
    getToday = container.getToday,
    setDuty = container.setDuty,
    newChangeId = container::newChangeId,
    syncFlush = { container.syncCoordinator.flush() },
    liveChanges = container.live.changes(LiveKind.WORK),
    countNewActivity = { container.countNewActivity() },
    loadDayStats = { container.dayStats() },
    shiftClock = container.shiftClock,
)

private fun newHistoryVm(container: AppContainer) = HistoryViewModel(
    container.getHistory, container.getHistoryDetail, container.live.changes(LiveKind.WORK),
)

/** A driver opened a package's item list on [surface] (`pickup` | `drop`). No item, no order. */
private fun manifestOpened(container: AppContainer, surface: String): (Boolean, Int) -> Unit =
    { hasCold, lineCount -> container.analyticsDriver.capture(AnalyticsEvent.ManifestOpened(surface, hasCold, lineCount)) }

/**
 * Says when something the driver did has not reached the platform yet. ⚠ The offline queue has held
 * such writes since 049 and showed them nowhere, so a driver could not tell a queued collect from a
 * lost one.
 */
@Composable
private fun PendingWritesLine(container: AppContainer) {
    val pending by container.offlineQueue.pending.collectAsState()
    if (pending.isEmpty()) return
    Text(
        if (pending.size == 1) "1 update saved on this phone — it sends when you reconnect."
        else "${pending.size} updates saved on this phone — they send when you reconnect.",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
    )
}

/**
 * Says when the platform REFUSED something the driver did while offline. ⚠ Such writes were dropped
 * without a word, so a stop collected in a loading dock could be refused later — reassigned, ended —
 * and the driver never learned it was not recorded.
 */
@Composable
private fun RefusedWritesLine(container: AppContainer) {
    val refused by container.offlineQueue.refused.collectAsState()
    if (refused.isEmpty()) return
    androidx.compose.foundation.layout.Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.errorContainer).padding(start = 20.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Not recorded: ${refused.map { it.label }.distinct().joinToString(", ")}. " +
                "It was saved while you were offline and the platform has since refused it — " +
                "check that work and tell dispatch.",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.weight(1f).padding(vertical = 10.dp),
        )
        androidx.compose.material3.TextButton(onClick = container.offlineQueue::clearRefused) { Text("OK") }
    }
}

private fun newCollectionVm(container: AppContainer, runId: String) = CollectionViewModel(
    runId = runId,
    getRun = container.getCollectionRun,
    getStop = container.getShopStop,
    collectStop = container.collectStop,
    checkInHub = container.checkInHub,
    newChangeId = container::newChangeId,
    liveChanges = container.live.changes(LiveKind.WORK),
    drafts = container.stopDrafts,
)

private fun newDeliveryVm(container: AppContainer, runId: String) = DeliveryViewModel(
    runId = runId,
    getRun = container.getDeliveryRun,
    getDrop = container.getDrop,
    advanceDrop = container.advanceDrop,
    completeWithMedia = container.completeWithMedia,
    failDrop = container.failDrop,
    newChangeId = container::newChangeId,
    liveChanges = container.live.changes(LiveKind.WORK),
)

private fun com.effyshopping.driver.mobile.features.driver.domain.Driver.railInitials(): String {
    val source = name.trim().ifBlank { workEmail.substringBefore("@") }
    val parts = source.split('.', '_', '-', ' ').filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].first()}${parts[1].first()}"
        source.length >= 2 -> source.take(2)
        else -> "DR"
    }.uppercase()
}
