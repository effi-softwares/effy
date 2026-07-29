package com.effyshopping.customer.mobile.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.core.storage.devicePreferences
import com.effyshopping.customer.mobile.core.theme.EffyTheme
import com.effyshopping.customer.mobile.features.onboarding.presentation.OnboardingScreen
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

        // FR-033. `remember` so the store is read once per process, not on every recomposition, and
        // `mutableStateOf` so dismissing the introduction re-renders into the shell immediately
        // rather than only on the next launch.
        val prefs = remember { devicePreferences() }
        var onboardingSeen by remember {
            mutableStateOf(prefs.getBoolean(PreferenceKeys.ONBOARDING_SEEN))
        }

        LaunchedEffect(Unit) { container.session.bootstrap() }

        // ⚠ THE COLOUR IS PAINTED EDGE-TO-EDGE; THE PADDING IS APPLIED INSIDE IT.
        //
        // These used to be the same modifier chain — `fillMaxSize().windowInsetsPadding(safeDrawing)`
        // on the `Surface` itself — and that is a different thing entirely: a Surface paints only the
        // area left after its own padding, so the status-bar strip and the gesture-bar strip were
        // never painted by the app at all. They fell through to the window background: Android's
        // `Theme.Material.NoActionBar` default (a mid grey) and, on iOS, the black UIWindow behind the
        // Compose layer. In light mode that reads as a barely-there seam; in dark mode it is a plainly
        // wrong-coloured band above and below the app.
        //
        // Splitting them keeps the layout identical — content is still inset by exactly `safeDrawing` —
        // while the ground extends under the system bars, which is the whole point of going
        // edge-to-edge in `MainActivity`.
        Surface(
            modifier = Modifier.fillMaxSize(),
            // ⚠ `EffySurface.page`, NOT `colorScheme.background`. The customer storefront's page is the
            // lightest ground and TILES carry the tint (see StorefrontKit), which is the inverse of the
            // console arrangement. Today both resolve to the same value, so this is about intent: if the
            // tokens diverge again, the storefront must follow `page`.
            color = EffySurface.page,
        ) {
            when (val s = session) {
                SessionState.Restoring -> Inset { CenteredMessage { CircularProgressIndicator() } }

                SessionState.Barred -> Inset { CenteredMessage {
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
                } }

                // Guest AND Authenticated both render the tab shell — the customer app is guest-first;
                // only gated tabs/actions defer to sign-in.
                //
                // ⚠ 026 FR-033: the first-launch introduction sits IN FRONT of the shell, not inside a
                // tab, and only until it has been seen once. It is deliberately NOT gated on session —
                // a returning signed-in customer on a fresh install still gets introduced, and a guest
                // who skipped it never sees it again. The flag is device-local and never syncs.
                is SessionState.Authenticated, SessionState.Guest ->
                    if (onboardingSeen) {
                        Inset { CustomerShell(container, s) }
                    } else {
                        // ⚠ DELIBERATELY NOT [Inset]. The introduction is a full-bleed photograph, and
                        // insetting it here stopped the image at the safe area — leaving a bar of page
                        // colour across the bottom that read as a rendering fault. It owns its insets
                        // instead, applying them to its text and actions and to nothing else.
                        OnboardingScreen(onDone = {
                            prefs.putBoolean(PreferenceKeys.ONBOARDING_SEEN, true)
                            onboardingSeen = true
                        })
                    }
            }
        }
    }
    }
}

/**
 * Hold content clear of the system bars.
 *
 * ⚠ Applied per BRANCH, not once around the whole tree, because one branch must not have it: a
 * full-bleed screen has to reach the physical edges, and the root `Surface` deliberately paints
 * beyond this padding so the bars carry the app's own ground either way.
 */
@Composable
private fun Inset(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) { content() }
}

@Composable
private fun CenteredMessage(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
