package com.effyshopping.driver.mobile.guards

import java.io.File
import kotlin.test.Test
import kotlin.test.fail

/**
 * Every `AppNavKey` is registered in `driverNavJson`'s serializers module. `AppNavKey` is not sealed, so a
 * missing one is not a compile error: it fails only after process death, on the tab holding it. A source
 * guard, so it lives in `androidHostTest` (commonMain has no filesystem).
 */
class RouteSerializerGuardTest {

    @Test
    fun `every AppNavKey is registered in driverNavJson`() {
        val source = findRoutesFile()
        // Strip comments first. 057 recorded a guard defeated because it matched commented-out
        // text; the reverse trap is a route named only in a comment counting as declared.
        val text = stripComments(source.readText())

        val declared = Regex(
            // The parameter list may itself contain a colon (`data class X(val id: String)`),
            // so it is matched explicitly rather than with a "anything but a colon" wildcard. The
            // first draft used `[^:\n]*` and the guard failed on its own repository — every
            // parameterised route read as undeclared.
            """data\s+(?:object|class)\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*AppNavKey""",
        ).findAll(text).map { it.groupValues[1] }.toSortedSet()

        val registered = Regex("""subclass\(\s*(\w+)::class""")
            .findAll(text).map { it.groupValues[1] }.toSortedSet()

        if (declared.isEmpty()) {
            fail("Guard found no AppNavKey declarations in ${source.path} — the guard itself is broken.")
        }

        val missing = declared - registered
        if (missing.isNotEmpty()) {
            fail(
                "These AppNavKey routes are NOT registered in driverNavJson's serializers module: " +
                    "${missing.joinToString(", ")}. Per-tab back stacks will fail to restore across " +
                    "process death on whichever tab holds one. Add `subclass(X::class, X.serializer())` " +
                    "in ${source.path}.",
            )
        }

        // The other direction: a serializer for a route that no longer exists is dead weight and a
        // sign the two lists have drifted.
        val orphaned = registered - declared
        if (orphaned.isNotEmpty()) {
            fail(
                "These routes are registered in driverNavJson but no longer declared: " +
                    "${orphaned.joinToString(", ")}. Remove them from ${source.path}.",
            )
        }
    }

    private fun stripComments(src: String): String = src
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    /** Walk up from the test's working directory until the shared module's route file is found. */
    private fun findRoutesFile(): File {
        val relative =
            "shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/core/nav/DriverRoutes.kt"
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            File(dir, relative).takeIf { it.isFile }?.let { return it }
            // The tests may run with the module itself as the working directory.
            File(dir, relative.removePrefix("shared/")).takeIf { it.isFile }?.let { return it }
            dir = dir.parentFile
        }
        fail("Could not locate DriverRoutes.kt from ${System.getProperty("user.dir")}")
    }
}
