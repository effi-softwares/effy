package com.effyshopping.customer.mobile.features.onboarding.presentation

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import com.effyshopping.mobile.kit.ui.MotionLevel
import kotlinx.coroutines.launch

/** One page of the introduction: a photograph and the one thing it is there to say. */
private data class OnboardingPage(val image: String, val headline: String)

/**
 * ⚠ PLACEHOLDER PHOTOGRAPHY — the only remote images this app hardcodes.
 *
 * The source design's onboarding is a full-bleed fashion photograph. Effy is a grocery store, so the
 * equivalent is produce. These are **Unsplash** images — the Unsplash Licence permits free commercial
 * use with no permission and no attribution required — on the same footing 019 used for the seeded
 * catalogue photography (Openverse CC). All three were checked for third-party branding: a shelf full
 * of other companies' logos is the wrong first thing a customer sees in an Effy app.
 *
 * They are **hardcoded and remote**, a deliberate trade recorded rather than hidden:
 *   - each costs a network round trip, on the first screen shown before anything else;
 *   - they depend on a third party staying up, which no other screen in this app does.
 *
 * Acceptable for a placeholder and NOT acceptable for the shipped product. Replace with commissioned
 * or licensed brand photography, bundled as `composeResources/drawable`, before public release.
 * Owning slice: brand photography (unscheduled).
 */
private val ONBOARDING_PAGES = listOf(
    OnboardingPage(
        image = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200&q=80",
        headline = "Everything you need, delivered.",
    ),
    OnboardingPage(
        image = "https://images.unsplash.com/photo-1607349913338-fca6f7fc42d0?w=1200&q=80",
        headline = "Fresh picks, every single day.",
    ),
    OnboardingPage(
        image = "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=1200&q=80",
        headline = "Browse now. Sign in when you're ready.",
    ),
)

/**
 * The first-launch introduction (026 US4 / FR-033).
 *
 * ── ⚠ WHY THERE IS MORE THAN ONE PAGE ───────────────────────────────────────────────────────────
 *
 * FR-033 requires the introduction to be **advanced AND skipped**. This screen used to be a single
 * page with two buttons — "Get Started" and "Skip" — wired to the same `onDone`. They were not merely
 * similar; they were the identical call, so the requirement was formally met and practically not: a
 * one-page introduction has nothing to skip past, and offering the choice was a lie about the flow.
 *
 * With pages the two actions mean different things and the difference is visible:
 *   **Next** walks the sequence · **Get Started** ends it on the last page · **Skip** leaves at once.
 *
 * Skip is hidden on the final page — there it *would* be the same call as Get Started again, and one
 * button that does the job is better than two that pretend to differ.
 *
 * The pager is also swipeable, which is how anyone will actually use it; the buttons exist so the flow
 * is operable without a gesture (and by a screen reader).
 *
 * ── The layout ──────────────────────────────────────────────────────────────────────────────────
 *
 * Photograph above, a solid action band below with a hairline between — the source design's shape.
 *
 * ⚠ THE HEADLINE SITS ON A PHOTOGRAPH, so its contrast cannot be guaranteed by tokens the way every
 * other screen's is. A top-down scrim from the page colour is painted behind it, so the type reads
 * against a known surface rather than against whatever the photograph happens to contain. The actions
 * get the same guarantee from the band; they used to sit on the photo, where "Skip" was near-black
 * text over dark vegetables and effectively invisible.
 */
@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val pages = ONBOARDING_PAGES
    val pagerState = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val motion = LocalMotionLevel.current
    val onLastPage = pagerState.currentPage == pages.lastIndex

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        HorizontalPager(state = pagerState, modifier = Modifier.weight(1f).fillMaxWidth()) { index ->
            Box(modifier = Modifier.fillMaxSize()) {
                AsyncImage(
                    model = pages[index].image,
                    // Decorative: the headline over it already carries the meaning, so announcing the
                    // photograph would only add noise to a screen reader.
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )

                // The legibility scrim — opaque at the top where the headline sits, clear by mid-page.
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

                EffyDisplay(
                    pages[index].headline,
                    size = DisplaySize.Hero,
                    modifier = Modifier
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(
                                WindowInsetsSides.Top + WindowInsetsSides.Horizontal,
                            ),
                        )
                        .padding(EffySpacing.lg),
                )
            }
        }

        // ── The action band ──────────────────────────────────────────────────────────────────────
        //
        // The background is applied BEFORE the bottom inset padding, so the band's colour runs to the
        // physical bottom edge instead of stopping above the gesture area.
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
                PageIndicator(count = pages.size, current = pagerState.currentPage)

                EffyPrimaryButton(
                    if (onLastPage) "Get Started" else "Next",
                    onClick = {
                        if (onLastPage) {
                            onDone()
                        } else {
                            scope.launch {
                                // 025 FR-037: with reduced motion the page still changes — only the
                                // travel goes. `animateScrollToPage` would ignore the preference.
                                if (motion == MotionLevel.None) {
                                    pagerState.scrollToPage(pagerState.currentPage + 1)
                                } else {
                                    pagerState.animateScrollToPage(pagerState.currentPage + 1)
                                }
                            }
                        }
                    },
                    modifier = Modifier.padding(top = EffySpacing.md),
                )

                // ⚠ Absent on the last page, where it would be the same action as Get Started.
                if (!onLastPage) {
                    TextButton(
                        onClick = onDone,
                        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.s),
                    ) {
                        // SemiBold so it reads as an action rather than a caption — subordinate to the
                        // primary button, not decorative.
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

/**
 * Where you are in the sequence.
 *
 * The current page is carried by WIDTH as well as fill, so the position survives grayscale and the
 * monochrome palette (FR-040) — under a single-hue scale a colour-only dot would say almost nothing.
 * Marked decorative for screen readers: the pager itself already announces the page.
 */
@Composable
private fun PageIndicator(count: Int, current: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(count) { index ->
            val selected = index == current
            val width by animateDpAsState(if (selected) 20.dp else 8.dp)
            Box(
                modifier = Modifier
                    .height(8.dp)
                    .width(width)
                    .clip(CircleShape)
                    .background(
                        if (selected) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.outlineVariant
                        },
                    ),
            )
        }
    }
}
