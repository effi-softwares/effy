// Team activity: everything recorded against this shop, newest first (058, US5).
//
// ⚠ IT INVENTS NO NEW AUDIT TRAIL. Three tables already record who did what — `fulfillment_event`
// (020's sole accountability control), `stock_movement` (054) and `refund` (055/057) — and this read
// is a UNION over them. A fourth log written by this screen would be a second answer to "what
// happened here", and the two would diverge the first time a write path forgot one of them.
//
// ⚠ A BACK-OFFICE STAFF NAME NEVER CROSSES. Platform-side actors render as "Effy": the shop is told
// that Effy did something, not which Effy employee — the same boundary 023 FR-018 draws for customer
// data, applied to Effy's own people.
import { query } from "@effy/edge-shared";

export type ActivityKind =
  | "state_changed"
  | "item_gathered"
  | "item_unavailable"
  | "item_restored"
  | "note_added"
  | "tags_changed"
  | "stock_changed"
  | "refund_issued";

export interface ActivityRow {
  id: string;
  at: Date;
  /** The staff member's name, or null when the platform acted / the operator record is gone. */
  actorName: string | null;
  /** True when a person at this shop acted but their record has since been removed (020's rule). */
  actorWasStaff: boolean;
  kind: ActivityKind;
  orderNumber: string | null;
  productName: string | null;
  quantity: number | null;
  amount: string | null;
  reason: string | null;
}

/** Newest 50 of the last 14 days: a sheet, not an archive. */
export const ACTIVITY_LIMIT = 50;
export const ACTIVITY_DAYS = 14;

const SELECT_ACTIVITY = `
(
  SELECT 'fe-' || fe.id::text AS id,
         fe.occurred_at       AS at,
         ss.name              AS actor_name,
         true                 AS actor_was_staff,
         fe.event_type        AS kind,
         o.order_number,
         oi.product_name,
         fe.quantity,
         NULL::text           AS amount,
         fe.to_status         AS reason
    FROM public.fulfillment_event fe
    JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
    JOIN public."order" o           ON o.id = sf.order_id
    LEFT JOIN public.shop_staff ss  ON ss.id = fe.actor_staff_id
    LEFT JOIN public.order_item oi  ON oi.id = fe.order_item_id
   WHERE sf.shop_id = $1
     AND fe.occurred_at >= now() - make_interval(days => $2::int)
)
UNION ALL
(
  SELECT 'sm-' || sm.id::text,
         sm.created_at,
         ss.name,
         sm.actor_kind = 'shop',
         'stock_changed',
         NULL,
         p.name,
         sm.quantity_delta,
         NULL::text,
         sm.reason
    FROM public.stock_movement sm
    JOIN public.product p          ON p.id = sm.product_id
    LEFT JOIN public.shop_staff ss ON ss.cognito_sub = sm.actor_sub AND ss.shop_id = sm.shop_id
   WHERE sm.shop_id = $1
     AND sm.created_at >= now() - make_interval(days => $2::int)
)
UNION ALL
(
  -- ⚠ Only refunds the SHOP itself issued. A back-office refund on the same order is Effy's action
  -- and is not this roster's business; the order's own activity log carries it either way.
  SELECT 'rf-' || r.id::text,
         r.created_at,
         ss.name,
         true,
         'refund_issued',
         o.order_number,
         NULL,
         NULL::int,
         r.amount::text,
         r.reason
    FROM public.refund r
    JOIN public."order" o ON o.id = r.order_id
    LEFT JOIN public.shop_staff ss ON ss.cognito_sub = r.actor_sub
   WHERE r.actor_kind = 'shop'
     AND r.created_at >= now() - make_interval(days => $2::int)
     AND EXISTS (
           SELECT 1 FROM public.shop_fulfillment sf2
            WHERE sf2.order_id = r.order_id AND sf2.shop_id = $1
         )
)
ORDER BY at DESC
LIMIT $3
`;

interface ActivityDbRow {
  id: string;
  at: Date;
  actor_name: string | null;
  actor_was_staff: boolean;
  kind: ActivityKind;
  order_number: string | null;
  product_name: string | null;
  quantity: number | null;
  amount: string | null;
  reason: string | null;
}

export async function readTeamActivity(
  shopId: string,
  limit = ACTIVITY_LIMIT,
  days = ACTIVITY_DAYS,
): Promise<ActivityRow[]> {
  const res = await query<ActivityDbRow>(SELECT_ACTIVITY, [shopId, days, limit]);
  return res.rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorName: r.actor_name,
    actorWasStaff: r.actor_was_staff,
    kind: r.kind,
    orderNumber: r.order_number,
    productName: r.product_name,
    quantity: r.quantity,
    amount: r.amount,
    reason: r.reason,
  }));
}
