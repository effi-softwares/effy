package com.effyshopping.customer.mobile.features.saved.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_favorite_outlined
import com.effyshopping.customer.mobile.resources.ic_favorite_selected
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The heart. One toggle, used on every product tile and on product detail.
 *
 * ⚠ ACCESSIBILITY (FR-058). The accessible NAME never changes — it is always "Save to saved items" —
 * and the pressed/unpressed state travels separately in `stateDescription` + `Role.Checkbox`, so a
 * screen reader announces one consistent control whose state changed rather than two different
 * controls. The predecessor's web button swapped its `aria-label` AND set `aria-pressed`, which
 * double-announces; the same mistake in Compose is swapping `contentDescription`.
 *
 * ⚠ COLOUR CANNOT CARRY THIS (SC-009). The brand is monochrome with no hue, so a filled heart has no
 * colour cue distinguishing it from an outlined one — fill, shape and the announced state carry the
 * entire burden. That is a real, testable risk, not a formality, and it is why SC-009 requires
 * observation with real people including a screen-reader user.
 *
 * ⚠ NEVER `Text("♥")`. `scripts/mobile-guard.sh` fails the build on the text glyphs this used to be
 * (025 SC-006); both drawables already ship in the design-system mobile-assets SSOT.
 */
@Composable
fun SaveControl(
    saved: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    // ⚠ Its OWN interaction source, and `indication = null`. The card's press feedback belongs to the
    // card; a ripple here would fire the tile's 0.97 squeeze as though the whole tile were tapped.
    val interactions = remember { MutableInteractionSource() }

    Icon(
        painter = painterResource(
            if (saved) Res.drawable.ic_favorite_selected else Res.drawable.ic_favorite_outlined,
        ),
        // ⚠ null here: the semantics block below owns the announcement. Setting both makes a screen
        // reader say it twice.
        contentDescription = null,
        modifier = modifier
            // A scrim behind the glyph, because the artwork underneath is a photograph and a bare
            // outline disappears over a pale one.
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f))
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
            }
            .padding(EffySpacing.xs)
            .size(24.dp),
        tint = MaterialTheme.colorScheme.onSurface,
    )
}

/**
 * The tile placement: top-right of the product image.
 *
 * ⚠ The touch target is deliberately larger than the glyph. 24dp of icon inside padding clears the
 * 48dp fat-finger minimum the constitution requires — a heart in the corner of a tile is exactly the
 * control people miss and then mis-tap into the product.
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
            .padding(EffySpacing.s),
    )
}
