package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.platform.phoneInDarkMode
import com.effyshopping.customer.mobile.core.platform.StatusBarIcons
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.lucide_wifi_off
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyIconChip
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import coil3.SingletonImageLoader
import com.effyshopping.mobile.kit.live.LiveLifecycle
import com.effyshopping.customer.mobile.core.image.newImageLoader
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.observability.AnalyticsConsentBanner
import com.effyshopping.customer.mobile.core.observability.ConsentState
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.platformMotionLevel
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.core.storage.devicePreferences
import com.effyshopping.customer.mobile.core.theme.EffyTheme
import com.effyshopping.customer.mobile.features.onboarding.presentation.OnboardingScreen
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import kotlinx.coroutines.launch
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.backhandler.BackHandler
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.core.config.AppConfig
import com.effyshopping.customer.mobile.core.platform.platformTag
import com.effyshopping.customer.mobile.core.presentation.EffySnackbarHost
import com.effyshopping.customer.mobile.features.appupdate.AppUpdateLaunchSurface
import com.effyshopping.customer.mobile.features.appupdate.AppUpdateViewModel
import com.effyshopping.customer.mobile.features.appupdate.MandatoryUpdateScreen
import com.effyshopping.customer.mobile.features.appupdate.UpdateDownloadedBar
import com.effyshopping.customer.mobile.features.appupdate.UpdateSheet
import com.effyshopping.mobile.kit.update.FlexibleDownload
import com.effyshopping.mobile.kit.update.GateState

/**
 * The app root. A top-level **session gate** picks the graph: `Restoring` splash, `Unreachable` (signed in,
 * record unreadable), a `Barred` refusal, or - for both a guest and a signed-in customer - the guest-first [CustomerShell] (adaptive
 * bottom bar / navigation rail over Home · Search · Orders · Account). `Restoring` is its own screen so
 * the guest home never flickers in before a signed-in session resolves.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class) // BackHandler (121: the mandatory screen)
@Composable
fun App(container: AppContainer) {
    // Register the app's Coil ImageLoader (cancellation-safe engine) once, during composition - before
    // any AsyncImage loads - so scrolling a list of product images can't crash the app (019 scroll fix).
    remember { SingletonImageLoader.setSafe { ctx -> newImageLoader(ctx) }; true }

    // 025 FR-037 / T073: read the device's reduced-motion preference once and publish it to every
    // screen below. Provided outside EffyTheme so the value is in force for the theme's own
    // transitions too.
    // Light, Dark or Match my phone (Account → Appearance).
    val appearance by container.appearance.collectAsState()
    val dark = appearance.resolveDark(phoneInDarkMode())

    CompositionLocalProvider(LocalMotionLevel provides platformMotionLevel()) {
    EffyTheme(dark = dark) {
        val session by container.session.state.collectAsState()
        // Hold the live channel exactly while in the foreground and signed in. A guest holds none.
        LiveLifecycle(container.live, signedIn = session is SessionState.Authenticated)
        val scope = rememberCoroutineScope()

        // 121: the launch gate - before Home, and before sign-in and the introduction, so guests are covered. Below the
        // session bootstrap above, which keeps running. The intro waits for its answer (at most 1.5 s).
        val updates = viewModel { AppUpdateViewModel(container.appUpdateGate, container.analyticsDriver, platformTag()) }
        val updateState by updates.state.collectAsState()
        val updateOffered by updates.updateOffered.collectAsState()
        val download by updates.download.collectAsState()
        val updateBar = remember { SnackbarHostState() }
        // Back on screen re-checks (FR-005); the first ON_START is the launch itself.
        var startedOnce by remember { mutableStateOf(false) }
        LifecycleEventEffect(Lifecycle.Event.ON_START) { if (startedOnce) updates.onForeground() else startedOnce = true }
        // The mandatory screen never pops to what is behind it: back leaves the app.
        BackHandler(enabled = updateState == GateState.Mandatory) { updates.leaveApp() }

        // FR-033. `remember` so the store is read once per process, not on every recomposition, and
        // `mutableStateOf` so dismissing the introduction re-renders into the shell immediately
        // rather than only on the next launch.
        val prefs = remember { devicePreferences() }
        var onboardingSeen by remember {
            mutableStateOf(prefs.getBoolean(PreferenceKeys.ONBOARDING_SEEN))
        }

        // The analytics-consent choice. `mutableStateOf` so accepting/declining re-renders
        // the shell (dismissing the banner) immediately, not only on the next launch.
        var consent by remember { mutableStateOf(container.analyticsConsent()) }

        LaunchedEffect(Unit) {
            container.session.bootstrap()
            // Seed the delivery location from the account's default address on sign-in, and
            // drop an account-derived one on sign-out. Started here rather than from a screen - in a
            // screen it would never run if the shopper's first stop is another tab, and would re-run
            // on every recomposition.
        }

        // The colour is painted edge-to-edge and the padding applied inside it: a Surface paints only the area
        // left after its own padding, so padding the Surface left the status and gesture bars to the window
        // background (grey on Android, black on iOS).
        Surface(
            modifier = Modifier.fillMaxSize(),
            // `EffySurface.page`, not `colorScheme.background`. The customer storefront's page is the
            // lightest ground and tiles carry the tint (see StorefrontKit), which is the inverse of the
            // console arrangement. Today both resolve to the same value, so this is about intent: if the
            // tokens diverge again, the storefront must follow `page`.
            color = EffySurface.page,
        ) {
          Box(modifier = Modifier.fillMaxSize()) {
            when (updateState) {
                GateState.Mandatory -> Inset {
                    MandatoryUpdateScreen(
                        updateOffered = updateOffered,
                        webSiteHost = AppConfig.webSiteHost,
                        onUpdate = updates::updateNow,
                        onWebsite = updates::chooseWebsite,
                    )
                }
                // Before Home: the launch screen's mark, with the sheet over it (FR-011). Home opens on Later.
                GateState.Optional, is GateState.Notice -> {
                    Inset { AppUpdateLaunchSurface() }
                    UpdateSheet(updateOffered = updateOffered, onUpdate = updates::updateNow, onLater = updates::later)
                }
                // Under the launch intro, which waits for the answer.
                GateState.Checking -> Inset { AppUpdateLaunchSurface() }
                GateState.Passed -> when (val s = session) {
                SessionState.Restoring -> Inset { CenteredMessage { EffyWordmark(size = 40.sp) } }

                SessionState.Unreachable -> Inset { UnreachableScreen(container) }

                SessionState.Barred -> Inset { CenteredMessage {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        EffyIconChip(Res.drawable.lucide_lock)
                        Text("This account can't be used", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp))
                        Text(
                            "Please contact support if you think this is a mistake.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        EffyGhostButton("Sign out", onClick = { scope.launch { container.session.signOutLocally() } }, modifier = Modifier.padding(top = 16.dp))
                    }
                } }

                // The way back, and the only exception to "a closing account is
                // refused everywhere".
                //
                // Restore is an explicit act, never inferred from signing in: the refusal and the
                // restore run through the same identity lookup, so an implicit restore would have the
                // gate refuse the very request meant to undo the deletion - and anyone holding this
                // customer's token would silently un-delete their account merely by opening the app.
                // Signing in surfaces the choice; this screen makes it.
                SessionState.Closing -> Inset { CenteredMessage {
                    var working by remember { mutableStateOf(false) }
                    // 113: null, or what to say - the server's refusal words when the deletion date has passed.
                    var failed by remember { mutableStateOf<String?>(null) }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "Your account is scheduled for deletion",
                            style = MaterialTheme.typography.titleLarge,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            "You can still change your mind. Restoring brings back your account, " +
                                "your saved items and your addresses.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                        failed?.let { EffyInlineError(it, modifier = Modifier.padding(top = 8.dp)) }
                        EffyPrimaryButton(
                            label = "Restore my account",
                            enabled = !working,
                            onClick = {
                                working = true
                                failed = null
                                scope.launch {
                                    val outcome = runCatching { container.restoreAccount.invoke() }
                                    val ok = outcome.isSuccess
                                    if (ok) {
                                        // Re-read the record so the shell renders the live account
                                        // rather than a stale local guess.
                                        runCatching { container.session.refreshRecord() }
                                    } else {
                                        failed = ((outcome.exceptionOrNull() as? AppException)?.error as? AppError.Validation)?.message
                                            ?: "We couldn't restore it just now. Please try again."
                                    }
                                    working = false
                                }
                            },
                            modifier = Modifier.padding(top = 16.dp),
                        )
                        EffyGhostButton("Sign out", onClick = { scope.launch { container.session.signOutLocally() } }, modifier = Modifier.padding(top = 8.dp))
                    }
                } }

                // Guest and Authenticated both render the tab shell - the customer app is guest-first;
                // only gated tabs/actions defer to sign-in.
                //
                // The first-launch introduction sits in front of the shell, not inside a
                // tab, and only until it has been seen once. It is deliberately not gated on session
                // a returning signed-in customer on a fresh install still gets introduced, and a guest
                // who skipped it never sees it again. The flag is device-local and never syncs.
                is SessionState.Authenticated, SessionState.Guest ->
                    if (onboardingSeen) {
                        // The shell, with the analytics-consent banner overlaid at the
                        // bottom only while the choice is unknown (non-blocking; the app is fully usable
                        // behind it). Accept loads analytics; decline records the refusal. No SDK loads
                        // until accept (Principle VII). Shown after onboarding so the two don't stack.
                        Box(modifier = Modifier.fillMaxSize()) {
                            Inset { CustomerShell(container, s) }
                            if (consent == ConsentState.UNKNOWN) {
                                AnalyticsConsentBanner(
                                    onAccept = { container.setAnalyticsConsent(true); consent = ConsentState.GRANTED },
                                    onDecline = { container.setAnalyticsConsent(false); consent = ConsentState.DENIED },
                                    modifier = Modifier
                                        .align(Alignment.BottomCenter)
                                        .windowInsetsPadding(WindowInsets.safeDrawing),
                                )
                            }
                        }
                    } else {
                        // Deliberately not [Inset]. The introduction is a full-bleed photograph, and
                        // insetting it here stopped the image at the safe area - leaving a bar of page
                        // colour across the bottom that read as a rendering fault. It owns its insets
                        // instead, applying them to its text and actions and to nothing else.
                        OnboardingScreen(onDone = {
                            prefs.putBoolean(PreferenceKeys.ONBOARDING_SEEN, true)
                            onboardingSeen = true
                        })
                    }
            }
            }
            // 121: Play's background download is ready - on whatever screen is showing.
            if (download == FlexibleDownload.Downloaded) UpdateDownloadedBar(updateBar, onRestart = updates::restart)
            EffySnackbarHost(
                updateBar,
                modifier = Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing),
            )
          }
        }

        // The launch intro, over everything, once per cold start: the native splash's "e." grows
        // into "effy." and hands over to the app once the session is known. Not saved across
        // configuration changes on purpose - `remember`, so a rotation does not replay it, but a new
        // process does.
        var introDone by remember { mutableStateOf(false) }
        // The status-bar icons follow the appearance (light icons on the dark theme); the intro sets
        // them itself while it is showing.
        if (introDone) StatusBarIcons(lightIcons = dark)
        if (!introDone) {
            EffyIntro(
                ready = session !is SessionState.Restoring && updateState != GateState.Checking,
                darkTheme = dark,
                onFinished = { introDone = true },
            )
        }
    }
    }
}

/**
 * Signed in, and the record cannot be read. Retries on Try again and whenever the shopper comes back to
 * the app, which is when the connection has usually returned; never on a timer (071). Sign out stays
 * offered, as on every other gate, so a session that can never produce a token again is not a dead end.
 */
@Composable
private fun UnreachableScreen(container: AppContainer) {
    val scope = rememberCoroutineScope()
    var working by remember { mutableStateOf(false) }
    fun retry() {
        if (working) return
        working = true
        scope.launch {
            container.session.retry()
            working = false
        }
    }

    // ON_RESUME is replayed the moment this is composed, which is straight after a read has just failed.
    var settled by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { if (settled) retry() else settled = true }

    CenteredMessage {
        EffyIconChip(Res.drawable.lucide_wifi_off)
        Text(
            "We can't reach Effy right now",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            "You're still signed in. Check your connection and try again.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        EffyPrimaryButton(
            label = "Try again",
            onClick = ::retry,
            loading = working,
            enabled = !working,
            modifier = Modifier.padding(top = 16.dp),
        )
        EffyGhostButton(
            "Sign out",
            onClick = { scope.launch { container.session.signOutLocally() } },
            enabled = !working,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

/**
 * Hold content clear of the system bars.
 *
 * Applied per branch, not once around the whole tree, because one branch must not have it: a
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
