// Delivery drops, history and activity (063, US3).
//
// ⚠ HISTORY IS THIN UNTIL SLICE D, DELIBERATELY. `proofCaptured` is always false and
// `HistoryDetailDTO.proof` is always null, because the custody records that make an entry rich are
// what Slice D produces. Returning what exists beats fabricating a richer-looking answer — 052's
// "the tax fields are ABSENT, not placeholder" reasoning, and 054's "inventing stock is worse than
// not returning it".

import { query, withTransaction } from "@effy/edge-shared";
import type {
  ActivityItem,
  DeliveryDropDTO,
  DropStatusRequest,
  HistoryDetailDTO,
  HistoryDTO,
} from "@effy/shared-types";

import { NotFoundError } from "./service";

/** GET /driver/v1/delivery/drops/{dropId} — one customer stop. */
export async function deliveryDrop(dropId: string, driverId: string): Promise<DeliveryDropDTO> {
  const res = await query<{
    stop_id: string;
    status: string;
    order_number: string;
    recipient_name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    region: string | null;
    package_count: string;
    shop_count: string;
  }>(
    `SELECT rs.id                                   AS stop_id,
            rs.status                               AS status,
            o.order_number                          AS order_number,
            o.delivery_address ->> 'recipientName'  AS recipient_name,
            o.delivery_address ->> 'line1'          AS line1,
            o.delivery_address ->> 'line2'          AS line2,
            o.delivery_address ->> 'city'           AS city,
            o.delivery_address ->> 'postalCode'     AS postal_code,
            o.delivery_address ->> 'region'         AS region,
            count(rp.id)::text                      AS package_count,
            count(DISTINCT sf.shop_id)::text        AS shop_count
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       JOIN public."order"      o  ON o.id = rs.order_id
       LEFT JOIN public.round_package   rp ON rp.stop_id = rs.id
       LEFT JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
      WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'
      GROUP BY rs.id, rs.status, o.order_number, o.delivery_address`,
    [dropId, driverId],
  );

  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  const address = [r.line1, r.line2, r.city, r.region, r.postal_code]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(", ");

  return {
    dropId: r.stop_id,
    orderRef: r.order_number,
    customerName: r.recipient_name ?? "",
    addressFull: address,
    // ⚠ ALWAYS NULL, AND THAT IS THE HONEST ANSWER. The contract carries this field and NOTHING ON
    // THE PLATFORM STORES IT — there is no delivery-instructions column anywhere, and checkout never
    // asks for one. Filling it with the address, or a cheerful default, would put words on a driver's
    // screen that no customer wrote. Whoever adds the field at checkout unblocks this line.
    instructions: null,
    status: r.status === "done" ? "delivered" : r.status === "arrived" ? "arrived" : "staged",
    packages: [
      {
        ref: r.order_number,
        // ⚠ HOW MANY shops contributed, never WHICH. Hidden fulfilment is a product rule, not a UI
        // choice — a driver learning which shops served an order would leak it to the customer.
        fromShopCount: Number(r.shop_count),
      },
    ],
  };
}

/** POST /driver/v1/delivery/drops/{dropId}/status — progress a drop. */
export async function setDropStatus(
  dropId: string,
  driverId: string,
  body: DropStatusRequest,
): Promise<{ status: string }> {
  return withTransaction(async (tx: any) => {
    const owns = await tx.query(
      `SELECT rs.id, rs.status
         FROM public.round_stop rs
         JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'
        FOR UPDATE OF rs`,
      [dropId, driverId],
    );
    if (owns.rowCount === 0) throw new NotFoundError();

    // ⚠ The contract's vocabulary is richer than the model's, and this is the whole mapping. Note
    // `delivered` is NOT reachable here: completing a drop requires proof (D16), which is Slice D.
    const next = body.to === "arrived" ? "arrived" : "pending";
    await tx.query(`UPDATE public.round_stop SET status = $2 WHERE id = $1`, [dropId, next]);
    await tx.query(
      `UPDATE public.driver_round SET status = 'in_progress', updated_at = now()
        WHERE id = (SELECT round_id FROM public.round_stop WHERE id = $1) AND status = 'planned'`,
      [dropId],
    );
    return { status: body.to };
  });
}

/**
 * GET /driver/v1/history — what this driver has finished, by local day.
 *
 * ⚠ `proofCaptured` IS ALWAYS FALSE, and that is honest rather than broken: nothing captures proof
 * until Slice D. A hardcoded `true` would put a claim on a screen that no record supports.
 */
export async function history(driverId: string): Promise<HistoryDTO> {
  const res = await query<{
    local_date: string;
    run_id: string;
    kind: string;
    completed_at: Date | null;
    stop_count: string;
  }>(
    `SELECT to_char(dr.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date,
            dr.id        AS run_id,
            dr.kind      AS kind,
            dr.updated_at AS completed_at,
            (SELECT count(*) FROM public.round_stop rs WHERE rs.round_id = dr.id)::text AS stop_count
       FROM public.driver_round dr
      WHERE dr.driver_id = $1 AND dr.status = 'completed'
      ORDER BY dr.updated_at DESC
      LIMIT 200`,
    [driverId],
  );

  const byDay = new Map<string, HistoryDTO["days"][number]>();
  for (const r of res.rows) {
    const day = byDay.get(r.local_date) ?? { date: r.local_date, runs: [], drops: [] };
    day.runs.push({
      runId: r.run_id,
      type: r.kind === "collection" ? "collection" : "same_day_delivery",
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      stopCount: Number(r.stop_count),
    });
    byDay.set(r.local_date, day);
  }
  return { days: [...byDay.values()] };
}

/** GET /driver/v1/history/{kind}/{id} — one finished item. */
export async function historyDetail(
  kind: string,
  id: string,
  driverId: string,
): Promise<HistoryDetailDTO> {
  const res = await query<{ status: string; completed_at: Date | null; address: string | null }>(
    `SELECT rs.status, rs.completed_at,
            CASE WHEN rs.kind = 'customer_drop'
                 THEN concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city')
                 ELSE concat_ws(', ', s.address_line1, s.suburb) END AS address
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       LEFT JOIN public."order" o ON o.id = rs.order_id
       LEFT JOIN public.shop    s ON s.id = rs.shop_id
      WHERE rs.id = $1 AND dr.driver_id = $2`,
    [id, driverId],
  );
  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  return {
    timeline: r.completed_at ? [{ status: r.status, at: r.completed_at.toISOString() }] : [],
    // ⚠ null until Slice D builds the three custody mechanisms (D16). Not a gap — a boundary.
    proof: null,
    addressFull: r.address,
    packages: [],
  };
}

/**
 * GET /driver/v1/activity.
 *
 * ⚠ DERIVED FROM ROUNDS, NOT A STORED FEED. A notification table would be a second place the truth
 * about a driver's work lives, and the two would disagree the first time one write failed (027's
 * counted-not-stored rule). A round that changed under a driver IS the activity.
 */
export async function activity(driverId: string): Promise<ActivityItem[]> {
  const res = await query<{ id: string; changed_note: string | null; updated_at: Date; kind: string }>(
    `SELECT id, changed_note, updated_at, kind
       FROM public.driver_round
      WHERE driver_id = $1 AND changed_note IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 50`,
    [driverId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    type: "run_assigned",
    body: r.changed_note ?? "",
    createdAt: r.updated_at.toISOString(),
    // ⚠ Always false: there is nowhere to record a read receipt, and claiming otherwise would make
    // the badge lie. Slice D or a later slice adds the store if the feed proves worth keeping.
    read: false,
    runId: r.id,
    dropId: null,
  }));
}
