package com.effyshopping.driver.mobile.core.platform

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import org.maplibre.compose.map.MaplibreMap
import org.maplibre.compose.map.rememberMapState
import org.maplibre.compose.style.BaseStyle

/**
 * The platform's map (060 US3, FR-023a…FR-023e).
 *
 * ⚠ **THIS IS THE ONLY FILE IN THE APP PERMITTED TO IMPORT `org.maplibre.*`.**
 * `MapLibreImportGuardTest` fails naming any other file that does. MapLibre Compose is **pre-1.0**
 * and its own documentation says to expect breaking changes between minor releases — confining it
 * to one call site makes an upgrade one file to fix, and makes FR-023e's fallback a substitution
 * rather than a rewrite of the Map feature (research R4).
 *
 * ⚠ **TILES COME FROM OPENFREEMAP, NOT FROM OPENSTREETMAP'S OWN SERVERS.** This is the single most
 * important fact about this file. OSM's **Tile Usage Policy** explicitly prohibits heavy use
 * *"including distributing an app that uses tiles from openstreetmap.org"* without prior permission,
 * and says access may be blocked without notice. Pointing at `tile.openstreetmap.org` would put the
 * platform in breach of a volunteer project's policy, and the only symptom would be **the map going
 * blank in production**. OpenFreeMap serves the same OpenStreetMap data, needs no API key, no
 * account and no billing relationship, and is MIT-licensed (research R2).
 *
 * ⚠ **Attribution is a LICENCE OBLIGATION** (FR-023b). MapLibre renders OpenFreeMap's attribution
 * from the style itself, and `MapAttributionTest` pins that we also carry it in our own chrome —
 * an automatic behaviour that silently stops is precisely the defect class this repo keeps
 * recording.
 */
private const val OPENFREEMAP_LIBERTY = "https://tiles.openfreemap.org/styles/liberty"

/** The attribution the OpenStreetMap/OpenFreeMap licences require us to display. */
const val MAP_ATTRIBUTION: String = "© OpenStreetMap contributors · OpenFreeMap"

@Composable
fun EffyMapCanvas(modifier: Modifier = Modifier) {
    // ⚠ GUARDED, and this is not belt-and-braces — it is a fix for a crash found by running the
    // app. Where MapLibre cannot get a renderer (no Metal service on the iOS Simulator) the native
    // render session aborts the PROCESS: not a Kotlin exception, so not catchable here, and the
    // driver loses their whole shift because they tapped a tab. See `mapRenderingSupported`.
    if (!mapRenderingSupported()) {
        EffyMapUnavailable(modifier, "Map preview isn't available on this device")
        return
    }
    val state = rememberMapState(baseStyle = BaseStyle.Uri(OPENFREEMAP_LIBERTY))
    Box(modifier, contentAlignment = Alignment.Center) {
        MaplibreMap(state = state, modifier = Modifier.fillMaxSize())
    }
}

/**
 * The stand-in used when the map cannot render (FR-023e's fallback, and any platform where the
 * native renderer is unavailable). Kept here so a caller never has to know which it got.
 */
@Composable
fun EffyMapUnavailable(modifier: Modifier = Modifier, reason: String) {
    Box(
        modifier.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            reason,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
