package com.effyshopping.shop.mobile.core.nav

/**
 * The signed-in area's routes (014). A small set — this bootstrap surface has a role-aware home and one
 * manager-gated destination that proves the gate. The sign-in flow (email → code) is not a route; it is
 * the `SignedOut` branch driven by the auth ViewModel's own step. There is no guest, no deep account area.
 */
sealed interface AppRoute {
    data object Home : AppRoute          // the role-aware shell: identity + (for managers) the manager area
    data object ManagerArea : AppRoute   // a manager-gated destination — proves the backend gate
}
