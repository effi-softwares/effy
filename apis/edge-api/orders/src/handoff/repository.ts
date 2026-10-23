// Writes no status: the handoff row's existence is the fact, and the arrival route checks it.

import { ConsignmentRefusal, handOver } from "@effy/edge-shared/delivery";
import { withTransaction } from "@effy/edge-shared";

import { OrderActionError, type OrderActionReason } from "../lib/errors";

export interface HandoffResult {
  /** false when this call found the handover already recorded. */
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

/** A missing `reference` is never an error; empty strings become null. */
export async function recordHandoff(input: RecordHandoffInput): Promise<HandoffResult> {
  return withTransaction(async (tx) => {
    // Written by @effy/edge-shared/delivery `handOver`, the one writer of `carrier_handoff`, which also
    // handles the consignment and tells the customer.
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
            // Whether a reference was supplied; the reference itself is on the handoff row.
            hasReference: done.reference !== null,
            changeId: input.changeId,
          }),
        ],
      );
    }
    return { created: done.created, reference: done.reference, carrierName: done.carrierName, handedOverAt: done.handedOverAt };
  });
}

function asOrderReason(code: string): OrderActionReason {
  if (code === "not_found" || code === "not_collected" || code === "not_standard" || code === "not_carrier") return code;
  return "not_collected";
}
