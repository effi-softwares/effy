package com.effyshopping.mobile.kit.live

/**
 * Every kind of thing a live update may name: a closed list mirroring `LIVE_KINDS` in
 * `packages/shared-types/src/live.ts` (its test fails if the two differ). An update carries only its
 * kind, so a duplicate or late one is harmless.
 */
enum class LiveKind(val wire: String) {
    ORDERS("orders"),
    STOCK("stock"),
    ATTENTION("attention"),
    WORK("work"),
    DISPATCH("dispatch"),
    SLOTS("slots"),
    REVIEW("review"),

    /** The customer's points balance changed. */
    POINTS("points"),

    /** Where Effy delivers changed. Back-office only. */
    COVERAGE("coverage"),

    /** A delivery fee plan changed. Back-office only. */
    PRICING("pricing"),

    /** A promotion or display group changed. Back-office only. */
    PROMOTIONS("promotions"),

    /** The category tree, the attribute library or an attachment changed (101). Back-office and every shop. */
    TAXONOMY("taxonomy");

    companion object {
        /** `null` for a kind this build has never heard of (a newer backend). */
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
