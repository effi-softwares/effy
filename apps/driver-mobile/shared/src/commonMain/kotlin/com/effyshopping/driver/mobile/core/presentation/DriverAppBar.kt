package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.lucide_chevron_left

/**
 * A tab root's bar: a large title (34 sp bold, the iOS large-title look on both platforms, as drawn),
 * with an optional trailing slot (the duty toggle on Today).
 */
@Composable
fun DriverLargeTitleBar(title: String, modifier: Modifier = Modifier, trailing: (@Composable RowScope.() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().statusBarsPadding().height(DriverSize.largeTitleBar).padding(start = 16.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-1).sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing?.invoke(this)
    }
}

/**
 * A pushed screen's bar: back (chevron + where it goes back to), a centred title, an optional action.
 */
@Composable
fun DriverInlineBar(
    title: String,
    backLabel: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Box(modifier.fillMaxWidth().statusBarsPadding().height(DriverSize.pushedBar).padding(horizontal = 4.dp)) {
        Row(
            Modifier
                .align(Alignment.CenterStart)
                .heightIn(min = DriverSize.target)
                .widthIn(max = 120.dp)
                .clickable(role = Role.Button, onClick = onBack)
                .semantics { contentDescription = "Back to $backLabel" }
                .padding(end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DriverIcon(Res.drawable.lucide_chevron_left, size = 28.dp, tint = MaterialTheme.colorScheme.primary)
            Text(backLabel, color = MaterialTheme.colorScheme.primary, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
            title,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 112.dp).semantics { heading() },
        )
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                color = MaterialTheme.colorScheme.primary,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.align(Alignment.CenterEnd).heightIn(min = DriverSize.target).clickable(role = Role.Button, onClick = onAction).padding(horizontal = 12.dp, vertical = 12.dp),
            )
        }
    }
}

/** A screen's scaffold: a bar on top, scrolling content, and an optional pinned action bar. */
@Composable
fun DriverScreen(
    bar: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    actions: (@Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        bar()
        Box(Modifier.weight(1f).fillMaxWidth()) { content() }
        if (actions != null) DriverActionBar(content = actions)
    }
}
