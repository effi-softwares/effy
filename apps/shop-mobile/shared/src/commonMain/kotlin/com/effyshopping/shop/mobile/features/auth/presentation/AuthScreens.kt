package com.effyshopping.shop.mobile.features.auth.presentation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.app.AppContainer

/** Composition wiring only: the ViewModel receives explicit use cases and the session authority. */
@Composable
fun SignInFlow(container: AppContainer, reducedMotion: Boolean = false) {
    val viewModel = viewModel {
        AuthViewModel(
            requestSignInCode = container.requestSignInCode,
            confirmSignIn = container.confirmSignIn,
            session = container.session,
        )
    }
    val state by viewModel.state.collectAsState()
    SignInScreen(
        state = state,
        onEmailChange = viewModel::onEmailChange,
        onCodeChange = viewModel::onCodeChange,
        onPrimaryAction = {
            when (state.stage) {
                AuthStage.Email -> viewModel.sendCode()
                AuthStage.Code -> viewModel.submitCode()
            }
        },
        onResend = viewModel::resendCode,
        onDifferentEmail = viewModel::backToEmail,
        onBack = viewModel::onBack,
        reducedMotion = reducedMotion,
    )
}
