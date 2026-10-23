// When a shop must have a package ready (020): a fixed offset from the order's placement, so ordering
// by `readyBy` is ordering by arrival (FR-001, SC-020).

import type { DeliveryPromise } from "./types";

/** How long after placement this shop must be ready. */
export const DEFAULT_READY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * How close to the deadline a portion must be before the queue escalates it in place (FR-001a).
 * Escalation changes PROMINENCE, never POSITION — a queue that rearranges under an operator
 * mid-shift is disorienting (SC-018).
 */
export const AT_RISK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/** The promise for an order placed at `placedAt`. */
export function promiseFor(placedAt: Date): Pick<DeliveryPromise, "readyBy"> {
  return { readyBy: new Date(placedAt.getTime() + DEFAULT_READY_WINDOW_MS) };
}

/**
 * Is this portion at risk against its promise?
 *
 * Terminal portions are never at risk — the shop has done its job, and flagging a completed order as
 * late would be noise the operator cannot act on.
 */
export function isAtRisk(promise: Pick<DeliveryPromise, "readyBy">, status: string, now: Date = new Date()): boolean {
  // ⚠ NAMED POSITIVELY (057 A3). This used to exclude `ready_for_pickup` and `collected` only, so
  // every state added after it — `delivered`, `unfulfillable`, `withdrawn` — satisfied the negation
  // and reported a finished order as AT RISK on the completed queue. That is 053/055's terminal-state
  // lesson recurring; listing the states that CAN be at risk means a new state is safe by default.
  if (!AT_RISK_STATUSES.includes(status)) return false;
  return promise.readyBy.getTime() - now.getTime() <= AT_RISK_THRESHOLD_MS;
}

/** The only states in which a portion can still miss its promise — the shop has not finished it. */
export const AT_RISK_STATUSES: readonly string[] = ["pending", "received", "picking"];
