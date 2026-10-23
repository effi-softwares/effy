// One transaction: the proof and everything it settles commit together.

import { enqueueOrderDeliveredIfComplete, withTransaction } from "@effy/edge-shared";
import { completeDeliveryRoundIfFinished } from "@effy/edge-shared/delivery";
import { accountFor, countByPackage, expectedParcels, NothingToHandOver, recordHandovers, recordReads, writeParcelHolds } from "@effy/edge-shared/labels";
import type { LabelReadDTO, ParcelHandover, ParcelMissing } from "@effy/shared-types";

import { assertRoundOpen } from "../work/open";
import { assertDropLoaded } from "../work/sequence";
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
  /** Every bag of the drop, handed over or declared missing, and the reads made at the door. */
  parcels?: ParcelHandover[];
  missingParcels?: ParcelMissing[];
  reads?: LabelReadDTO[];
}

export interface RecordProofResult {
  proof: CapturedProof;
  /** This call completed the order's last outstanding package. */
  orderComplete: boolean;
  /** Existing proof was found (a retry). */
  replayed: boolean;
}

/**
 * The delivery completion. Writes in order: proof (the idempotency anchor), packages, fulfilment,
 * `package_arrival`, stop and round, then the shared rollup. `package_arrival` is what order
 * completeness reads; skipping it leaves the order incomplete silently.
 */
export async function recordProof(input: RecordProofInput): Promise<RecordProofResult> {
  return withTransaction(async (tx: any) => {
    // A replay is answered before anything is locked.
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

    // No proof on a round that has not opened.
    await assertRoundOpen(tx, row.round_id);

    // Already proven: answer with what it has, as a success.
    const existing = await tx.query(SQL.EXISTING_PROOF, [input.dropId]);
    if (existing.rowCount > 0) {
      return {
        proof: toCapturedProof(existing.rows[0] as ProofRow),
        orderComplete: false,
        replayed: true,
      };
    }

    // Delivered from the van, so it must have been loaded.
    await assertDropLoaded(tx, input.dropId, input.driverId);

    const inserted = await tx.query(SQL.INSERT_PROOF, [
      input.dropId,
      input.method,
      input.mediaKey,
      input.note,
      input.driverId,
      input.changeId,
    ]);

    const packages = await tx.query(SQL.DROP_PACKAGES, [input.dropId]);
    // Every bag is handed over or declared missing. All missing: held, not delivered.
    const dropPackages = (packages.rows as DropPackageRow[]).map((p) => p.shop_fulfillment_id);
    const expected = await expectedParcels(tx, { step: "deliver", packageIds: dropPackages, roundId: row.round_id });
    const accounted = accountFor("deliver", expected, input.parcels, input.missingParcels);
    const holds = await writeParcelHolds(tx, {
      step: "deliver", driverId: input.driverId, roundId: row.round_id, changeId: input.changeId,
      missing: accounted.missing, expectedCount: countByPackage(expected),
    });
    const notHere = new Set(holds.packagesHeld);
    if (dropPackages.length > 0 && dropPackages.every((id) => notHere.has(id))) throw new NothingToHandOver();
    for (const p of (packages.rows as DropPackageRow[]).filter((x) => !notHere.has(x.shop_fulfillment_id))) {
      await tx.query(SQL.MARK_PACKAGE_DELIVERED, [p.round_package_id]);
      await tx.query(SQL.MARK_FULFILLMENT_DELIVERED, [p.shop_fulfillment_id]);
      await tx.query(SQL.INSERT_ARRIVAL, [p.shop_fulfillment_id, input.driverSub]);
    }

    await tx.query(SQL.MARK_STOP_DONE, [input.dropId]);
    await tx.query(SQL.MARK_ROUND_IN_PROGRESS, [row.round_id]);
    // How each bag was handed over at the door.
    await recordHandovers(tx, {
      step: "deliver",
      actor: { kind: "driver", driverId: input.driverId },
      roundId: row.round_id,
      changeId: input.changeId,
      parcels: accounted.handed.filter((h) => !notHere.has(h.parcel.packageId)).map((h) => ({ parcelId: h.parcel.parcelId, method: h.method })),
      allowed: new Map(expected.map((p) => [p.parcelId, p.packageId])),
    });
    await recordReads(tx, { actor: { kind: "driver", driverId: input.driverId }, surface: "driver_app", step: "deliver", roundId: row.round_id, reads: input.reads });
    await completeRoundIfFinished(tx, row.round_id);

    // The shared rollup, not a second one: an order is complete only when every package has arrived.
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

/** Delivers, writes, releases and rolls up nothing: the driver still has the goods. */
export async function recordFailure(input: RecordFailureInput): Promise<RecordFailureResult> {
  return withTransaction(async (tx: any) => {
    const byChange = await tx.query(SQL.FAILURE_BY_CHANGE, [input.changeId]);
    if (byChange.rowCount > 0) {
      const prior = byChange.rows[0] as FailureRow;
      return { failureId: prior.id, failedAt: toIso(prior.failed_at), replayed: true };
    }

    const drop = await tx.query(SQL.LOCK_DROP, [input.dropId, input.driverId]);
    if (drop.rowCount === 0) throw new DropNotFoundError();

    // No attempt before the round opens.
    await assertRoundOpen(tx, (drop.rows[0] as DropRow).round_id);
    // Nor at a drop never loaded.
    await assertDropLoaded(tx, input.dropId, input.driverId);

    const roundId = (drop.rows[0] as DropRow).round_id;
    const ins = await tx.query(SQL.INSERT_FAILURE, [
      input.dropId,
      input.reason,
      input.note,
      input.driverId,
      input.changeId,
    ]);
    await tx.query(SQL.MARK_STOP_SKIPPED, [input.dropId]);
    await tx.query(SQL.MARK_ROUND_IN_PROGRESS, [roundId]);
    await completeRoundIfFinished(tx, roundId);

    const r = ins.rows[0] as FailureRow;
    return { failureId: r.id, failedAt: toIso(r.failed_at), replayed: false };
  });
}

/** Unless failed parcels are still to be returned to the hub. The rule is in @effy/edge-shared/delivery. */
async function completeRoundIfFinished(tx: any, roundId: string): Promise<boolean> {
  return completeDeliveryRoundIfFinished(tx, roundId);
}
