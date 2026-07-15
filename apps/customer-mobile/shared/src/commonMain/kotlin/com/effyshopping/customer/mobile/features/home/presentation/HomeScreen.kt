package com.effyshopping.customer.mobile.features.home.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.session.SessionState

/**
 * The guest home (013 US1, FR-002a). An HONEST empty state — the store is being stocked — with NO mock
 * products. Its job is to prove the shell, the design tokens, and dark mode; it is thin on purpose.
 *
 * The top bar carries the ONLY deferred sign-in demand (FR-002b): tapping "Account" as a guest raises
 * sign-in (returning to Account on success); as a signed-in customer it opens Account directly.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(container: AppContainer, session: SessionState) {
    val nav = container.navigator
    val signedIn = session is SessionState.Authenticated

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Effy") },
                actions = {
                    TextButton(onClick = {
                        if (signedIn) nav.push(AppRoute.Account)
                        else nav.push(AppRoute.SignIn(returnTo = AppRoute.Account))
                    }) { Text("Account") }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "We're stocking the shelves",
                    style = MaterialTheme.typography.headlineSmall,
                    textAlign = TextAlign.Center,
                )
                Text(
                    "Effy is almost ready. Come back soon — there'll be plenty to shop for.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
