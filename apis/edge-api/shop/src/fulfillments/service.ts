// Service for shop order fulfilment (020): state-machine rules and validation. No HTTP, no SQL
// (constitution Principle VI). The repository owns shop-scoping; this module owns legality.

import * as repo from "./repository";
import {
  FulfillmentError,
  isLegalTransition,
  type FulfillmentDetail,
  type FulfillmentStatus,
  type FulfillmentSummary,
  type ItemProgress,
  type QueueState,
  type RequestableTransition,
} from "./types";

/** Actor context. `staffId` is nullable so an audit row survives a missing operator record. */
export interface Actor {
  sub: string;
  shopId: string;
  staffId: string | null;
}

export function listQueue(actor: Actor, state: QueueState): Promise<FulfillmentSummary[]> {
  return repo.listQueue(actor.shopId, state);
}

/** Opening a portion IS the acknowledgement (FR-011a) — the repository handles it, guarded. */
export function getDetail(actor: Actor, fulfillmentId: string): Promise<FulfillmentDetail> {
  return repo.readDetail(fulfillmentId, actor.shopId, actor.staffId);
}

/**
 * Advance or reverse a portion.
 *
 * The no-op rule (FR-014, SC-005): if the guarded UPDATE matches zero rows we re-read. If the
 * portion is ALREADY in the requested state, another operator won the race — that is a benign
 * success, not an error, and returning 409 there would make a correct concurrent action look broken.
 * If it sits in some other state, the requested transition was genuinely illegal → conflict.
 */
export async function transition(
  actor: Actor,
  fulfillmentId: string,
  to: RequestableTransition,
): Promise<FulfillmentDetail> {
  const current = await repo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();

  if (current === to) return getDetail(actor, fulfillmentId); // already there — benign no-op

  if (!isLegalTransition(current, to)) {
    // Covers `collected` (absent as a source, so permanently immutable — FR-011f) and every
    // skipped/backward edge the machine does not admit.
    throw new FulfillmentError("conflict", `cannot move a ${current} fulfillment to ${to}`);
  }

  const applied = await repo.transition(fulfillmentId, actor.shopId, current, to, actor.staffId);
  if (!applied) {
    // Lost the race between our read and our write. Re-read and apply the same rule as above.
    const now = await repo.readStatus(fulfillmentId, actor.shopId);
    if (now === null) throw notFound();
    if (now !== to) {
      throw new FulfillmentError("conflict", `cannot move a ${now} fulfillment to ${to}`);
    }
  }
  return getDetail(actor, fulfillmentId);
}

/**
 * Record picking progress for one line.
 *
 * Only legal while `picking`: before that there are no progress rows to write, and after it the
 * portion is complete. `collected` is refused by the same check (FR-011f).
 */
export async function updateItemProgress(
  actor: Actor,
  fulfillmentId: string,
  orderItemId: string,
  body: Record<string, unknown>,
): Promise<FulfillmentDetail> {
  const progress = parseProgress(body);

  const current = await repo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();
  if (current !== "picking") {
    throw new FulfillmentError("conflict", `items can only be recorded while picking (is ${current})`);
  }

  await repo.updateItemProgress(fulfillmentId, actor.shopId, orderItemId, progress, actor.staffId);
  return getDetail(actor, fulfillmentId);
}

/**
 * ⚠ DEV-ONLY (FR-030…FR-034). Collect a ready portion using a placeholder driver identity.
 *
 * The state guard here is a second line of defence only — the real control is that the route is
 * structurally absent outside local development (FR-031). It can never skip, reverse, or shortcut
 * an earlier state: `ready_for_pickup` is the sole legal source (FR-032).
 */
export async function collectViaStub(
  actor: Actor,
  fulfillmentId: string,
  driverRef: string,
): Promise<FulfillmentDetail> {
  if (!driverRef.trim()) {
    throw new FulfillmentError("validation", "driverRef is required", [
      { field: "driverRef", message: "must be a non-empty string" },
    ]);
  }

  const current = await repo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();
  if (current !== "ready_for_pickup") {
    throw new FulfillmentError("conflict", `only a ready_for_pickup fulfillment can be collected (is ${current})`);
  }

  await repo.collectViaStub(fulfillmentId, actor.shopId, driverRef, actor.staffId);
  return getDetail(actor, fulfillmentId);
}

/**
 * DEV-ONLY driver stub: mark a picked-up portion delivered (`collected` → `delivered`). The second
 * half of the placeholder driver lifecycle, mirroring collectViaStub. `collected` is the sole legal
 * source; the route is structurally absent outside local dev (FR-031), so the state guard is a
 * second line of defence only. Removed with collectViaStub when the driver slice ships (FR-034).
 */
export async function deliverViaStub(
  actor: Actor,
  fulfillmentId: string,
  driverRef: string,
): Promise<FulfillmentDetail> {
  if (!driverRef.trim()) {
    throw new FulfillmentError("validation", "driverRef is required", [
      { field: "driverRef", message: "must be a non-empty string" },
    ]);
  }

  const current = await repo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();
  if (current !== "collected") {
    throw new FulfillmentError("conflict", `only a collected fulfillment can be delivered (is ${current})`);
  }

  await repo.deliverViaStub(fulfillmentId, actor.shopId, driverRef, actor.staffId);
  return getDetail(actor, fulfillmentId);
}

// ── internals ──────────────────────────────────────────────────────────────────────────────────

/**
 * "Does not exist" and "belongs to another shop" are the SAME error by construction — every
 * repository read is shop-scoped, so the two are indistinguishable before they reach here. The
 * handler maps this to a uniform 403, which is what stops response codes being used to enumerate
 * other shops' portions (SC-007).
 */
function notFound(): FulfillmentError {
  return new FulfillmentError("not_found", "fulfillment not found");
}

function parseProgress(body: Record<string, unknown>): ItemProgress {
  const out: ItemProgress = {};
  for (const key of ["gatheredQuantity", "unavailableQuantity"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new FulfillmentError("validation", "invalid quantity", [
        { field: key, message: "must be a non-negative integer" },
      ]);
    }
    out[key] = v;
  }
  if (out.gatheredQuantity === undefined && out.unavailableQuantity === undefined) {
    throw new FulfillmentError("validation", "nothing to update", [
      { field: "gatheredQuantity", message: "provide gatheredQuantity and/or unavailableQuantity" },
    ]);
  }
  return out;
}

/** Re-exported for tests that assert legality without touching the database. */
export { isLegalTransition };
export type { FulfillmentStatus };
