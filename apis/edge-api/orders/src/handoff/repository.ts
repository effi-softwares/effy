// Recording that a standard package left Effy's care for an outside carrier (053 US2).
//
// ⚠ THIS WRITES NO STATUS. `shop_fulfillment` is untouched here — the handoff row's EXISTENCE is the
// fact, and it is what the arrival route checks (research R3). A `handed_over` status would be a
// second source of truth that can disagree with this row, and it would buy nothing the customer
// sees: a package in a carrier's van and one on the hub floor are both "on the way" to a shopper.

import { ConsignmentRefusal, handOver } from "@effy/edge-shared/delivery";
import { withTransaction } from "@effy/edge-shared";

import { OrderActionError, type OrderActionReason } from "../lib/errors";

export interface HandoffResult {
  /** false when this call found the handover already recorded — the idempotent replay. */
  created: boolean;
  reference: string | null;
  carrierName: string | null;
  handedOverAt: string;
}

export interface RecordHandoffInput {
  fulfillmentId: string;
  actorSub: string;
  reference?: string;
  carrierName?: string;
  note?: string;
  changeId: string;
}

/**
 * Record a carrier handover, idempotently.
 *
 * ⚠ A MISSING `reference` IS NOT AN ERROR (FR-003). Effy has no carrier contract, so most handovers
 * genuinely have no consignment number to record. This function must never refuse for its absence,
 * and nothing downstream may present the resulting NULL as missing data, a warning, or an unfinished
 * step. Empty strings are normalised to NULL so "not supplied" and "supplied as blank" cannot become
 * two different rows meaning the same thing.
 */
export async function recordHandoff(input: RecordHandoffInput): Promise<HandoffResult> {
  return withTransaction(async (tx) => {
    // ⚠ 080 — THE HANDOVER IS WRITTEN BY @effy/edge-shared/delivery `handOver`, the one writer of
    // `carrier_handoff` (the shop service hands supplier pickups over through it too). It also
    // creates or completes the parcel's consignment and tells the customer. This route keeps 053's
    // contract and its audit row.
    let done: Awaited<ReturnType<typeof handOver>>;
    try {
      done = await handOver(tx, {
        packageId: input.fulfillmentId,
        actor: { kind: "staff", sub: input.actorSub },
        reference: input.reference ?? null,
        carrierName: input.carrierName ?? null,
        note: input.note ?? null,
      });
    } catch (err) {
      if (err instanceof ConsignmentRefusal) throw new OrderActionError(asOrderReason(err.code));
      throw err;
    }
    if (done.created) {
      await tx.query(
        `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
         VALUES ($1, 'order.handoff_recorded', 'shop_fulfillment', $2, $3::jsonb)`,
        [
          input.actorSub,
          input.fulfillmentId,
          JSON.stringify({
            orderId: done.orderId,
            // Recorded as a boolean, deliberately: whether a reference was supplied is the operational
            // fact worth auditing, and the reference itself already lives on the handoff row.
            hasReference: done.reference !== null,
            changeId: input.changeId,
          }),
        ],
      );
    }
    return { created: done.created, reference: done.reference, carrierName: done.carrierName, handedOverAt: done.handedOverAt };
  });
}

/** The shared writer's refusal codes this route has always answered with (053, 078). */
function asOrderReason(code: string): OrderActionReason {
  if (code === "not_found" || code === "not_collected" || code === "not_standard" || code === "not_carrier") return code;
  return "not_collected";
}
