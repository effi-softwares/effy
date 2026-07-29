package com.effyshopping.customer.mobile.features.cart.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_cart_outlined
import com.effyshopping.mobile.design.EffyRadius
import org.jetbrains.compose.resources.painterResource

/**
 * The cart, with its live line count — the app's single cart affordance, wherever it appears.
 *
 * ── ⚠ Why every catalogue screen carries one ────────────────────────────────────────────────────
 *
 * The source design puts Cart in its bottom bar, so it is one tap from anywhere. Effy's bottom bar
 * cannot: its five tabs are Home · Browse · Search · Orders · Account, and Browse being among them is
 * a signed-off requirement (025 FR-009/FR-010), not a preference to trade away.
 *
 * So the cart travels in the app bar of the screens where a shopper is choosing things — Discover,
 * Browse, Search, and the product page itself. Anything less leaves a dead end: after the Nav3
 * migration the cart briefly had no entry point at all, and "Add to cart" led nowhere.
 *
 * The count is read from the DEVICE-LOCAL cart, which 019 R8 made the single source of truth, so the
 * badge is correct for a guest and does not wait on a network round trip.
 */
@Composable
fun CartAction(container: AppContainer, onCart: () -> Unit, modifier: Modifier = Modifier) {
    val lines by container.guestCart.lines.collectAsState()
    val count = lines.sumOf { it.quantity }
    // The count is ANNOUNCED, not merely seen (025 FR-045) — a badge is invisible to a screen reader.
    val label = if (count > 0) "Cart, $count items" else "Cart"

    Box(
        modifier = modifier
            .size(EffyMinTouchTarget)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .clickable(onClickLabel = label, onClick = onCart),
        contentAlignment = Alignment.Center,
    ) {
        BadgedBox(badge = { if (count > 0) Badge { Text("$count") } }) {
            Icon(
                painterResource(Res.drawable.ic_cart_outlined),
                contentDescription = label,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}
