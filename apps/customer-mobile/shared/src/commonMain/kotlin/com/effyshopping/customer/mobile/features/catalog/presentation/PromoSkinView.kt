package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.invisibleToUser
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.effyshopping.customer.mobile.core.theme.LocalEffyDark
import com.effyshopping.customer.mobile.features.catalog.domain.PromoLook
import com.effyshopping.customer.mobile.features.catalog.domain.PromoSkinRules
import com.effyshopping.customer.mobile.features.catalog.domain.SkinAlign
import com.effyshopping.customer.mobile.features.catalog.domain.SkinButtonStyle
import com.effyshopping.customer.mobile.features.catalog.domain.SkinChipStyle
import com.effyshopping.customer.mobile.features.catalog.domain.SkinDecorationSet
import com.effyshopping.customer.mobile.features.catalog.domain.SkinLayout
import com.effyshopping.customer.mobile.features.catalog.domain.SkinPicture
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSettings
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextCorner
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextStyle
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_apple
import com.effyshopping.customer.mobile.resources.lucide_arrow_right
import com.effyshopping.customer.mobile.resources.lucide_carrot
import com.effyshopping.customer.mobile.resources.lucide_check
import com.effyshopping.customer.mobile.resources.lucide_citrus
import com.effyshopping.customer.mobile.resources.lucide_coffee
import com.effyshopping.customer.mobile.resources.lucide_copy
import com.effyshopping.customer.mobile.resources.lucide_croissant
import com.effyshopping.customer.mobile.resources.lucide_cup_soda
import com.effyshopping.customer.mobile.resources.lucide_gift
import com.effyshopping.customer.mobile.resources.lucide_ice_cream_cone
import com.effyshopping.customer.mobile.resources.lucide_leaf
import com.effyshopping.customer.mobile.resources.lucide_milk
import com.effyshopping.customer.mobile.resources.lucide_party_popper
import com.effyshopping.customer.mobile.resources.lucide_sandwich
import com.effyshopping.customer.mobile.resources.lucide_snowflake
import com.effyshopping.customer.mobile.resources.lucide_sparkles
import com.effyshopping.customer.mobile.resources.lucide_sun
import com.effyshopping.customer.mobile.resources.lucide_wheat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * 095 — a promotion in a staff-designed skin: the twin of `@effy/web-kit/promo-skin` (`PromoSkin.tsx`).
 * Same layouts, same sizes (dp = px), same words, from [PromoSkinRules].
 *
 * ⚠ A skin's colours are CONTENT (constitution v3.6.0): they come from the skin, were checked for
 * readability by the server, and are used only inside this frame. The skin's own dark colours apply in
 * the dark appearance; without them it looks the same in both (spec US4-3).
 *
 * Reading order: label, headline, supporting line, the picture's description, the action. Decorations
 * are not read. With a code the button copies it; without one, the skin opens the offer.
 */
@Composable
fun PromoSkinView(
    look: PromoLook,
    headline: String,
    supportingLine: String?,
    code: String?,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
    onCopied: (String) -> Unit = {},
) {
    val base = look.settings ?: return
    val s = PromoSkinRules.coloursFor(base, LocalEffyDark.current)
    val size = if (PromoSkinRules.geometry(look.layout, look.size) != null) look.size else PromoSkinRules.defaultSize(look.layout)
    val geo = PromoSkinRules.geometry(look.layout, size) ?: return
    val pad = s.shape.spacing.px.dp
    val shape = RoundedCornerShape(s.shape.radius.px.dp)
    val picture = look.picture
    val opens = code == null && onOpen != null
    val frame = modifier
        .fillMaxWidth()
        .heightIn(min = geo.minHeight.dp)
        .clip(shape)
        .background(colour(s.background.colour))
        .then(s.shape.outline?.let { Modifier.border(1.dp, colour(it), shape) } ?: Modifier)
        .then(if (opens) Modifier.clickable(role = Role.Button, onClickLabel = headline, onClick = onOpen!!) else Modifier)

    when (look.layout) {
        SkinLayout.HEADER_CARD -> Column(frame.background(colour(s.body?.colour ?: "#ffffff"))) {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(colour(s.background.colour))) {
                Backdrop(s, picture, geo.decorations, geo.minHeight)
                Column(Modifier.padding(pad).fillMaxWidth(geo.wordsWidth.toFloat())) { Words(s, headline, null, code, supporting = false) }
            }
            Column(Modifier.padding(horizontal = pad, vertical = pad * 2 / 3), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val body = s.body
                if (code != null && body != null) {
                    Box(
                        Modifier.clip(CircleShape).border(1.dp, colour(body.tagColour).copy(alpha = 0.25f), CircleShape).padding(horizontal = 10.dp, vertical = 3.dp),
                    ) { Text("Code", color = colour(body.tagColour), fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                }
                if (s.supporting.show && supportingLine != null) StyledText(supportingLine, s.supporting.style, s.align)
                Actions(s, code, onCopied)
            }
        }

        SkinLayout.PICTURE_BESIDE -> Row(frame) {
            val words: @Composable () -> Unit = {
                Column(
                    Modifier.weight(1f).padding(pad),
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                    horizontalAlignment = horizontal(s.align),
                ) {
                    Words(s, headline, supportingLine, code, supporting = true)
                    Actions(s, code, onCopied)
                }
            }
            val pic: @Composable () -> Unit = {
                if (picture != null) {
                    Box(Modifier.weight(0.82f).heightIn(min = geo.minHeight.dp).fillMaxHeight()) {
                        Picture(picture, if (s.pictureContain) ContentScale.Fit else ContentScale.Crop, Modifier.matchParentSize())
                    }
                }
            }
            if (s.pictureAtStart) { pic(); words() } else { words(); pic() }
        }

        SkinLayout.STRIP -> Row(frame.padding(horizontal = pad, vertical = pad / 2), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (picture != null) Box(Modifier.size(48.dp).clip(RoundedCornerShape(6.dp))) { Picture(picture, ContentScale.Crop, Modifier.matchParentSize()) }
            Column(Modifier.weight(1f)) { Words(s, headline, null, code, supporting = false) }
            Actions(s, code, onCopied)
        }

        else -> Box(frame) {
            Backdrop(s, picture, geo.decorations, geo.minHeight)
            val corner = when (look.layout) {
                SkinLayout.FULL_PICTURE -> when (s.textCorner) {
                    SkinTextCorner.TOP_START -> Alignment.TopStart
                    SkinTextCorner.CENTER -> Alignment.Center
                    SkinTextCorner.BOTTOM_END -> Alignment.BottomEnd
                    else -> Alignment.BottomStart
                }
                SkinLayout.TILE -> Alignment.BottomStart
                else -> Alignment.CenterStart
            }
            Column(
                Modifier.align(corner).padding(pad).fillMaxWidth(geo.wordsWidth.toFloat()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalAlignment = horizontal(s.align),
            ) {
                Words(s, headline, supportingLine, code, supporting = look.layout != SkinLayout.TILE)
                Actions(s, code, onCopied)
            }
        }
    }
}

/** `#rrggbb` → a colour; an unreadable value draws as black (the server never sends one). */
private fun colour(hex: String): Color = PromoSkinRules.argb(hex)?.let { Color(it) } ?: Color.Black

private fun horizontal(align: SkinAlign): Alignment.Horizontal = when (align) {
    SkinAlign.CENTER -> Alignment.CenterHorizontally
    SkinAlign.END -> Alignment.End
    SkinAlign.START -> Alignment.Start
}

private fun textAlign(align: SkinAlign): TextAlign = when (align) {
    SkinAlign.CENTER -> TextAlign.Center
    SkinAlign.END -> TextAlign.End
    SkinAlign.START -> TextAlign.Start
}

@Composable
private fun StyledText(text: String, style: SkinTextStyle, align: SkinAlign, modifier: Modifier = Modifier) {
    Text(
        text,
        modifier = modifier,
        color = colour(style.colour),
        fontSize = style.size.px.sp,
        fontWeight = FontWeight(style.weight.value),
        lineHeight = (style.size.px * 1.2).sp,
        maxLines = style.lines,
        overflow = TextOverflow.Ellipsis,
        textAlign = textAlign(align),
    )
}

@Composable
private fun ColumnScope.Words(s: SkinSettings, headline: String, supportingLine: String?, code: String?, supporting: Boolean) {
    PromoSkinRules.labelWords(s, code != null)?.let { label ->
        Text(
            label.uppercase(),
            color = colour(s.label.colour),
            fontSize = s.label.size.px.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = if (s.label.wide) 0.08.em else 0.em,
        )
    }
    StyledText(headline, s.headline, s.align, Modifier.semantics { heading() })
    if (supporting && s.supporting.show && supportingLine != null) StyledText(supportingLine, s.supporting.style, s.align)
}

@Composable
private fun Actions(s: SkinSettings, code: String?, onCopied: (String) -> Unit) {
    val words = PromoSkinRules.buttonWords(s, code != null)
    val showChip = s.chip.show && code != null
    if (!showChip && words == null) return
    // ⚠ `LocalClipboardManager` is deprecated for a suspending replacement whose plain-text entry has no
    // common-source factory in CMP 1.11.1 (see PromotionScreen.kt). WARNING level.
    @Suppress("DEPRECATION")
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (showChip) Chip(s, code!!)
        if (words != null) {
            val label = if (copied) "Copied" else words
            val tint = colour(s.button.text)
            val press = if (code != null) Modifier.clickable(role = Role.Button, onClickLabel = "$words: $code") {
                clipboard.setText(AnnotatedString(code))
                onCopied(code)
                copied = true
                scope.launch { delay(2000); copied = false }
            } else Modifier
            val body = when (s.button.style) {
                SkinButtonStyle.FILLED -> Modifier.height(36.dp).clip(RoundedCornerShape(8.dp)).background(colour(s.button.fill)).then(press).padding(horizontal = 14.dp)
                SkinButtonStyle.OUTLINE -> Modifier.height(36.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, tint, RoundedCornerShape(8.dp)).then(press).padding(horizontal = 14.dp)
                else -> press
            }
            Row(body, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (s.button.icon && code != null) {
                    Icon(painterResource(if (copied) Res.drawable.lucide_check else Res.drawable.lucide_copy), contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                }
                Text(label, color = tint, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                if (s.button.icon && code == null) {
                    Icon(painterResource(Res.drawable.lucide_arrow_right), contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

@Composable
private fun Chip(s: SkinSettings, code: String) {
    val text = colour(s.chip.text)
    val shape = RoundedCornerShape(6.dp)
    val frame = when (s.chip.style) {
        SkinChipStyle.FILLED -> Modifier.clip(shape).background(colour(s.chip.fill))
        SkinChipStyle.SOLID -> Modifier.border(1.dp, text, shape)
        SkinChipStyle.DASHED -> Modifier.drawBehind {
            drawRoundRect(text, cornerRadius = CornerRadius(6.dp.toPx()), style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 4f))))
        }
    }
    Box(frame.height(32.dp).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        Text(code, color = text, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge, letterSpacing = 0.02.em)
    }
}

@Composable
private fun Picture(picture: SkinPicture, scale: ContentScale, modifier: Modifier) {
    AsyncImage(
        model = picture.url,
        contentDescription = picture.alt,
        contentScale = scale,
        alignment = BiasAlignment((picture.focusX * 2 - 1).toFloat(), (picture.focusY * 2 - 1).toFloat()),
        modifier = modifier,
    )
}

/** The picture under its tint, or the decorations when there is no picture. */
@Composable
private fun BoxScope.Backdrop(s: SkinSettings, picture: SkinPicture?, decorations: Boolean, height: Int) {
    if (picture != null) {
        Picture(picture, ContentScale.Crop, Modifier.matchParentSize())
        s.background.tint?.let { Box(Modifier.matchParentSize().background(colour(it.colour).copy(alpha = it.strength.toFloat()))) }
    } else if (decorations && s.decorations.show) {
        Decorations(s.decorations.set, colour(s.decorations.colour), s.decorations.strength.toFloat(), height)
    }
}

private val ICONS: Map<SkinDecorationSet, List<DrawableResource>> = mapOf(
    SkinDecorationSet.FOOD to listOf(Res.drawable.lucide_apple, Res.drawable.lucide_milk, Res.drawable.lucide_carrot),
    SkinDecorationSet.PRODUCE to listOf(Res.drawable.lucide_carrot, Res.drawable.lucide_apple, Res.drawable.lucide_leaf),
    SkinDecorationSet.BAKERY to listOf(Res.drawable.lucide_croissant, Res.drawable.lucide_wheat, Res.drawable.lucide_sandwich),
    SkinDecorationSet.DRINKS to listOf(Res.drawable.lucide_cup_soda, Res.drawable.lucide_citrus, Res.drawable.lucide_coffee),
    SkinDecorationSet.SEASONAL_WINTER to listOf(Res.drawable.lucide_snowflake, Res.drawable.lucide_gift, Res.drawable.lucide_coffee),
    SkinDecorationSet.SEASONAL_SUMMER to listOf(Res.drawable.lucide_sun, Res.drawable.lucide_ice_cream_cone, Res.drawable.lucide_citrus),
    SkinDecorationSet.CELEBRATION to listOf(Res.drawable.lucide_gift, Res.drawable.lucide_party_popper, Res.drawable.lucide_sparkles),
)

/** Three bubbles in the same places as the web's (`decorations.tsx` SPOTS), hidden from screen readers. */
@Composable
private fun BoxScope.Decorations(set: SkinDecorationSet, tint: Color, strength: Float, height: Int) {
    val spots = listOf(Triple(0.08f, 0.14f, 0.42f), Triple(0.3f, 0.46f, 0.3f), Triple(0.1f, 0.66f, 0.22f))
    BoxWithConstraints(Modifier.matchParentSize().semantics { invisibleToUser() }) {
        ICONS.getValue(set).forEachIndexed { i, icon ->
            val (right, top, scale) = spots[i]
            val d = (height * scale).dp
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = -(maxWidth * right), y = maxHeight * top)
                    .size(d)
                    .clip(CircleShape)
                    .background(tint.copy(alpha = strength)),
                contentAlignment = Alignment.Center,
            ) { Icon(painterResource(icon), contentDescription = null, tint = tint, modifier = Modifier.size(d / 2)) }
        }
    }
}
