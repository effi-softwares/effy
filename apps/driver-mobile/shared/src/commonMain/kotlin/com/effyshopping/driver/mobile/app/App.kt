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
import com.effyshopping.mobile.kit.live.LiveLifecycle
import com.effyshopping.driver.mobile.core.session.SessionState
import com.effyshopping.driver.mobile.core.theme.EffyTheme
import com.effyshopping.driver.mobile.core.theme.LocalEffyDark
import com.effyshopping.driver.mobile.features.auth.presentation.SignInFlow
import com.effyshopping.driver.mobile.features.onboarding.PermissionPrimingScreen
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
    // 092 — the launch intro, over everything, once per cold start (as the customer app). While it shows
    // it owns the status bar (light on the dark splash); after, the theme does. `remember`, not saved:
    // a rotation does not replay it, a new process does.
    var introDone by remember { mutableStateOf(false) }
    EffyTheme(mode = appearanceMode, onResolvedAppearance = { if (introDone) platformUiController.applyAppearance(it) }) {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()
        // 071 — hold the live channel exactly while in the foreground and signed in.
        LiveLifecycle(container.live, signedIn = session is SessionState.SignedIn)

        LaunchedEffect(Unit) {
            container.session.bootstrap()
            // Flush any writes queued while offline on a previous run (FR-040).
            runCatching { container.syncCoordinator.flush() }
        }
        // Backlog C6 — the moment the connection returns, send what is waiting and, if the app opened
        // offline, check the session for real. Before, queued writes waited for a refresh.
        LaunchedEffect(Unit) {
            container.connectivity.online.collect { online ->
                if (!online) return@collect
                container.session.recheckIfOffline()
                runCatching { container.syncCoordinator.flush() }
            }
        }

        androidx.compose.runtime.CompositionLocalProvider(
            com.effyshopping.driver.mobile.core.presentation.LocalReducedMotion provides platformState.reducedMotion,
        ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (val s = session) {
                // The launch intro covers this; it hands over only once the session is known.
                SessionState.Restoring -> Unit

                SessionState.SignedOut -> SignInFlow(container, reducedMotion = platformState.reducedMotion)

                SessionState.Refused -> com.effyshopping.driver.mobile.features.auth.presentation.RefusedScreen(
                    onSignOut = { scope.launch { container.session.signOutLocally() } },
                )

                is SessionState.SignedIn -> {
                    // One-time permission priming (FR-004), then the shell.
                    var primed by remember { mutableStateOf(container.hasPrimedPermissions()) }
                    if (!primed) {
                        PermissionPrimingScreen(firstName = s.driver.name.trim().substringBefore(' ').ifBlank { null }, onContinue = {
                            container.markPermissionsPrimed()
                            primed = true
                        })
                    } else {
                        DriverShell(container, s, mapLauncher, platformState.reducedMotion)
                    }
                }
            }
        }
        }
        if (!introDone) {
            DriverIntro(
                ready = session !is SessionState.Restoring,
                darkTheme = LocalEffyDark.current,
                reducedMotion = platformState.reducedMotion,
                onDarkGround = platformUiController::applyAppearance,
                onFinished = { introDone = true },
            )
        }
    }
}

