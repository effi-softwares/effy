package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.ic_arrow_back
import org.jetbrains.compose.resources.painterResource

/**
 * The one back control: a 48 dp bordered square with the shared arrow icon.
 *
 * ⚠ Five headers each drew their own, and each drew the arrow as a TEXT CHARACTER ("←", "‹ Back") —
 * which a screen reader announces as "leftwards arrow", and which changes shape with the font.
 */
@Composable
fun BackButton(onBack: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(11.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.size(48.dp).clickable(role = Role.Button, onClickLabel = "Back", onClick = onBack),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                painter = painterResource(Res.drawable.ic_arrow_back),
                contentDescription = "Back",
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}
