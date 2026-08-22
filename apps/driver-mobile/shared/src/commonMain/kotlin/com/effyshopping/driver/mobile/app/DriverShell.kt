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
import com.effyshopping.driver.mobile.core.nav.CollectionRunRoute
import com.effyshopping.driver.mobile.core.nav.DeliveryRunRoute
import com.effyshopping.driver.mobile.core.nav.DriverTab
import com.effyshopping.driver.mobile.core.nav.DropRoute
import com.effyshopping.driver.mobile.core.nav.HistoryDetailRoute
import com.effyshopping.driver.mobile.core.nav.HistoryRoot
import com.effyshopping.driver.mobile.core.nav.HubCheckinRoute
import com.effyshopping.driver.mobile.core.nav.MapRoot
import com.effyshopping.driver.mobile.core.nav.ShopStopRoute
import com.effyshopping.driver.mobile.core.nav.TodayRoot
import com.effyshopping.driver.mobile.core.nav.driverNavJson
import com.effyshopping.driver.mobile.core.nav.driverStartRoute
import com.effyshopping.driver.mobile.core.session.SessionState
import com.effyshopping.driver.mobile.features.account.AccountScreen
import com.effyshopping.driver.mobile.features.placeholder.ComingSoonScreen
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionRunScreen
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionViewModel
import com.effyshopping.driver.mobile.features.collection.presentation.HubCheckinScreen
import com.effyshopping.driver.mobile.features.collection.presentation.ShopStopScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryRunScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryViewModel
import com.effyshopping.driver.mobile.features.delivery.presentation.DropDetailScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryDetailScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryViewModel
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.presentation.TodayScreen
import com.effyshopping.driver.mobile.features.today.presentation.TodayViewModel
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
            icon = { selected -> TabGlyph(tab.label.first().toString(), selected) },
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
                    )
                }
                is ShopStopRoute -> {
                    val vm = viewModel(key = "coll-${route.runId}") { newCollectionVm(container, route.runId) }
                    val st by vm.state.collectAsState()
                    androidx.compose.runtime.LaunchedEffect(route.stopId) { vm.loadStop(route.stopId) }
                    ShopStopScreen(
                        state = st,
                        onBack = { tabs.pop() },
                        onCollect = { vm.collect(route.stopId) { tabs.pop() } },
                        onReport = { kind -> vm.report(route.stopId, kind, null) },
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
                        onDeliverCode = { code, note -> vm.deliverWithCode(route.dropId, code, note) },
                        onDeliverContactless = { note -> vm.deliverContactless(route.dropId, note) },
                        onFail = { reason, note -> vm.fail(route.dropId, reason, note) },
                        onNext = { tabs.pop() },
                    )
                }

                MapRoot -> ComingSoonScreen("Map", "Open a delivery drop to navigate. A route map is coming soon.")
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
                    HistoryDetailScreen(state = st, title = route.title, onBack = { tabs.pop() })
                }
                AccountRoot -> AccountScreen(
                    driver = session.driver,
                    appearanceMode = appearanceMode,
                    onAppearanceModeChange = container.appearance::setMode,
                    signingOut = signingOut,
                    onSignOut = {
                        if (!signingOut) {
                            signingOut = true
                            tabs.resetForSignOut(DriverTab.TODAY)
                            scope.launch { container.session.signOutLocally() }
                        }
                    },
                )
                else -> ComingSoonScreen("Today", "")
            }
        }
    }
}

@Composable
private fun TabGlyph(letter: String, selected: Boolean) {
    Text(
        letter,
        style = MaterialTheme.typography.titleMedium,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
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
    completeWithCode = container.completeWithCode,
    completeContactless = container.completeContactless,
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
