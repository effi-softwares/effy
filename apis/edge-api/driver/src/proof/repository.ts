// The proof write path (064). One transaction, because the proof and everything it settles must
// commit together or not at all.

import { enqueueOrderDeliveredIfComplete, withTransaction } from "@effy/edge-shared";

import * as SQL from "./sql";
import type {
  CapturedProof,
  DropPackageRow,
  DropRow,
  FailureRow,
  ProofRow,
  SupportedProofMethod,
} from "./types";
import { toCapturedProof, toIso } from "./types";

export class DropNotFoundError extends Error {
  constructor() {
    super("drop not found");
    this.name = "DropNotFoundError";
  }
}

export interface RecordProofInput {
  dropId: string;
  driverId: string;
  driverSub: string;
  method: SupportedProofMethod;
  mediaKey: string | null;
  note: string | null;
  changeId: string;
}

export interface RecordProofResult {
  proof: CapturedProof;
  /** True when THIS call completed the order's last outstanding package. */
  orderComplete: boolean;
  /** True when the call found existing proof rather than writing it (a retry). */
  replayed: boolean;
}

/**
 * Record proof and complete the drop.
 *
 * ⚠ THIS FUNCTION *IS* THE DELIVERY COMPLETION — it is not an annotation on one (research R2).
 * Until 064 the only writer of `shop_fulfillment.status = 'delivered'` anywhere on this platform was
 * `edge-api/orders/src/arrival/repository.ts`, 053's BACK-OFFICE manual arrival path built for
 * standard carrier packages. A same-day delivery could only be completed by an admin asserting it
 * happened; the driver who handed the package over had no way to say so.
 *
 * The order of writes matters and is not arbitrary:
 *
 *   1. proof            — the evidence, and the idempotency anchor (`delivery_proof_stop_uq`)
 *   2. packages         — each unit settled
 *   3. fulfillment      — the status a shop and a shopper read
 *   4. ⚠ package_arrival — WHAT ORDER COMPLETENESS ACTUALLY KEYS ON (research R3)
 *   5. stop + round     — the driver's own progress
 *   6. ⚠ the shared rollup — one implementation, never a second one
 *
 * Step 4 is the one with no second chance. `enqueueOrderDeliveredIfComplete` asks whether an
 * unarrived package of this order exists, against `package_arrival` — not against the status written
 * in step 3. Skipping it leaves the order permanently incomplete with nothing failing anywhere.
 */
export async function recordProof(input: RecordProofInput): Promise<RecordProofResult> {
  return withTransaction(async (tx: any) => {
    // A replay of the same driver action, wherever it landed. Answered before anything is locked so
    // a retry is cheap and can never contend with itself.
    const byChange = await tx.query(SQL.PROOF_BY_CHANGE, [input.changeId]);
    if (byChange.rowCount > 0) {
      return {
        proof: toCapturedProof(byChange.rows[0] as ProofRow),
        orderComplete: false,
        replayed: true,
      };
    }

    const drop = await tx.query(SQL.LOCK_DROP, [input.dropId, input.driverId]);
    if (drop.rowCount === 0) throw new DropNotFoundError();
    const row = drop.rows[0] as DropRow;

    // ⚠ Idempotent by state, the pattern `work/complete.ts` establishes for this service: a drop
    // already proven answers with what it already has, as a success. A retry on a phone in a loading
    // bay must not be something the driver has to think about.
    const existing = await tx.query(SQL.EXISTING_PROOF, [input.dropId]);
    if (existing.rowCount > 0) {
      return {
        proof: toCapturedProof(existing.rows[0] as ProofRow),
        orderComplete: false,
        replayed: true,
      };
    }

    const inserted = await tx.query(SQL.INSERT_PROOF, [
      input.dropId,
      input.method,
      input.mediaKey,
      input.note,
      input.driverId,
      input.changeId,
    ]);

    const packages = await tx.query(SQL.DROP_PACKAGES, [input.dropId]);
    for (const p of packages.rows as DropPackageRow[]) {
      await tx.query(SQL.MARK_PACKAGE_DELIVERED, [p.round_package_id]);
      await tx.query(SQL.MARK_FULFILLMENT_DELIVERED, [p.shop_fulfillment_id]);
      // ⚠ See the note above — without this the order never completes and the shopper is never told.
      await tx.query(SQL.INSERT_ARRIVAL, [p.shop_fulfillment_id, input.driverSub]);
    }

    await tx.query(SQL.MARK_STOP_DONE, [input.dropId]);
    await tx.query(SQL.MARK_ROUND_IN_PROGRESS, [row.round_id]);

    // ⚠ THE SHARED ROLLUP, NEVER A SECOND IMPLEMENTATION (Principle II, research R3). Its own header
    // names `edge-api/driver` as a caller — and this service has imported it exactly never until now,
    // because 063's teardown removed the caller and left the rule with one consumer.
    //
    // ⚠ IT IS A ROLLUP, NOT A MAX. A mixed order is complete only when EVERY package has arrived.
    // 053 fixed a live defect where the driver path announced delivery on a drop id, telling a
    // shopper their order had arrived while the standard half was still with a carrier.
    const orderComplete = row.order_id
      ? await enqueueOrderDeliveredIfComplete(tx, row.order_id)
      : false;

    return {
      proof: toCapturedProof({ ...(inserted.rows[0] as ProofRow), method: input.method, media_key: input.mediaKey, note: input.note }),
      orderComplete,
      replayed: false,
    };
  });
}

export interface RecordFailureInput {
  dropId: string;
  driverId: string;
  reason: string;
  note: string | null;
  changeId: string;
}

export interface RecordFailureResult {
  failureId: string;
  failedAt: string;
  replayed: boolean;
}

/**
 * Record an attempt that could not be completed (FR-009…FR-013).
 *
 * ⚠ WHAT THIS DELIBERATELY DOES NOT DO: mark anything delivered, write a `package_arrival`, release
 * the package, or call the completion rollup. The driver still physically has the goods (FR-011), and
 * the order must never report delivered because of a failure (SC-011).
 */
export async function recordFailure(input: RecordFailureInput): Promise<RecordFailureResult> {
  return withTransaction(async (tx: any) => {
    const byChange = await tx.query(SQL.FAILURE_BY_CHANGE, [input.changeId]);
    if (byChange.rowCount > 0) {
      const prior = byChange.rows[0] as FailureRow;
      return { failureId: prior.id, failedAt: toIso(prior.failed_at), replayed: true };
    }

    const drop = await tx.query(SQL.LOCK_DROP, [input.dropId, input.driverId]);
    if (drop.rowCount === 0) throw new DropNotFoundError();

    const ins = await tx.query(SQL.INSERT_FAILURE, [
      input.dropId,
      input.reason,
      input.note,
      input.driverId,
      input.changeId,
    ]);
    await tx.query(SQL.MARK_STOP_SKIPPED, [input.dropId]);

    const r = ins.rows[0] as FailureRow;
    return { failureId: r.id, failedAt: toIso(r.failed_at), replayed: false };
  });
}
