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

    // ⚠ THE TOUCH TARGET IS A BOX AROUND THE GLYPH, NOT THE GLYPH.
    //
    // This used to hang `toggleable` on the Icon itself: a 24 dp glyph with 4 dp of padding is a
    // **32 dp** target, while the comment above it claimed it "clears the 48dp fat-finger minimum".
    // It did not, and the constitution's minimum is not a suggestion — this is the control people
    // reach for in the corner of a tile, so a miss lands on the tile and navigates away from what
    // they were trying to save. The invisible box is `EffyMinTouchTarget`; the visible scrim stays
    // small.
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
            // ⚠ null here: the semantics block above owns the announcement. Setting both makes a
            // screen reader say it twice.
            contentDescription = null,
            modifier = Modifier
                // 087 — the heart pops when its state changes (Motion board; off under reduced motion).
                .effyBump(saved)
                // 087 (Product card board): a white square with a hairline behind the glyph — the
                // artwork underneath may be a pale photograph — inside the 48dp target.
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
 * ⚠ The inset is SMALL because the touch target is already large — [SaveControl] is a 48 dp box with
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
