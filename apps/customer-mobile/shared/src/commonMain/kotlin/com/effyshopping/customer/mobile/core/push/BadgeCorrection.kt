package com.effyshopping.customer.mobile.core.push

/**
 * 116 C6: a silent badge correction (contracts/push.md) - the data of a `type=badge` push. Android can't set the icon's
 * number (the launcher counts the notifications on screen), so a correction takes away every shown Effy notification
 * that is no longer unseen: the ones whose tag (the notification id) is not in [keep], or all of them at 0.
 */
data class BadgeCorrection(val count: Int, val keep: Set<String>) {
    companion object {
        const val TYPE = "badge"

        /** The push's data, or null when it is not a correction (or is malformed - then nothing is touched). */
        fun of(data: Map<String, String>): BadgeCorrection? {
            if (data["type"] != TYPE) return null
            val count = data["count"]?.toIntOrNull()?.takeIf { it >= 0 } ?: return null
            val keep = data["keep"].orEmpty().split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
            return BadgeCorrection(count, keep)
        }
    }
}

/** Which of the shown notifications (by tag) to take away. An untagged one (from before 116) goes too. */
fun badgeCancellations(shownTags: List<String?>, correction: BadgeCorrection): List<String?> =
    if (correction.count == 0) shownTags else shownTags.filter { it == null || it !in correction.keep }
