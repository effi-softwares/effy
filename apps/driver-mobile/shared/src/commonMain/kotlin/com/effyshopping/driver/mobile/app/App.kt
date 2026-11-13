package com.effyshopping.driver.mobile.app

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.backhandler.BackHandler
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.driver.mobile.core.config.AppConfig
import com.effyshopping.driver.mobile.core.platform.platformTag
import com.effyshopping.driver.mobile.core.presentation.DriverSnack
import com.effyshopping.driver.mobile.core.presentation.DriverSnackbar
import com.effyshopping.driver.mobile.features.appupdate.AppUpdateLaunchSurface
import com.effyshopping.driver.mobile.features.appupdate.AppUpdateViewModel
import com.effyshopping.driver.mobile.features.appupdate.AppUpdateWords
import com.effyshopping.driver.mobile.features.appupdate.MandatoryUpdateScreen
import com.effyshopping.driver.mobile.features.appupdate.UpdateSheet
import com.effyshopping.mobile.kit.update.FlexibleDownload
import com.effyshopping.mobile.kit.update.GateState
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
import com.effyshopping.driver.mobile.core.platform.rememberSetAppBadge
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
 * The driver app root. Login-first: a top-level session gate picks the graph - `Restoring` splash,
 * the sign-in flow when signed out (the only public screen), a refusal message when barred/unprovisioned,
 * or the adaptive [DriverShell] when signed in. No guest; no driver content without a session.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class) // BackHandler (121: the mandatory screen)
@Composable
fun App(
    container: AppContainer,
    platformUiController: PlatformUiController = NoOpPlatformUiController(),
    mapLauncher: MapLauncher = NoOpMapLauncher(),
) {
    val platformState by platformUiController.state.collectAsState()
    val appearanceMode by container.appearance.mode.collectAsState()
    // The launch intro, over everything, once per cold start (as the customer app). While it shows
    // it owns the status bar (light on the dark splash); after, the theme does. `remember`, not saved:
    // a rotation does not replay it, a new process does.
    var introDone by remember { mutableStateOf(false) }
    EffyTheme(mode = appearanceMode, onResolvedAppearance = { if (introDone) platformUiController.applyAppearance(it) }) {
        val session by container.session.state.collectAsState()
        val scope = rememberCoroutineScope()
        // Hold the live channel exactly while in the foreground and signed in.
        LiveLifecycle(container.live, signedIn = session is SessionState.SignedIn)
        // 116 FR-016: signing out clears the icon (a change from signed in, never a cold start's first state).
        val setAppBadge = rememberSetAppBadge()
        var badgeWasSignedIn by remember { mutableStateOf(false) }
        LaunchedEffect(session) {
            if (session is SessionState.SignedIn) badgeWasSignedIn = true
            else if (session == SessionState.SignedOut && badgeWasSignedIn) {
                badgeWasSignedIn = false
                setAppBadge(0)
            }
        }

        // 109 FR-014: a notification tapped while nobody is signed in is held (in memory only) for the shell to check
        // with the server after sign-in; a barred driver's is dropped. Signed in, DriverShell opens it directly.
        val opened by container.openedNotification.collectAsState()

        // 121: the launch gate - before sign-in and the shell. ⚠ BELOW the root effects above that flush the offline
        // queue, which keep running under the mandatory screen: work recorded without signal is never held back.
        val updates = viewModel { AppUpdateViewModel(container.appUpdateGate, container.analyticsDriver, platformTag()) }
        val updateState by updates.state.collectAsState()
        val updateOffered by updates.updateOffered.collectAsState()
        val download by updates.download.collectAsState()
        val updateBusy by updates.busy.collectAsState()
        // Back on screen re-checks (FR-005); the first ON_START is the launch itself.
        var startedOnce by remember { mutableStateOf(false) }
        LifecycleEventEffect(Lifecycle.Event.ON_START) { if (startedOnce) updates.onForeground() else startedOnce = true }
        // The mandatory screen never pops to what is behind it: back leaves the app.
        BackHandler(enabled = updateState == GateState.Mandatory) { updates.leaveApp() }
        LaunchedEffect(session, opened) {
            val tapped = opened ?: return@LaunchedEffect
            when (session) {
                SessionState.SignedOut -> {
                    container.openedNotification.value = null
                    container.pendingOpen.value = tapped
                }
                SessionState.Refused -> {
                    container.openedNotification.value = null
                    container.pendingOpen.value = null
                }
                else -> Unit
            }
        }

        LaunchedEffect(Unit) {
            container.session.bootstrap()
            // Flush any writes queued while offline on a previous run.
            runCatching { container.syncCoordinator.flush() }
        }
        // Backlog C6 - the moment the connection returns, send what is waiting and, if the app opened
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
          Box(modifier = Modifier.fillMaxSize()) {
            when (updateState) {
                GateState.Mandatory -> MandatoryUpdateScreen(
                    updateOffered = updateOffered,
                    busy = updateBusy,
                    version = AppConfig.appVersion,
                    build = updates.build,
                    dispatchPhone = AppConfig.dispatchPhone,
                    onUpdate = updates::updateNow,
                    onCallDispatch = { phone ->
                        updates.chooseCallDispatch()
                        mapLauncher.dial(phone)
                    },
                )
                // Under the launch intro, which waits for the answer.
                GateState.Checking -> AppUpdateLaunchSurface()
                // The app itself - with the update sheet over it when one applies (FR-011).
                GateState.Passed, GateState.Optional, is GateState.Notice -> when (val s = session) {
                // The launch intro covers this; it hands over only once the session is known.
                SessionState.Restoring -> Unit

                SessionState.SignedOut -> SignInFlow(container, reducedMotion = platformState.reducedMotion)

                SessionState.Refused -> com.effyshopping.driver.mobile.features.auth.presentation.RefusedScreen(
                    onSignOut = { scope.launch { container.session.signOutLocally() } },
                )

                is SessionState.SignedIn -> {
                    // One-time permission priming, then the shell.
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
            if (updateState == GateState.Optional || updateState is GateState.Notice) {
                UpdateSheet(notice = updateState is GateState.Notice, updateOffered = updateOffered, busy = updateBusy, onUpdate = updates::updateNow, onLater = updates::later)
            }
            // 121: Play's background download is ready - on whatever screen is showing, until Restart.
            DriverSnackbar(
                snack = if (download == FlexibleDownload.Downloaded) {
                    DriverSnack(AppUpdateWords.DOWNLOADED, DriverSnack.Kind.Info, AppUpdateWords.RESTART, updates::restart)
                } else {
                    null
                },
                onDismiss = {},
                durationMillis = Long.MAX_VALUE,
                modifier = Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing),
            )
          }
        }
        }
        if (!introDone) {
            DriverIntro(
                ready = session !is SessionState.Restoring && updateState != GateState.Checking,
                darkTheme = LocalEffyDark.current,
                reducedMotion = platformState.reducedMotion,
                onDarkGround = platformUiController::applyAppearance,
                onFinished = { introDone = true },
            )
        }
    }
}

