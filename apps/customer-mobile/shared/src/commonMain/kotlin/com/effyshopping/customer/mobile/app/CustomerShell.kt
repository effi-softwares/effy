package com.effyshopping.customer.mobile.app

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.backhandler.BackHandler
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import com.effyshopping.customer.mobile.core.nav.CUSTOMER_TAB_ROOTS
import com.effyshopping.customer.mobile.core.nav.rememberBackAffordanceDecorator
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.nav.rememberCustomerNavState
import com.effyshopping.customer.mobile.core.session.SessionState
import com.effyshopping.customer.mobile.features.account.presentation.AccountRoutes
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressBookScreen
import com.effyshopping.customer.mobile.features.auth.presentation.AuthRoutes
import com.effyshopping.customer.mobile.features.cart.presentation.CartScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.HomeScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.ProductDetailScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.SearchScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.OrdersScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.ReceiptScreen
import com.effyshopping.customer.mobile.features.favorites.presentation.FavoritesScreen
import com.effyshopping.customer.mobile.features.help.presentation.CustomerServiceScreen
import com.effyshopping.customer.mobile.features.help.presentation.FaqsScreen
import com.effyshopping.customer.mobile.features.help.presentation.HelpCenterScreen
import com.effyshopping.customer.mobile.features.notifications.presentation.NotificationsScreen
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_account_outlined
import com.effyshopping.customer.mobile.resources.ic_account_selected
import com.effyshopping.customer.mobile.resources.ic_home_outlined
import com.effyshopping.customer.mobile.resources.ic_home_selected
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
import com.effyshopping.customer.mobile.resources.ic_orders_selected
import com.effyshopping.customer.mobile.resources.ic_search_outlined
import com.effyshopping.customer.mobile.resources.ic_search_selected
import com.effyshopping.mobile.kit.shell.ResponsiveDestination
import com.effyshopping.mobile.kit.shell.ResponsiveNavigation
import com.effyshopping.mobile.kit.ui.AdaptiveContent
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.mobile.kit.ui.rememberMotionSpec
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/** The label for each tab root, in bar order. */
private fun tabLabel(key: CustomerNavKey): String = when (key) {
    CustomerNavKey.Home -> "Home"
    CustomerNavKey.Search -> "Search"
    CustomerNavKey.Orders -> "Orders"
    CustomerNavKey.Account -> "Account"
    else -> error("$key is not a tab root")
}

/**
 * The guest-first customer shell, on **Jetpack Navigation 3** (026).
 *
 * ── What changed, and why ───────────────────────────────────────────────────────────────────────
 *
 * 015 hand-rolled this because Nav3 was alpha with an unverified iOS runtime. Nav3 went stable in
 * Nov 2025 and Compose Multiplatform 1.10 shipped it for iOS; this app is on 1.11.1, so the
 * deviation's reason expired. The old mechanism was three different notions of "where am I" — a
 * delimiter-joined String for Home ("homeproduct:42", parsed with startsWith), a nullable id for
 * Orders, and an AppNavigator for Account. Now every tab has one NavBackStack of typed keys.
 *
 * ── ⚠ THE BOTTOM BAR IS NOT ALWAYS SHOWN ────────────────────────────────────────────────────────
 *
 * The bar shows only at a tab's ROOT — `navState.showBottomBar` is `currentStack.size == 1`. Going
 * deeper into any tab hides it, which is what fixes product detail, cart and checkout stacking the
 * nav bar underneath their own sticky primary action.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun CustomerShell(container: AppContainer, session: SessionState) {
    val navState = rememberCustomerNavState()
    val signedIn = session is SessionState.Authenticated

    // Bind the ViewModels' navigation handle to the composable-owned stacks (see CustomerNavigator).
    LaunchedEffect(navState) { container.navigator.bindTo(navState) }

    // The tab a guest was trying to reach when deferred sign-in interrupted them.
    var pendingTab by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(signedIn) {
        if (signedIn) {
            pendingTab?.let { name ->
                CUSTOMER_TAB_ROOTS.firstOrNull { it::class.simpleName == name }?.let(navState::selectTab)
                pendingTab = null
            }
        }
    }

    /** Deferred sign-in: send the guest to the Account tab's auth flow, remembering where they were. */
    fun requireSignIn() {
        pendingTab = navState.activeTab::class.simpleName
        navState.selectTab(CustomerNavKey.Account)
        navState.push(CustomerNavKey.SignIn())
    }

    BackHandler(enabled = navState.canGoBack || navState.activeTab != CustomerNavKey.Home) {
        if (!navState.pop()) navState.selectTab(CustomerNavKey.Home)
    }

    ResponsiveNavigation(
        destinations = CUSTOMER_TAB_ROOTS.map { root ->
            ResponsiveDestination(
                tab = root,
                label = tabLabel(root),
                icon = { selected -> CustomerDestinationIcon(root, selected) },
            )
        },
        selectedTab = navState.activeTab,
        onSelectTab = navState::selectTab,
        showNavigation = navState.showBottomBar,
    ) {
        // ── iOS-style push/pop, via NavDisplay's OWN transition parameters ──────────────────────
        //
        // Nav3's default is a fade. These three parameters are part of the NavDisplay API, so this is
        // configuration rather than a hand-written animation: the incoming screen slides in from the
        // trailing edge while the outgoing one drifts a quarter-width the other way (the parallax that
        // makes a UIKit push read as depth), and pop mirrors it.
        //
        // `predictivePopTransitionSpec` matters on Android 14+: without it, the back-gesture preview
        // uses the forward spec and the screen appears to advance while you are dragging it away.
        //
        // Duration comes from the shared motion spec, so a device with reduced-motion enabled gets
        // 0ms — the navigation still happens, only the movement goes (025 FR-037).
        val nav = rememberMotionSpec(MotionRole.Forward)
        val slide = tween<IntOffset>(nav.durationMillis)
        val fade = tween<Float>(nav.durationMillis)

        NavDisplay(
            backStack = navState.currentStack,
            onBack = { navState.pop() },
            // ⚠ Adding a decorator REPLACES the default list, so the saveable-state one must be
            // re-declared here or every screen loses its per-entry remembered state.
            entryDecorators = listOf(
                rememberSaveableStateHolderNavEntryDecorator(),
                rememberBackAffordanceDecorator(navState),
            ),
            transitionSpec = {
                (slideInHorizontally(slide) { it } + fadeIn(fade)) togetherWith
                    (slideOutHorizontally(slide) { -it / 4 } + fadeOut(fade))
            },
            popTransitionSpec = {
                (slideInHorizontally(slide) { -it / 4 } + fadeIn(fade)) togetherWith
                    (slideOutHorizontally(slide) { it } + fadeOut(fade))
            },
            predictivePopTransitionSpec = {
                (slideInHorizontally(slide) { -it / 4 } + fadeIn(fade)) togetherWith
                    (slideOutHorizontally(slide) { it } + fadeOut(fade))
            },
            entryProvider = entryProvider {
                // ── Tab roots ──────────────────────────────────────────────────────────────────
                entry<CustomerNavKey.Home> {
                    HomeScreen(
                        container = container,
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onSearch = { navState.selectTab(CustomerNavKey.Search) },
                        onNotifications = {
                            navState.selectTab(CustomerNavKey.Account)
                            navState.push(CustomerNavKey.Notifications)
                        },
                        // ⚠ These two are the ONLY way into the cart and saved items on this surface
                        // — Effy's bottom bar has no Cart or Saved tab. Removing them makes the cart
                        // fillable and unopenable; that regression shipped once already.
                        onCart = { navState.push(CustomerNavKey.Cart) },
                        onFavorites = {
                            if (signedIn) navState.push(CustomerNavKey.Favorites) else requireSignIn()
                        },
                    )
                }

                entry<CustomerNavKey.Search> {
                    SearchScreen(
                        container,
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.push(CustomerNavKey.Cart) },
                    )
                }

                entry<CustomerNavKey.Orders> {
                    if (signedIn) {
                        OrdersScreen(
                            container,
                            onOpen = { navState.push(CustomerNavKey.OrderDetail(it)) },
                            onBrowse = {
                                // Browse was this escape's target; Discover is now the shop window.
                                // resetToRoot() FIRST — the cart/favorites screen sits inside some
                                // tab's stack, and selecting Home while already on Home would
                                // otherwise leave the empty state on screen.
                                navState.resetToRoot()
                                navState.selectTab(CustomerNavKey.Home)
                            },
                        )
                    } else {
                        GatedTab("Orders", "Sign in to see your orders.", ::requireSignIn)
                    }
                }

                entry<CustomerNavKey.Account> {
                    if (signedIn) {
                        AccountRoutes(container, CustomerNavKey.Account, session)
                    } else {
                        GuestAccountLanding(container)
                    }
                }

                // ── Commerce (bar hidden — each owns a bottom-anchored action) ─────────────────
                entry<CustomerNavKey.Product> { key ->
                    ProductDetailScreen(
                        container = container,
                        productId = key.productId,
                        session = session,
                        onRequireSignIn = ::requireSignIn,
                        onBack = { navState.pop() },
                        // Related products push onto the SAME stack, so Back walks the chain the
                        // shopper actually followed.
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.push(CustomerNavKey.Cart) },
                    )
                }

                entry<CustomerNavKey.Cart> {
                    CartScreen(
                        container = container,
                        onCheckout = {
                            if (signedIn) navState.push(CustomerNavKey.Checkout) else requireSignIn()
                        },
                        onBrowse = {
                                // Browse was this escape's target; Discover is now the shop window.
                                // resetToRoot() FIRST — the cart/favorites screen sits inside some
                                // tab's stack, and selecting Home while already on Home would
                                // otherwise leave the empty state on screen.
                                navState.resetToRoot()
                                navState.selectTab(CustomerNavKey.Home)
                            },
                    )
                }

                entry<CustomerNavKey.Checkout> {
                    CheckoutScreen(
                        container = container,
                        onPlaced = { orderId -> navState.resetTo(CustomerNavKey.Receipt(orderId)) },
                        onBack = { navState.pop() },
                    )
                }

                // The end of checkout. `resetTo` means this IS the bottom of the stack, so there is
                // deliberately no back arrow — the order is placed and there is nothing to return to.
                entry<CustomerNavKey.Receipt> { key ->
                    ReceiptScreen(
                        container,
                        key.orderId,
                        title = "Order confirmed",
                        doneLabel = "Keep shopping",
                        // ⚠ Order matters. Checkout may have run in any tab (Search → Product →
                        // Cart → Checkout), so that tab is cleared to its OWN root first; only then
                        // do we move to Home. Resetting to Home directly would have planted Home as
                        // the Search tab's root.
                        onDone = {
                            navState.resetToRoot()
                            navState.selectTab(CustomerNavKey.Home)
                        },
                    )
                }

                // The same screen opened from order history — pushed, so the back arrow is the way
                // out and no bottom action is needed.
                entry<CustomerNavKey.OrderDetail> { key ->
                    ReceiptScreen(container, key.orderId, title = "Order details")
                }


                // ── Auth (bar hidden — a focused flow) ────────────────────────────────────────
                entry<CustomerNavKey.SignIn> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.SignUp> { AuthRoutes(container, CustomerNavKey.SignUp) }
                entry<CustomerNavKey.VerifyOtp> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.Recovery> { AuthRoutes(container, CustomerNavKey.Recovery) }

                // ── Account sub-screens (bar KEPT, except the two commit forms) ───────────────
                entry<CustomerNavKey.Favorites> {
                    FavoritesScreen(
                        container,
                        onOpen = { navState.push(CustomerNavKey.Product(it)) },
                        onBack = { navState.pop() },
                        onBrowse = {
                                // Browse was this escape's target; Discover is now the shop window.
                                // resetToRoot() FIRST — the cart/favorites screen sits inside some
                                // tab's stack, and selecting Home while already on Home would
                                // otherwise leave the empty state on screen.
                                navState.resetToRoot()
                                navState.selectTab(CustomerNavKey.Home)
                            },
                    )
                }
                entry<CustomerNavKey.AddressBook> {
                    AddressBookScreen(container, onBack = { navState.pop() })
                }
                entry<CustomerNavKey.Notifications> { NotificationsScreen() }
                entry<CustomerNavKey.Faqs> { FaqsScreen() }
                entry<CustomerNavKey.HelpCenter> { HelpCenterScreen() }
                entry<CustomerNavKey.CustomerService> { CustomerServiceScreen() }
                entry<CustomerNavKey.MyDetails> {
                    AccountRoutes(container, CustomerNavKey.MyDetails, session)
                }
                entry<CustomerNavKey.Password> { key -> AccountRoutes(container, key, session) }
            },
        )
    }
}

/**
 * The primary-navigation icon for a tab, filled when selected.
 *
 * ⚠ This replaced the shared kit's letter-placeholder icon, which rendered the FIRST LETTER of each
 * label — "H", "S", "O", "A". Nothing else in the app signalled "unfinished" as loudly. That component
 * is now deleted outright so no future app can inherit it. Icons come from the shared Material Symbols
 * set (packages/design-system/mobile-assets), synced and drift-checked, so both mobile surfaces draw
 * from one authored source (FR-029).
 *
 * contentDescription is null by design: the navigation labels the whole destination, so naming the
 * icon too would make a screen reader announce every tab twice.
 */
@Composable
private fun CustomerDestinationIcon(tab: CustomerNavKey, selected: Boolean) {
    val resource: DrawableResource = when (tab) {
        CustomerNavKey.Home -> if (selected) Res.drawable.ic_home_selected else Res.drawable.ic_home_outlined
        CustomerNavKey.Search -> if (selected) Res.drawable.ic_search_selected else Res.drawable.ic_search_outlined
        CustomerNavKey.Orders -> if (selected) Res.drawable.ic_orders_selected else Res.drawable.ic_orders_outlined
        CustomerNavKey.Account -> if (selected) Res.drawable.ic_account_selected else Res.drawable.ic_account_outlined
        else -> error("$tab is not a tab root")
    }
    Icon(painterResource(resource), contentDescription = null)
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
        Button(onClick = { container.navigator.push(CustomerNavKey.SignIn()) }, modifier = Modifier.fillMaxWidth()) {
            Text("Sign in")
        }
        TextButton(onClick = { container.navigator.push(CustomerNavKey.SignUp) }) { Text("Create an account") }
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
