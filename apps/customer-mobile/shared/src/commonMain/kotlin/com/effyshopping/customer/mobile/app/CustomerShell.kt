package com.effyshopping.customer.mobile.app

import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.LocalEffySharedTransition
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.mobile.kit.ui.MotionLevel
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.scene.Scene
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.SharedTransitionLayout
import com.effyshopping.customer.mobile.core.platform.platformTag
import com.effyshopping.customer.mobile.core.presentation.LocalIsIos
import com.effyshopping.customer.mobile.core.presentation.LocalOpenNotifications
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.CompositionLocalProvider
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
import com.effyshopping.customer.mobile.features.paymentmethods.presentation.PaymentMethodsScreen
import com.effyshopping.customer.mobile.features.points.presentation.PointsScreen
import com.effyshopping.customer.mobile.features.auth.presentation.AuthRoutes
import com.effyshopping.customer.mobile.features.cart.presentation.CartScreen
import com.effyshopping.customer.mobile.features.catalog.domain.BannerTarget
import com.effyshopping.customer.mobile.features.catalog.presentation.HomeScreen
import com.effyshopping.customer.mobile.features.saved.presentation.SavedScreen
import com.effyshopping.customer.mobile.features.feedback.presentation.FeedbackScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.ProductDetailScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.PromotionScreen
import com.effyshopping.customer.mobile.features.catalog.presentation.SearchScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutScreen
import com.effyshopping.customer.mobile.features.payment.presentation.PaymentRoute
import com.effyshopping.customer.mobile.features.checkout.presentation.OrdersScreen
import com.effyshopping.customer.mobile.features.checkout.presentation.ReceiptScreen
import com.effyshopping.customer.mobile.features.help.presentation.HelpScreen
import com.effyshopping.customer.mobile.features.legal.presentation.LegalDocumentScreen
import com.effyshopping.customer.mobile.features.legal.presentation.LegalIndexScreen
import com.effyshopping.customer.mobile.features.notifications.presentation.NotificationsScreen
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.mobile.kit.shell.ResponsiveDestination
import com.effyshopping.mobile.kit.shell.ResponsiveNavigation
import com.effyshopping.mobile.kit.ui.AdaptiveContent
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.mobile.kit.ui.rememberMotionSpec
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/** The label for each tab root, in bar order. */
// A stable, low-cardinality screen key for analytics (never a display label, never PII).
private fun CustomerNavKey.telemetryScreenName(): String = when (this) {
    CustomerNavKey.Home -> "home"
    CustomerNavKey.Search -> "search"
    CustomerNavKey.Cart -> "cart"
    CustomerNavKey.Orders -> "orders"
    CustomerNavKey.Account -> "account"
    else -> "other"
}

private fun tabLabel(key: CustomerNavKey): String = when (key) {
    CustomerNavKey.Home -> "Home"
    CustomerNavKey.Search -> "Search"
    CustomerNavKey.Cart -> "Cart"
    CustomerNavKey.Orders -> "Orders"
    CustomerNavKey.Account -> "Account"
    else -> error("$key is not a tab root")
}

/**
 * The guest-first customer shell, on Jetpack Navigation 3: every tab has one NavBackStack of typed keys.
 * The bottom bar shows only at a tab's root (`navState.showBottomBar`), so a deeper screen's sticky
 * primary action never sits on top of it.
 */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun CustomerShell(container: AppContainer, session: SessionState) {
    val navState = rememberCustomerNavState()
    val signedIn = session is SessionState.Authenticated

    // Bind the ViewModels' navigation handle to the composable-owned stacks (see CustomerNavigator).
    LaunchedEffect(navState) { container.navigator.bindTo(navState) }

    // Emit a screen view whenever the active tab changes. One call-site for the four primary
    // destinations; a no-op until analytics is consented + initialised (the driver guards on `ready`).
    // The name is a stable low-cardinality key, never PII (docs/telemetry/platform-events.md).
    LaunchedEffect(navState.activeTab) {
        container.analyticsDriver.screen(navState.activeTab.telemetryScreenName())
    }

    /**
     * Reconcile the cart whenever the session changes.
     *
     * Keyed on `signedIn`, so it fires on launch and on every sign-in / sign-out — which is exactly when
     * the mirror is most likely to disagree with the platform. On sign-in the merge has already run in
     * `SessionManager`; this picks up anything that merge could not, and sends any change still queued.
     *
     * This is not a true app-foreground hook. A shopper who backgrounds the app for an hour and returns
     * without the session changing will re-price when they next open the cart (`CartScreen` does its own
     * refresh), not the instant they return. A proper foreground signal needs a platform lifecycle
     * observer, which is US4's territory; this covers the transitions that matter most.
     */
    LaunchedEffect(signedIn) { container.syncCart() }

    /**
     * Deferred sign-in, pushed onto the tab the shopper is in, so Back returns to the gate or product they
     * were on, and `completeSignIn`'s `resetToRoot` lands them on the tab's root. Pass [returnTo] whenever the
     * destination is a specific screen (checkout); a gated tab needs nothing.
     */
    fun requireSignIn(returnTo: CustomerNavKey? = null) {
        navState.push(CustomerNavKey.SignIn(returnTo))
    }

    /**
     * Tapping a tab a guest cannot use asks them to sign in — it does not show them a page whose only
     * content is a button that asks them to sign in.
     *
     * The interstitial was a dead screen. "Orders / Sign in to see your orders. / [Sign in]" costs a
     * tap and tells the shopper nothing they did not already know from the tab they just pressed. Web
     * has never done this — `requireCustomer` redirects `/account` straight to `/sign-in?next=/account`
     * — so this is a parity fix as much as a UX one.
     *
     * It does not switch tabs first, and that is deliberate. Sign-in is pushed onto the tab the
     * shopper is already in, so backing out returns them exactly where they were and they never see
     * the gate at all. Switching first is what an earlier version did, and Back then landed on the
     * account page instead of where they came from.
     *
     * The guest account landing is now deleted outright, and signing out goes to Home rather than to
     * it (see `AccountViewModel.signOut`). Nothing routes a guest to the Account tab any more, so its
     * guest branch only leaves. `GatedTab` survives for Orders on the same last-resort footing.
     */
    fun selectTabOrAskToSignIn(tab: CustomerNavKey) {
        val gated = tab == CustomerNavKey.Orders || tab == CustomerNavKey.Account
        if (gated && !signedIn) requireSignIn(returnTo = tab) else navState.tapTab(tab)
    }

    BackHandler(enabled = navState.canGoBack || navState.activeTab != CustomerNavKey.Home) {
        if (!navState.pop()) navState.selectTab(CustomerNavKey.Home)
    }

    val cart by container.cart.state.collectAsState()

    // The bell in every header opens Notifications on the current tab, so Back returns where the
    // shopper was. Provided once here; screens never wire it.
    CompositionLocalProvider(
        LocalOpenNotifications provides { navState.push(CustomerNavKey.Notifications) },
        LocalIsIos provides (platformTag() == "ios"),
    ) {
    ResponsiveNavigation(
        destinations = CUSTOMER_TAB_ROOTS.map { root ->
            ResponsiveDestination(
                tab = root,
                label = tabLabel(root),
                icon = { selected -> CustomerDestinationIcon(root, selected) },
            )
        },
        selectedTab = navState.activeTab,
        onSelectTab = ::selectTabOrAskToSignIn,
        showNavigation = navState.showBottomBar,
        // The storefront tab bar: five generous tabs, the cart's count on Cart.
        bottomBar = {
            EffyTabBar(
                tabs = CUSTOMER_TAB_ROOTS,
                selected = navState.activeTab,
                cartCount = cart.itemCount,
                label = ::tabLabel,
                onSelect = ::selectTabOrAskToSignIn,
            )
        },
    ) {
        // The iOS push, through NavDisplay's own transition parameters: the new page slides in from the trailing
        // edge over 350ms on the iOS curve while the page below drifts 30% the other way and dims; pop and the
        // edge swipe mirror it. Compose Multiplatform drives the iOS edge swipe through predictive back, so
        // `predictivePopTransitionSpec` is the interactive swipe (finger-driven, hence linear); without it,
        // Android 14+'s back preview would advance. Tab switches cross-fade (150ms). Reduced motion → a short
        // fade; none → instant.
        val level = LocalMotionLevel.current
        val ease = EffyStorefrontMotion.IosEase
        val pushMs = EffyStorefrontMotion.PushMillis
        fun isTabSwitch(from: Scene<NavKey>, to: Scene<NavKey>) =
            from.entries.firstOrNull()?.contentKey != to.entries.firstOrNull()?.contentKey
        fun fade(ms: Int) = fadeIn(tween(ms)) togetherWith fadeOut(tween(ms))
        val none = EnterTransition.None togetherWith ExitTransition.None

        SharedTransitionLayout {
        CompositionLocalProvider(LocalEffySharedTransition provides this) {
        NavDisplay(
            backStack = navState.currentStack,
            onBack = { navState.pop() },
            sharedTransitionScope = this,
            // Adding a decorator replaces the default list, so the saveable-state one must be
            // re-declared here or every screen loses its per-entry remembered state.
            entryDecorators = listOf(
                rememberSaveableStateHolderNavEntryDecorator(),
                rememberBackAffordanceDecorator(navState),
            ),
            transitionSpec = {
                when {
                    level == MotionLevel.None -> none
                    isTabSwitch(initialState, targetState) -> fade(EffyStorefrontMotion.TabFadeMillis)
                    level == MotionLevel.Reduced -> fade(EffyStorefrontMotion.ReducedFadeMillis)
                    else -> slideInHorizontally(tween(pushMs, easing = ease)) { it } togetherWith
                        (slideOutHorizontally(tween(pushMs, easing = ease)) { -(it * 0.3f).toInt() } +
                            fadeOut(tween(pushMs, easing = ease), targetAlpha = 0.85f))
                }
            },
            popTransitionSpec = {
                when {
                    level == MotionLevel.None -> none
                    isTabSwitch(initialState, targetState) -> fade(EffyStorefrontMotion.TabFadeMillis)
                    level == MotionLevel.Reduced -> fade(EffyStorefrontMotion.ReducedFadeMillis)
                    else -> (slideInHorizontally(tween(pushMs, easing = ease)) { -(it * 0.3f).toInt() } +
                        fadeIn(tween(pushMs, easing = ease), initialAlpha = 0.85f)) togetherWith
                        slideOutHorizontally(tween(pushMs, easing = ease)) { it }
                }
            },
            predictivePopTransitionSpec = {
                when (level) {
                    MotionLevel.None -> none
                    MotionLevel.Reduced -> fade(EffyStorefrontMotion.ReducedFadeMillis)
                    else -> (slideInHorizontally(tween(pushMs, easing = LinearEasing)) { -(it * 0.3f).toInt() } +
                        fadeIn(tween(pushMs, easing = LinearEasing), initialAlpha = 0.85f)) togetherWith
                        slideOutHorizontally(tween(pushMs, easing = LinearEasing)) { it }
                }
            },
            entryProvider = entryProvider {
                // Tab roots
                entry<CustomerNavKey.Home> {
                    HomeScreen(
                        container = container,
                        onRequireSignIn = { requireSignIn() },
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        // One tap reaches a live keyboard. The focus request is set
                        // before the tab switch, so Search consumes it as it composes. Home itself
                        // deliberately accepts no text — a second search field here would be the one
                        // without filters, sort or paging, and the one a shopper meets first.
                        onSearch = {
                            navState.requestSearchFocus()
                            navState.selectTab(CustomerNavKey.Search)
                        },
                        // Pushed onto the current tab, not routed via Account. The bell is on this
                        // screen, so Back belongs here. It used to `selectTab(Account)` first — because
                        // Notifications is also an Account list row — which meant opening it from
                        // Discover and pressing Back landed on the account page.
                        onNotifications = { navState.push(CustomerNavKey.Notifications) },
                        // The cart is a tab; every way into it selects the tab.
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                        // Reachable by a guest too. The predecessor gated this behind sign-in, and
                        // usability research is one-sided that the sign-in wall is the single biggest
                        // reason saved-item features go unused. Guest saving itself lands in US3; the
                        // route is open from here so the gate never has to be re-added.
                        onSaved = { navState.push(CustomerNavKey.Saved) },
                        // "See all" on a section, "All products" and the "Your Effy" cards: pushed onto Home, so Back returns
                        // there. The rail's key decides the refinement (on sale, a category, or everything).
                        onAllProducts = { navState.push(CustomerNavKey.Results(title = "All products")) },
                        onOpenOrder = { navState.push(CustomerNavKey.OrderDetail(it)) },
                        onPoints = { navState.push(CustomerNavKey.Points) },
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
                        // A category shortcut opens that category's products, and the
                        // destination states the scope — a filtered list that does not say what it
                        // is filtered to looks like a broken search.
                        onCategoryClick = { shortcut ->
                            navState.push(
                                CustomerNavKey.Results(
                                    title = shortcut.label,
                                    categoryKey = shortcut.key,
                                ),
                            )
                        },
                        // Where a banner leads: a promotion leads to itself ([CustomerNavKey.Promotion]). The other branches are
                        // the vocabulary for product-scoped promotions. Exhaustive over a sealed interface; a target the app does
                        // not understand never reaches here (it renders non-tappable).
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
                // results implementation in the app, not two.
                entry<CustomerNavKey.Results> { key ->
                    SearchScreen(
                        container,
                        onRequireSignIn = { requireSignIn() },
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                        entryCategoryKey = key.categoryKey,
                        entrySaleOnly = key.saleOnly,
                        title = key.title,
                    )
                }

                // The promotion behind a banner tap. "Browse products" leads into the ordinary store
                // the destination the banner used to jump straight to, now reached deliberately and
                // after the shopper has the code.
                entry<CustomerNavKey.Promotion> { key ->
                    PromotionScreen(
                        container = container,
                        promotionId = key.promotionId,
                        onBack = { navState.pop() },
                        onBrowse = { navState.push(CustomerNavKey.Results(title = "All products")) },
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                    )
                }

                entry<CustomerNavKey.Search> {
                    // Consumed here, once per composition of the tab root, rather than inside
                    // SearchScreen — the screen must not decide for itself whether the shopper asked
                    // for a keyboard.
                    val autoFocus = remember { navState.consumeSearchFocus() }
                    SearchScreen(
                        container,
                        onRequireSignIn = { requireSignIn() },
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                        autoFocus = autoFocus,
                        // 087 (Search board): the start page's aisles, "All products" and "On sale"
                        // open Results ON the Search tab, so Back returns to the start page.
                        onAisle = { navState.push(CustomerNavKey.Results(title = it.name, categoryKey = it.key)) },
                        onAllProducts = { navState.push(CustomerNavKey.Results(title = "All products")) },
                        onSale = { navState.push(CustomerNavKey.Results(title = "On sale", saleOnly = true)) },
                    )
                }

                entry<CustomerNavKey.Orders> {
                    if (signedIn) {
                        OrdersScreen(
                            container,
                            onOpen = { navState.push(CustomerNavKey.OrderDetail(it)) },
                            onViewCart = { navState.selectTab(CustomerNavKey.Cart) },
                            onBrowse = {
                                // Browse was this escape's target; Discover is now the shop window.
                                // resetToRoot first — the cart/favorites screen sits inside some
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
                        // There is no guest account page. A guest tapping Account is asked to sign in
                        // (`selectTabOrAskToSignIn`) and signing out lands on Home, so nothing routes
                        // here without a session — this branch is the last resort for a session that
                        // ends while the tab is on screen, and it leaves rather than renders.
                        //
                        // It replaced a landing page whose whole content was "Sign in" / "Create an
                        // account" — a page that told the shopper only what the tab they just pressed
                        // already told them. Its one unique affordance, "Clear data on this device",
                        // is not lost: Signing out clears the device unconditionally
                        // (`onSignedOut` in AppContainer resets both stores and removes the persisted
                        // keys), so the button was a manual path to something the app now always does.
                        LaunchedEffect(Unit) { navState.selectTab(CustomerNavKey.Home) }
                    }
                }

                // Commerce (bar hidden — each owns a bottom-anchored action)
                entry<CustomerNavKey.Product> { key ->
                    ProductDetailScreen(
                        container = container,
                        productId = key.productId,
                        session = session,
                        onRequireSignIn = ::requireSignIn,
                        onBack = { navState.pop() },
                        // Related products push onto the same stack, so Back walks the chain the
                        // shopper actually followed.
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                    )
                }

                entry<CustomerNavKey.Cart> {
                    CartScreen(
                        container = container,
                        onProductClick = { navState.push(CustomerNavKey.Product(it)) },
                        onSeeAllSale = { navState.push(CustomerNavKey.Results(title = "On sale", saleOnly = true)) },
                        onCheckout = {
                            // Return them to checkout, not to a tab root.
                            if (signedIn) navState.push(CustomerNavKey.Checkout)
                            else requireSignIn(CustomerNavKey.Checkout)
                        },
                        onBrowse = {
                                // Browse was this escape's target; Discover is now the shop window.
                                // resetToRoot first — the cart/favorites screen sits inside some
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
                        // Checkout ends unpaid. It creates the order and its intent and pushes
                        // the payment screen; the receipt is reached from there, not from here.
                        onProceedToPayment = { navState.push(CustomerNavKey.Payment) },
                        onBack = { navState.pop() },
                        // Points paid for everything: the order is placed, exactly as after onPaid.
                        onPlacedWithPoints = { orderId -> navState.resetTo(CustomerNavKey.Receipt(orderId)) },
                    )
                }

                // Effy's own payment screen, around the provider's in-app element.
                //
                // The intent is read from the in-memory handoff, not from the route — the route is a
                // bare marker precisely so a payment client secret is never persisted (see
                // `CustomerNavKey.Payment`). A null handoff means the process was killed mid-payment;
                // the order still exists unpaid, so the honest answer is to say so and send them back
                // to checkout rather than render a payment screen that cannot charge anything.
                entry<CustomerNavKey.Payment> {
                    PaymentRoute(
                        container = container,
                        // resetTo, like the checkout receipt below — the order is paid and there is
                        // nothing behind it to go back to.
                        onPaid = { orderId -> navState.resetTo(CustomerNavKey.Receipt(orderId)) },
                        onBackToCheckout = { navState.pop() },
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
                        // Order matters. Checkout may have run in any tab (Search → Product →
                        // Cart → Checkout), so that tab is cleared to its own root first; only then
                        // do we move to Home. Resetting to Home directly would have planted Home as
                        // the Search tab's root.
                        onDone = {
                            navState.resetToRoot()
                            navState.selectTab(CustomerNavKey.Home)
                        },
                        // This order's details, on the Orders tab, where it will be found again.
                        onTrack = {
                            navState.resetToRoot()
                            navState.selectTab(CustomerNavKey.Orders)
                            navState.push(CustomerNavKey.OrderDetail(key.orderId))
                        },
                    )
                }

                // The same screen opened from order history — pushed, so the back arrow is the way
                // out and no bottom action is needed.
                entry<CustomerNavKey.OrderDetail> { key ->
                    ReceiptScreen(
                        container,
                        key.orderId,
                        title = "Order details",
                        onViewCart = { navState.selectTab(CustomerNavKey.Cart) },
                    )
                }

                // Auth (bar hidden — a focused flow)
                entry<CustomerNavKey.SignIn> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.SignInPassword> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.SignUp> { AuthRoutes(container, CustomerNavKey.SignUp) }
                entry<CustomerNavKey.SignUpPassword> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.ProfileName> { AuthRoutes(container, CustomerNavKey.ProfileName) }
                entry<CustomerNavKey.VerifyOtp> { key -> AuthRoutes(container, key) }
                entry<CustomerNavKey.Recovery> { AuthRoutes(container, CustomerNavKey.Recovery) }

                // Account sub-screens (bar kept, except the two commit forms)
                entry<CustomerNavKey.Saved> {
                    SavedScreen(
                        container,
                        onOpen = { navState.push(CustomerNavKey.Product(it)) },
                        onBack = { navState.pop() },
                        onBrowse = {
                            // resetToRoot first — the saved screen sits inside some tab's stack, and
                            // selecting Home while already on Home would otherwise leave the empty
                            // state on screen.
                            navState.resetToRoot()
                            navState.selectTab(CustomerNavKey.Home)
                        },
                        // A saved row that is already in the cart offers the way there rather than
                        // a second "Add to cart" (eBay's watchlist pattern).
                        onCart = { navState.selectTab(CustomerNavKey.Cart) },
                    )
                }
                entry<CustomerNavKey.AddressBook> {
                    AddressBookScreen(container, onBack = { navState.pop() })
                }
                entry<CustomerNavKey.Points> {
                    PointsScreen(container, onBack = { navState.pop() })
                }
                entry<CustomerNavKey.PaymentMethods> {
                    PaymentMethodsScreen(container, onBack = { navState.pop() })
                }
                entry<CustomerNavKey.Notifications> { NotificationsScreen() }
                // Three routes, one help page (Help board). The old keys stay so a restored back
                // stack still resolves.
                entry<CustomerNavKey.Faqs> { HelpScreen(onOpenOrders = { navState.selectTab(CustomerNavKey.Orders) }) }
                entry<CustomerNavKey.HelpCenter> { HelpScreen(onOpenOrders = { navState.selectTab(CustomerNavKey.Orders) }) }
                entry<CustomerNavKey.CustomerService> { HelpScreen(onOpenOrders = { navState.selectTab(CustomerNavKey.Orders) }) }
                entry<CustomerNavKey.Feedback> {
                    val vm = remember { container.feedbackViewModel() }
                    FeedbackScreen(viewModel = vm, onBack = { navState.pop() })
                }
                entry<CustomerNavKey.MyDetails> {
                    AccountRoutes(container, CustomerNavKey.MyDetails, session)
                }
                entry<CustomerNavKey.Password> { key -> AccountRoutes(container, key, session) }

                // A route needs four registrations, not three, and this is the fourth.
                //
                // `CustomerNavKey.kt` documents three places a route must appear (the sealed
                // interface, the polymorphic serializer module, and ALL_CUSTOMER_ROUTES). That list
                // is incomplete: a route also needs an `entry<>` here, or `NavDisplay` hits the
                // fallback and throws `IllegalStateException: Unknown screen …` the moment a shopper
                // taps it.
                //
                // Nothing caught that. It compiles, the serialization test passes (the route IS in
                // all three lists), and `mobile-guard` passes too — its reachability check proves
                // something navigates to the route, not that the shell can render it. Shipping the
                // account centre without these three lines crashed the app on the first tap of
                // "Security", on a device, after every gate was green.
                entry<CustomerNavKey.Security> {
                    AccountRoutes(container, CustomerNavKey.Security, session)
                }
                entry<CustomerNavKey.Privacy> {
                    AccountRoutes(container, CustomerNavKey.Privacy, session)
                }
                entry<CustomerNavKey.DeleteAccount> {
                    AccountRoutes(container, CustomerNavKey.DeleteAccount, session)
                }
                entry<CustomerNavKey.PasswordReset> {
                    AccountRoutes(container, CustomerNavKey.PasswordReset, session)
                }

                // Legal & informational documents (no session required — viewable by anyone)
                entry<CustomerNavKey.LegalIndex> { LegalIndexScreen(container) }
                entry<CustomerNavKey.LegalDocument> { key -> LegalDocumentScreen(container, key.slug) }
            },
        )
        }
        }
    }
    }
}

/**
 * The primary-navigation icon for a tab, filled when selected.
 *
 * This replaced the shared kit's letter-placeholder icon, which rendered the first letter of each
 * label — "H", "S", "O", "A". Nothing else in the app signalled "unfinished" as loudly. That component
 * is now deleted outright so no future app can inherit it. Icons come from the shared Material Symbols
 * set (packages/design-system/mobile-assets), synced and drift-checked, so both mobile surfaces draw
 * from one authored source.
 *
 * contentDescription is null by design: the navigation labels the whole destination, so naming the
 * icon too would make a screen reader announce every tab twice.
 */
@Composable
private fun CustomerDestinationIcon(tab: CustomerNavKey, selected: Boolean) {
    // The side rail (≥600dp) — same Lucide glyphs as the tab bar; selection is the rail's indicator.
    Icon(painterResource(tabIcon(tab)), contentDescription = null)
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
        EffyPrimaryButton("Sign in", onClick = onSignIn, modifier = Modifier.fillMaxWidth())
    }
}

