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
                    val vm = viewModel {
                        TodayViewModel(
                            initialDuty = session.driver.dutyStatus,
                            getToday = container.getToday,
                            setDuty = container.setDuty,
                            newChangeId = container::newChangeId,
                            syncFlush = { container.syncCoordinator.flush() },
                        )
                    }
                    val state by vm.state.collectAsState()
                    TodayScreen(
                        driver = session.driver,
                        state = state,
                        onToggleDuty = vm::toggleDuty,
                        onRefresh = vm::refresh,
                        onOpenRun = { runId, phase ->
                            tabs.push(if (phase == Phase.COLLECTION) CollectionRunRoute(runId) else DeliveryRunRoute(runId))
                        },
                        onOpenActivity = { tabs.push(ActivityRoute) },
                        reducedMotion = reducedMotion,
                    )
                }
                ActivityRoute -> {
                    val vm = viewModel(key = "activity") { ActivityViewModel(container.getActivity, container.markActivityRead) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(Unit) { vm.load() }
                    ActivityScreen(
                        state = st,
                        onBack = { tabs.pop() },
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
                    // ⚠ Clearing on stopId change is what stops one stop's ticks appearing at the
                    // next: the ViewModel is keyed per RUN, not per stop, so the set outlives a stop.
                    androidx.compose.runtime.LaunchedEffect(route.stopId) {
                        vm.clearConfirmations()
                        vm.loadStop(route.stopId)
                    }
                    ShopStopScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onCollect = { vm.collect(route.stopId) { tabs.pop() } },
                        onTogglePackage = vm::togglePackage,
                        onOpenProblem = { tabs.push(ShopProblemRoute(route.runId, route.stopId)) },
                    )
                }
                is ShopProblemRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.stopId) { vm.loadStop(route.stopId) }
                    ShopProblemScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onSubmit = { ref, kind, note ->
                            vm.reportPackage(route.stopId, ref, kind, note)
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
                        onCheckIn = { vm.checkIn() },
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
                    DropDetailScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onNavigate = { address -> mapLauncher.navigateTo(address) },
                        onAdvance = { to -> vm.advance(route.dropId, to) },
                        onDeliverContactless = { bytes, note -> vm.deliverContactless(route.dropId, bytes, note) },
                        onDeliverPhoto = { bytes, note -> vm.deliverWithPhoto(route.dropId, bytes, note) },
                        onDeliverSignature = { bytes, note -> vm.deliverWithSignature(route.dropId, bytes, note) },
                        onFail = { reason, note -> vm.fail(route.dropId, reason, note) },
                        onNext = { tabs.pop() },
                        reducedMotion = reducedMotion,
                    )
                }

                MapRoot -> {
                    // ⚠ The map derives its stops from the runs the driver ALREADY has, so it
                    // carries no fetch of its own and cannot disagree with Today. Positions are
                    // placeholder (register: map.markerCoordinates) — the cartography is real.
                    var mapMode by rememberSaveable { mutableStateOf(MapMode.COLLECTION) }
                    val todayVm = viewModel(key = "today") {
                        TodayViewModel(
                            initialDuty = session.driver.dutyStatus,
                            getToday = container.getToday,
                            setDuty = container.setDuty,
                            newChangeId = container::newChangeId,
                            syncFlush = { container.syncCoordinator.flush() },
                        )
                    }
                    val todaySt by todayVm.state.collectAsState()
                    val today = todaySt.today

                    val stops = buildList {
                        today?.active?.let {
                            add(MapStop(it.id, 1, it.title, it.subtitle.orEmpty()))
                        }
                        today?.upNext?.forEachIndexed { i, item ->
                            add(MapStop(item.id, i + 2, item.title, item.subtitle.orEmpty()))
                        }
                        if (mapMode == MapMode.COLLECTION) {
                            session.driver.hub?.takeIf { it.isNotBlank() }?.let {
                                add(MapStop("hub", 0, it, "Check in every package · ends the run", isHub = true))
                            }
                        }
                    }

                    MapScreen(
                        state = MapUiState(mode = mapMode, stops = stops),
                        onModeChange = { mapMode = it },
                        onOpenStop = { stop ->
                            today?.activeRunId?.let { runId ->
                                if (mapMode == MapMode.COLLECTION) {
                                    tabs.push(CollectionRunRoute(runId))
                                } else {
                                    tabs.push(DeliveryRunRoute(runId))
                                }
                            }
                        },
                    )
                }
                HistoryRoot -> {
                    val vm = viewModel(key = "history") { HistoryViewModel(container.getHistory, container.getHistoryDetail) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(Unit) { vm.load() }
                    HistoryScreen(
                        state = st,
                        onOpenDrop = { dropId -> tabs.push(HistoryDetailRoute("drop", dropId, "Delivery")) },
                        onOpenRun = { runId -> tabs.push(HistoryDetailRoute("run", runId, "Run")) },
                    )
                }
                is HistoryDetailRoute -> {
                    val vm = viewModel(key = "history") { HistoryViewModel(container.getHistory, container.getHistoryDetail) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.id) { vm.loadDetail(route.kind, route.id) }
                    HistoryDetailScreen(state = st, title = route.title, kind = route.kind, onBack = { tabs.pop() })
                }
                AccountRoot -> AccountScreen(
                    driver = session.driver,
                    appearanceMode = appearanceMode,
                    signingOut = signingOut,
                    onOpenAppearance = { tabs.push(AppearanceRoute) },
                    onOpenHelp = { tabs.push(HelpRoute) },
                    onSignOut = {
                        if (!signingOut) {
                            signingOut = true
                            tabs.resetForSignOut(DriverTab.TODAY)
                            scope.launch { container.session.signOutLocally() }
                        }
                    },
                )
                AppearanceRoute -> AppearanceScreen(
                    mode = appearanceMode,
                    onModeChange = container.appearance::setMode,
                    onBack = { tabs.pop() },
                )
                HelpRoute -> HelpScreen(driver = session.driver, onBack = { tabs.pop() })
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

private fun newCollectionVm(container: AppContainer, runId: String) = CollectionViewModel(
    runId = runId,
    getRun = container.getCollectionRun,
    getStop = container.getShopStop,
    collectStop = container.collectStop,
    reportIssue = container.reportCollectionIssue,
    checkInHub = container.checkInHub,
    newChangeId = container::newChangeId,
)

private fun newDeliveryVm(container: AppContainer, runId: String) = DeliveryViewModel(
    runId = runId,
    getRun = container.getDeliveryRun,
    getDrop = container.getDrop,
    advanceDrop = container.advanceDrop,
    completeWithMedia = container.completeWithMedia,
    failDrop = container.failDrop,
    newChangeId = container::newChangeId,
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
