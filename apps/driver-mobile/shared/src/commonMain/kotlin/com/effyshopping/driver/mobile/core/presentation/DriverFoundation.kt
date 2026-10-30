package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/**
 * The driver kit's sizes (092 - the canvas's "Sizes for the road"). Drivers work one-handed, outdoors,
 * sometimes in gloves: targets are bigger than the customer app's, and the one next action sits at
 * the bottom of every screen.
 */
object DriverSize {
    /** The screen gutter. */
    val gutter = 16.dp
    /** The smallest tappable area. */
    val target = 48.dp
    /** A primary action, pinned at the bottom. */
    val primary = 56.dp
    /** A secondary action. */
    val secondary = 52.dp
    /** A list row. */
    val row = 64.dp
    /** A list row with a meta line. */
    val rowTall = 72.dp
    /** A tab root's large-title bar. */
    val largeTitleBar = 60.dp
    /** A pushed screen's bar. */
    val pushedBar = 52.dp
}

/** A Lucide glyph from the driver's resources, tinted with the current content colour by default. */
@Composable
fun DriverIcon(
    icon: DrawableResource,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    tint: Color = LocalContentColor.current,
    contentDescription: String? = null,
) {
    Icon(painterResource(icon), contentDescription = contentDescription, tint = tint, modifier = modifier.size(size))
}
