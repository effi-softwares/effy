package com.effyshopping.driver.mobile.guards

import java.io.File
import kotlin.test.Test
import kotlin.test.fail

/**
 * The driver app never addresses its user as a shop and never shows money (shop copy once shipped on its
 * sign-in screen). Word-bounded phrases over comment-stripped source, so this file's own notes do not trip
 * it.
 */
class AudienceCopyGuardTest {

    private val bannedAudience = listOf(
        "shop workspace",
        "shop operator",
        "shop operators",
        "provisioned shop",
        "store manager",
    )

    /**
     * A driver sees counts, never currency - the design's own stated boundary and the
     * driver app's rule since 049. No earnings, tips, pay or cash-out.
     */
    private val bannedMoney = listOf(
        "earnings", "payout", "payouts", "cash out", "cash-out", "tip", "tips",
    )

    @Test
    fun `no copy addresses the driver as a shop`() = sweep(bannedAudience) { phrase, file ->
        "Driver-app source addresses its user as a shop: \"$phrase\" in ${file}. " +
            "The driver app has exactly one audience and it is not a shop operator (FR-010)."
    }

    @Test
    fun `no currency reaches a driver's screen`() = sweep(bannedMoney) { phrase, file ->
        "Driver-app source mentions money: \"$phrase\" in ${file}. Every number a driver sees is a " +
            "count, a distance, a time or a duration - never currency (FR-011)."
    }

    private fun sweep(phrases: List<String>, message: (String, String) -> String) {
        val root = findSourceRoot()
        val hits = mutableListOf<String>()

        root.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            // The guards themselves quote the banned phrases by necessity.
            .filterNot { it.path.contains("/guards/") }
            .forEach { file ->
                val text = stripComments(file.readText()).lowercase()
                phrases.forEach { phrase ->
                    if (Regex("\\b${Regex.escape(phrase)}\\b").containsMatchIn(text)) {
                        hits += message(phrase, file.name)
                    }
                }
            }

        if (hits.isNotEmpty()) fail(hits.joinToString("\n"))
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
