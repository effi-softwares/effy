import { ANY_TIME_LABEL, formatDeliveryWindow, type DeliveryWindow } from "@effy/shared-types";
import { presignRead, query, withTransaction } from "@effy/edge-shared";
import { liveParcelsByPackage } from "@effy/edge-shared/labels";
import type {
  DeliveryDropDTO,
  HandoverPreference,
  DropStatusRequest,
  HistoryDetailDTO,
  HistoryStop,
  HistoryDTO,
} from "@effy/shared-types";

import { dropStatusOf } from "./drop-status";
import { EMPTY_SUMMARY, addSummaries, manifestsByPackage } from "./manifest";
import { packageCodes, packageItems, stopPackageIds, stopRoundTimes } from "./repository";
import { assertStopRoundOpen } from "./open";
import { assertDropLoaded } from "./sequence";
import { NotFoundError, ordered } from "./service";
import { runMapOf } from "./run-map";
import { roundStops } from "./repository";

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
    delivery_note: string | null;
    delivery_handover: HandoverPreference | null;
    window_start: Date | null;
    window_end: Date | null;
    any_time: boolean;
    phone: string | null;
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
            o.delivery_address ->> 'phone'          AS phone,
            count(rp.id)::text                      AS package_count,
            count(DISTINCT sf.shop_id)::text        AS shop_count,
            o.delivery_note                         AS delivery_note,
            o.delivery_handover                     AS delivery_handover,
            -- The window the customer was sold. Read from the ORDER's own packages rather
            -- than through round_package: a late-joined package must not change the window.
            (SELECT min(opd.window_start) FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT min(opd.window_end)   FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_end,
            -- Sold a day with no time.
            EXISTS (SELECT 1 FROM public.order_package_delivery opd
                      JOIN public.delivery_slot ds ON ds.id = opd.slot_id
                     WHERE opd.order_id = o.id AND ds.any_time) AS any_time
       FROM public.round_stop rs
       JOIN public.driver_round dr ON dr.id = rs.round_id
       JOIN public."order"      o  ON o.id = rs.order_id
       LEFT JOIN public.round_package   rp ON rp.stop_id = rs.id
       LEFT JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
      WHERE rs.id = $1 AND dr.driver_id = $2 AND rs.kind = 'customer_drop'
      GROUP BY rs.id, rs.status, o.id, o.order_number, o.delivery_address, o.delivery_note, o.delivery_handover`,
    [dropId, driverId],
  );

  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  // One manifest per package, in the stable order the app labels by position.
  const packageIds = await stopPackageIds(dropId, driverId);
  const [items, codes, bags] = await Promise.all([
    packageItems(packageIds),
    packageCodes(packageIds),
    liveParcelsByPackage({ query: (t, v) => query(t, v) }, packageIds),
  ]);
  const manifests = manifestsByPackage(packageIds, items);

  const address = [r.line1, r.line2, r.city, r.region, r.postal_code]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(", ");

  return {
    dropId: r.stop_id,
    orderRef: r.order_number,
    customerName: r.recipient_name ?? "",
    addressFull: address,
    // The customer's own note, verbatim; null means they wrote nothing.
    instructions: r.delivery_note,
    // A request the app leads the proof chooser with, never a rule that removes a way to complete.
    handover: r.delivery_handover,
    // Instants only: "due" and "late" change while the screen is open, so the app derives them.
    ...dropWindow(r.window_start, r.window_end, r.any_time),
    // Every stored state reads back as itself.
    status: dropStatusOf(r.status),
    // One entry per package, so the list matches the bags in hand.
    packages: packageIds.map((id) => {
      const manifest = manifests.get(id);
      return {
        ref: r.order_number,
        packageCode: codes.get(id)!,
        parcels: bags.get(id) ?? [],
        // How many shops, never which (hidden fulfilment). A package is one shop's portion, so 1.
        fromShopCount: 1,
        items: manifest?.items ?? [],
        summary: manifest?.summary ?? { ...EMPTY_SUMMARY },
      };
    }),
    summary: addSummaries(packageIds.map((id) => manifests.get(id)?.summary ?? EMPTY_SUMMARY)),
    // Readable before its round opens; every action is refused until then.
    opening: (await stopRoundTimes(dropId, driverId))?.opening ?? null,
    // The customer's number, only while the drop is open; history never carries it.
    customerPhone: OPEN_DROP.has(r.status) ? (r.phone?.trim() || null) : null,
    // Loaded with the van; until then nothing on the drop can be done.
    loaded: r.status !== "pending",
  };
}

/** The only order an open drop may move through. */
const PROGRESS = ["pending", "out_for_delivery", "en_route", "arrived"];
const OPEN_DROP = new Set(PROGRESS);

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

    // A finished drop never moves backwards: answer with where it is.
    const current: string = owns.rows[0].status;
    if (current === "done" || current === "skipped") {
      return { status: current === "done" ? "delivered" : "failed" };
    }

    // Refused until the window's round opens, so a van cannot leave hours early.
    await assertStopRoundOpen(tx, dropId, driverId);

    // Not before loading, the only writer of `out_for_delivery`.
    await assertDropLoaded(tx, dropId, driverId);

    // `delivered` needs proof; `out_for_delivery` is the van being loaded.
    const ALLOWED = new Set(["en_route", "arrived"]);
    if (!ALLOWED.has(body.to)) throw new NotFoundError();
    const next = body.to;

    // Nor backwards on an open drop: an offline replay answers with where it is and writes nothing.
    if (PROGRESS.indexOf(next) <= PROGRESS.indexOf(current)) {
      return { status: dropStatusOf(current) };
    }
    await tx.query(`UPDATE public.round_stop SET status = $2 WHERE id = $1`, [dropId, next]);
    await tx.query(
      `UPDATE public.driver_round SET status = 'in_progress', updated_at = now()
        WHERE id = (SELECT round_id FROM public.round_stop WHERE id = $1) AND status = 'planned'`,
      [dropId],
    );
    return { status: body.to };
  });
}

/** What this driver has finished, by local day. */
export async function history(driverId: string): Promise<HistoryDTO> {
  const res = await query<{
    local_date: string;
    run_id: string;
    kind: "collection" | "delivery";
    completed_at: Date | null;
    stop_count: string;
    package_count: string;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT to_char(dr.updated_at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date,
            dr.id        AS run_id,
            dr.kind      AS kind,
            dr.updated_at AS completed_at,
            -- A delivery run's window: the span its drops were sold (none for a collection).
            (SELECT min(opd.window_start) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT max(opd.window_end) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_end,
            -- Shops or drops, not the hub: what a driver would count.
            (SELECT count(*) FROM public.round_stop rs WHERE rs.round_id = dr.id AND rs.kind <> 'hub_checkin')::text AS stop_count,
            (SELECT count(*) FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
              WHERE rs.round_id = dr.id)::text AS package_count
       FROM public.driver_round dr
      WHERE dr.driver_id = $1 AND dr.status = 'completed'
      ORDER BY dr.updated_at DESC
      LIMIT 200`,
    [driverId],
  );

  const drops = await query<{
    local_date: string;
    drop_id: string;
    order_number: string;
    customer_suburb: string | null;
    completed_at: Date | null;
    proof_captured: boolean;
    street: string | null;
    proof_method: string | null;
    failure_reason: string | null;
  }>(
    // A drop that came back is history too, with its street and how a delivered one was handed over.
    `SELECT to_char(x.at AT TIME ZONE 'Australia/Melbourne', 'YYYY-MM-DD') AS local_date, x.*
       FROM (
         SELECT rs.id          AS drop_id,
                o.order_number AS order_number,
                o.delivery_address ->> 'city' AS customer_suburb,
                nullif(btrim(o.delivery_address ->> 'line1'), '') AS street,
                COALESCE(rs.completed_at, f.failed_at) AS completed_at,
                COALESCE(rs.completed_at, f.failed_at) AS at,
                (dp.id IS NOT NULL) AS proof_captured,
                dp.method AS proof_method,
                CASE WHEN rs.status = 'skipped' THEN f.reason END AS failure_reason
           FROM public.round_stop rs
           JOIN public.driver_round dr ON dr.id = rs.round_id
           JOIN public."order"      o  ON o.id = rs.order_id
           LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
           LEFT JOIN LATERAL (
             SELECT fa.reason, fa.failed_at FROM public.delivery_attempt_failure fa
              WHERE fa.stop_id = rs.id ORDER BY fa.failed_at DESC LIMIT 1
           ) f ON TRUE
          WHERE dr.driver_id = $1
            AND rs.kind = 'customer_drop'
            AND rs.status IN ('done', 'skipped')
       ) x
      WHERE x.at IS NOT NULL
      ORDER BY x.at DESC
      LIMIT 200`,
    [driverId],
  );

  // Merged, not sorted: `one-ordering.guard.test.ts` forbids `.sort(` here, and both queries are newest first.
  const runRows = res.rows;
  const dropRows = drops.rows;
  const orderedDates: string[] = [];
  let i = 0;
  let j = 0;
  while (i < runRows.length || j < dropRows.length) {
    const a = runRows[i]?.local_date;
    const b = dropRows[j]?.local_date;
    // Descending; `undefined` means that source is exhausted.
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
      type: r.kind,
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      stopCount: Number(r.stop_count),
      packageCount: Number(r.package_count),
      window: dropWindow(r.window_start, r.window_end).window,
    });
  }
  for (const d of dropRows) {
    byDay.get(d.local_date)!.drops.push({
      dropId: d.drop_id,
      orderRef: d.order_number,
      customerSuburb: d.customer_suburb ?? "",
      completedAt: d.completed_at!.toISOString(),
      proofCaptured: d.proof_captured,
      street: d.street,
      proofMethod: (d.proof_method as HistoryDTO["days"][number]["drops"][number]["proofMethod"]) ?? null,
      failureReason: (d.failure_reason as HistoryDTO["days"][number]["drops"][number]["failureReason"]) ?? null,
    });
  }

  return { days: [...byDay.values()] };
}

export async function historyDetail(
  kind: string,
  id: string,
  driverId: string,
): Promise<HistoryDetailDTO> {
  if (kind === "run") return historyRun(id, driverId);
  const res = await query<{
    status: string;
    completed_at: Date | null;
    address: string | null;
    proof_method: "photo" | "signature" | "contactless" | null;
    proof_media_key: string | null;
    proof_note: string | null;
    proof_captured_at: Date | null;
    order_number: string | null;
    package_count: string;
    failure_reason: HistoryDetailDTO["failureReason"];
    failed_at: Date | null;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT rs.status, rs.completed_at,
            o.order_number,
            (SELECT min(opd.window_start) FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT min(opd.window_end)   FROM public.order_package_delivery opd
              WHERE opd.order_id = o.id AND opd.window_start IS NOT NULL) AS window_end,
            (SELECT count(*) FROM public.round_package rp WHERE rp.stop_id = rs.id)::text AS package_count,
            f.reason AS failure_reason, f.failed_at,
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
       LEFT JOIN LATERAL (
         SELECT fa.reason, fa.failed_at FROM public.delivery_attempt_failure fa
          WHERE fa.stop_id = rs.id ORDER BY fa.failed_at DESC LIMIT 1
       ) f ON TRUE
      WHERE rs.id = $1 AND dr.driver_id = $2`,
    [id, driverId],
  );
  const r = res.rows[0];
  if (!r) throw new NotFoundError();

  const at = r.completed_at ?? r.failed_at;
  return {
    timeline: at ? [{ status: r.status, at: at.toISOString() }] : [],
    proof: await renderProof(r),
    addressFull: r.address,
    packages: [],
    // The order, its package count, and why a drop came back.
    orderRef: r.order_number,
    packageCount: Number(r.package_count),
    window: dropWindow(r.window_start, r.window_end).window,
    failureReason: r.status === "skipped" ? (r.failure_reason ?? null) : null,
  };
}

/** The caller's own completed rounds: stops in order and how each ended. */
async function historyRun(runId: string, driverId: string): Promise<HistoryDetailDTO> {
  const res = await query<{
    stop_id: string;
    seq: number | null;
    kind: string;
    status: string;
    completed_at: Date | null;
    shop_name: string | null;
    address: string | null;
    proof_method: "photo" | "signature" | "contactless" | null;
    failure_reason: HistoryStop["failureReason"];
    round_kind: string;
    window_start: Date | null;
    window_end: Date | null;
  }>(
    `SELECT rs.id AS stop_id, rs.seq, rs.kind, rs.status, rs.completed_at, dr.kind AS round_kind,
            -- A delivery run's window: the span its drops were sold (none for a collection).
            (SELECT min(opd.window_start) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_start,
            (SELECT max(opd.window_end) FROM public.round_stop rw JOIN public.order_package_delivery opd ON opd.order_id = rw.order_id
              WHERE rw.round_id = dr.id AND opd.window_start IS NOT NULL) AS window_end,
            (SELECT f.reason FROM public.delivery_attempt_failure f WHERE f.stop_id = rs.id ORDER BY f.failed_at DESC LIMIT 1) AS failure_reason,
            s.name AS shop_name,
            CASE WHEN rs.kind = 'customer_drop'
                 THEN concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city') END AS address,
            dp.method AS proof_method
       FROM public.driver_round dr
       JOIN public.round_stop rs ON rs.round_id = dr.id
       LEFT JOIN public."order" o ON o.id = rs.order_id
       LEFT JOIN public.shop    s ON s.id = rs.shop_id
       LEFT JOIN public.delivery_proof dp ON dp.stop_id = rs.id
      WHERE dr.id = $1 AND dr.driver_id = $2 AND dr.status = 'completed'
      ORDER BY rs.kind = 'hub_checkin', rs.seq NULLS LAST, rs.completed_at NULLS LAST`,
    [runId, driverId],
  );
  if (res.rows.length === 0) throw new NotFoundError();
  const stops: HistoryStop[] = res.rows.map((r, i) => ({
    stopId: r.stop_id,
    sequence: i + 1,
    kind: r.kind === "customer_drop" ? "drop" : r.kind === "hub_checkin" ? "hub" : "shop",
    title: r.kind === "hub_checkin" ? "Hub check-in" : r.kind === "customer_drop" ? (r.address || "Delivery") : (r.shop_name ?? "Shop"),
    status: r.status === "skipped" ? "skipped" : "done",
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    proofMethod: r.proof_method,
    failureReason: r.status === "skipped" ? r.failure_reason : null,
  }));
  // Every stop done, in the shared rule's order.
  const map = await runMapOf(ordered(await roundStops(runId, driverId)), res.rows[0]!.round_kind === "collection" ? "collection" : "delivery", true);
  // A max, not a sort (`.sort(` is forbidden in this file).
  const last = res.rows.map((r) => r.completed_at).filter((d): d is Date => d !== null)
    .reduce<Date | undefined>((a, b) => (a === undefined || b.getTime() > a.getTime() ? b : a), undefined);
  return {
    timeline: last ? [{ status: "completed", at: last.toISOString() }] : [],
    proof: null,
    addressFull: null,
    packages: [],
    stops,
    map,
    window: dropWindow(res.rows[0]!.window_start, res.rows[0]!.window_end).window,
  };
}

interface ProofColumns {
  proof_method: "photo" | "signature" | "contactless" | null;
  proof_media_key: string | null;
  proof_note: string | null;
  proof_captured_at: Date | null;
}

/**
 * Proof media is archived to Glacier IR, never deleted, so reads are the same at any age. A
 * `media_key` that will not resolve is therefore a fault: it alarms rather than rendering as empty.
 */
async function renderProof(r: ProofColumns): Promise<HistoryDetailDTO["proof"]> {
  if (r.proof_method === null || r.proof_captured_at === null) return null;

  let mediaUrl: string | null = null;
  if (r.proof_media_key !== null) {
    try {
      mediaUrl = await presignRead(r.proof_media_key);
    } catch (err) {
      // Its own EMF record: a dimension would blind the undimensioned alarm.
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
    // Null: either the proof never had media (old contactless rows), or a fault, which alarms.
    mediaUrl,
    note: r.proof_note,
    capturedAt: r.proof_captured_at.toISOString(),
  };
}

/** The label the app shows and the instants it judges Due and Late by. */
function dropWindow(
  start: Date | null,
  end: Date | null,
  anyTime = false,
): { window: string | null; deliveryWindow: DeliveryWindow | null } {
  if (!start || !end) return { window: null, deliveryWindow: null };
  const deliveryWindow = { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
  // The server words the window in Melbourne time with the shared formatter. A day with no time
  // reads "Any time", with the round's hours.
  const hours = formatDeliveryWindow(deliveryWindow);
  return { window: anyTime ? `${ANY_TIME_LABEL} · ${hours}` : hours, deliveryWindow };
}
