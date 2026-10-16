package com.effyshopping.driver.mobile.core.scan

/**
 * 090 — what one read means at one step. ONE RULE for every scanning step (shop, hub, load, door,
 * return): each screen is a view of these outcomes, never its own judgement. Pure, and decided from what
 * the phone already holds — so it works with no signal.
 */
sealed interface ScanOutcome {
    /** A package expected here, not yet scanned. It counts. */
    data class Accepted(val code: String) : ScanOutcome

    /** Already counted at this step. Quiet: no sound, nothing changes. */
    data class AlreadyScanned(val code: String) : ScanOutcome

    /**
     * ⚠ A HARD STOP. The package belongs to another stop or drop on the driver's work — handing it over
     * here is the wrong-bag mistake scanning exists to prevent. [where] names where it belongs.
     */
    data class BelongsElsewhere(val code: String, val where: String) : ScanOutcome

    /** An Effy label, but for nothing on this driver's work. */
    data class NotOnYourWork(val code: String) : ScanOutcome

    /** Not an Effy package label — a product's own barcode. Ignored silently. */
    data object NotALabel : ScanOutcome
}

/**
 * What a step expects: the codes that belong HERE, and the codes elsewhere on the driver's work with
 * where they belong (the words the hard stop says).
 */
data class ScanContext(
    val expected: Set<String>,
    val elsewhere: Map<String, String> = emptyMap(),
)

object ScanRule {
    /** Judge [read] (a raw scanner value, or a typed code) against [context], given what is [scanned]. */
    fun judge(read: String, context: ScanContext, scanned: Set<String>): ScanOutcome {
        // A typed code arrives bare; a scan carries the EFY1: token. Both go through the same rule.
        val code = PackageToken.parse(read) ?: read.trim().takeIf(PackageToken::isCode) ?: return ScanOutcome.NotALabel
        return when {
            code in context.expected && code in scanned -> ScanOutcome.AlreadyScanned(code)
            code in context.expected -> ScanOutcome.Accepted(code)
            code in context.elsewhere -> ScanOutcome.BelongsElsewhere(code, context.elsewhere.getValue(code))
            else -> ScanOutcome.NotOnYourWork(code)
        }
    }
}

/**
 * One step's scanning: the rule plus what has been accepted so far. The screen holds one per step.
 * [isComplete] is what the auto-complete bar (the redesign) waits for.
 */
class ScanSession(val context: ScanContext, initiallyScanned: Set<String> = emptySet()) {
    private val accepted = initiallyScanned.filter { it in context.expected }.toMutableSet()

    val scanned: Set<String> get() = accepted
    val expectedCount: Int get() = context.expected.size
    val scannedCount: Int get() = accepted.size
    val isComplete: Boolean get() = context.expected.isNotEmpty() && accepted.containsAll(context.expected)

    fun judge(read: String): ScanOutcome =
        ScanRule.judge(read, context, accepted).also { if (it is ScanOutcome.Accepted) accepted += it.code }

    /** "Undo" on the auto-complete bar, or a driver un-ticking by hand. */
    fun forget(code: String) {
        accepted -= code
    }
}
