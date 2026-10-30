package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.border
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.lucide_heart
import com.effyshopping.customer.mobile.core.presentation.effyBump
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_favorite_selected
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The heart, on every product tile and on product detail. The accessible name never changes ("Save to saved
 * items"); the state travels in `stateDescription` + `Role.Checkbox`, so a screen reader announces one
 * control whose state changed (swapping `contentDescription` would announce two). Fill and shape carry the
 * state visually. Never `Text("♥")` (`scripts/mobile-guard.sh` fails it): both drawables ship in the
 * design-system mobile assets.
 */
@Composable
fun SaveControl(
    saved: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    // Its own interaction source, and `indication = null`. The card's press feedback belongs to the
    // card; a ripple here would fire the tile's 0.97 squeeze as though the whole tile were tapped.
    val interactions = remember { MutableInteractionSource() }

    // The touch target is an invisible `EffyMinTouchTarget` box around the small glyph, so a miss does not open the tile.
    Box(
        modifier = modifier
            .size(EffyMinTouchTarget)
            .toggleable(
                value = saved,
                interactionSource = interactions,
                indication = null,
                role = Role.Checkbox,
                onValueChange = onToggle,
            )
            .semantics {
                contentDescription = "Save to saved items"
                stateDescription = if (saved) "Saved" else "Not saved"
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(
                if (saved) Res.drawable.ic_favorite_selected else Res.drawable.lucide_heart,
            ),
            // null here: the semantics block above owns the announcement. Setting both makes a
            // screen reader say it twice.
            contentDescription = null,
            modifier = Modifier
                // The heart pops when its state changes (Motion board; off under reduced motion).
                .effyBump(saved)
                // 087 (Product card board): a white square with a hairline behind the glyph - the
                // artwork underneath may be a pale photograph - inside the 48dp target.
                .clip(EffyStorefrontShape.control)
                .background(MaterialTheme.colorScheme.background)
                .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
                .padding(9.dp)
                .size(20.dp),
            // 087 (Product card board): a saved heart is filled in Effy blue; unsaved, a black outline.
            tint = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/**
 * The tile placement: top-right of the product image.
 *
 * The inset is small because the touch target is already large - [SaveControl] is a 48 dp box with
 * a 32 dp scrim centred in it, so the visible heart sits about 12 dp in from the corner while the
 * tappable area reaches almost to it. A bigger inset here would push the glyph into the middle of the
 * artwork; a bigger *target* is what the shopper actually needs, and that is handled inside.
 */
@Composable
fun BoxScope.TileSaveControl(
    saved: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    SaveControl(
        saved = saved,
        onToggle = onToggle,
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(EffySpacing.xs),
    )
}
