package com.effyshopping.mobile.kit.live

/**
 * Every kind of thing a live update may name (071). The list is closed.
 *
 * ⚠ A MIRROR of `LIVE_KINDS` in `packages/shared-types/src/live.ts`, which is the source of truth.
 * `packages/shared-types/src/live.test.ts` reads this file and fails if the two lists differ —
 * same names, same order. Add a kind there first.
 *
 * ⚠ An update carries ONLY its kind. No id, no status, no amount: the app re-reads through the
 * routes it already uses. That is what makes a duplicate or late update harmless.
 */
enum class LiveKind(val wire: String) {
    ORDERS("orders"),
    STOCK("stock"),
    ATTENTION("attention"),
    WORK("work"),
    DISPATCH("dispatch"),
    SLOTS("slots"),
    REVIEW("review"),

    /** 074 — the customer's points balance changed. */
    POINTS("points");

    companion object {
        /** `null` for a kind this build has never heard of — a newer backend, not an error. */
        fun fromWire(wire: String?): LiveKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** What the app shows about the channel itself. */
enum class LiveState {
    /** Subscribed: updates arrive. Nothing is shown. */
    LIVE,

    /** Connecting, or lost and trying again. Shown only if it lasts. */
    RECONNECTING,

    /** No channel for this person, signed out, or in the background. */
    OFF,
}
