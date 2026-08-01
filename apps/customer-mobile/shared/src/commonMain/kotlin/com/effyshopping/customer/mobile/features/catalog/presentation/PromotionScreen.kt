package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyPullToRefresh
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.core.presentation.ProductImage
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import com.effyshopping.mobile.design.EffyBanner
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing

/**
 * The promotion detail — where a banner tap now leads.
 *
 * ── ⚠ WHY THIS SCREEN EXISTS ────────────────────────────────────────────────────────────────────
 *
 * Every banner used to target `{kind: "search"}`, so a tap opened the unfiltered store: the Search tab
 * by another name, carrying none of the promotion's own facts — not the code, not the terms. It read
 * as a bug because it behaved like one.
 *
 * The reason no better destination existed is in the data model, not in the navigation: `promo_code`
 * has no product or category scoping. A promotion is a whole-cart discount with an optional minimum,
 * so there is no set of qualifying products a results list could be filtered to. A cart-level code is
 * a message, and the destination for a message is the message itself, stated in full.
 *
 * ⚠ IT DOES NOT VIOLATE 028 FR-034 (no banner-only destinations). That rule protects shoppers from
 * CONTENT reachable only through a carousel slide most of them never see. This page contains nothing
 * the banner face does not already announce — it is the banner's own message, expanded, with the
 * ordinary store one tap further on.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────────────────────────
 *
 * A sectioned page with detail rows, NOT cards (DOCTRINE-2). The artwork is rendered at the same
 * locked [EffyBanner.ratio] the banner uses, so the picture an operator approved is the picture the
 * shopper sees — no crop, at either end.
 */
@Composable
fun PromotionScreen(
    container: AppContainer,
    promotionId: String,
    onBack: () -> Unit,
    onBrowse: () -> Unit,
    onCart: () -> Unit,
) {
    val vm = viewModel(key = promotionId) {
        PromotionViewModel(promotionId = promotionId, getPromotion = container.getPromotion)
    }
    val state by vm.state.collectAsState()
    val justCopied by vm.justCopied.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Offer", onBack = onBack)

        when (val s = state) {
            PromotionUiState.Loading ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }

            // ⚠ NO "Try again" here, and that is the whole reason this state is separate from [Failed].
            // The promotion is genuinely gone; retrying would fail forever, and inviting it would keep
            // a shopper waiting for a discount that is not coming.
            PromotionUiState.Unavailable ->
                PromotionMessage(
                    title = "This offer has ended",
                    body = "It may have expired or been fully claimed. There may be others on the home screen.",
                    action = "Browse products",
                    onAction = onBrowse,
                )

            PromotionUiState.Failed ->
                PromotionMessage(
                    title = "We couldn’t load this offer",
                    body = "Check your connection and try again.",
                    action = "Try again",
                    onAction = vm::load,
                )

            is PromotionUiState.Ready -> PromotionBody(
                promotion = s.promotion,
                justCopied = justCopied,
                onCopied = vm::onCodeCopied,
                onRefresh = vm::refresh,
                onBrowse = onBrowse,
                onCart = onCart,
            )
        }
    }
}

@Composable
private fun PromotionBody(
    promotion: Promotion,
    justCopied: Boolean,
    onCopied: () -> Unit,
    onRefresh: suspend () -> Unit,
    onBrowse: () -> Unit,
    onCart: () -> Unit,
) {
    // ⚠ `LocalClipboardManager` is deprecated in favour of the suspending `LocalClipboard`, which is
    // used deliberately anyway: the replacement's `ClipEntry` has no common-source factory in Compose
    // Multiplatform 1.11.1 (`withPlainText` lives in `iosMain`), so taking it would mean an
    // expect/actual pair on both platforms to copy one string. The deprecation is WARNING level.
    @Suppress("DEPRECATION")
    val clipboard = LocalClipboardManager.current

    EffyPullToRefresh(onRefresh = onRefresh) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        ) {
            if (promotion.imageUrl != null) {
                PromotionArtwork(imageUrl = promotion.imageUrl)
            }

            Column(
                modifier = Modifier.padding(EffySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.xs),
            ) {
                Text(promotion.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold))
                if (!promotion.subtitle.isNullOrBlank()) {
                    Text(
                        promotion.subtitle,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            EffyHairline()

            // ── The code ───────────────────────────────────────────────────────────────────────
            //
            // The reason a shopper opened this screen. It is selectable-looking and copyable rather
            // than something to memorise and retype — a mistyped code reads to a shopper as a refused
            // offer, and they blame the offer.
            Row(
                modifier = Modifier.fillMaxWidth().padding(EffySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                    Text(
                        "Code",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        promotion.code,
                        modifier = Modifier
                            .border(
                                width = 1.dp,
                                color = MaterialTheme.colorScheme.outline,
                                shape = RoundedCornerShape(EffyRadius.sm),
                            )
                            .padding(horizontal = EffySpacing.md, vertical = EffySpacing.s),
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    )
                }
                Button(onClick = {
                    clipboard.setText(AnnotatedString(promotion.code))
                    onCopied()
                }) {
                    Text(if (justCopied) "Copied" else "Copy")
                }
            }

            EffyHairline()

            DetailRow(label = "Conditions", value = promotion.terms ?: "No minimum spend")
            DetailRow(label = "Availability", value = promotion.validity ?: "No end date")

            EffyHairline()

            Column(
                modifier = Modifier.padding(EffySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
            ) {
                Text("How to use it", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                Text(
                    "Add what you want to your cart, then enter this code in the cart to apply the " +
                        "discount before you check out.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(
                modifier = Modifier.fillMaxWidth().padding(EffySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
            ) {
                EffyPrimaryButton(label = "Browse products", onClick = onBrowse, modifier = Modifier.fillMaxWidth())
                TextButton(onClick = onCart, modifier = Modifier.fillMaxWidth()) { Text("Go to cart") }
            }
        }
    }
}

/**
 * The artwork, at the SAME locked ratio and maximum width the banner uses — so the picture is the one
 * the operator approved, at the one shape the platform accepts, and a tablet gets no promotional slab.
 * No scrim: nothing is drawn over it here, so nothing needs protecting from it.
 */
@Composable
private fun PromotionArtwork(imageUrl: String) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val width = if (maxWidth <= EffyBanner.maxRenderWidth) maxWidth else EffyBanner.maxRenderWidth
        Box(
            modifier = Modifier
                .width(width)
                .aspectRatio(EffyBanner.ratio)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(EffySurface.tint),
        ) {
            // ⚠ An EMPTY name, not the title. The heading directly below is this promotion's
            // accessible name; labelling the artwork too would make a screen reader announce the same
            // offer twice, once as a picture. The artwork carries no information the text does not.
            ProductImage(imageUrl, "", modifier = Modifier.matchParentSize())
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md)
            // One announcement per row: a screen reader reading "Conditions" and "On orders over
            // $30.00" as two unrelated fragments loses the fact that one qualifies the other.
            .semantics(mergeDescendants = true) { contentDescription = "$label: $value" },
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            value,
            modifier = Modifier.weight(2f),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun PromotionMessage(title: String, body: String, action: String, onAction: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(EffySpacing.xl), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Button(onClick = onAction) { Text(action) }
        }
    }
}
