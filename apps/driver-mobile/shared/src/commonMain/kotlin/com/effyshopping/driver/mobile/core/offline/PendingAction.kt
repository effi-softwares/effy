package com.effyshopping.driver.mobile.core.offline

import kotlinx.serialization.Serializable

/**
 * A driver write that could not reach the backend and is queued for replay (049 US6, FR-039/040).
 *
 * Every driver mutation is a POST to `/driver/v1/…` whose body carries a per-action `changeId`, and the
 * backend applies each `changeId` **exactly once** (a UNIQUE index on `driver_task_event.change_id` +
 * `ON CONFLICT DO NOTHING`). So replaying a queued action after reconnect is always safe: a first
 * delivery applies it, a duplicate is a no-op. That idempotency is what makes "apply on reconnect without
 * double-applying" true (SC-007) — the queue only has to guarantee the write is not *lost*.
 */
@Serializable
data class PendingAction(
    val changeId: String,
    val path: String, // e.g. "driver/v1/collection/runs/…/stops/…/collect"
    val bodyJson: String, // the exact request body, replayed verbatim
    val label: String, // human-readable, for a "N pending" surface
    val attempts: Int = 0,
)
