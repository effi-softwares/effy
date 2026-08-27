// Recording that a standard package left Effy's care for an outside carrier (053 US2).
//
// ⚠ THIS WRITES NO STATUS. `shop_fulfillment` is untouched here — the handoff row's EXISTENCE is the
// fact, and it is what the arrival route checks (research R3). A `handed_over` status would be a
// second source of truth that can disagree with this row, and it would buy nothing the customer
// sees: a package in a carrier's van and one on the hub floor are both "on the way" to a shopper.

import { withTransaction } from "@effy/edge-shared";

import { OrderActionError } from "../lib/errors";

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
    const pkg = await tx.query<{
      id: string;
      order_id: string;
      status: string;
      method: string | null;
      existing_at: string | null;
      existing_reference: string | null;
      existing_carrier: string | null;
    }>(
      `SELECT sf.id,
              sf.order_id,
              sf.status,
              opd.method,
              h.handed_over_at AS existing_at,
              h.reference      AS existing_reference,
              h.carrier_name   AS existing_carrier
         FROM public.shop_fulfillment sf
    LEFT JOIN public.order_package_delivery opd
           ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.carrier_handoff h ON h.shop_fulfillment_id = sf.id
        WHERE sf.id = $1
          FOR UPDATE OF sf`,
      [input.fulfillmentId],
    );

    const row = pkg.rows[0];
    if (!row) throw new OrderActionError("not_found");

    if (row.existing_at) {
      return {
        created: false,
        reference: row.existing_reference,
        carrierName: row.existing_carrier,
        handedOverAt: new Date(row.existing_at).toISOString(),
      };
    }

    // ⚠ A same-day package is delivered by an Effy driver and never passes to a carrier. Refusing
    // here keeps the two routes to `delivered` from crossing.
    if (row.method === "same_day") throw new OrderActionError("not_standard");

    // Nothing to hand over until a driver has collected it from the shop.
    if (row.status !== "collected") throw new OrderActionError("not_collected");

    const reference = normalise(input.reference);
    const carrierName = normalise(input.carrierName);

    const inserted = await tx.query<{ handed_over_at: string }>(
      `INSERT INTO public.carrier_handoff
           (shop_fulfillment_id, reference, carrier_name, recorded_by_sub, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shop_fulfillment_id) DO NOTHING
       RETURNING handed_over_at`,
      [input.fulfillmentId, reference, carrierName, input.actorSub, normalise(input.note)],
    );

    if (inserted.rowCount === 0) {
      // Lost the race; the other writer's record stands.
      const existing = await tx.query<{
        handed_over_at: string;
        reference: string | null;
        carrier_name: string | null;
      }>(
        `SELECT handed_over_at, reference, carrier_name
           FROM public.carrier_handoff WHERE shop_fulfillment_id = $1`,
        [input.fulfillmentId],
      );
      const e = existing.rows[0]!;
      return {
        created: false,
        reference: e.reference,
        carrierName: e.carrier_name,
        handedOverAt: new Date(e.handed_over_at).toISOString(),
      };
    }

    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ($1, 'order.handoff_recorded', 'shop_fulfillment', $2, $3::jsonb)`,
      [
        input.actorSub,
        input.fulfillmentId,
        JSON.stringify({
          orderId: row.order_id,
          // Recorded as a boolean, deliberately: whether a reference was supplied is the operational
          // fact worth auditing, and the reference itself already lives on the handoff row.
          hasReference: reference !== null,
          changeId: input.changeId,
        }),
      ],
    );

    return {
      created: true,
      reference,
      carrierName,
      handedOverAt: new Date(inserted.rows[0]!.handed_over_at).toISOString(),
    };
  });
}

/** "" and whitespace collapse to NULL — "not supplied" and "supplied blank" must not differ. */
function normalise(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}
