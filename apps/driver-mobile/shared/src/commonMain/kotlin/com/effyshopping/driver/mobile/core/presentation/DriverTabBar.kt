package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.core.nav.DriverTab
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_history
import com.effyshopping.driver.mobile.resources.lucide_truck
import com.effyshopping.driver.mobile.resources.lucide_user_round

/**
 * The tab bar (redesign `04 Tab bar`): three equal tabs on a hairline, a 27 dp Lucide icon over a 12 sp
 * label; the selected tab is blue, semibold, with a short blue bar beneath it. Shown on tab roots only.
 */
@Composable
fun DriverTabBar(selected: DriverTab, onSelect: (DriverTab) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Column(modifier.fillMaxWidth().background(scheme.background)) {
        HorizontalDivider(color = scheme.outlineVariant)
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 4.dp).padding(top = 6.dp, bottom = 4.dp).selectableGroup(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            DriverTab.entries.forEach { tab ->
                val on = tab == selected
                val bar by animateFloatAsState(if (on) 1f else 0f, tween(180), label = "tab-bar")
                Column(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 58.dp)
                        .selectable(
                            selected = on,
                            role = Role.Tab,
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = { onSelect(tab) },
                        ),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
                ) {
                    DriverIcon(
                        when (tab) {
                            DriverTab.TODAY -> Res.drawable.lucide_truck
                            DriverTab.HISTORY -> Res.drawable.lucide_history
                            DriverTab.ACCOUNT -> Res.drawable.lucide_user_round
                        },
                        size = 27.dp,
                        tint = if (on) scheme.primary else scheme.onSurfaceVariant,
                    )
                    Text(
                        tab.label,
                        fontSize = 12.sp,
                        lineHeight = 14.sp,
                        fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (on) scheme.primary else scheme.onSurfaceVariant,
                    )
                    Box(Modifier.padding(top = 2.dp).fillMaxWidth(0.44f).height(3.dp).alpha(bar).clip(CircleShape).background(scheme.primary))
                }
            }
        }
    }
}
