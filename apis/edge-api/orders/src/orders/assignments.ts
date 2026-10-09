// Who has each package, and how it got there (073) — the back-office order read's assignment lines.
//
// ⚠ READ-ONLY. Assigning and unassigning are the fleet service's (it owns the planner and its lock);
// this only shows the result, so the order screens stay one service and one request.

import { query, reasonWords, type ExclusionReason } from "@effy/edge-shared";
import { deliveredBySql } from "@effy/edge-shared/delivery";
import type { OrderAssignment } from "@effy/shared-types";

/**
 * ⚠ 082 — "THIS PARCEL IS DELIVERY WORK NOW", in ONE place: Effy delivers it (079's definition — never
 * the method: since 078 a later-day window is sold as `standard`), and its round has OPENED (the
 * database's one definition of that, `public.round_opens_at`). A parcel sold no window is due at once.
 *
 * A parcel at the hub waiting for a later day is NOT delivery work yet: it is waiting, not unassigned,
 * and neither the order page nor the "needs a driver" filter says otherwise. Both read this fragment,
 * over a fulfilment `sf`, its order `o` and its captured delivery row `opd`.
 */
export const DELIVERY_DUE_SQL = `(
  ${deliveredBySql("o", "COALESCE(opd.method, sf.delivery_method)", "opd.slot_id")} = 'effy'
  AND (opd.window_start IS NULL
       OR public.round_opens_at('delivery', opd.window_end, opd.window_start) <= now())
)`;

/**
 * Every package's current collection and delivery assignment — the LATEST round row of each kind —
 * with the round's opening time (the database's one definition), and the standing reasons for any
 * package nobody has.
 *
 * ⚠ "MOVABLE" IS DECIDED HERE, AND ONLY CONSERVATIVELY. A package can be reassigned while its row is
 * still `assigned` — except on a delivery round already under way, whose goods have left the hub in a
 * van even though no proof is in yet. The fleet route enforces the same rule; this only decides
 * whether the screen OFFERS it.
 */
const ASSIGNMENTS = `
  SELECT sf.id::text AS package_id,
         sf.status   AS shop_status,
         ${DELIVERY_DUE_SQL} AS delivery_due,
         stage.stage,
         a.round_package_id, a.state, a.driver_id, a.driver_name, a.round_id, a.round_status,
         a.opens_at, a.due_at, a.assigned_note,
         EXISTS (SELECT 1 FROM public.hub_checkin hc
                   JOIN public.driver_round cdr ON cdr.id = hc.round_id
                   JOIN public.round_stop crs ON crs.round_id = cdr.id
                   JOIN public.round_package crp ON crp.stop_id = crs.id
                  WHERE crp.shop_fulfillment_id = sf.id AND crp.state = 'picked_up') AS at_hub,
         COALESCE((SELECT array_agg(DISTINCT ae.reason) FROM public.assignment_exclusion ae
                    WHERE ae.shop_fulfillment_id = sf.id AND ae.kind = stage.stage), '{}')  AS reasons,
         COALESCE((SELECT bool_or(ae.driver_id IS NULL) FROM public.assignment_exclusion ae
                    WHERE ae.shop_fulfillment_id = sf.id AND ae.kind = stage.stage), false) AS nobody
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
   CROSS JOIN (VALUES ('collection'), ('delivery')) AS stage(stage)
    LEFT JOIN LATERAL (
      SELECT rp.id::text AS round_package_id, rp.state, d.id::text AS driver_id, d.name AS driver_name,
             dr.id::text AS round_id, dr.status AS round_status,
             public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
             dr.deadline_at AS due_at, rp.assigned_note
        FROM public.round_package rp
        JOIN public.round_stop   rs ON rs.id = rp.stop_id
        JOIN public.driver_round dr ON dr.id = rs.round_id AND dr.kind = stage.stage
        JOIN public.driver        d ON d.id = dr.driver_id
       WHERE rp.shop_fulfillment_id = sf.id
       ORDER BY rp.created_at DESC, rp.id DESC
       LIMIT 1
    ) a ON TRUE
   WHERE sf.id = ANY($1::uuid[])
`;

interface Row {
  package_id: string;
  shop_status: string;
  delivery_due: boolean;
  stage: "collection" | "delivery";
  round_package_id: string | null;
  state: string | null;
  driver_id: string | null;
  driver_name: string | null;
  round_id: string | null;
  round_status: string | null;
  opens_at: Date | null;
  due_at: Date | null;
  assigned_note: string | null;
  at_hub: boolean;
  reasons: ExclusionReason[];
  nobody: boolean;
}

/** The one line shown for a package nobody has. */
function whyUnassigned(r: Row): string {
  if (r.nobody) return "No driver is on duty";
  if (r.reasons.length === 0) return "Waiting for auto-assign (every 5 minutes)";
  return `No driver can take it — ${r.reasons.slice(0, 2).map(reasonWords).join(", ").toLowerCase()}`;
}

function toAssignment(r: Row): OrderAssignment | null {
  const open = r.state === "assigned";
  // Taken and on its way: the driver who has it, not movable by a click.
  if (r.state === "picked_up" || r.state === "delivered" || (open && r.stage === "delivery" && r.round_status === "in_progress")) {
    return {
      assignmentId: r.round_package_id,
      driver: r.driver_id ? { id: r.driver_id, name: r.driver_name ?? "" } : null,
      opensAt: null,
      dueAt: r.due_at ? r.due_at.toISOString() : null,
      roundId: r.round_id,
      how: r.assigned_note,
      unassignedReason: null,
      movable: false,
    };
  }
  if (open) {
    return {
      assignmentId: r.round_package_id,
      driver: r.driver_id ? { id: r.driver_id, name: r.driver_name ?? "" } : null,
      opensAt: r.opens_at && r.opens_at.getTime() > Date.now() ? r.opens_at.toISOString() : null,
      dueAt: r.due_at ? r.due_at.toISOString() : null,
      roundId: r.round_id,
      how: r.assigned_note,
      unassignedReason: null,
      movable: true,
    };
  }
  // Nobody has it. Is it waiting for a driver at THIS stage?
  const waiting =
    r.stage === "collection"
      ? r.shop_status === "ready_for_pickup"
      : r.delivery_due && r.shop_status === "collected" && r.at_hub;
  if (!waiting) return null;
  return {
    assignmentId: null,
    driver: null,
    opensAt: null,
    dueAt: null,
    roundId: null,
    how: null,
    unassignedReason: whyUnassigned(r),
    movable: true,
  };
}

/** packageId → its collection and delivery assignment. `null` = nothing to show for that stage. */
export async function assignmentsFor(
  packageIds: readonly string[],
): Promise<Map<string, { collect: OrderAssignment | null; deliver: OrderAssignment | null }>> {
  const out = new Map<string, { collect: OrderAssignment | null; deliver: OrderAssignment | null }>();
  if (packageIds.length === 0) return out;
  const res = await query<Row>(ASSIGNMENTS, [packageIds]);
  for (const r of res.rows) {
    const entry = out.get(r.package_id) ?? { collect: null, deliver: null };
    if (r.stage === "collection") entry.collect = toAssignment(r);
    else entry.deliver = toAssignment(r);
    out.set(r.package_id, entry);
  }
  return out;
}
