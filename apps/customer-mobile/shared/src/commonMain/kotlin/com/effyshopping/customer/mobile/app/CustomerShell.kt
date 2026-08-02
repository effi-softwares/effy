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
import androidx.compose.runtime.remember
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
import com.effyshopping.customer.mobile.features.catalog.domain.BannerTarget
import com.effyshopping.customer.mobile.features.catalog.presentation.HomeScreen
import com.effyshopping.customer.mobile.features.saved.presentation.SavedScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.ProductDetailScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.PromotionScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.SearchScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.OrdersScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.ReceiptScreen
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

    /**
     * Reconcile the cart whenever the session changes (027 FR-008).
     *
     * Keyed on `signedIn`, so it fires on launch AND on every sign-in / sign-out — which is exactly when
     * the mirror is most likely to disagree with the platform. On sign-in the merge has already run in
     * `SessionManager`; this picks up anything that merge could not, and sends any change still queued.
     *
     * ⚠ This is NOT a true app-foreground hook. A shopper who backgrounds the app for an hour and returns
     * without the session changing will re-price when they next open the cart (`CartScreen` does its own
     * refresh), not the instant they return. A proper foreground signal needs a platform lifecycle
     * observer, which is US4's territory; this covers the transitions that matter most.
     */
    LaunchedEffect(signedIn) { container.syncCart() }

    /**
     * Deferred sign-in — pushed onto the tab the shopper is ALREADY in.
     *
     * ⚠ It used to `selectTab(Account)` first and remember the original tab in a `pendingTab` string,
     * restoring it once sign-in succeeded. That threw the shopper into a different tab to ask the
     * question, so **Back went to the account page instead of where they came from** — and the
     * restore only ran on success, never on cancel. Pushing here means Back returns to the gate or
     * the product they were looking at, and `completeSignIn`'s `resetToRoot()` already lands them on
     * the right tab's root afterwards, so nothing needs remembering.
     */
    fun requireSignIn() {
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
                        // 028 FR-008: ONE tap reaches a live keyboard. The focus request is set
                        // before the tab switch, so Search consumes it as it composes. Home itself
                        // deliberately accepts no text — a second search field here would be the one
                        // without filters, sort or paging, and the one a shopper meets first.
                        onSearch = {
                            navState.requestSearchFocus()
                            navState.selectTab(CustomerNavKey.Search)
                        },
                        // ⚠ Pushed onto the CURRENT tab, not routed via Account. The bell is on this
                        // screen, so Back belongs here. It used to `selectTab(Account)` first — because
                        // Notifications is also an Account list row — which meant opening it from
                        // Discover and pressing Back landed on the account page.
                        onNotifications = { navState.push(CustomerNavKey.Notifications) },
                        // ⚠ This is the ONLY way into the cart on this surface — Effy's bottom bar
                        // has no Cart tab. Removing it makes the cart fillable and unopenable; that
                        // regression shipped once already.
                        onCart = { navState.push(CustomerNavKey.Cart) },
                        // ⚠ Reachable by a GUEST too. The predecessor gated this behind sign-in, and
                        // usability research is one-sided that the sign-in wall is the single biggest
                        // reason saved-item features go unused. Guest saving itself lands in US3; the
                        // route is open from here so the gate never has to be re-added.
                        onSaved = { navState.push(CustomerNavKey.Saved) },
                        // 028 FR-018: "See all" on a section. PUSHED onto the Home tab, so Back
                        // returns to Home rather than stranding the shopper at the Search tab's
                        // root. The rail's own key decides the refinement — the on-sale rail carries
                        // the sale filter, a category rail carries its category, and Featured is
                        // simply everything.
                        onSeeAll = { rail ->
                            navState.push(
                                CustomerNavKey.Results(
                                    title = rail.title,
                                    categoryKey = rail.key.removePrefix("category:").takeIf {
                                        rail.key.startsWith("category:")
                                    },
                                    saleOnly = rail.key == "on_sale",
                                ),
                            )
                        },
                        // 028 FR-027: a category shortcut opens that category's products, and the
                        // destination STATES the scope — a filtered list that does not say what it
                        // is filtered to looks like a broken search.
                        onCategoryClick = { shortcut ->
                            navState.push(
                                CustomerNavKey.Results(
                                    title = shortcut.label,
                                    categoryKey = shortcut.key,
                                ),
                            )
                        },
                        // Where a banner leads.
                        //
                        // ⚠ EVERY banner used to arrive here as [BannerTarget.Search], because the
                        // server hard-coded that one destination — so a tap opened the unfiltered
                        // store, which is the Search tab by another name and carries none of the
                        // promotion's own facts. A promotion now leads to itself
                        // ([CustomerNavKey.Promotion]); see `PromotionScreen` for why that is the only
                        // destination a whole-cart discount actually has, and why it does not conflict
                        // with FR-034.
                        //
                        // The other branches are kept, not dead: they are the vocabulary the server
                        // may start using the day a promotion can be scoped to products.
                        //
                        // ⚠ The `when` is EXHAUSTIVE over a sealed interface, so a new destination is
                        // a compile error rather than a silent no-op. A banner whose target the app
                        // does not understand never reaches here: it renders non-tappable.
                        onBannerClick = { banner ->
                            when (val target = banner.target) {
                                null -> Unit
                                is BannerTarget.Promotion ->
                                    navState.push(CustomerNavKey.Promotion(target.promotionId))
                                BannerTarget.Search ->
                                    navState.push(CustomerNavKey.Results(title = banner.title))
                                BannerTarget.Sale ->
                                    navState.push(
                                        CustomerNavKey.Results(title = banner.title, saleOnly = true),
                                    )
                                is BannerTarget.Category ->
                                    navState.push(
                                        CustomerNavKey.Results(
                                            title = banner.title,
                                            categoryKey = target.categoryKey,
                                        ),
                                    )
                                is BannerTarget.Product ->
                                    navState.push(CustomerNavKey.Product(target.productId))
                            }
                        },
                    )
                }

                // A scoped result set — the ordinary Search screen with an entry refinement. One
                // results implementation in the app, not two (FR-009).
                entry<CustomerNavKey.Results> { key ->
                    SearchScreen(
                        container,
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.push(CustomerNavKey.Cart) },
                        entryCategoryKey = key.categoryKey,
                        entrySaleOnly = key.saleOnly,
                        title = key.title,
                    )
                }

                // The promotion behind a banner tap. "Browse products" leads into the ordinary store —
                // the destination the banner used to jump straight to, now reached deliberately and
                // after the shopper has the code.
                entry<CustomerNavKey.Promotion> { key ->
                    PromotionScreen(
                        container = container,
                        promotionId = key.promotionId,
                        onBack = { navState.pop() },
                        onBrowse = { navState.push(CustomerNavKey.Results(title = "All products")) },
                        onCart = { navState.push(CustomerNavKey.Cart) },
                    )
                }

                entry<CustomerNavKey.Search> {
                    // ⚠ Consumed HERE, once per composition of the tab root, rather than inside
                    // SearchScreen — the screen must not decide for itself whether the shopper asked
                    // for a keyboard.
                    val autoFocus = remember { navState.consumeSearchFocus() }
                    SearchScreen(
                        container,
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.push(CustomerNavKey.Cart) },
                        autoFocus = autoFocus,
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
                entry<CustomerNavKey.Saved> {
                    SavedScreen(
                        container,
                        onOpen = { navState.push(CustomerNavKey.Product(it)) },
                        onBack = { navState.pop() },
                        onBrowse = {
                            // resetToRoot() FIRST — the saved screen sits inside some tab's stack, and
                            // selecting Home while already on Home would otherwise leave the empty
                            // state on screen.
                            navState.resetToRoot()
                            navState.selectTab(CustomerNavKey.Home)
                        },
                        onChangeLocation = {
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
