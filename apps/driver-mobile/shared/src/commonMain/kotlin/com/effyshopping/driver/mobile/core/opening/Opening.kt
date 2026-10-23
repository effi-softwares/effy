package com.effyshopping.driver.mobile.core.opening

import kotlin.time.ExperimentalTime
import kotlin.time.Instant

/**
 * When a round opens — present only while the round has not opened yet.
 *
 * Work is given to a driver the moment a driver can take it, hours before it can be done. The round
 * is on the phone in full from then on; what the driver may not do yet is act on it. This is the
 * moment that changes.
 *
 * The server decides whether a round is open, and sends no opening at all once it is. So a null
 * [Opening] always means "open" — including on a phone whose clock is wrong, which could otherwise
 * show an open round as locked. The clock here is used for one thing: noticing, while the screen is
 * open, that the moment has arrived (see `rememberIsOpen`), so the controls come alive without the
 * driver doing anything. If the phone is ahead of the server and a tap arrives early, the server
 * still refuses it and says when.
 *
 * [label] is the server's wording, in Melbourne time ("1:15 pm", "tomorrow 11:15 am"). This app
 * has no timezone database and never formats a time — the same rule as `DeliveryWindow`.
 */
data class Opening(
    val atEpochMillis: Long,
    val label: String,
) {
    /** Has the moment arrived, by this device's clock? */
    fun isOpenAt(nowEpochMillis: Long): Boolean = nowEpochMillis >= atEpochMillis

    /** "Opens 1:15 pm" — what every locked control says beside itself. */
    val sentence: String get() = "Opens $label"

    companion object {
        /**
         * From the wire. Null unless both parts are present and readable: an instant with no words
         * could not be shown, and words with no instant could never unlock. Either way the round is
         * treated as open here and the server remains the judge.
         */
        @OptIn(ExperimentalTime::class)
        fun of(at: String?, label: String?): Opening? {
            if (at.isNullOrBlank() || label.isNullOrBlank()) return null
            val millis = runCatching { Instant.parse(at).toEpochMilliseconds() }.getOrNull() ?: return null
            return Opening(millis, label)
        }
    }
}

/** A null opening is an open round. */
fun Opening?.isOpenAt(nowEpochMillis: Long): Boolean = this == null || this.isOpenAt(nowEpochMillis)
