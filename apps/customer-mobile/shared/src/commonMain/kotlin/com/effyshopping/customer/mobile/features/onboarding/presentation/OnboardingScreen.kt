package com.effyshopping.customer.mobile.features.onboarding.presentation

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.presentation.EffyGhostButton
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.EffyWordmark
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.LocalMotionLevel
import com.effyshopping.mobile.kit.ui.MotionLevel
import kotlinx.coroutines.launch

/**
 * The first-launch introduction (026 FR-033; restyled by 087 to the Onboarding board).
 *
 * ⚠ 087 — NO PHOTOGRAPHS AND NO GRADIENT. The old pages hot-linked three Unsplash photographs (network
 * at the very first screen, and someone else's CDN) under a vertical gradient (constitution: flat
 * fills only). The board's art is flat shapes in the storefront's colours on the green tint — drawn
 * here, so it costs nothing to download and cannot fail to load.
 */
private data class OnboardingPage(val headline: String, val body: String)

private val ONBOARDING_PAGES = listOf(
    OnboardingPage(
        "Everything you need, delivered.",
        "Fresh groceries and everyday essentials, brought to your door. Browse freely — sign in only when you order.",
    ),
    OnboardingPage(
        "Fresh picks, every single day.",
        "Choose a delivery window today or on the next few days — or just a day, and we'll come when we can.",
    ),
    OnboardingPage(
        "Browse now. Sign in when you're ready.",
        "Save favourites and fill your cart as a guest. We'll ask who you are at checkout.",
    ),
)

@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val pages = ONBOARDING_PAGES
    val pagerState = rememberPagerState { pages.size }
    val scope = rememberCoroutineScope()
    val motion = LocalMotionLevel.current
    val onLastPage = pagerState.currentPage == pages.lastIndex

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        HorizontalPager(state = pagerState, modifier = Modifier.weight(1f).fillMaxWidth()) { index ->
            Box(modifier = Modifier.fillMaxSize().background(EffyRoles.brandMuted)) {
                OnboardingArt(variant = index, modifier = Modifier.fillMaxSize())
                EffyWordmark(size = 32.sp, modifier = Modifier.padding(start = 24.dp, top = 40.dp))
                Text(
                    pages[index].headline,
                    style = MaterialTheme.typography.displayLarge.copy(fontSize = 44.sp, lineHeight = 46.sp),
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(horizontal = 24.dp, vertical = 40.dp)
                        .semantics { heading() },
                )
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
            Text(pages[pagerState.currentPage].body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                PageIndicator(count = pages.size, current = pagerState.currentPage, modifier = Modifier.weight(1f))
                if (!onLastPage) EffyGhostButton("Skip", onClick = onDone)
            }
            EffyPrimaryButton(
                if (onLastPage) "Get started" else "Next",
                onClick = {
                    if (onLastPage) {
                        onDone()
                    } else {
                        scope.launch {
                            if (motion == MotionLevel.None) pagerState.scrollToPage(pagerState.currentPage + 1)
                            else pagerState.animateScrollToPage(pagerState.currentPage + 1)
                        }
                    }
                },
            )
        }
    }
}

/** The position dots: the current one widens into a blue bar (kept from 026, retimed by 087). */
@Composable
private fun PageIndicator(count: Int, current: Int, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(count) { index ->
            val selected = index == current
            val width by animateDpAsState(if (selected) 20.dp else 8.dp, tween(effyDuration(EffyStorefrontMotion.StandardMillis)), label = "onboardingDot")
            Box(
                modifier = Modifier
                    .height(8.dp)
                    .width(width)
                    .clip(CircleShape)
                    .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
            )
        }
    }
}

/**
 * The board's flat art: arcs, dots and a leaf in Effy green and blue on the green tint. Three
 * variants so each page reads as its own, from the same shapes. Decorative — no semantics.
 */
@Composable
private fun OnboardingArt(variant: Int, modifier: Modifier = Modifier) {
    val green = EffyRoles.brand
    val blue = MaterialTheme.colorScheme.primary
    Canvas(modifier = modifier.clearAndSetSemantics {}) {
        val w = size.width
        val h = size.height
        val flip = variant % 2 == 1
        fun x(f: Float) = if (flip) w * (1 - f) else w * f
        arc(green.copy(alpha = 0.5f), Offset(x(-0.03f), h * 0.29f), w * 0.4f, 30.dp.toPx(), 180f)
        drawCircle(blue.copy(alpha = 0.85f), radius = 26.dp.toPx(), center = Offset(x(0.8f), h * 0.135f))
        drawCircle(blue.copy(alpha = 0.45f), radius = 7.dp.toPx(), center = Offset(x(0.54f), h * 0.23f))
        rotate(12f + variant * 20f, pivot = Offset(x(0.75f), h * 0.35f)) {
            drawRoundRect(
                green.copy(alpha = 0.25f),
                topLeft = Offset(x(0.75f) - 55.dp.toPx(), h * 0.35f - 14.dp.toPx()),
                size = Size(110.dp.toPx(), 28.dp.toPx()),
                cornerRadius = CornerRadius(14.dp.toPx()),
            )
        }
        drawCircle(green.copy(alpha = 0.45f), radius = 36.dp.toPx(), center = Offset(x(0.2f), h * 0.5f), style = Stroke(8.dp.toPx()))
        arc(green.copy(alpha = 0.35f), Offset(x(0.64f), h * 0.98f), w * 0.38f, 30.dp.toPx(), 0f)
        drawCircle(blue.copy(alpha = 0.6f), radius = 7.dp.toPx(), center = Offset(x(0.38f), h * 0.83f))
    }
}

private fun DrawScope.arc(color: androidx.compose.ui.graphics.Color, center: Offset, radius: Float, stroke: Float, start: Float) {
    drawArc(
        color = color,
        startAngle = start,
        sweepAngle = 90f,
        useCenter = false,
        topLeft = Offset(center.x - radius, center.y - radius),
        size = Size(radius * 2, radius * 2),
        style = Stroke(stroke),
    )
}
