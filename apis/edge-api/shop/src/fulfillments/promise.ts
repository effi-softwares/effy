// When a shop must have a package ready: a fixed offset from placement, so ordering by `readyBy` is ordering by arrival.

import type { DeliveryPromise } from "./types";

export const DEFAULT_READY_WINDOW_MS = 60 * 60 * 1000;

/** Escalation changes prominence, never position: the queue must not rearrange mid-shift. */
export const AT_RISK_THRESHOLD_MS = 15 * 60 * 1000;

export function promiseFor(placedAt: Date): Pick<DeliveryPromise, "readyBy"> {
  return { readyBy: new Date(placedAt.getTime() + DEFAULT_READY_WINDOW_MS) };
}

/** Terminal portions are never at risk. */
export function isAtRisk(promise: Pick<DeliveryPromise, "readyBy">, status: string, now: Date = new Date()): boolean {
  // Named positively, so a new state is safe by default.
  if (!AT_RISK_STATUSES.includes(status)) return false;
  return promise.readyBy.getTime() - now.getTime() <= AT_RISK_THRESHOLD_MS;
}

/** The only states in which a portion can still miss its promise. */
export const AT_RISK_STATUSES: readonly string[] = ["pending", "received", "picking"];
