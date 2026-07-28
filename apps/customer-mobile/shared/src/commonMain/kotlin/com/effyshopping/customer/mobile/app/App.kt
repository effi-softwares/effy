package com.effyshopping.customer.mobile.app

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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import coil3.SingletonImageLoader
import com.effyshopping.customer.mobile.core.image.newImageLoader
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.platformMotionLevel
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.theme.EffyTheme
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import kotlinx.coroutines.launch

/**
 * The app root (015). A top-level **session gate** picks the graph: `Restoring` splash, a `Barred`
 * refusal, or — for both a guest and a signed-in customer — the guest-first [CustomerShell] (adaptive
 * bottom bar / navigation rail over Home · Search · Orders · Account). `Restoring` is its own screen so
 * the guest home never flickers in before a signed-in session resolves.
 */
@Composable
fun App(container: AppContainer) {
    // Register the app's Coil ImageLoader (cancellation-safe engine) ONCE, during composition — before
    // any AsyncImage loads — so scrolling a list of product images can't crash the app (019 scroll fix).
    remember { SingletonImageLoader.setSafe { ctx -> newImageLoader(ctx) }; true }

    // 025 FR-037 / T073: read the device's reduced-motion preference ONCE and publish it to every
    // screen below. Provided outside EffyTheme so the value is in force for the theme's own
    // transitions too.
    CompositionLocalProvider(LocalMotionLevel provides platformMotionLevel()) {
    EffyTheme {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()

        LaunchedEffect(Unit) { container.session.bootstrap() }

        Surface(
            modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing),
            // ⚠ `EffySurface.page`, NOT `colorScheme.background`.
            //
            // The generated scheme maps `background` to #EFEFF1 and `card` to white — the console
            // arrangement. The customer storefront inverts it (see StorefrontKit): the page is white
            // and TILES carry the tint. Painting the root `background` here is what put every screen
            // in this app on grey while the web storefront sat on white.
            color = EffySurface.page,
        ) {
            when (val s = session) {
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
                        TextButton(
                            onClick = { scope.launch { container.session.signOutLocally() } },
                            modifier = Modifier.padding(top = 16.dp),
                        ) { Text("Sign out") }
                    }
                }

                // Guest AND Authenticated both render the tab shell — the customer app is guest-first;
                // only gated tabs/actions defer to sign-in.
                is SessionState.Authenticated, SessionState.Guest -> CustomerShell(container, s)
            }
        }
    }
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
