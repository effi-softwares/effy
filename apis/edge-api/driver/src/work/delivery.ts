// Delivery drops, history and activity (063, US3).
//
// ⚠ HISTORY CARRIES REAL PROOF SINCE 064. This header used to say `proofCaptured` was always false
// and `HistoryDetailDTO.proof` always null "until Slice D" — correct when written, and 064 IS that
// slice. A comment asserting a limitation that no longer holds is the stale-claim shape 060 and 063
// both record, so it was corrected in the same change rather than left to be believed.

import { presignRead, query, withTransaction } from "@effy/edge-shared";
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

/** GET /driver/v1/history — what this driver has finished, by local day. */
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

  // ⚠ 064 — THE DROPS HALF, WHICH HAS ALWAYS BEEN AN EMPTY ARRAY. `HistoryDropRow.proofCaptured` has
  // existed on the contract since 049 and never had a value, because `drops` was hardcoded to `[]`
  // and nothing captured proof anyway. Both are true now, so the field finally means something: a
  // driver can look back at a delivery and see that it WAS evidenced — which is the whole point of
  // having captured it.
  const drops = await query<{
    local_date: string;
    drop_id: string;
    order_number: string;
    customer_suburb: string | null;
    completed_at: Date | null;
    proof_captured: boolean;
  }>(
    `SELECT to_char(rs.completed_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date,
            rs.id          AS drop_id,
            o.order_number AS order_number,
            o.delivery_address ->> 'city' AS customer_suburb,
            rs.completed_at AS completed_at,
            (dp.id IS NOT NULL) AS proof_captured
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       JOIN public."order"      o  ON o.id = rs.order_id
       LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
      WHERE dr.driver_id = $1
        AND rs.kind = 'customer_drop'
        AND rs.status = 'done'
        AND rs.completed_at IS NOT NULL
      ORDER BY rs.completed_at DESC
      LIMIT 200`,
    [driverId],
  );

  // ⚠ THE DAYS ARE MERGED, NOT SORTED, AND THAT IS NOT A STYLE CHOICE.
  //
  // `one-ordering.guard.test.ts` forbids a raw `.sort(` anywhere in a file that produces an ordered
  // stop list, and it is deliberately blunt: 063 hardened it after a cleverer version failed to catch
  // its own negative proof, because "whatever the variable is called, sorting HERE is the thing that
  // drifts". A `.sort(` on history days would have been harmless and would still have tripped it —
  // correctly, since the guard cannot tell the two apart and should not try.
  //
  // It is also the better construction. Both queries already return newest-first, so merging their
  // date sequences yields the right order BY BUILDING IT, rather than by fixing it up afterwards.
  const runRows = res.rows;
  const dropRows = drops.rows;
  const orderedDates: string[] = [];
  let i = 0;
  let j = 0;
  while (i < runRows.length || j < dropRows.length) {
    const a = runRows[i]?.local_date;
    const b = dropRows[j]?.local_date;
    // Descending, so the LATER date comes first; `undefined` means that source is exhausted.
    const pick = b === undefined || (a !== undefined && a >= b) ? a! : b!;
    if (orderedDates[orderedDates.length - 1] !== pick) orderedDates.push(pick);
    if (a === pick) i += 1;
    if (b === pick) j += 1;
  }

  const byDay = new Map<string, HistoryDTO["days"][number]>();
  for (const date of orderedDates) byDay.set(date, { date, runs: [], drops: [] });

  for (const r of runRows) {
    byDay.get(r.local_date)!.runs.push({
      runId: r.run_id,
      type: r.kind === "collection" ? "collection" : "same_day_delivery",
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      stopCount: Number(r.stop_count),
    });
  }
  for (const d of dropRows) {
    byDay.get(d.local_date)!.drops.push({
      dropId: d.drop_id,
      orderRef: d.order_number,
      customerSuburb: d.customer_suburb ?? "",
      completedAt: d.completed_at!.toISOString(),
      proofCaptured: d.proof_captured,
    });
  }

  return { days: [...byDay.values()] };
}

/** GET /driver/v1/history/{kind}/{id} — one finished item. */
export async function historyDetail(
  kind: string,
  id: string,
  driverId: string,
): Promise<HistoryDetailDTO> {
  const res = await query<{
    status: string;
    completed_at: Date | null;
    address: string | null;
    proof_method: "photo" | "signature" | "contactless" | null;
    proof_media_key: string | null;
    proof_note: string | null;
    proof_captured_at: Date | null;
  }>(
    `SELECT rs.status, rs.completed_at,
            CASE WHEN rs.kind = 'customer_drop'
                 THEN concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city')
                 ELSE concat_ws(', ', s.address_line1, s.suburb) END AS address,
            dp.method      AS proof_method,
            dp.media_key   AS proof_media_key,
            dp.note        AS proof_note,
            dp.captured_at AS proof_captured_at
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       LEFT JOIN public."order" o ON o.id = rs.order_id
       LEFT JOIN public.shop    s ON s.id = rs.shop_id
       LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
      WHERE rs.id = $1 AND dr.driver_id = $2`,
    [id, driverId],
  );
  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  return {
    timeline: r.completed_at ? [{ status: r.status, at: r.completed_at.toISOString() }] : [],
    proof: await renderProof(r),
    addressFull: r.address,
    packages: [],
  };
}

interface ProofColumns {
  proof_method: "photo" | "signature" | "contactless" | null;
  proof_media_key: string | null;
  proof_note: string | null;
  proof_captured_at: Date | null;
}

/**
 * Turn stored proof into something viewable (064, US5 — FR-023).
 *
 * ⚠ THERE IS NO EXPIRY LOGIC HERE, AND ITS ABSENCE IS THE DESIGN. Proof media is ARCHIVED, never
 * deleted (operator direction, research R5): a lifecycle rule moves it to Glacier Instant Retrieval
 * after 90 days, which serves through the ordinary S3 API in milliseconds. A presigned GET works the
 * same on a photograph from this morning and one from two years ago, so no read path has two
 * behaviours depending on an object's age — and an earlier draft's shared `proof-retention.ts`, its
 * derived "has this expired?" answer and the test keeping that derivation in step with the Terraform
 * number all ceased to exist with the decision.
 *
 * ⚠ WHICH INVERTS FR-026. Under time-limited retention a missing object was an expected state to
 * render politely. Nothing deletes media now, so `mediaUrl: null` where a `media_key` EXISTS means
 * something is wrong — a failed upload recorded anyway, a key mismatch, or an object removed out of
 * band. It is alarmed on, never dressed up as a tidy empty state: a system that renders its own
 * corruption as a normal outcome cannot report it.
 */
async function renderProof(r: ProofColumns): Promise<HistoryDetailDTO["proof"]> {
  if (r.proof_method === null || r.proof_captured_at === null) return null;

  let mediaUrl: string | null = null;
  if (r.proof_media_key !== null) {
    try {
      mediaUrl = await presignRead(r.proof_media_key);
    } catch (err) {
      // ⚠ EMF ON STDOUT AS ITS OWN RECORD — never a dimension on an existing metric, because a
      // dimensioned metric is a DIFFERENT metric in CloudWatch and an alarm on the undimensioned
      // name goes blind the moment one is added (059 found exactly this; 054 before it).
      console.log(
        JSON.stringify({
          _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
              {
                Namespace: "Effy/Dispatch",
                Dimensions: [[]],
                Metrics: [{ Name: "ProofMediaMissingOnRead", Unit: "Count" }],
              },
            ],
          },
          ProofMediaMissingOnRead: 1,
        }),
      );
      mediaUrl = null;
    }
  }

  return {
    method: r.proof_method,
    // ⚠ Null here has TWO meanings and they are not the same fact:
    //   · the proof never had media — only possible for `contactless`, and since FR-002 requires a
    //     photograph for an unattended drop, only for rows written before that rule;
    //   · the object should exist and could not be read — the fault case above, which alarms.
    // They are distinguishable at the source (`media_key IS NULL` vs a key that will not resolve),
    // which is what FR-026 asks for.
    mediaUrl,
    note: r.proof_note,
    capturedAt: r.proof_captured_at.toISOString(),
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
