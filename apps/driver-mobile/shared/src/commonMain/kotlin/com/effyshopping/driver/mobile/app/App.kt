package com.effyshopping.driver.mobile.app

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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.MapLauncher
import com.effyshopping.driver.mobile.core.platform.NoOpMapLauncher
import com.effyshopping.driver.mobile.core.platform.NoOpPlatformUiController
import com.effyshopping.driver.mobile.core.platform.PlatformUiController
import com.effyshopping.driver.mobile.core.session.SessionState
import com.effyshopping.driver.mobile.core.theme.EffyTheme
import com.effyshopping.driver.mobile.features.auth.presentation.SignInFlow
import kotlinx.coroutines.launch

/**
 * The driver app root (049). Login-first: a top-level session gate picks the graph — `Restoring` splash,
 * the sign-in flow when signed out (the ONLY public screen), a refusal message when barred/unprovisioned,
 * or the adaptive [DriverShell] when signed in. No guest; no driver content without a session.
 */
@Composable
fun App(
    container: AppContainer,
    platformUiController: PlatformUiController = NoOpPlatformUiController(),
    mapLauncher: MapLauncher = NoOpMapLauncher(),
) {
    val platformState by platformUiController.state.collectAsState()
    val appearanceMode by container.appearance.mode.collectAsState()
    EffyTheme(mode = appearanceMode, onResolvedAppearance = platformUiController::applyAppearance) {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) { container.session.bootstrap() }

        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (val s = session) {
                SessionState.Restoring -> Centered {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text("EFFY", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                        CircularProgressIndicator()
                        Text(
                            "Starting your shift…",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                SessionState.SignedOut -> SignInFlow(container, reducedMotion = platformState.reducedMotion)

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

                is SessionState.SignedIn -> DriverShell(container, s, mapLauncher)
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
