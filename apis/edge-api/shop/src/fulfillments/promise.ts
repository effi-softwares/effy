// The delivery-promise seam (020 research R7).
//
// ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
// │ 021-delivery-zones-pricing REPOINTS THIS FILE. It is the only place 020 decides what a shop  │
// │ is promising, and it is deliberately the ONLY place — so introducing same-day vs multi-day   │
// │ changes DATA and this module, not the queue, the handlers, or either client surface.         │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Why this is not a database column: 019 ships a single flat delivery fee and no service levels, so
// every order's promise is identical today. A `promised_ready_at` column added now would be one this
// slice never populates, shaped by guesses about a spec that does not exist — and 021 may well model
// the promise per-shop rather than per-order (an open question in NEXT-021-delivery-zones.md).
//
// Why the queue still orders BY PROMISE rather than by arrival: because the offset below is a
// constant, ordering by `readyBy` IS ordering by `placedAt` — so FR-001 is satisfied and SC-020
// (identical to strict FIFO) holds BY CONSTRUCTION rather than by a branch. Building FIFO now and
// retrofitting urgency later would mean reworking the queue query, both UIs, and their tests.

import type { DeliveryPromise } from "./types";

/** The only service level the platform sells today. 021 replaces this with a per-zone set. */
export const DEFAULT_SERVICE_LEVEL = "standard";

/** How long after placement this shop must be ready. Uniform today; per-zone/per-level in 021. */
export const DEFAULT_READY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * How close to the deadline a portion must be before the queue escalates it in place (FR-001a).
 * Escalation changes PROMINENCE, never POSITION — a queue that rearranges under an operator
 * mid-shift is disorienting (SC-018).
 */
export const AT_RISK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/** Derive the promise for an order placed at `placedAt`. Uniform (the pre-021 fallback). */
export function promiseFor(placedAt: Date): DeliveryPromise {
  return {
    serviceLevel: DEFAULT_SERVICE_LEVEL,
    readyBy: new Date(placedAt.getTime() + DEFAULT_READY_WINDOW_MS),
  };
}

/**
 * The 021 seam (research R11): use the REAL per-portion promise when 021 populated it (a same-day vs
 * multi-day package now has a genuinely different `readyBy`), falling back to the uniform derivation for
 * pre-021 portions. This is the whole 020-side change — everything else in the queue/detail already
 * renders the promise. The delivery FEE is deliberately NOT a parameter here: the shop sees the service
 * level and ready-by, never the payment amount (FR-021a).
 */
export function promiseFrom(
  placedAt: Date,
  promisedReadyAt: Date | null,
  serviceLevel: string | null,
): DeliveryPromise {
  if (promisedReadyAt) {
    return { serviceLevel: serviceLevel ?? DEFAULT_SERVICE_LEVEL, readyBy: promisedReadyAt };
  }
  return promiseFor(placedAt);
}

/**
 * Is this portion at risk against its promise?
 *
 * Terminal portions are never at risk — the shop has done its job, and flagging a completed order as
 * late would be noise the operator cannot act on.
 */
export function isAtRisk(promise: DeliveryPromise, status: string, now: Date = new Date()): boolean {
  if (status === "ready_for_pickup" || status === "collected") return false;
  return promise.readyBy.getTime() - now.getTime() <= AT_RISK_THRESHOLD_MS;
}
