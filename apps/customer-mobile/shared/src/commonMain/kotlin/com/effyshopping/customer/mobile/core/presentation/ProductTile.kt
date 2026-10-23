package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.layout.height
import com.effyshopping.customer.mobile.resources.lucide_arrow_right
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_plus
import com.effyshopping.mobile.design.EffyBanner
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.WindowWidth
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * The product tile — one for every product listing in the app (Product card board).
 *
 * A grey image well (8dp corners, no border, no shadow — the well separates it from the page), the
 * Sale badge top-left, the save heart top-right ([imageOverlay]), and the ADD button bottom-right:
 * a white "+" that morphs into a blue quantity stepper once the product is in the cart (Motion board,
 * 250ms). Below: brand, name (two lines), price in tabular bold with the struck price and the saving
 * in Effy green.
 *
 * The add control appears only when the caller passes [onCartQuantityChange]; a tile can still be a
 * plain link. The picture carries the shared-element key `product-image-<id>`, so opening the product
 * grows it into the product page's gallery (Page transitions board).
 *
 * [fillHeight] stretches a tile to its grid row so price rows line up across a row.
 */
@Composable
fun EffyProductCard(
    product: ProductCard,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    fillHeight: Boolean = false,
    imageOverlay: (@Composable BoxScope.() -> Unit)? = null,
    cartQuantity: Int = 0,
    onCartQuantityChange: ((Int) -> Unit)? = null,
) {
    val percentOff = discountPercent(product.priceAmount, product.compareAtAmount)
    val interactions = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .then(if (fillHeight) Modifier.fillMaxSize() else Modifier)
            .effyPress(interactions, 0.97f)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = product.name) {
                onClick(product.id)
            },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .effySharedElement("product-image-${product.id}")
                .clip(EffyStorefrontShape.card)
                .background(EffySurface.tint),
        ) {
            ProductImage(product.imageUrl, product.name, modifier = Modifier.fillMaxSize())

            // An offer on the product leads: it is what the cart will apply.
            if (product.offerLabel != null && product.available) {
                EffySaleBadge(modifier = Modifier.align(Alignment.TopStart).padding(EffySpacing.s), text = product.offerLabel)
            } else if (product.badges.contains(ProductBadge.ON_SALE) || percentOff != null) {
                EffySaleBadge(modifier = Modifier.align(Alignment.TopStart).padding(EffySpacing.s))
            } else if (product.badges.contains(ProductBadge.NEW)) {
                EffySaleBadge(modifier = Modifier.align(Alignment.TopStart).padding(EffySpacing.s), text = "New")
            }

            if (!product.available) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(EffySpacing.s)
                        .clip(EffyStorefrontShape.small)
                        .background(MaterialTheme.colorScheme.onSurface)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text("Unavailable", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.background)
                }
            }

            // The heart sits above the unavailable label: a shopper must still be able to un-save.
            imageOverlay?.invoke(this)

            if (onCartQuantityChange != null && product.available && product.variantCount > 1) {
                // Sold in several sizes: the shopper chooses on the product page; never a guessed size.
                TileChooseControl(
                    name = product.name,
                    onClick = { onClick(product.id) },
                    modifier = Modifier.align(Alignment.BottomEnd).padding(EffySpacing.s),
                )
            } else if (onCartQuantityChange != null && product.available) {
                TileCartControl(
                    name = product.name,
                    quantity = cartQuantity,
                    onChange = onCartQuantityChange,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(EffySpacing.s),
                )
            }
        }

        if (!product.brand.isNullOrBlank()) {
            Text(
                product.brand,
                modifier = Modifier.padding(top = EffySpacing.s),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            product.name,
            modifier = Modifier.padding(top = if (product.brand.isNullOrBlank()) EffySpacing.s else 2.dp),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        if (fillHeight) Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.padding(top = EffySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Sizes at different prices: the lowest, said as a lowest.
            if (product.priceVaries) {
                Text("From", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                money(product.priceAmount, product.currency),
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum"),
            )
            if (percentOff != null && product.compareAtAmount != null) {
                Text(
                    money(product.compareAtAmount, product.currency),
                    style = MaterialTheme.typography.bodySmall.copy(textDecoration = TextDecoration.LineThrough),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DiscountChip(percentOff)
            }
        }
        UnitPriceText(product.unitPrice)
    }
}

/** The tile's control for a product sold in several sizes: "Choose" opens the product. */
@Composable
private fun TileChooseControl(name: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interactions = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .effyPress(interactions)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Choose a size of $name", onClick = onClick)
            .clip(EffyStorefrontShape.control)
            .background(MaterialTheme.colorScheme.background)
            .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
            .padding(horizontal = EffySpacing.md, vertical = 6.dp),
    ) {
        Text("Choose", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold))
    }
}

/** The tile's add control: "+" while not in the cart, a blue stepper once it is. */
@Composable
private fun TileCartControl(
    name: String,
    quantity: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tick = EffyHaptics.tick()
    val duration = effyDuration(EffyStorefrontMotion.MorphMillis)
    AnimatedContent(
        targetState = quantity > 0,
        modifier = modifier,
        transitionSpec = {
            (fadeIn(tween(duration)) togetherWith fadeOut(tween(duration / 2)))
                .using(SizeTransform(clip = false) { _, _ -> tween(duration) })
        },
        contentAlignment = Alignment.BottomEnd,
        label = "tileAdd",
    ) { inCart ->
        if (inCart) {
            EffyQuantityStepper(
                quantity = quantity,
                onChange = onChange,
                minimum = 0,
                primary = true,
                decreaseLabel = if (quantity == 1) "Remove $name" else "Remove one",
            )
        } else {
            val interactions = remember { MutableInteractionSource() }
            Box(
                modifier = Modifier
                    .size(EffySize.target)
                    .effyPress(interactions, 0.9f)
                    .clip(EffyStorefrontShape.control)
                    .background(MaterialTheme.colorScheme.background)
                    .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.control)
                    .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Add $name to cart") {
                        tick()
                        onChange(1)
                    },
                contentAlignment = Alignment.Center,
            ) {
                Icon(painterResource(Res.drawable.lucide_plus), contentDescription = "Add $name to cart", modifier = Modifier.size(20.dp))
            }
        }
    }
}

// Home rails

/** Vertical gap between Home's blocks. */
val HomeSectionGap = EffySpacing.xl + EffySpacing.s

/** Horizontal gap between tiles inside a rail. */
val RailItemGap = EffySpacing.md

/**
 * How much of the window one rail tile occupies — 2.2 tiles on a phone (Foundations board), so the
 * third peeks and the rail reads as scrollable. None of these divide 1.0 evenly (RailSizingTest).
 */
fun railTileWidthFraction(width: WindowWidth): Float = when (width) {
    WindowWidth.COMPACT -> 0.42f
    WindowWidth.MEDIUM -> 0.28f
    WindowWidth.EXPANDED -> 0.22f
}

/** A product tile sized for a horizontally scrolling rail; the caller resolves [width] where constraints are real. */
@Composable
fun EffyRailTile(
    product: ProductCard,
    onClick: (String) -> Unit,
    width: Dp,
    modifier: Modifier = Modifier,
    imageOverlay: (@Composable BoxScope.() -> Unit)? = null,
    cartQuantity: Int = 0,
    onCartQuantityChange: ((Int) -> Unit)? = null,
) {
    EffyProductCard(
        product,
        onClick,
        modifier = modifier.width(width),
        imageOverlay = imageOverlay,
        cartQuantity = cartQuantity,
        onCartQuantityChange = onCartQuantityChange,
    )
}

// Banners

/** The width a banner renders at: the full width on a phone, capped (and centred) beyond that. */
fun bannerRenderWidth(available: Dp): Dp =
    if (available <= EffyBanner.maxRenderWidth) available else EffyBanner.maxRenderWidth

/**
 * A promotional banner. Flat fills only: over artwork the message sits on a flat black panel at the
 * bottom-left, so its contrast is known whatever the photograph does; with no artwork it is a flat
 * Effy-green panel with white type.
 */
@Composable
fun EffyPromoBanner(
    title: String,
    subtitle: String?,
    terms: String?,
    code: String?,
    imageUrl: String?,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val onPanel = MaterialTheme.colorScheme.background
    BoxWithConstraints(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val width = bannerRenderWidth(maxWidth)
        val interactions = remember { MutableInteractionSource() }
        Box(
            modifier = Modifier
                .width(width)
                .aspectRatio(EffyBanner.ratio)
                .then(if (onClick != null) Modifier.effyPress(interactions, 0.99f) else Modifier)
                .clip(EffyStorefrontShape.banner)
                .background(if (imageUrl != null) EffySurface.tint else EffyRoles.brand)
                .then(
                    if (onClick != null) Modifier.clickable(interactionSource = interactions, indication = null, onClickLabel = title, onClick = onClick)
                    else Modifier,
                ),
        ) {
            if (imageUrl != null) ProductImage(imageUrl, title, modifier = Modifier.matchParentSize())

            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth(EffyBanner.textWidth)
                    .padding(start = width * EffyBanner.textInsetLeft, bottom = width / EffyBanner.ratio * EffyBanner.textInsetBottom)
                    .then(
                        if (imageUrl != null) {
                            Modifier.clip(EffyStorefrontShape.card).background(MaterialTheme.colorScheme.onSurface).padding(EffySpacing.md)
                        } else {
                            Modifier
                        },
                    ),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = onPanel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, modifier = Modifier.padding(top = EffySpacing.xs), style = MaterialTheme.typography.bodySmall, color = onPanel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!terms.isNullOrBlank()) {
                    Text(terms, modifier = Modifier.padding(top = EffySpacing.xs), style = MaterialTheme.typography.labelSmall, color = onPanel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!code.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .padding(top = EffySpacing.s)
                            .clip(EffyStorefrontShape.small)
                            .border(1.dp, onPanel, EffyStorefrontShape.small)
                            .padding(horizontal = EffySpacing.s, vertical = 2.dp),
                    ) {
                        Text(code, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum"), color = onPanel, maxLines = 1)
                    }
                }
            }
        }
    }
}

/**
 * One aisle shortcut: a round zinc well with the aisle's glyph, the name beneath (Main board).
 * The whole column is the target.
 */
@Composable
fun EffyCategoryShortcut(
    label: String,
    icon: DrawableResource,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactions = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .widthIn(min = 76.dp, max = 88.dp)
            .effyPress(interactions, 0.95f)
            .clip(EffyStorefrontShape.card)
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = label, onClick = onClick)
            .padding(vertical = EffySpacing.xs, horizontal = EffySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(72.dp).clip(CircleShape).background(EffySurface.tint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(30.dp), tint = MaterialTheme.colorScheme.onSurface)
        }
        Text(
            label,
            modifier = Modifier.padding(top = EffySpacing.s),
            style = MaterialTheme.typography.labelMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The home hero (Main board, "This week's offer") — a flat Effy-green panel, 232dp, with white type:
 * a small uppercase eyebrow, a 26sp bold headline, one sentence, a white "View offer" button, the
 * pager's dots bottom-right and the offer's glyph in a translucent circle top-right. The board's
 * decorative arcs are drawn, not downloaded.
 *
 * Flat, not a photograph. The design's banners are colour and type; an operator's artwork is not
 * drawn here (Foundations: "promo grounds — banner artwork only, white type"). The ground is the
 * storefront's own green (`--brand`), not a new colour: the constitution allows the storefront no
 * third hue, so the board's violet offer card is drawn in Effy blue instead.
 */
@Composable
fun EffyHeroBanner(
    eyebrow: String,
    title: String,
    body: String?,
    icon: DrawableResource,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    dots: (@Composable () -> Unit)? = null,
) {
    val white = androidx.compose.ui.graphics.Color.White
    val interactions = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(232.dp)
            .then(if (onClick != null) Modifier.effyPress(interactions, 0.99f) else Modifier)
            .clip(EffyStorefrontShape.banner)
            // A promo ground carries white type, so it is the light palette's green in both appearances.
            .background(EffyRoles.promoGround)
            .then(if (onClick != null) Modifier.clickable(interactionSource = interactions, indication = null, onClickLabel = title, onClick = onClick) else Modifier),
    ) {
        PromoArt(Modifier.matchParentSize())
        Box(
            modifier = Modifier.align(Alignment.TopEnd).padding(20.dp).size(72.dp).clip(CircleShape).background(white.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) { Icon(painterResource(icon), contentDescription = null, tint = white, modifier = Modifier.size(36.dp)) }
        Column(
            modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp), color = white.copy(alpha = 0.85f))
            Text(title, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold), color = white, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 250.dp))
            if (!body.isNullOrBlank()) Text(body, style = MaterialTheme.typography.bodyMedium, color = white.copy(alpha = 0.92f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                if (onClick != null) {
                    Box(
                        modifier = Modifier.height(48.dp).clip(EffyStorefrontShape.control).background(white).padding(horizontal = 20.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("View offer", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = EffyRoles.splashGround) }
                }
                Spacer(Modifier.weight(1f))
                dots?.invoke()
            }
        }
    }
}

/**
 * An offer card in the Home "Offers" row (Main board): 300×150, a flat ground with white type, an
 * uppercase eyebrow ("Offer" or "Code"), a 20sp title, and either "View offer →" or the code in a
 * dashed box. [alternate] switches the ground from Effy blue to Effy green.
 */
@Composable
fun EffyOfferCard(
    title: String,
    code: String?,
    icon: DrawableResource,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    alternate: Boolean = false,
) {
    val white = androidx.compose.ui.graphics.Color.White
    val interactions = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .width(300.dp)
            .height(150.dp)
            .then(if (onClick != null) Modifier.effyPress(interactions, 0.98f) else Modifier)
            .clip(EffyStorefrontShape.banner)
            .background(if (alternate) EffyRoles.promoGround else EffyRoles.promoBlue)
            .then(if (onClick != null) Modifier.clickable(interactionSource = interactions, indication = null, onClickLabel = title, onClick = onClick) else Modifier),
    ) {
        PromoArt(Modifier.matchParentSize())
        Box(
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp).size(56.dp).clip(CircleShape).background(white.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) { Icon(painterResource(icon), contentDescription = null, tint = white, modifier = Modifier.size(28.dp)) }
        Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.widthIn(max = 200.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (code != null) "CODE" else "OFFER", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.9.sp), color = white.copy(alpha = 0.85f))
                Text(title, style = MaterialTheme.typography.titleLarge.copy(lineHeight = 23.sp), color = white, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (code != null) {
                Box(
                    modifier = Modifier
                        .height(28.dp)
                        .drawBehind {
                            drawRoundRect(
                                white.copy(alpha = 0.7f),
                                cornerRadius = androidx.compose.ui.geometry.CornerRadius(6.dp.toPx()),
                                style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx(), pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(5f, 4f))),
                            )
                        }
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(code, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp), color = white) }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("View offer", style = MaterialTheme.typography.labelMedium, color = white)
                    Icon(painterResource(Res.drawable.lucide_arrow_right), contentDescription = null, tint = white, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}

/** The board's decorative arcs and dots on a promo ground — white at low alpha, purely ornamental. */
@Composable
private fun PromoArt(modifier: Modifier) {
    androidx.compose.foundation.Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val white = androidx.compose.ui.graphics.Color.White
        val r = h * 0.6f
        drawArc(white.copy(alpha = 0.3f), startAngle = 270f, sweepAngle = 90f, useCenter = false,
            topLeft = androidx.compose.ui.geometry.Offset(w * 0.66f - r * 0.1f, -h * 0.11f - r), size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
            style = androidx.compose.ui.graphics.drawscope.Stroke(h * 0.12f))
        drawCircle(white.copy(alpha = 0.18f), radius = h * 0.19f, center = androidx.compose.ui.geometry.Offset(w * 0.125f, h),
            style = androidx.compose.ui.graphics.drawscope.Stroke(h * 0.028f))
        drawCircle(white.copy(alpha = 0.35f), radius = h * 0.028f, center = androidx.compose.ui.geometry.Offset(w * 0.47f, h * 0.17f))
    }
}
