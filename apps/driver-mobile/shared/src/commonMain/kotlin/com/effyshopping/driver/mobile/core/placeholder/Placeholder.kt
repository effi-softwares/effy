package com.effyshopping.driver.mobile.core.placeholder

/**
 * Data provenance (060 US2, FR-013…FR-017a).
 *
 * This app renders screens the platform cannot fully supply. A stop's ETA, a shop's coordinates, a
 * delivery window and the dispatch phone number all appear in the design and none of them exist in
 * the backend. Rather than leave those screens unbuilt, they render with placeholder values — and
 * every one of them is recorded in `specs/060-driver-mobile-ui/provenance-register.md`.
 *
 * ⚠ **Placeholder data is NOT marked in the running app** (FR-016, operator decision 2026-09-20).
 * Screens stay clean for review and screenshots, and the register is the sole record. That decision
 * is exactly why [Provenance.PLACEHOLDER_OPERATIONAL] exists and why it may never render as a value:
 * with nothing on screen saying "invented", a fabricated ETA is indistinguishable from a computed one
 * and a driver will plan their route around it.
 *
 * The rule in one line: **decorative placeholders may render; operational ones may not.**
 */
enum class Provenance {
    /**
     * Real — from the backend or the device. ⚠ A field that is PLATFORM today MUST NOT be downgraded
     * to a placeholder for visual convenience (FR-014, SC-009).
     */
    PLATFORM,

    /**
     * Invented, and a driver acting on it costs nothing — a sample shop name, a map marker's
     * position, a photo thumbnail. Renders normally; the register records it.
     */
    PLACEHOLDER_DECORATIVE,

    /**
     * ⚠ Invented, and a driver **could act on it** — an ETA, a distance, a delivery window, a phone
     * number. MUST NOT render as a value. Render [unavailableLabel] instead, or omit the field
     * (FR-015, SC-015).
     */
    PLACEHOLDER_OPERATIONAL,

    /**
     * Computed in the app from other values — a count, a percentage, a progress fraction. ⚠ Inherits
     * the **weakest** provenance of its inputs (see [weakest]), so "3 of 4 stops done" cannot look
     * trustworthy when one of the four was invented.
     */
    DERIVED,
}

/**
 * The weakest provenance among [inputs] — the classification a [Provenance.DERIVED] value takes.
 *
 * Ordering, weakest last: PLATFORM < DERIVED < PLACEHOLDER_DECORATIVE < PLACEHOLDER_OPERATIONAL.
 * A figure derived from anything operational is itself operational, which is what stops a count
 * rendered from part-invented inputs reading as a fact.
 */
fun weakest(vararg inputs: Provenance): Provenance =
    inputs.maxByOrNull { rank(it) } ?: Provenance.PLATFORM

private fun rank(p: Provenance): Int = when (p) {
    Provenance.PLATFORM -> 0
    Provenance.DERIVED -> 1
    Provenance.PLACEHOLDER_DECORATIVE -> 2
    Provenance.PLACEHOLDER_OPERATIONAL -> 3
}

/**
 * A value together with where it came from.
 *
 * ⚠ Every placeholder in this app is declared in exactly one place — a
 * `features/<x>/data/PlaceholderData.kt` — and never inline in a composable (research R11). With no
 * in-app marking, one file per feature is the only thing that keeps the register findable six months
 * from now, and `PlaceholderRegisterGuardTest` fails if a declared value is missing from the register.
 *
 * @param value the value to render (meaningless for [Provenance.PLACEHOLDER_OPERATIONAL] — see [render])
 * @param provenance how this value came to exist
 * @param unblockedBy ⚠ for placeholders, the condition that would make it real. This is what turns
 *   the register into the backlog of what the platform still owes this app (FR-017a).
 */
data class Sourced<out T>(
    val value: T,
    val provenance: Provenance,
    val unblockedBy: String? = null,
) {
    init {
        require(provenance == Provenance.PLATFORM || unblockedBy != null) {
            "A non-PLATFORM value must say what would make it real (FR-017a)."
        }
    }
}

/** A real value from the backend or the device. */
fun <T> platform(value: T): Sourced<T> = Sourced(value, Provenance.PLATFORM)

/** An invented value a driver cannot act on to their cost. */
fun <T> decorative(value: T, unblockedBy: String): Sourced<T> =
    Sourced(value, Provenance.PLACEHOLDER_DECORATIVE, unblockedBy)

/**
 * ⚠ An invented value a driver **could** act on. It carries no renderable value on purpose — the
 * only thing a screen may show for one of these is [unavailableLabel].
 */
fun operational(unblockedBy: String): Sourced<Nothing?> =
    Sourced(null, Provenance.PLACEHOLDER_OPERATIONAL, unblockedBy)

/**
 * The one string this app shows in place of a value it cannot honestly supply.
 *
 * ⚠ **One implementation, deliberately.** "Shown as unavailable" is a rule (FR-015), and a rule
 * spread across twenty screens as a convention is a rule that will be broken on the twenty-first —
 * 054 recorded exactly that shape when one availability predicate was hand-written in 14 places.
 *
 * An em dash, not "N/A" or "Unknown": it reads as "nothing here" rather than as an error the driver
 * should do something about.
 */
fun unavailableLabel(): String = "—"

/**
 * What a screen should render for [this].
 *
 * Returns [unavailableLabel] for [Provenance.PLACEHOLDER_OPERATIONAL] — ⚠ **the single line that
 * enforces FR-015 and SC-015.** Everything else renders its value.
 */
fun Sourced<Any?>.render(format: (Any?) -> String = { it?.toString() ?: unavailableLabel() }): String =
    if (provenance == Provenance.PLACEHOLDER_OPERATIONAL) unavailableLabel() else format(value)
