package com.effyshopping.customer.mobile.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.nav.AppRoute
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.account.presentation.AccountRoutes
import com.effyshopping.customer.mobile.features.auth.presentation.AuthRoutes
import com.effyshopping.customer.mobile.features.cart.presentation.CartScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.HomeScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.ProductDetailScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.SearchScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.OrdersScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.ReceiptScreen
import com.effyshopping.customer.mobile.features.favorites.presentation.FavoritesScreen
import com.effyshopping.mobile.kit.shell.AdaptiveNavShell
import com.effyshopping.mobile.kit.shell.NavDestination
import com.effyshopping.mobile.kit.shell.NavGlyph
import com.effyshopping.mobile.kit.ui.AdaptiveContent

/** The customer app's primary tabs (015). Home/Search are PUBLIC; Orders/Account are AUTHENTICATED. */
enum class CustomerTab(val label: String) { HOME("Home"), SEARCH("Search"), ORDERS("Orders"), ACCOUNT("Account") }

/**
 * The guest-first customer shell (015 US1/US2). The tab graph renders for GUESTS — Home and Search need no
 * session. Orders/Account are visible but gated: tapping one as a guest raises **deferred sign-in** and,
 * on success, returns to the intended tab (return-to-intent, FR-010/011).
 *
 * The Account tab hosts the existing auth + account sub-graph, driven by the app's `AppNavigator` (its
 * per-tab back stack) — the substantial 013 auth/account screens are reused unchanged; the shared
 * [AdaptiveNavShell] + top-level session gate are layered around them.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun CustomerShell(container: AppContainer, session: SessionState) {
    var currentTabName by rememberSaveable { mutableStateOf(CustomerTab.HOME.name) }
    var pendingTabName by rememberSaveable { mutableStateOf<String?>(null) }
    // US2/US3: the Home tab's back stack (Home → Product → Cart → Checkout → Receipt), as a
    // delimiter-joined saveable String (survives config change / process death). A lightweight stand-in
    // for the mobile-kit TabBackStacks until that adoption. Routes: "home" | "product:<id>" | "cart" |
    // "checkout" | "receipt:<orderId>".
    // US5: the Orders tab's list↔detail selection.
    var ordersDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    var homeStackRaw by rememberSaveable { mutableStateOf("home") }
    val homeStack = homeStackRaw.split('\u0001')
    val homeTop = homeStack.last()
    fun pushHome(route: String) { homeStackRaw = "$homeStackRaw\u0001$route" }
    fun popHome() { if (homeStack.size > 1) homeStackRaw = homeStack.dropLast(1).joinToString("\u0001") }
    fun resetHome(route: String) { homeStackRaw = "home\u0001$route" }
    fun goHome() { homeStackRaw = "home" }

    val currentTab = CustomerTab.valueOf(currentTabName)
    val signedIn = session is SessionState.Authenticated

    // Return-to-intent: once a deferred sign-in completes, jump to the tab the guest originally wanted.
    LaunchedEffect(signedIn) {
        if (signedIn) pendingTabName?.let { currentTabName = it; pendingTabName = null }
    }

    val stack by container.navigator.stack.collectAsState()
    val accountCanGoBack = stack.size > 1
    val homeHasBack = currentTab == CustomerTab.HOME && homeStack.size > 1
    val ordersHasDetail = currentTab == CustomerTab.ORDERS && ordersDetailId != null
    BackHandler(
        enabled = homeHasBack || ordersHasDetail ||
            (currentTab == CustomerTab.ACCOUNT && accountCanGoBack) ||
            currentTab != CustomerTab.HOME,
    ) {
        when {
            homeHasBack -> popHome()
            ordersHasDetail -> ordersDetailId = null
            currentTab == CustomerTab.ACCOUNT && accountCanGoBack -> container.navigator.pop()
            else -> currentTabName = CustomerTab.HOME.name
        }
    }

    val destinations = CustomerTab.entries.map { tab ->
        NavDestination<CustomerTab>(tab = tab, label = tab.label, icon = { sel -> NavGlyph(tab.label, sel) })
    }

    val stateHolder = rememberSaveableStateHolder()
    AdaptiveNavShell(
        destinations = destinations,
        selectedTab = currentTab,
        onSelectTab = { currentTabName = it.name },
    ) {
        stateHolder.SaveableStateProvider(currentTabName) {
            when (currentTab) {
                CustomerTab.HOME -> {
                    val requireSignIn = {
                        // Deferred sign-in: jump to the Account tab's auth graph; the Home stack is kept
                        // so the customer returns to where they were via Back.
                        currentTabName = CustomerTab.ACCOUNT.name
                        container.navigator.push(AppRoute.SignIn())
                    }
                    val openFavorites = { if (signedIn) pushHome("favorites") else requireSignIn() }
                    when {
                        homeTop == "home" ->
                            HomeStackHost(container, onCart = { pushHome("cart") }, onFavorites = openFavorites) {
                                HomeScreen(container, onProductClick = { pushHome("product:$it") })
                            }

                        homeTop == "favorites" ->
                            FavoritesScreen(container, onOpen = { pushHome("product:$it") })

                        homeTop.startsWith("product:") ->
                            ProductDetailScreen(
                                container = container,
                                productId = homeTop.removePrefix("product:"),
                                session = session,
                                onRequireSignIn = requireSignIn,
                                onBack = { popHome() },
                            )

                        homeTop == "cart" ->
                            CartScreen(container, onCheckout = {
                                if (signedIn) pushHome("checkout") else requireSignIn()
                            })

                        homeTop == "checkout" ->
                            CheckoutScreen(
                                container = container,
                                onPlaced = { orderId -> resetHome("receipt:$orderId") },
                                onBack = { popHome() },
                            )

                        homeTop.startsWith("receipt:") ->
                            ReceiptScreen(container, homeTop.removePrefix("receipt:"), onDone = { goHome() })

                        else -> HomeScreen(container, onProductClick = { pushHome("product:$it") })
                    }
                }
                CustomerTab.SEARCH -> SearchScreen(container, onProductClick = {
                    // Open the product in the Home tab's stack (shared detail view).
                    pushHome("product:$it")
                    currentTabName = CustomerTab.HOME.name
                })
                CustomerTab.ORDERS -> if (signedIn) {
                    val detail = ordersDetailId
                    if (detail != null) {
                        ReceiptScreen(container, detail, onDone = { ordersDetailId = null })
                    } else {
                        OrdersScreen(container, onOpen = { ordersDetailId = it })
                    }
                } else {
                    GatedTab("Orders", "Sign in to see your orders.") {
                        pendingTabName = CustomerTab.ORDERS.name
                        currentTabName = CustomerTab.ACCOUNT.name
                        container.navigator.push(AppRoute.SignIn())
                    }
                }
                CustomerTab.ACCOUNT -> AccountTab(container, session)
            }
        }
    }
}

/** Wraps a Home-stack screen with a top cart affordance (the mobile analogue of the web header badge). */
@Composable
private fun HomeStackHost(
    container: AppContainer,
    onCart: () -> Unit,
    onFavorites: () -> Unit,
    content: @Composable () -> Unit,
) {
    val lines by container.guestCart.lines.collectAsState()
    val count = lines.sumOf { it.quantity }
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onFavorites) { Text("♥") }
            TextButton(onClick = onCart) { Text(if (count > 0) "Cart ($count)" else "Cart") }
        }
        Box(modifier = Modifier.weight(1f)) { content() }
    }
}

/** The Account tab: dispatches the auth/account sub-graph off the navigator (its own back stack). */
@Composable
private fun AccountTab(container: AppContainer, session: SessionState) {
    val stack by container.navigator.stack.collectAsState()
    when (val route = stack.last()) {
        AppRoute.Home ->
            if (session is SessionState.Authenticated) {
                AccountRoutes(container, AppRoute.Account, session) // signed in → the account screen
            } else {
                GuestAccountLanding(container) // guest → sign-in / create-account entry
            }

        is AppRoute.SignIn, AppRoute.SignUp, is AppRoute.VerifyOtp, AppRoute.Recovery ->
            AuthRoutes(container, route)

        AppRoute.Account, AppRoute.EditName, AppRoute.PasswordSet, AppRoute.PasswordChange ->
            AccountRoutes(container, route, session)
    }
}

/** Guest landing inside the Account tab — the deferred-sign-in entry (no card, DOCTRINE-2). */
@Composable
private fun GuestAccountLanding(container: AppContainer) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Your account", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Sign in to manage your profile and orders. You can keep browsing without an account.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = { container.navigator.push(AppRoute.SignIn()) }, modifier = Modifier.fillMaxWidth()) {
            Text("Sign in")
        }
        TextButton(onClick = { container.navigator.push(AppRoute.SignUp) }) { Text("Create an account") }
    }
}

/** A gated tab a guest can see but not use — the tap raises deferred sign-in. */
@Composable
private fun GatedTab(title: String, message: String, onSignIn: () -> Unit) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onSignIn, modifier = Modifier.fillMaxWidth()) { Text("Sign in") }
    }
}

/** A navigable "coming soon" placeholder for a tab whose feature slice hasn't landed (FR-025). */
@Composable
private fun ComingSoonTab(title: String, subtitle: String) {
    AdaptiveContent(
        modifier = Modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Coming soon", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    }
}
