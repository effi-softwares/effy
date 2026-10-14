package com.effyshopping.customer.mobile.app

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.presentation.EffyBadge
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.effyBump
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.presentation.effyPress
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_house
import com.effyshopping.customer.mobile.resources.lucide_package
import com.effyshopping.customer.mobile.resources.lucide_search
import com.effyshopping.customer.mobile.resources.lucide_shopping_cart
import com.effyshopping.customer.mobile.resources.lucide_user_round
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/** The tab row's height: 58dp of tabs plus room for the 3dp indicator (Tab bar board). */
private val TabBarHeight = EffySize.tabRow + 6.dp

/** One tab's label and glyph (Tab bar board). */
internal fun tabIcon(tab: CustomerNavKey): DrawableResource = when (tab) {
    CustomerNavKey.Home -> Res.drawable.lucide_house
    CustomerNavKey.Search -> Res.drawable.lucide_search
    CustomerNavKey.Cart -> Res.drawable.lucide_shopping_cart
    CustomerNavKey.Orders -> Res.drawable.lucide_package
    CustomerNavKey.Account -> Res.drawable.lucide_user_round
    else -> error("$tab is not a tab root")
}

/**
 * THE TAB BAR — five generous tabs: Home · Search · Cart · Orders · Account (Tab bar board; 087 FR-006).
 *
 * Operator direction: "bottom navbar should have good space and size, do not make it small". Each cell
 * is a full fifth of the width and at least 58dp tall (above the home indicator, which the app root's
 * inset already adds), with a 27dp Lucide icon and a 12sp label. The current tab is Effy blue, its label
 * semibold, with a 3dp blue bar under it that SLIDES between tabs — three signals, never colour alone.
 * The cart carries its item count, which bumps when something is added.
 *
 * The bar is hidden on pages opened on top (the shell's rule, unchanged).
 */
@Composable
internal fun EffyTabBar(
    tabs: List<CustomerNavKey>,
    selected: CustomerNavKey,
    cartCount: Int,
    label: (CustomerNavKey) -> String,
    onSelect: (CustomerNavKey) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        // ⚠ A FIXED height, never "fill". The navigation layout measures the bar with the whole screen
        // as its maximum, so anything that fills (fillMaxHeight, an unbounded BoxWithConstraints)
        // becomes a full-screen tab bar with the page squeezed out — the first 087 build did exactly that.
        BoxWithConstraints(modifier = Modifier.fillMaxWidth().height(TabBarHeight)) {
            val cell = maxWidth / tabs.size
            val index = tabs.indexOf(selected).coerceAtLeast(0)
            val indicatorX by animateDpAsState(
                cell * index,
                tween(effyDuration(EffyStorefrontMotion.StandardMillis)),
                label = "tabIndicator",
            )
            Row(modifier = Modifier.fillMaxWidth().height(TabBarHeight).selectableGroup()) {
                tabs.forEach { tab ->
                    TabCell(
                        tab = tab,
                        label = label(tab),
                        selected = tab == selected,
                        badge = if (tab == CustomerNavKey.Cart) cartCount else 0,
                        onClick = { onSelect(tab) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            // The indicator: 3dp, inset 18% each side of its cell, at the bottom of the row.
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .offset(x = indicatorX + cell * 0.18f)
                    .width(cell * 0.64f)
                    .height(3.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.primary),
            )
        }
    }
}

@Composable
private fun TabCell(
    tab: CustomerNavKey,
    label: String,
    selected: Boolean,
    badge: Int,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    val interactions = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .height(TabBarHeight)
            .effyPress(interactions, 0.92f)
            .selectable(selected = selected, interactionSource = interactions, indication = null, role = Role.Tab, onClick = onClick)
            .semantics {
                contentDescription = if (badge > 0) "$label, $badge ${if (badge == 1) "item" else "items"}" else label
            }
            .padding(top = 8.dp, bottom = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Box {
            Icon(painterResource(tabIcon(tab)), contentDescription = null, tint = color, modifier = Modifier.size(27.dp))
            if (badge > 0) {
                EffyBadge(
                    badge,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .offset(x = 15.dp, y = (-6).dp)
                        .effyBump(badge),
                )
            }
        }
        Text(
            label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 12.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            ),
            color = color,
            maxLines = 1,
        )
    }
}
