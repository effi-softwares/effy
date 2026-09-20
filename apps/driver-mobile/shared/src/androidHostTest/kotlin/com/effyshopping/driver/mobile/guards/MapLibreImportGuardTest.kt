package com.effyshopping.driver.mobile.guards

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * MapLibre is reachable from exactly one file, and the tiles never come from OpenStreetMap's own
 * servers (060 T062, FR-023a/b, research R2/R4).
 *
 * ⚠ **Two separate hazards, one guard.**
 *
 * **1. The dependency is pre-1.0.** MapLibre Compose's own documentation says to expect breaking
 * changes between minor releases. One import site means an upgrade is one file, and FR-023e's
 * stylised fallback is a substitution rather than a rewrite of the Map feature. "Only import it in
 * one place" is a comment until something fails.
 *
 * **2. ⚠ THE OBVIOUS TILE SERVER IS FORBIDDEN.** OpenStreetMap's Tile Usage Policy explicitly
 * prohibits heavy use *"including distributing an app that uses tiles from openstreetmap.org"*, and
 * says access may be blocked without notice. The failure mode is the worst kind: nothing breaks in
 * development, and the map goes blank in production once someone notices the traffic. A test is the
 * only thing standing between a well-meaning edit and a policy breach.
 */
class MapLibreImportGuardTest {


    @Test
    fun `maplibre is imported in exactly one file`() {
        val root = findSourceRoot()
        val importers = root.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filterNot { it.path.contains("/guards/") }
            .filter { Regex("""^\s*import\s+org\.maplibre\.""", RegexOption.MULTILINE)
                .containsMatchIn(stripComments(it.readText())) }
            .map { it.name }
            .toList()

        if (importers != listOf("EffyMapCanvas.kt")) {
            fail(
                "org.maplibre.* must be imported ONLY by EffyMapCanvas.kt, but was found in: " +
                    "${importers.joinToString(", ").ifBlank { "no file at all" }}. " +
                    "MapLibre Compose is pre-1.0 and documents breaking changes between minor " +
                    "releases; confining it to one call site is what keeps an upgrade to one file " +
                    "and keeps FR-023e's fallback a substitution (research R4).",
            )
        }
    }

    @Test
    fun `tiles never come from OpenStreetMap's own servers`() {
        val root = findSourceRoot()
        val offenders = root.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filterNot { it.path.contains("/guards/") }
            .filter { stripComments(it.readText()).contains("tile.openstreetmap.org") }
            .map { it.name }
            .toList()

        if (offenders.isNotEmpty()) {
            fail(
                "These files point at OpenStreetMap's own tile servers: " +
                    "${offenders.joinToString(", ")}. The OSM Tile Usage Policy FORBIDS " +
                    "distributing an app that uses them, and access may be blocked without " +
                    "notice — the map would simply go blank in production. Use OpenFreeMap " +
                    "(no key, no account, no billing) as EffyMapCanvas does.",
            )
        }
    }

    @Test
    fun `the required attribution is present`() {
        val canvas = File(
            findSourceRoot(),
            "commonMain/kotlin/com/effyshopping/driver/mobile/core/platform/EffyMapCanvas.kt",
        )
        assertTrue(canvas.isFile, "EffyMapCanvas.kt not found at ${canvas.path}")
        val text = canvas.readText()
        assertTrue(
            text.contains("OpenStreetMap contributors") && text.contains("OpenFreeMap"),
            "The map's attribution string must credit both OpenStreetMap contributors and " +
                "OpenFreeMap. This is a LICENCE OBLIGATION (FR-023b), not a nicety — and MapLibre " +
                "rendering it automatically from the style is exactly the kind of automatic " +
                "behaviour that silently stops.",
        )
    }

    private fun stripComments(src: String): String = src
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    private fun findSourceRoot(): File {
        val relative = "apps/driver-mobile/shared/src"
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            File(dir, relative).takeIf { it.isDirectory }?.let { return it }
            dir = dir.parentFile
        }
        fail("Could not locate the driver source root from ${System.getProperty("user.dir")}")
    }
}
