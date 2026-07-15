package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.nav.AppRoute
import com.effyshopping.shop.mobile.core.session.SessionManager
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.core.ui.AdaptiveContent
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import com.effyshopping.shop.mobile.features.shop.domain.OperatorStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The home shell's own ViewModel — one screen, one responsibility (its only action is sign-out). */
class HomeViewModel(private val session: SessionManager) : ViewModel() {
    fun signOut() = viewModelScope.launch { session.signOutLocally() }
}

/** The manager-area ViewModel — owns the gate decision, and nothing else. */
class ManagerViewModel(private val checkManagerAccess: CheckManagerAccess) : ViewModel() {
    enum class Gate { CHECKING, GRANTED, DENIED }

    private val _gate = MutableStateFlow(Gate.CHECKING)
    val gate = _gate.asStateFlow()

    /** THE authorization decision (FR-023): the BACKEND gate, called even though the role passed. */
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

/** The role-aware shell (014 US3/US4). Identity from the RECORD; manager entry hidden from non-managers. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(container: AppContainer, session: SessionState.SignedIn) {
    val vm = viewModel { HomeViewModel(container.session) }
    val operator = session.operator
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Effy Shop") },
                actions = { TextButton(onClick = vm::signOut) { Text("Sign out") } },
            )
        },
    ) { padding ->
        // Tablet-first (FR-003a): identity reads as a bounded card on a tablet, full-width on a phone.
        AdaptiveContent(
            modifier = Modifier.padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(operator.display, style = MaterialTheme.typography.titleLarge)
            IdentityRow("Role", roleLabel(operator))
            IdentityRow("Status", if (operator.status == OperatorStatus.ACTIVE) "Active" else "Disabled")
            IdentityRow("Shop", operator.shop?.name ?: "Not assigned yet")   // null = expected (FR-021)

            HorizontalDivider()
            // Role-aware UI (FR-022): the manager entry is a COURTESY, hidden from non-managers.
            // Whether it's actually allowed is decided by the gate on the next screen — NOT here.
            if (operator.isManagerByRole) {
                Button(onClick = { container.navigator.push(AppRoute.ManagerArea) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Manager area")
                }
            } else {
                Text(
                    "You're set up as shop staff. Manager tools aren't available on your account.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** The manager-gated destination (014 US4). The BACKEND gate decides — the hidden control was only UX. */
@Composable
fun ManagerAreaScreen(container: AppContainer, session: SessionState.SignedIn) {
    val vm = viewModel { ManagerViewModel(container.checkManagerAccess) }
    val gate by vm.gate.collectAsState()
    // The gate check is a lifecycle-safe effect, not a side-effect in composition — it runs once on entry.
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
            // ONE uniform denial for any 403 (FR-025) — it never says which of role/status/shop failed.
            ManagerViewModel.Gate.DENIED -> Text(
                "You don't have access to this area.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error,
            )
        }
        TextButton(onClick = { container.navigator.pop() }) { Text("Back") }
    }
}

@Composable
private fun IdentityRow(label: String, value: String) {
    Text("$label: $value", style = MaterialTheme.typography.bodyMedium)
}

private fun roleLabel(operator: Operator): String = when {
    operator.roles.isEmpty() -> "No role yet"                // expected in-progress state (FR-021)
    operator.isManagerByRole -> "Shop manager"
    else -> "Shop staff"
}
