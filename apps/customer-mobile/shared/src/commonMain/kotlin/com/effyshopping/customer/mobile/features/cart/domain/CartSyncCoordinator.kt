package com.effyshopping.customer.mobile.features.cart.domain

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Keeps the [CartStore] mirror and the platform in agreement (027).
 *
 * ── The two halves ──────────────────────────────────────────────────────────────────────────────
 *
 * **Reading** ([refresh]) — brings the mirror up to date:
 *   - signed in → `GET /v1/cart`; the account cart IS the truth, adopted by revision.
 *   - guest     → `POST /v1/cart/preview`; a guest has no server cart, so the platform prices the
 *                 device's own lines and writes nothing.
 *
 * **Writing** ([submit]) — sends what the shopper did. This is the half that makes a cart built on one
 * device appear on another (US2): without it the mirror was durable but private, and a shopper signing in
 * on a second device would correctly see nothing, because nothing had ever been sent.
 *
 * ── Three rules ─────────────────────────────────────────────────────────────────────────────────
 *
 *  1. **A guest sends nothing.** There is no server cart to send to. Their whole cart goes across once, at
 *     sign-in, via the merge — which is why [submit] is a no-op for a guest rather than a queued failure.
 *  2. **The queue drains in order, one at a time.** A remove followed by an add on the same product must
 *     not race; the [Mutex] is what stops two drains interleaving into a cart neither the shopper nor the
 *     platform asked for.
 *  3. **A response is adopted only if it is newer.** The mirror's forward-only rule does the work; this
 *     class just hands it every answer it gets.
 *
 * A failure never destroys anything. A network error leaves the change queued for the next trigger; a
 * definitive refusal (a 4xx — the product went away, the cart is full) marks it dead so it is not retried
 * forever, and the mirror reconciles to the platform's actual contents.
 *
 * ⚠ Debouncing, backoff and the offline drain-on-launch are US4. This drains eagerly and retries on the
 * next trigger, which is correct but chattier than it will be. The seam is deliberately this shape so
 * those are additions, not a rewrite.
 */
class CartSyncCoordinator(
    private val repo: CartRepository,
    private val store: CartStore,
    /** Whether a customer session exists right now. Read at call time, never cached. */
    private val isSignedIn: () -> Boolean,
    private val scope: CoroutineScope,
) {
    private val drainLock = Mutex()

    /** One pending send-timer per product, so debouncing one line never delays another. */
    private val debounced = mutableMapOf<String, Job>()

    /** Consecutive transient failures, for the backoff. Reset by any success. */
    private var failures = 0

    init {
        // ⚠ A change made before a force-quit is on disk, not in memory. Without this it would sit there
        // until the shopper happened to touch the cart again — so an edit made in a tunnel, followed by the
        // app being killed, would silently never reach the platform (FR-017).
        scope.launch { drain() }
    }

    // ── Reading ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Bring the mirror up to date. Safe to call on every cart open and every app foreground.
     *
     * Returns true when the mirror changed. A false means either nothing was newer or the platform could
     * not be reached — and the caller does not need to care, because either way the mirror is still the
     * best available answer and still what the UI shows.
     */
    suspend fun refresh(): Boolean =
        try {
            if (isSignedIn()) {
                // Send anything outstanding FIRST, so a read cannot overwrite a change we have not yet
                // told the platform about. Getting this order wrong loses the shopper's most recent tap.
                drain()
                store.adopt(repo.get())
            } else {
                val lines = store.snapshot().lines
                if (lines.isEmpty()) {
                    false
                } else {
                    store.adoptPreview(repo.preview(lines.map { PendingLine(it.productId, it.quantity) }))
                }
            }
        } catch (e: AppException) {
            // Offline, or the platform is unreachable. Keep what we hold — "we could not check" must never
            // read to the shopper as "you have nothing".
            false
        }

    // ── Writing ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Record a change the shopper just made and start sending it.
     *
     * A guest's change is deliberately dropped rather than queued: there is no server cart for it to
     * apply to, and their cart crosses over whole at sign-in. Queueing it would mean replaying a guest's
     * entire history against an account cart the moment they signed in, which is both wrong and
     * unnecessary.
     */
    fun submit(change: PendingChange) {
        if (!isSignedIn()) return
        store.enqueue(change)
        scope.launch { drain() }
    }

    /**
     * Record a repeated change — a quantity stepper — and send only what the shopper settles on.
     *
     * Ten taps in two seconds produce ONE request (FR-016, SC-005): each tap replaces the queued value and
     * restarts a short timer, and only the last one is ever sent. Per product, so adjusting one line never
     * holds up another.
     *
     * The mirror has already moved by the time this is called, so the debounce is invisible — the shopper
     * sees every tap immediately and the network sees only the answer.
     */
    fun submitDebounced(change: PendingChange) {
        if (!isSignedIn()) return
        store.enqueueConflating(change)
        debounced[change.productId]?.cancel()
        debounced[change.productId] = scope.launch {
            delay(SEND_DEBOUNCE_MS)
            drain()
        }
    }

    /**
     * Send every queued change, oldest first, stopping at the first one that could not be sent.
     *
     * Stopping matters: the queue is ordered, and skipping past a change that failed would apply later
     * changes on top of a cart missing an earlier one.
     */
    suspend fun drain() {
        if (!isSignedIn()) return
        drainLock.withLock {
            while (true) {
                val change = store.queue.value.firstOrNull { !it.isDead } ?: return
                val sent = send(change)
                if (!sent) return
            }
        }
    }

    /** Returns true when the change was applied (or definitively refused) and can leave the queue. */
    private suspend fun send(change: PendingChange): Boolean =
        try {
            store.adopt(apply(change))
            store.dequeue(change.changeId)
            failures = 0
            true
        } catch (e: AppException) {
            when {
                // Transient: wait, then let the next trigger try again. The wait GROWS with consecutive
                // failures so a device with no signal is not hammering the radio flat (FR-020); it is
                // capped, because a shopper who regains signal should not wait minutes for their cart.
                isTransient(e.error) -> {
                    failures++
                    delay(backoffMillis())
                    false
                }
                else -> {
                    // A definitive refusal. Retrying only repeats it, so mark it dead, tell the shopper,
                    // and reconcile to what the platform actually holds (FR-019).
                    store.markFailed(change.changeId, describe(e.error))
                    runCatching { store.adopt(repo.get()) }
                    true
                }
            }
        }

    /** Exponential, capped. 1s, 2s, 4s, 8s, then every 15s. */
    private fun backoffMillis(): Long {
        val step = RETRY_BASE_MS shl (failures - 1).coerceIn(0, 3)
        return step.coerceAtMost(RETRY_MAX_MS)
    }

    private suspend fun apply(change: PendingChange): CartSnapshot = when (change.kind) {
        PendingChangeKind.Add -> repo.add(change.productId, change.quantity, change.changeId)
        PendingChangeKind.SetQuantity -> repo.setQuantity(change.productId, change.quantity, change.changeId)
        PendingChangeKind.Remove -> repo.remove(change.productId, change.changeId)
        PendingChangeKind.Clear -> repo.clear(change.changeId)
        PendingChangeKind.Merge -> repo.merge(change.lines, change.changeId)
        PendingChangeKind.SetAside -> repo.setAside(change.productId, change.changeId)
        PendingChangeKind.RestoreSaved -> repo.restoreSaved(change.productId, change.changeId)
        PendingChangeKind.DeleteSaved -> repo.deleteSaved(change.productId, change.changeId)
    }

    /**
     * A failure worth trying again, versus one that will only repeat. Getting this wrong in either
     * direction is bad: retrying a refusal forever burns battery and never succeeds, and giving up on a
     * blip silently loses the shopper's change.
     *
     * ⚠ `Unauthenticated` counts as retryable, and that is a lesson paid for. A rejected token is not the
     * shopper's mistake and not permanent — an expired access token, a refresh in flight, or a service
     * configured to accept the wrong app client all produce it, and all are fixed without the shopper
     * doing anything. Treating it as final marked every queued change dead and discarded the shopper's
     * work over something that would have healed on the next attempt.
     */
    private fun isTransient(error: AppError): Boolean =
        error == AppError.Network ||
            error == AppError.Unavailable ||
            error == AppError.Unauthenticated ||
            error is AppError.RateLimited

    private companion object {
        /** Long enough that a deliberate second tap lands inside it; short enough to feel instant. */
        const val SEND_DEBOUNCE_MS = 400L
        const val RETRY_BASE_MS = 1_000L
        const val RETRY_MAX_MS = 15_000L
    }

    /** Shopper-facing wording for a change that will not be retried. Never mentions a shop. */
    private fun describe(error: AppError): String = when (error) {
        is AppError.Validation -> error.message
        else -> "We couldn’t save that change."
    }
}
