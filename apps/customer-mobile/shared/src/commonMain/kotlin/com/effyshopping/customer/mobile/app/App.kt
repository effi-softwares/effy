package com.effyshopping.customer.mobile.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.backhandler.BackHandler
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.theme.EffyTheme
import com.effyshopping.customer.mobile.features.account.presentation.AccountRoutes
import com.effyshopping.customer.mobile.features.auth.presentation.AuthRoutes
import com.effyshopping.customer.mobile.features.home.presentation.HomeScreen
import kotlinx.coroutines.launch

/**
 * The app root (013). Renders by [SessionState] first (Restoring / Barred / everything-else), then by
 * the navigator's top route. `Restoring` is its own screen so the guest home never flickers in before
 * a signed-in session resolves (data-model § 4).
 */
@Composable
fun App(container: AppContainer) {
    EffyTheme {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) { container.session.bootstrap() }

        Surface(
            // Edge-to-edge is enabled (MainActivity), so consume the safe-area insets HERE — the
            // non-Scaffold auth/account screens would otherwise draw under the status/navigation bars,
            // clipping titles and putting primary buttons under the gesture bar (Principle V, fat-finger).
            modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
            color = MaterialTheme.colorScheme.background,
        ) {
            when (session) {
                SessionState.Restoring -> CenteredMessage { CircularProgressIndicator() }

                SessionState.Barred -> CenteredMessage {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("This account can't be used", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Please contact support if you think this is a mistake.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        androidx.compose.material3.TextButton(
                            onClick = { scope.launch { container.session.signOutLocally() } },
                            modifier = Modifier.padding(top = 16.dp),
                        ) { Text("Sign out") }
                    }
                }

                else -> RouteHost(container, session)
            }
        }
    }
}

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
private fun RouteHost(container: AppContainer, session: SessionState) {
    val stack by container.navigator.stack.collectAsState()
    // Wire the OS back gesture/button to our own back stack — otherwise system Back finishes the
    // Activity and ejects the user from the app instead of popping a screen.
    BackHandler(enabled = stack.size > 1) { container.navigator.pop() }
    when (val route = stack.last()) {
        AppRoute.Home -> HomeScreen(container, session)
        is AppRoute.SignIn, AppRoute.SignUp, is AppRoute.VerifyOtp, AppRoute.Recovery ->
            AuthRoutes(container, route)
        AppRoute.Account, AppRoute.EditName, AppRoute.PasswordSet, AppRoute.PasswordChange ->
            AccountRoutes(container, route, session)
    }
}

@Composable
private fun CenteredMessage(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
