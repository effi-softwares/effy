package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.mobile.kit.nav.rememberTabBackStacks
import com.effyshopping.mobile.kit.shell.AdaptiveNavShell
import com.effyshopping.mobile.kit.shell.NavDestination
import com.effyshopping.mobile.kit.shell.NavGlyph
import com.effyshopping.mobile.kit.ui.AdaptiveContent
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.nav.AccountRoot
import com.effyshopping.shop.mobile.core.nav.CatalogProductRoute
import com.effyshopping.shop.mobile.core.nav.CatalogRoot
import com.effyshopping.shop.mobile.core.nav.HomeRoot
import com.effyshopping.shop.mobile.core.nav.ManagerArea
import com.effyshopping.shop.mobile.core.nav.OrdersRoot
import com.effyshopping.shop.mobile.core.nav.ShopTab
import com.effyshopping.shop.mobile.core.nav.shopNavJson
import com.effyshopping.shop.mobile.core.nav.shopStartRoute
import com.effyshopping.shop.mobile.features.catalog.presentation.CatalogListScreen
import com.effyshopping.shop.mobile.features.catalog.presentation.ProductDetailScreen
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Owns the app's only cross-tab action: sign-out. */
class ShopShellViewModel(private val session: SessionManager) : ViewModel() {
    fun signOut() = viewModelScope.launch { session.signOutLocally() }
}

/** The manager-area ViewModel — owns the gate decision, and nothing else. */
class ManagerViewModel(private val checkManagerAccess: CheckManagerAccess) : ViewModel() {
    enum class Gate { CHECKING, GRANTED, DENIED }

    private val _gate = MutableStateFlow(Gate.CHECKING)
    val gate = _gate.asStateFlow()

    /** THE authorization decision: the BACKEND gate, called even though the role passed. */
    fun checkManagerGate() {
        _gate.value = Gate.CHECKING
        viewModelScope.launch {
            _gate.value = when (checkManagerAccess()) {
                ManagerAccess.GRANTED -> Gate.GRANTED
                ManagerAccess.DENIED -> Gate.DENIED
            }
        }
    }
}

/**
 * The signed-in shop shell (015 US3). Adaptive primary navigation — a bottom bar on a phone, a navigation
 * rail on a tablet — over four tabs, each with its own back stack. Login-first: this only ever renders for
 * a [SessionState.SignedIn], selected by the top-level session gate in `App`.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun ShopShell(container: AppContainer, session: SessionState.SignedIn) {
    val vm = viewModel { ShopShellViewModel(container.session) }
    val tabs = rememberTabBackStacks(
        tabs = ShopTab.entries.toList(),
        initialTab = ShopTab.HOME,
        tabId = { it.name },
        tabById = { ShopTab.valueOf(it) },
        startRoute = ::shopStartRoute,
        json = shopNavJson,
    )

    // Back: unwind the current tab; at a tab root, fall back to Home; at Home root, let the system handle it.
    BackHandler(enabled = tabs.canGoBack || tabs.currentTab != ShopTab.HOME) {
        if (tabs.canGoBack) tabs.pop() else tabs.selectTab(ShopTab.HOME)
    }

    val destinations = ShopTab.entries.map { tab ->
        NavDestination<ShopTab>(tab = tab, label = tab.label, icon = { sel -> NavGlyph(tab.label, sel) })
    }

    AdaptiveNavShell(
        destinations = destinations,
        selectedTab = tabs.currentTab,
        onSelectTab = { tabs.selectTab(it) },
    ) {
        when (val route = tabs.currentRoute) {
            HomeRoot -> HomeTab(
                session.operator,
                onOpenManager = { tabs.push(ManagerArea) },
                onOpenCatalog = { tabs.selectTab(ShopTab.CATALOG) },
            )
            ManagerArea -> ManagerAreaTab(container, onBack = { tabs.pop() })
            CatalogRoot -> CatalogListScreen(container, onOpenProduct = { tabs.push(CatalogProductRoute(it)) })
            is CatalogProductRoute -> ProductDetailScreen(container, id = route.id, onBack = { tabs.pop() })
            OrdersRoot -> ComingSoonTab("Orders", "Incoming orders will appear here.")
            AccountRoot -> AccountTab(session.operator, onSignOut = vm::signOut)
            else -> HomeTab(
                session.operator,
                onOpenManager = { tabs.push(ManagerArea) },
                onOpenCatalog = { tabs.selectTab(ShopTab.CATALOG) },
            )
        }
    }
}

/** Home tab — a role-aware landing. Sectioned rows, no card (DOCTRINE-2). */
@Composable
private fun HomeTab(operator: Operator, onOpenManager: () -> Unit, onOpenCatalog: () -> Unit) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Effy Shop", style = MaterialTheme.typography.headlineSmall)
        Text(
            operator.shop?.name ?: "No shop assigned yet",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider()
        Button(onClick = onOpenCatalog, modifier = Modifier.fillMaxWidth()) { Text("Browse catalog") }
        if (operator.isManagerByRole) {
            Button(onClick = onOpenManager, modifier = Modifier.fillMaxWidth()) { Text("Manager area") }
        } else {
            Text(
                "You're set up as shop staff. Manager tools aren't available on your account.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Account tab — identity from the RECORD (sectioned rows, no card) + sign-out. */
@Composable
private fun AccountTab(operator: Operator, onSignOut: () -> Unit) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(operator.display, style = MaterialTheme.typography.titleLarge)
        IdentityRow("Role", roleLabel(operator))
        IdentityRow("Status", if (operator.status == OperatorStatus.ACTIVE) "Active" else "Disabled")
        IdentityRow("Shop", operator.shop?.name ?: "Not assigned yet")
        HorizontalDivider()
        TextButton(onClick = onSignOut) { Text("Sign out") }
    }
}

/** The manager-gated destination (014 carried forward) — the BACKEND gate decides. */
@Composable
private fun ManagerAreaTab(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel { ManagerViewModel(container.checkManagerAccess) }
    val gate by vm.gate.collectAsState()
    LaunchedEffect(Unit) { vm.checkManagerGate() }

    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Manager area", style = MaterialTheme.typography.headlineSmall)
        when (gate) {
            ManagerViewModel.Gate.CHECKING -> CircularProgressIndicator()
            ManagerViewModel.Gate.GRANTED -> Text(
                "You're a manager at an active shop. Shop-level tools will live here in a later slice.",
                style = MaterialTheme.typography.bodyLarge,
            )
            ManagerViewModel.Gate.DENIED -> Text(
                "You don't have access to this area.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
            )
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}

/** A navigable "coming soon" placeholder for a tab whose feature slice hasn't landed (FR-025). */
@Composable
private fun ComingSoonTab(title: String, subtitle: String) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Coming soon", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun IdentityRow(label: String, value: String) {
    Text("$label: $value", style = MaterialTheme.typography.bodyMedium)
}

private fun roleLabel(operator: Operator): String = when {
    operator.roles.isEmpty() -> "No role yet"
    operator.isManagerByRole -> "Shop manager"
    else -> "Shop staff"
}
