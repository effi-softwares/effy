package com.effyshopping.customer.mobile.features.onboarding.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import coil3.compose.AsyncImage
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.mobile.design.EffySpacing

/**
 * ⚠ PLACEHOLDER PHOTOGRAPHY, and the only remote image this app hardcodes.
 *
 * The source design's onboarding screen is a full-bleed fashion photograph. Effy is a grocery store,
 * so the equivalent is produce. This is an **Unsplash** image — the Unsplash Licence permits free
 * commercial use with no permission and no attribution required — chosen because it is the same
 * footing 019 used for the seeded catalogue photography (Openverse CC).
 *
 * It is **hardcoded and remote**, which is a deliberate trade recorded rather than hidden:
 *   - it costs a network round trip on first launch, on the one screen shown before anything else;
 *   - it depends on a third party staying up, which no other screen in this app does.
 *
 * Both are acceptable for a placeholder and NOT acceptable for the shipped product. Replace with
 * commissioned or licensed brand photography, bundled as a `composeResources/drawable`, before public
 * release. Owning slice: brand photography (unscheduled).
 */
private const val ONBOARDING_IMAGE =
    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80"

/**
 * The first-launch introduction (026 US4 / FR-033), composed to the source design's onboarding screen:
 * a full-bleed photograph, an oversized display headline over the top of it, and a single full-width
 * primary action pinned to the bottom.
 *
 * FR-033 requires it to be advanceable AND skippable, and never to reappear — both are the caller's
 * job via [onDone], which writes the device-local flag.
 *
 * ⚠ THE HEADLINE SITS ON A PHOTOGRAPH, so its contrast cannot be guaranteed by tokens the way every
 * other screen's is. A top-down scrim from the page colour is painted behind it: the type then reads
 * against a known surface rather than against whatever the photograph happens to contain, which is
 * the only way this screen can honour the same AA floor as the rest of the app.
 */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AsyncImage(
            model = ONBOARDING_IMAGE,
            // Decorative: the headline beside it already carries the meaning, so announcing the
            // photograph would only add noise to a screen reader.
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        // The legibility scrim — opaque at the top where the headline sits, clear by mid-screen.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to MaterialTheme.colorScheme.background,
                        0.42f to MaterialTheme.colorScheme.background,
                        0.62f to Color.Transparent,
                    ),
                ),
        )

        Column(modifier = Modifier.fillMaxSize()) {
            // The headline clears the status bar; the photograph behind it does not.
            EffyDisplay(
                "Everything you need, delivered.",
                size = DisplaySize.Hero,
                modifier = Modifier
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal),
                    )
                    .padding(EffySpacing.lg),
            )

            Box(modifier = Modifier.weight(1f))

            // ── The action band ──────────────────────────────────────────────────────────────────
            //
            // ⚠ A SOLID band, not buttons floating on the photograph — this is what the source design
            // does, and here it is also the only way the actions can be legible. "Skip" is a text
            // action drawn in `primary`; over the photo it was near-black on dark vegetables and
            // effectively invisible. The file header already committed to contrast "against a known
            // surface rather than against whatever the photograph happens to contain" — the top scrim
            // delivered that for the headline and nothing delivered it down here.
            //
            // The background is applied BEFORE the bottom inset padding, so the band's colour runs to
            // the physical bottom edge instead of stopping above the gesture area.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal),
                    ),
            ) {
                EffyHairline()
                Column(modifier = Modifier.padding(EffySpacing.lg)) {
                    EffyPrimaryButton("Get Started", onClick = onDone)
                    TextButton(
                        onClick = onDone,
                        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
                    ) {
                        // SemiBold so it reads as an action rather than a caption — it is subordinate
                        // to Get Started, not decorative.
                        Text(
                            "Skip",
                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                        )
                    }
                }
            }
        }
    }
}
