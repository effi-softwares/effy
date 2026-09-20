package com.effyshopping.driver.mobile.features.today.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.TodayItem

/**
 * The rest of the round, in order (060 US1, design screens `home` / `home-delivery`).
 *
 * Rows, not cards — the constitution's default, and the right one here: these ARE a set, each is
 * one line of text, and a tile per shop would push the whole queue below the fold on a phone.
 *
 * ⚠ The design puts an ETA on every row. Omitted throughout for the reason in the register: there
 * is no routing engine and no coordinates, so every one of those times would be invented, and a
 * driver sequences their round by them.
 */
@Composable
fun UpNextList(
    phase: Phase,
    items: List<TodayItem>,
    hubName: String?,
    onOpenRun: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty() && hubName == null) return

    val isCollection = phase == Phase.COLLECTION
    val noun = if (isCollection) "shop" else "drop"
    val heading = "UP NEXT · ${items.size} $noun${if (items.size == 1) "" else "s"}"

    Column(modifier.fillMaxWidth()) {
        // \u26a0 FOUND BY LOOKING AT IT ON A SIMULATOR, not by a test. With an empty queue this
        // rendered "UP NEXT \u00b7 0 shops" beside a "Whole run \u203a" link \u2014 a heading for nothing and
        // an affordance into an empty list. The spec's own edge case asked whether the section
        // "collapses or shows an empty heading"; it showed the heading. 039's lesson exactly:
        // layout is not a property an assertion can see.
        if (items.isNotEmpty()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                heading,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "Whole run ›",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onOpenRun)
                    .padding(horizontal = 8.dp, vertical = 12.dp),
            )
        }

        }

        items.forEachIndexed { index, item ->
            QueueRow(
                // ⚠ DERIVED from position, not from the backend. The active item is #1, so the
                // queue starts at 2 — matching the design's "Stop 1" on the hero above.
                index = index + 2,
                item = item,
                onClick = onOpenRun,
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }

        // ⚠ Collection only. A collection run ENDS at the hub — that is the hub-and-spoke model's
        // pivot — whereas a same-day run ends at the last customer and has no such row.
        if (isCollection && hubName != null) {
            HubRow(hubName)
        }
    }
}

@Composable
private fun QueueRow(index: Int, item: TodayItem, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IndexChip(index.toString())
        Spacer(Modifier.size(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            item.subtitle?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(4.dp))
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** The run's destination. Dashed and unnumbered — it is not a stop, it is where the stops end. */
@Composable
private fun HubRow(hubName: String) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surface),
            contentAlignment = Alignment.Center,
        ) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.size(34.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        "H",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.size(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "Then: hub check-in",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                hubName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun IndexChip(label: String) {
    Box(
        Modifier
            .size(34.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
