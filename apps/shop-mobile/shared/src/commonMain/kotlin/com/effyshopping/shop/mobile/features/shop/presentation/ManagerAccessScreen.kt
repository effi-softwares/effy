package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.core.ui.EffyInlineError
import com.effyshopping.shop.mobile.core.ui.EffyLoading
import com.effyshopping.shop.mobile.core.ui.EffyPage
import com.effyshopping.shop.mobile.core.ui.EffyPageTitle
import com.effyshopping.shop.mobile.core.ui.EffyTextAction
import com.effyshopping.shop.mobile.features.shop.domain.CheckManagerAccess
import com.effyshopping.shop.mobile.features.shop.domain.ManagerAccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ManagerViewModel(private val checkManagerAccess: CheckManagerAccess) : ViewModel() {
    enum class Gate { Checking, Granted, Denied }

    private val mutableGate = MutableStateFlow(Gate.Checking)
    val gate = mutableGate.asStateFlow()

    fun check() {
        mutableGate.value = Gate.Checking
        viewModelScope.launch {
            mutableGate.value = runCatching { checkManagerAccess() }.fold(
                onSuccess = { if (it == ManagerAccess.GRANTED) Gate.Granted else Gate.Denied },
                onFailure = { Gate.Denied },
            )
        }
    }
}

@Composable
fun ManagerAccessScreen(checkManagerAccess: CheckManagerAccess, onBack: () -> Unit) {
    val viewModel = viewModel { ManagerViewModel(checkManagerAccess) }
    val gate by viewModel.gate.collectAsState()
    LaunchedEffect(Unit) { viewModel.check() }

    EffyPage {
        EffyPageTitle("Manager area", "Access is verified for this shop every time.")
        when (gate) {
            ManagerViewModel.Gate.Checking -> EffyLoading("Checking access…")
            ManagerViewModel.Gate.Granted -> EffyPageTitle(
                "Access confirmed",
                "Manager tools will be added here as focused workflows.",
            )
            ManagerViewModel.Gate.Denied -> EffyInlineError("You don't have access to this area.")
        }
        EffyTextAction("Back", onBack)
    }
}
