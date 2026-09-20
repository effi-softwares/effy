package com.effyshopping.driver.mobile.guards

import java.io.File
import kotlin.test.Test
import kotlin.test.fail

/**
 * MapLibre must not come back (060, replacing `MapLibreImportGuardTest`).
 *
 * ⚠ **It was adopted, shipped, and removed on operator decision.** MapLibre Compose rendered real
 * OpenStreetMap cartography and worked at runtime, but **aborted the app under Xcode's debug
 * build** — `SIGABRT` on its own render thread, in the pre-1.0 handoff between native render
 * callbacks and the Kotlin/Native runtime. Not fixable from here, and an app that cannot be Run
 * from Xcode cannot be developed.
 *
 * ⚠ **Re-adding it is an easy mistake to make**: the map screen looks like it wants a real map, the
 * dependency is one line, and the crash only appears under a debug build with the Map tab open —
 * so someone could re-introduce it, see it work, and ship. This test is the memory of that.
 *
 * ⚠ It also keeps `tile.openstreetmap.org` out. OSM's Tile Usage Policy **forbids distributing an
 * app that uses it**, and that remains true for any future map attempt.
 */
class MapLibreAbsentGuardTest {

    @Test
    fun `maplibre is not a dependency of this app`() {
        val app = appRoot()
        val offenders = listOf("gradle/libs.versions.toml", "shared/build.gradle.kts")
            .map { File(app, it) }
            .filter { it.isFile && stripComments(it.readText()).contains("maplibre", ignoreCase = true) }
            .map { it.name }

        if (offenders.isNotEmpty()) {
            fail(
                "MapLibre is referenced again in: ${offenders.joinToString(", ")}. It was removed " +
                    "in 060 because it ABORTS THE APP under Xcode's debug build (SIGABRT on its " +
                    "own render thread — pre-1.0 threading against the Kotlin/Native runtime). " +
                    "It works when launched normally, so this is easy to re-add and ship. If you " +
                    "are deliberately retrying it, delete this test and say why in the plan.",
            )
        }
    }

    @Test
    fun `no source imports maplibre`() {
        val importers = sourceRoot().walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filterNot { it.path.contains("/guards/") }
            .filter { stripComments(it.readText()).contains("org.maplibre") }
            .map { it.name }
            .toList()

        if (importers.isNotEmpty()) {
            fail("These files import org.maplibre.*: ${importers.joinToString(", ")}. See above.")
        }
    }

    @Test
    fun `no source points at OpenStreetMap's own tile servers`() {
        val offenders = sourceRoot().walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filterNot { it.path.contains("/guards/") }
            .filter { stripComments(it.readText()).contains("tile.openstreetmap.org") }
            .map { it.name }
            .toList()

        if (offenders.isNotEmpty()) {
            fail(
                "These files point at OpenStreetMap's own tile servers: " +
                    "${offenders.joinToString(", ")}. Its Tile Usage Policy FORBIDS distributing " +
                    "an app that uses them, and access may be blocked without notice.",
            )
        }
    }

    private fun stripComments(src: String): String = src
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")
        .replace(Regex("""^\s*#[^\n]*""", RegexOption.MULTILINE), "")

    private fun appRoot(): File = ascend("apps/driver-mobile")
    private fun sourceRoot(): File = ascend("apps/driver-mobile/shared/src")

    private fun ascend(relative: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            File(dir, relative).takeIf { it.isDirectory }?.let { return it }
            dir = dir.parentFile
        }
        fail("Could not locate $relative from ${System.getProperty("user.dir")}")
    }
}
