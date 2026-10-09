// 080 US2 — what a shop is told about a courier collecting a parcel from it. Raw SQL (Principle VI).
import { COURIER_COLLECTION_SQL } from "@effy/edge-shared/delivery";
import { presignRead, query } from "@effy/edge-shared";
import type { CourierPickupDTO } from "@effy/shared-types";

/**
 * The courier pickups among `packageIds` — THIS shop's packages only (the `shop_id` predicate is the
 * isolation, not the caller's list). A package is here only while a courier collects it from the
 * supplier; switched to "via the hub", it simply drops out.
 *
 * ⚠ ONE READ PER LIST, beside the list's own query — not a subquery inside five grouped queries.
 *
 * ⚠ WHAT A SHOP IS NEVER TOLD: the fee, the customer's estimate, the tracking link, or anything about
 * another shop's parcel on the same order. The select names exactly the fields the shop may see.
 *
 * ⚠ The latest LIVE consignment wins; a cancelled one is shown only when nothing replaced it.
 * Handed over without a consignment row cannot happen (the one writer creates it), but the handoff is
 * the fact, so it is asked directly.
 */
const SELECT_PICKUPS = `
  SELECT sf.id::text AS package_id,
         CASE WHEN EXISTS (SELECT 1 FROM public.carrier_handoff h WHERE h.shop_fulfillment_id = sf.id) THEN 'handed_over'
              WHEN cc.id IS NULL THEN 'arranging'
              WHEN cc.state = 'booked' THEN 'booked'
              WHEN cc.state = 'cancelled' THEN 'cancelled'
              ELSE 'handed_over' END                 AS state,
         to_char(cc.pickup_date, 'YYYY-MM-DD')       AS pickup_date,
         to_char(cc.pickup_from, 'HH24:MI')          AS pickup_from,
         to_char(cc.pickup_to, 'HH24:MI')            AS pickup_to,
         cs.courier_name, cs.service_name,
         cc.reference, cc.label_key
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM public.courier_consignment c
       WHERE c.shop_fulfillment_id = sf.id
       ORDER BY (c.state <> 'cancelled') DESC, c.created_at DESC
       LIMIT 1
    ) cc ON TRUE
    LEFT JOIN public.courier_service cs ON cs.id = COALESCE(cc.courier_service_id, o.courier_service_id)
   WHERE sf.shop_id = $1
     AND sf.id = ANY($2::uuid[])
     AND ${COURIER_COLLECTION_SQL("o")} = 'supplier'
`;

interface PickupRow {
  package_id: string;
  state: CourierPickupDTO["state"];
  pickup_date: string | null;
  pickup_from: string | null;
  pickup_to: string | null;
  courier_name: string | null;
  service_name: string | null;
  reference: string | null;
  label_key: string | null;
}

export async function courierPickups(shopId: string, packageIds: readonly string[]): Promise<Map<string, CourierPickupDTO>> {
  if (packageIds.length === 0) return new Map();
  const res = await query<PickupRow>(SELECT_PICKUPS, [shopId, packageIds]);
  const out = new Map<string, CourierPickupDTO>();
  for (const r of res.rows) {
    out.set(r.package_id, {
      state: r.state,
      pickupDate: r.pickup_date,
      pickupFrom: r.pickup_from,
      pickupTo: r.pickup_to,
      courierName: r.courier_name,
      serviceName: r.service_name,
      reference: r.reference,
      // ⚠ The label carries the customer's name and address: a short-lived read, never a public URL.
      labelUrl: r.state === "booked" && r.label_key ? await presignRead(r.label_key).catch(() => null) : null,
    });
  }
  return out;
}

/** `{ courierPickup }` when there is one, `{}` otherwise — the field is absent, never null. */
export const pickupOf = (m: Map<string, CourierPickupDTO>, id: string): { courierPickup?: CourierPickupDTO } => {
  const p = m.get(id);
  return p ? { courierPickup: p } : {};
};
