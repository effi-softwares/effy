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
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.shop.mobile.core.session.SessionState
import com.effyshopping.shop.mobile.core.platform.NoOpPlatformUiController
import com.effyshopping.shop.mobile.core.platform.PlatformUiController
import com.effyshopping.shop.mobile.core.theme.EffyTheme
import com.effyshopping.shop.mobile.features.auth.presentation.SignInFlow
import com.effyshopping.shop.mobile.features.shop.presentation.ShopShell
import kotlinx.coroutines.launch

/**
 * The app root (015). Login-first: a top-level **session gate** picks the graph — `Restoring` splash,
 * the sign-in flow when signed out (the ONLY public screen), a refusal message when barred, or the
 * adaptive [ShopShell] (bottom bar / navigation rail) when signed in. There is no guest; no operator
 * content is reachable without a session (FR-014/015). Back handling + per-tab history live inside the
 * shell, so session expiry anywhere unwinds cleanly by swapping this gate's branch.
 */
@Composable
fun App(
    container: AppContainer,
    platformUiController: PlatformUiController = NoOpPlatformUiController(),
) {
    val platformState by platformUiController.state.collectAsState()
    val appearanceMode by container.appearance.mode.collectAsState()
    EffyTheme(mode = appearanceMode, onResolvedAppearance = platformUiController::applyAppearance) {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) { container.session.bootstrap() }

        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            when (val s = session) {
                SessionState.Restoring -> Centered {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text("EFFY", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                        CircularProgressIndicator()
                        Text(
                            "Opening your workspace…",
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

                is SessionState.SignedIn -> SignedInEntry(platformState.reducedMotion) {
                    ShopShell(container, s, reducedMotion = platformState.reducedMotion)
                }
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}

@Composable
private fun SignedInEntry(reducedMotion: Boolean, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(if (reducedMotion) 0 else 180),
    )
    Surface(modifier = Modifier.fillMaxSize().alpha(alpha), color = MaterialTheme.colorScheme.background) {
        content()
    }
}
