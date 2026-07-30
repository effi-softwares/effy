package com.effyshopping.customer.mobile.features.cart.domain

import kotlinx.serialization.Serializable

/**
 * One cart change the shopper has made that the platform has not yet accepted (027 FR-017/FR-018).
 *
 * ── Why this exists at all ──────────────────────────────────────────────────────────────────────
 *
 * A tap must land immediately (FR-014), and the network must not be in that path. So a change is applied
 * to the mirror, queued here, and persisted — in that order — before any request exists. If the process
 * dies before the request goes out, the queue is still on disk and the change is applied on the next
 * launch.
 *
 * ⚠ [changeId] is minted ONCE PER SHOPPER ACTION and reused by every retry of it. That is the whole
 * point: when a request reaches the platform but its response never reaches the client, the client cannot
 * tell success from failure — so it retries, and the platform recognises the id and does nothing. Minting
 * a fresh id per attempt would turn "add 1 milk" into "add 1 milk twice" precisely when the network is
 * worst.
 *
 * Most of these operations are idempotent anyway (absolute quantities; union-with-max). The id is carried
 * on all of them regardless, so the queue has no special cases and a future non-idempotent operation
 * cannot be added without inheriting the guard.
 */
@Serializable
data class PendingChange(
    /** UUIDv4, one per shopper action. */
    val changeId: String,
    val kind: PendingChangeKind,
    /** Empty for cart-wide operations (clear, merge). */
    val productId: String = "",
    /** The ABSOLUTE quantity for SetQuantity, the increment for Add, otherwise ignored. */
    val quantity: Int = 0,
    /** Only for [PendingChangeKind.Merge] — the device lines being folded in. */
    val lines: List<PendingLine> = emptyList(),
    val status: PendingStatus = PendingStatus.Queued,
    /** How many times sending has been attempted, for backoff and for giving up (FR-020). */
    val attempts: Int = 0,
    /** Set when the platform refused this definitively; surfaced to the shopper (FR-019). */
    val failure: String? = null,
) {
    /** A change the coordinator should stop retrying — a definitive refusal, not a network blip. */
    val isDead: Boolean get() = status == PendingStatus.Failed
}

@Serializable
data class PendingLine(val productId: String, val quantity: Int)

@Serializable
enum class PendingChangeKind {
    /** The ONE non-idempotent operation: it increments. */
    Add,

    /** Absolute quantity; 0 removes. */
    SetQuantity,
    Remove,
    Clear,
    Merge,
    SetAside,
    RestoreSaved,
    DeleteSaved,
}

@Serializable
enum class PendingStatus {
    /** Waiting for the coordinator (possibly waiting for connectivity). */
    Queued,

    /** In flight. */
    Sending,

    /** Definitively refused; retrying would only repeat the refusal. */
    Failed,
}
