package com.effyshopping.customer.mobile.features.notifications.domain

/**
 * ⚠ PLACEHOLDER DATA (026 FR-035 / T066). THE PLATFORM HAS NO NOTIFICATIONS CAPABILITY.
 *
 * The source design has a Notifications screen; Effy has no notifications backend, no push
 * registration surfaced to the customer app, and no notification table. Rather than omit the screen
 * or invent a backend, the screen is built and fed from THIS ONE MODULE.
 *
 * ── The rules that make this honest ─────────────────────────────────────────────────────────────
 *
 *  1. **One module, clearly named.** Every fixture lives here, so its presence is greppable and a
 *     test can assert no production path reaches it. Fixtures scattered as literals inside a screen
 *     are how placeholder data quietly becomes permanent.
 *  2. **Nothing here may look like a real event.** Every item is written as an obviously generic
 *     example — no order numbers that could match a real order, no prices, no dates that imply the
 *     platform sent anything. A shopper must never be shown a placeholder AS a real notification
 *     (FR-035), and the surest way to guarantee that is for the content to be incapable of it.
 *  3. **It has an owning slice.** These are replaced wholesale when a notifications capability is
 *     built. Until then the screen is reachable and complete, but it reports nothing that happened.
 *
 * Owning slice: **a future `notifications` feature** (unscheduled). Delete this file then.
 */
object NotificationFixtures {
    /**
     * The screen renders whatever this returns. It returns an EMPTY list by default, so what a real
     * shopper sees is the empty state — which is the truth: nothing has been sent to them.
     *
     * [sample] exists so the operator can review the populated layout. It is not wired to any UI.
     */
    fun current(): List<AppNotification> = emptyList()

    /** The populated layout, for operator review only. Never called from a production path. */
    fun sample(): List<AppNotification> = listOf(
        AppNotification(
            group = "Today",
            kind = NotificationKind.Order,
            title = "Example: an order update",
            body = "Order updates will appear here once notifications are switched on.",
        ),
        AppNotification(
            group = "Today",
            kind = NotificationKind.Delivery,
            title = "Example: a delivery update",
            body = "You'll be told when an order is on its way.",
        ),
        AppNotification(
            group = "Earlier",
            kind = NotificationKind.Account,
            title = "Example: an account notice",
            body = "Changes to your account will be confirmed here.",
        ),
    )
}

/** What a notification is about — decides the leading icon. */
enum class NotificationKind { Order, Delivery, Account }

/**
 * One notification.
 *
 * [group] is a heading such as "Today" — a plain string, not a date, because the source groups by
 * relative day and this app has no notification timestamps to derive one from yet.
 */
data class AppNotification(
    val group: String,
    val kind: NotificationKind,
    val title: String,
    val body: String,
)
