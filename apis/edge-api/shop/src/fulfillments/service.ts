// State-machine rules and validation; the repository owns shop scoping.

import { withTransaction } from "@effy/edge-shared";
import { ConsignmentRefusal, handOver } from "@effy/edge-shared/delivery";
import { liveParcels, recordHandovers } from "@effy/edge-shared/labels";
import type { ParcelHandover } from "@effy/shared-types";
import { announceOrder } from "@effy/edge-shared/live";
import { announceMoves } from "@effy/edge-shared/live";
import * as repo from "./repository";
import {
  FulfillmentError,
  isLegalTransition,
  type FulfillmentDetail,
  type FulfillmentStatus,
  type FulfillmentSummary,
  type QueueState,
  type RequestableTransition,
} from "./types";

/** `staffId` is nullable so an audit row survives a missing operator record. */
export interface Actor {
  sub: string;
  shopId: string;
  staffId: string | null;
}

export function listQueue(actor: Actor, state: QueueState): Promise<FulfillmentSummary[]> {
  return repo.listQueue(actor.shopId, state);
}

/** Opening a portion is the acknowledgement; the repository guards it. */
export function getDetail(actor: Actor, fulfillmentId: string): Promise<FulfillmentDetail> {
  return repo.readDetail(fulfillmentId, actor.shopId, actor.staffId);
}

/**
 * When the guarded UPDATE matches zero rows we re-read: already in the requested state means another
 * operator won the race (a success); any other state means the transition was illegal (conflict).
 */
export async function transition(
  actor: Actor,
  fulfillmentId: string,
  to: RequestableTransition,
  /** Required when `to` is `unfulfillable` (the database enforces it too): back-office decides a refund on it. */
  reason?: string,
): Promise<FulfillmentDetail> {
  if (to === "unfulfillable" && (reason ?? "").trim() === "") {
    throw new FulfillmentError("validation", "say why this cannot be supplied");
  }

  const current = await repo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();

  if (current === to) return getDetail(actor, fulfillmentId);

  if (!isLegalTransition(current, to)) {
    // Covers `collected` (never a source) and every skipped or backward edge.
    throw new FulfillmentError("conflict", `cannot move a ${current} fulfillment to ${to}`);
  }

  const applied = await repo.transition(
    fulfillmentId, actor.shopId, current, to, actor.staffId, reason?.trim(),
  );
  if (!applied) {
    // Lost the race between read and write: the same rule as above.
    const now = await repo.readStatus(fulfillmentId, actor.shopId);
    if (now === null) throw notFound();
    if (now !== to) {
      throw new FulfillmentError("conflict", `cannot move a ${now} fulfillment to ${to}`);
    }
  } else {
    // Tells the shop's screens, operations, and the customer if their page changed. Only the race's winner announces.
    await announceMoves([{ fulfillmentId, from: current }]);
  }
  return getDetail(actor, fulfillmentId);
}

/** Missing and another shop's are one error (every read is shop-scoped); the handler answers 403. */
function notFound(): FulfillmentError {
  return new FulfillmentError("not_found", "fulfillment not found");
}

export { isLegalTransition };
export type { FulfillmentStatus };

/**
 * The shop hands a parcel to the courier who came for it. Own shop only: another shop's package, a
 * hub-routed one or a missing one is the same 403; one nobody has booked is 409 `not_booked`. The
 * write is `@effy/edge-shared/delivery` `handOver` (actor `shop`), in one transaction.
 */
export async function courierHandover(
  actor: Actor,
  fulfillmentId: string,
  reference: string | null,
  parcels?: ReadonlyArray<Partial<ParcelHandover>>,
): Promise<FulfillmentDetail> {
  const before = await repo.readStatus(fulfillmentId, actor.shopId);
  if (before === null) throw notFound();
  let out;
  try {
    out = await withTransaction(async (tx) => {
      const done = await handOver(tx, { packageId: fulfillmentId, actor: { kind: "shop", sub: actor.sub, staffId: actor.staffId }, reference });
      // One hand-over row per bag, the first time only. A bag not reported as scanned went by hand.
      if (done.created && actor.staffId) {
        const bags = await liveParcels(tx, [fulfillmentId]);
        const said = new Map((parcels ?? []).filter((p) => p?.parcelCode || p?.parcelId).map((p) => [String(p.parcelId ?? p.parcelCode).toUpperCase(), p.method]));
        await recordHandovers(tx, {
          step: "courier_handover",
          actor: { kind: "shop_staff", staffId: actor.staffId },
          changeId: crypto.randomUUID(),
          parcels: bags.map((b) => ({ parcelId: b.parcelId, method: said.get(b.parcelId.toUpperCase()) ?? said.get(b.code) ?? "manual" })),
          allowed: new Map(bags.map((b) => [b.parcelId, fulfillmentId])),
        });
      }
      return done;
    });
  } catch (err) {
    if (err instanceof ConsignmentRefusal) {
      if (err.code === "not_found" || err.code === "not_courier" || err.code === "not_standard") throw notFound();
      throw new FulfillmentError("conflict", err.code === "not_booked"
        ? "no courier pickup has been booked for this parcel yet"
        : err.code === "not_ready" ? "mark the parcel ready first" : err.message);
    }
    throw err;
  }
  if (out.created) {
    if (before !== "collected") await announceMoves([{ fulfillmentId, from: before }]);
    await announceOrder(out.orderId);
  }
  return getDetail(actor, fulfillmentId);
}
