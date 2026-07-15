package com.effyshopping.shop.mobile.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.shop.mobile.core.nav.AppRoute
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.core.theme.EffyTheme
import com.effyshopping.shop.mobile.features.auth.presentation.SignInFlow
import com.effyshopping.shop.mobile.features.shop.presentation.HomeScreen
import com.effyshopping.shop.mobile.features.shop.presentation.ManagerAreaScreen
import kotlinx.coroutines.launch

/**
 * The app root (014). Login-first: it renders by [SessionState] — there is no guest. `Restoring` is its
 * own screen so the sign-in form never flickers in before a remembered session resolves.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun App(container: AppContainer) {
    EffyTheme {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) { container.session.bootstrap() }

        Surface(
            modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
            color = MaterialTheme.colorScheme.background,
        ) {
            when (val s = session) {
                SessionState.Restoring -> Centered { CircularProgressIndicator() }

                SessionState.SignedOut -> {
                    // Reset the back stack while signed out, so the NEXT sign-in always starts at Home —
                    // a route from a previous session (e.g. ManagerArea) can never survive into it.
                    LaunchedEffect(Unit) { container.navigator.resetTo(AppRoute.Home) }
                    SignInFlow(container)
                }

                SessionState.Refused -> Centered {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("This account can't be used", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "Please contact your administrator if you think this is a mistake.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        TextButton(
                            onClick = { scope.launch { container.session.signOutLocally() } },
                            modifier = Modifier.padding(top = 16.dp),
                        ) { Text("Sign out") }
                    }
                }

                is SessionState.SignedIn -> {
                    val stack by container.navigator.stack.collectAsState()
                    BackHandler(enabled = stack.size > 1) { container.navigator.pop() }
                    when (stack.last()) {
                        AppRoute.Home -> HomeScreen(container, s)
                        AppRoute.ManagerArea -> ManagerAreaScreen(container, s)
                    }
                }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
