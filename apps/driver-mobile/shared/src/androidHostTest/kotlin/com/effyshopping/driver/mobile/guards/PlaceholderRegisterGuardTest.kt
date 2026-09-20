package com.effyshopping.driver.mobile.guards

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Every placeholder declared in code MUST appear in the provenance register, and vice versa
 * (060 US2, FR-013/FR-017, T057).
 *
 * ⚠ **Why this guard is the feature, not decoration.** The operator chose that placeholder data is
 * **not marked in the running app** (FR-016) — screens stay clean and the register is the *only*
 * record of what is invented or withheld. A record nobody checks goes stale on the first change
 * after someone stops paying attention, and then it is worse than nothing: a reviewer trusts it and
 * it is wrong. 058 put the same lesson as *"a count in a comment is true only while someone
 * maintains it."*
 *
 * It checks **both directions**, deliberately:
 *  - a declaration with no register entry means a placeholder exists that the register denies;
 *  - a register key with no declaration means the register describes something that no longer
 *    exists, which is how a reviewer ends up looking for a field that was made real months ago.
 */
class PlaceholderRegisterGuardTest {

    private val keyBlock = Regex("""<!--\s*PLACEHOLDER-KEYS(.*?)-->""", RegexOption.DOT_MATCHES_ALL)

    /** `val someName: Sourced<...> = operational(...) / decorative(...) / platform(...)` */
    private val declaration = Regex("""\bval\s+(\w+)\s*:\s*Sourced<""")

    @Test
    fun `every declared placeholder is described in the provenance register`() {
        val repoRoot = findRepoRoot()
        val register = File(repoRoot, "specs/060-driver-mobile-ui/provenance-register.md")
        assertTrue(register.isFile, "Provenance register not found at ${register.path}")

        val documented = keyBlock.find(register.readText())
            ?.groupValues?.get(1)
            ?.lines()
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?.toSortedSet()
            ?: fail("The register has no <!-- PLACEHOLDER-KEYS --> block; this guard cannot run.")

        val declared = placeholderFiles(repoRoot).flatMap { file ->
            // ⚠ Comments stripped first. 057 recorded a guard defeated by commented-out text; the
            // mirror trap is a declaration that exists only inside a comment counting as real.
            val text = stripComments(file.readText())
            val feature = featureNameOf(file)
            declaration.findAll(text).map { "$feature.${it.groupValues[1]}" }
        }.toSortedSet()

        if (declared.isEmpty()) {
            fail("Guard found no placeholder declarations at all — the guard itself is broken.")
        }

        val undocumented = declared - documented
        val orphaned = documented - declared

        val problems = buildList {
            if (undocumented.isNotEmpty()) {
                add(
                    "DECLARED IN CODE BUT MISSING FROM THE REGISTER: " +
                        "${undocumented.joinToString(", ")}. " +
                        "Placeholder data is invisible in the running app (FR-016), so a value the " +
                        "register does not list is a value nobody can discover. Add it to the " +
                        "PLACEHOLDER-KEYS block and describe it in the per-screen section.",
                )
            }
            if (orphaned.isNotEmpty()) {
                add(
                    "IN THE REGISTER BUT NO LONGER DECLARED: ${orphaned.joinToString(", ")}. " +
                        "Either the placeholder became real — in which case remove the key and say " +
                        "so — or it was deleted and the register still describes it.",
                )
            }
        }
        if (problems.isNotEmpty()) fail(problems.joinToString("\n\n"))
    }

    /**
     * ⚠ FR-015's safety rule, checked mechanically (T059, SC-015).
     *
     * A `PLACEHOLDER_OPERATIONAL` value is one a driver could act on — an ETA, a distance, a
     * delivery window. With nothing marking it on screen, rendering one is indistinguishable from
     * rendering a computed fact. `operational()` therefore carries **no value at all** (its type is
     * `Sourced<Nothing?>`), which makes "render it anyway" unrepresentable rather than merely
     * discouraged. This asserts that property holds for every declaration.
     *
     * ⚠ **THE NEGATIVE PROOF FOR THIS ONE NEVER REACHES THE TEST.** Changing a declaration to
     * `Sourced<String> = operational(...)` is a **COMPILE ERROR** — `Sourced<out T>` is covariant,
     * so `Sourced<Nothing?>` is not a `Sourced<String>`:
     *
     *     e: Initializer type mismatch: expected 'Sourced<String>', actual 'Sourced<Nothing?>'.
     *
     * That is a stronger guarantee than a test, and the better outcome: the rule is enforced by the
     * type system rather than by a guard somebody could delete. This test remains as a backstop for
     * a future refactor that widens the return type and quietly removes that protection.
     */
    @Test
    fun `operational placeholders carry no renderable value`() {
        val repoRoot = findRepoRoot()
        val offenders = mutableListOf<String>()

        placeholderFiles(repoRoot).forEach { file ->
            val text = stripComments(file.readText())
            Regex("""\bval\s+(\w+)\s*:\s*Sourced<([^>]+)>\s*=\s*operational\(""")
                .findAll(text)
                .forEach { m ->
                    val (name, type) = m.destructured
                    if (type.trim() != "Nothing?") {
                        offenders += "${featureNameOf(file)}.$name (Sourced<$type>)"
                    }
                }
        }

        if (offenders.isNotEmpty()) {
            fail(
                "These operational placeholders declare a renderable value: " +
                    "${offenders.joinToString(", ")}. An operational placeholder is one a driver " +
                    "could act on, and nothing marks it as invented on screen — so it must be " +
                    "`Sourced<Nothing?>` and render via unavailableLabel(), or be omitted " +
                    "(FR-015, SC-015).",
            )
        }
    }

    /** `features/<name>/data/PlaceholderData.kt` -> `<name>`. */
    private fun featureNameOf(file: File): String =
        file.parentFile?.parentFile?.name ?: fail("Unexpected placeholder path: ${file.path}")

    private fun placeholderFiles(repoRoot: File): List<File> {
        val features = File(
            repoRoot,
            "apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features",
        )
        return features.walkTopDown()
            .filter { it.isFile && it.name == "PlaceholderData.kt" }
            .toList()
    }

    private fun stripComments(src: String): String = src
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    private fun findRepoRoot(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            if (File(dir, "specs/060-driver-mobile-ui/provenance-register.md").isFile) return dir
            dir = dir.parentFile
        }
        fail("Could not locate the repository root from ${System.getProperty("user.dir")}")
    }
}
