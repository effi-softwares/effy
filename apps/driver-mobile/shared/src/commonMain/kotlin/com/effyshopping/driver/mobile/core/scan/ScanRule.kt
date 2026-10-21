package com.effyshopping.driver.mobile.core.scan

/**
 * 090 — what one read means at one step. ONE RULE for every scanning step (shop, hub, load, door,
 * return): each screen is a view of these outcomes, never its own judgement. Pure, and decided from what
 * the phone already holds — so it works with no signal.
 *
 * ⚠ 096 — THE KOTLIN TWIN of `packages/shared-types/src/scan-rule.ts`. Both are held to the same rows,
 * `scan-rule.fixtures.json` (embedded as `ScanRuleFixture.kt`): the same outcomes and the same words on
 * every surface (FR-052). What a step counts is BAGS — each with its own code.
 */
sealed interface ScanOutcome {
    /** A bag expected here, not yet scanned. It counts. */
    data class Accepted(val code: String) : ScanOutcome

    /** Already counted at this step. Quiet: no sound, nothing changes. */
    data class AlreadyScanned(val code: String) : ScanOutcome

    /**
     * ⚠ A HARD STOP. The bag belongs to another stop or drop on the driver's work — handing it over
     * here is the wrong-bag mistake scanning exists to prevent. [where] names where it belongs.
     */
    data class BelongsElsewhere(val code: String, val where: String) : ScanOutcome

    /** An Effy label, but for nothing on this driver's work. */
    data class NotOnYourWork(val code: String) : ScanOutcome

    /** 096 — a label the shop removed (the bag was voided). Never counted. */
    data class Voided(val code: String) : ScanOutcome

    /** 096 — a bag whose order was cancelled. Never counted. */
    data class Cancelled(val code: String) : ScanOutcome

    /** Not an Effy label — a product's own barcode. Ignored silently. */
    data object NotALabel : ScanOutcome
}

/** 096 — a bag's place in its package, for "Bag 2 of 3". */
data class BagNumber(val seq: Int, val of: Int)

/**
 * What a step expects: the codes that belong HERE, and the codes elsewhere on the driver's work with
 * where they belong (the words the hard stop says). 096 — [bags] numbers each expected bag; [voided] and
 * [cancelled] are bags that must never count.
 */
data class ScanContext(
    val expected: Set<String>,
    val elsewhere: Map<String, String> = emptyMap(),
    val bags: Map<String, BagNumber> = emptyMap(),
    val voided: Set<String> = emptySet(),
    val cancelled: Set<String> = emptySet(),
)

object ScanRule {
    /**
     * The bag code a read names. A scan carries the `EFY1:` token (or the bare code); a typed code may
     * arrive bare, in lower case, or grouped for reading aloud ("wtm zhx").
     */
    fun readCode(read: String, typed: Boolean): String? {
        PackageToken.parse(read)?.let { return it }
        val bare = if (typed) read.filterNot { it.isWhitespace() || it == '-' }.uppercase() else read.trim()
        return bare.takeIf(PackageToken::isCode)
    }

    /** Judge [read] (a raw scanner value, or a typed code) against [context], given what is [scanned]. */
    fun judge(read: String, context: ScanContext, scanned: Set<String>, typed: Boolean = false): ScanOutcome {
        val code = readCode(read, typed) ?: return ScanOutcome.NotALabel
        return when {
            code in context.voided -> ScanOutcome.Voided(code)
            code in context.cancelled -> ScanOutcome.Cancelled(code)
            code in context.expected && code in scanned -> ScanOutcome.AlreadyScanned(code)
            code in context.expected -> ScanOutcome.Accepted(code)
            code in context.elsewhere -> ScanOutcome.BelongsElsewhere(code, context.elsewhere.getValue(code))
            else -> ScanOutcome.NotOnYourWork(code)
        }
    }

    /** The sentence every surface shows for [outcome] (the shared words, `READ_OUTCOME_WORDS`). */
    fun words(outcome: ScanOutcome, context: ScanContext): String = when (outcome) {
        is ScanOutcome.Accepted -> context.bags[outcome.code]?.let { "Bag ${it.seq} of ${it.of}" } ?: "Counted"
        is ScanOutcome.AlreadyScanned -> "Already scanned"
        is ScanOutcome.BelongsElsewhere -> "For ${outcome.where} — not here"
        is ScanOutcome.NotOnYourWork -> "Not expected here"
        is ScanOutcome.Voided -> "This label is no longer used"
        is ScanOutcome.Cancelled -> "This order was cancelled"
        ScanOutcome.NotALabel -> "Not an Effy label"
    }

    /** The wire's word for [outcome] (`ReadOutcome`). */
    fun wireOutcome(outcome: ScanOutcome): String = when (outcome) {
        is ScanOutcome.Accepted -> "accepted"
        is ScanOutcome.AlreadyScanned -> "already_counted"
        is ScanOutcome.BelongsElsewhere -> "belongs_elsewhere"
        is ScanOutcome.NotOnYourWork -> "not_on_this_work"
        is ScanOutcome.Voided -> "voided"
        is ScanOutcome.Cancelled -> "cancelled"
        ScanOutcome.NotALabel -> "not_a_label"
    }

    /** The code [outcome] names, or null. */
    fun codeOf(outcome: ScanOutcome): String? = when (outcome) {
        is ScanOutcome.Accepted -> outcome.code
        is ScanOutcome.AlreadyScanned -> outcome.code
        is ScanOutcome.BelongsElsewhere -> outcome.code
        is ScanOutcome.NotOnYourWork -> outcome.code
        is ScanOutcome.Voided -> outcome.code
        is ScanOutcome.Cancelled -> outcome.code
        ScanOutcome.NotALabel -> null
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

    fun judge(read: String, typed: Boolean = false): ScanOutcome =
        ScanRule.judge(read, context, accepted, typed).also { if (it is ScanOutcome.Accepted) accepted += it.code }

    /** "Undo" on the auto-complete bar, or a driver un-ticking by hand. */
    fun forget(code: String) {
        accepted -= code
    }
}
