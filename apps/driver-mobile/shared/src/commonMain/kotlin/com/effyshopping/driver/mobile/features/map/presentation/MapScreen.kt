package com.effyshopping.driver.mobile.features.map.presentation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.effyshopping.driver.mobile.core.platform.EffyMapCanvas
import com.effyshopping.driver.mobile.core.platform.MAP_ATTRIBUTION

/**
 * The Map tab (060 US3, design screens `map-collection` / `map-delivery`).
 *
 * ⚠ **This was the app's only dead end.** The tab existed, occupied a permanent quarter of the
 * bottom navigation, and opened a "coming soon" message. A driver tapped a tab that was there and
 * was told to come back later.
 *
 * ⚠ **Real cartography, placeholder pins** — and the asymmetry is deliberate, not a shortcut. The
 * tiles are genuine OpenStreetMap data via OpenFreeMap. The **positions** are not: 049 R13 recorded
 * that shops carry no address or coordinates and orders carry an un-geocoded address, so there is
 * nothing on the platform to plot. The map is therefore **illustrative, not navigational** — a
 * driver who needs to get somewhere uses **Navigate** on the stop or drop, which hands the device's
 * own maps app the real address string. No routing decision is ever taken from this screen.
 */
@Composable
fun MapScreen(
    state: MapUiState,
    onModeChange: (MapMode) -> Unit,
    onOpenStop: (MapStop) -> Unit,
) {
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        Text(
            "Map",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 20.dp, top = 8.dp, bottom = 14.dp),
        )

        SegmentedModes(mode = state.mode, onModeChange = onModeChange)

        Spacer(Modifier.height(14.dp))

        Box(Modifier.fillMaxWidth().height(260.dp)) {
            EffyMapCanvas(Modifier.fillMaxSize())
            // ⚠ Attribution is a LICENCE OBLIGATION, not a nicety (FR-023b). MapLibre renders the
            // style's own attribution; this carries it in our chrome too, and MapAttributionTest
            // pins it — an automatic behaviour that silently stops is the defect class this repo
            // keeps recording.
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(topStart = 6.dp),
                modifier = Modifier.align(Alignment.BottomEnd),
            ) {
                Text(
                    MAP_ATTRIBUTION,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                )
            }
        }

        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Spacer(Modifier.height(16.dp))
            Text(
                when (state.mode) {
                    MapMode.COLLECTION -> "SHOPS → HUB"
                    MapMode.SAME_DAY -> "HUB → DROPS"
                },
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(6.dp))

            if (state.stops.isEmpty()) {
                Spacer(Modifier.height(20.dp))
                Text(
                    when (state.mode) {
                        MapMode.COLLECTION -> "No collection run assigned right now."
                        MapMode.SAME_DAY -> "No same-day run yet — it unlocks at hub check-in."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                state.stops.forEach { stop ->
                    StopRow(stop = stop, onClick = { onOpenStop(stop) })
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }

            Spacer(Modifier.height(18.dp))
            Text(
                "Stop positions aren't plotted yet. Use Navigate on a stop to route there.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SegmentedModes(mode: MapMode, onModeChange: (MapMode) -> Unit) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
    ) {
        Row(Modifier.padding(3.dp)) {
            MapMode.entries.forEach { option ->
                val selected = mode == option
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .clickable { onModeChange(option) },
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            if (option == MapMode.COLLECTION) "Collection" else "Same-day",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = if (selected) {
                                MaterialTheme.colorScheme.onPrimary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StopRow(stop: MapStop, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 48.dp)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // ⚠ FR-023d — the hub reads differently from an ordinary stop. A square outline versus a
        // filled round-rect, not just a colour: the hub is a different KIND of place, and on a
        // sunlit windscreen mount colour alone does not carry that.
        Surface(
            shape = RoundedCornerShape(if (stop.isHub) 4.dp else 10.dp),
            color = if (stop.isHub) {
                MaterialTheme.colorScheme.surface
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
            border = if (stop.isHub) {
                BorderStroke(1.5.dp, MaterialTheme.colorScheme.onSurface)
            } else {
                null
            },
            modifier = Modifier.size(34.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    if (stop.isHub) "H" else stop.sequence.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                stop.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                stop.subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // ⚠ The design shows an ETA column per stop. Omitted — no routing engine, no coordinates.
    }
}
