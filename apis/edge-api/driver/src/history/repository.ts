// Repository for driver history (049 US5): raw SQL, no ORM. Read-only. Both record types — completed
// collection runs and completed same-day drops — grouped by business day. Scoped to the driver (FR-012).

import { query, presignRead } from "@effy/edge-shared";

import type { HistoryDTO, HistoryDetailDTO, ProofMethod, TimelineEntry } from "@effy/shared-types";

interface RunRow {
  run_id: string;
  type: "collection" | "same_day_delivery";
  completed_at: Date | null;
  business_date: string;
  stop_count: string;
}
interface DropRow {
  drop_id: string;
  order_number: string;
  suburb: string | null;
  delivered_at: Date;
  proof: boolean;
  business_date: string;
}

/** GET /driver/v1/history — completed runs + delivered drops, grouped by day (most recent first). */
export async function getHistory(driverId: string): Promise<HistoryDTO> {
  const runs = await query<RunRow>(
    `SELECT r.id AS run_id, r.type, r.completed_at, r.business_date::text AS business_date,
            (SELECT count(*)::text FROM public.collection_task ct WHERE ct.run_id = r.id) AS stop_count
       FROM public.driver_run r
      WHERE r.driver_id = $1 AND r.status IN ('checked_in', 'completed')
      ORDER BY r.business_date DESC, r.completed_at DESC NULLS LAST`,
    [driverId],
  );
  const drops = await query<DropRow>(
    `SELECT dt.id AS drop_id, o.order_number,
            o.delivery_address ->> 'city' AS suburb,
            dt.delivered_at,
            EXISTS (SELECT 1 FROM public.proof_of_delivery p WHERE p.delivery_task_id = dt.id) AS proof,
            r.business_date::text AS business_date
       FROM public.delivery_task dt
       JOIN public.driver_run r ON r.id = dt.run_id
       JOIN public."order" o ON o.id = dt.order_id
      WHERE r.driver_id = $1 AND dt.status = 'delivered'
      ORDER BY dt.delivered_at DESC`,
    [driverId],
  );

  const days = new Map<string, { runs: HistoryDTO["days"][number]["runs"]; drops: HistoryDTO["days"][number]["drops"] }>();
  const day = (d: string) => {
    if (!days.has(d)) days.set(d, { runs: [], drops: [] });
    return days.get(d)!;
  };
  for (const r of runs.rows) {
    day(r.business_date).runs.push({
      runId: r.run_id,
      type: r.type,
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      stopCount: Number(r.stop_count),
    });
  }
  for (const d of drops.rows) {
    day(d.business_date).drops.push({
      dropId: d.drop_id,
      orderRef: d.order_number,
      customerSuburb: d.suburb ?? "—",
      completedAt: d.delivered_at.toISOString(),
      proofCaptured: d.proof,
    });
  }

  return {
    days: [...days.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({ date, runs: v.runs, drops: v.drops })),
  };
}

interface EventRow {
  status: string;
  at: Date;
}
interface ProofRow {
  method: ProofMethod;
  media_key: string | null;
  note: string | null;
  captured_at: Date;
}

/** GET /driver/v1/history/{kind}/{id} — a run or drop's timeline + (for a drop) captured proof. */
export async function getDetail(
  kind: "run" | "drop",
  id: string,
  driverId: string,
): Promise<HistoryDetailDTO | null> {
  // Ownership check + fetch the timeline.
  if (kind === "run") {
    const owns = await query(`SELECT 1 FROM public.driver_run WHERE id = $1 AND driver_id = $2`, [id, driverId]);
    if (owns.rowCount === 0) return null;
    const ev = await query<EventRow>(
      `SELECT status, at FROM public.driver_task_event WHERE run_id = $1 ORDER BY at`,
      [id],
    );
    return { timeline: mapTimeline(ev.rows), proof: null, addressFull: null, packages: [] };
  }

  const own = await query<{ order_number: string; addr: string | null }>(
    `SELECT o.order_number,
            concat_ws(', ', o.delivery_address ->> 'line1', o.delivery_address ->> 'city', o.delivery_address ->> 'postalCode') AS addr
       FROM public.delivery_task dt
       JOIN public.driver_run r ON r.id = dt.run_id
       JOIN public."order" o ON o.id = dt.order_id
      WHERE dt.id = $1 AND r.driver_id = $2`,
    [id, driverId],
  );
  if (own.rowCount === 0) return null;

  const ev = await query<EventRow>(
    `SELECT status, at FROM public.driver_task_event WHERE delivery_task_id = $1 ORDER BY at`,
    [id],
  );
  const proofRow = await query<ProofRow>(
    `SELECT method, media_key, note, captured_at FROM public.proof_of_delivery WHERE delivery_task_id = $1`,
    [id],
  );
  const packages = await query<{ order_number: string; from_shops: string }>(
    `SELECT o.order_number, count(DISTINCT sf.shop_id)::text AS from_shops
       FROM public.delivery_task_package dtp
       JOIN public.shop_fulfillment sf ON sf.id = dtp.shop_fulfillment_id
       JOIN public."order" o ON o.id = sf.order_id
      WHERE dtp.delivery_task_id = $1 GROUP BY o.order_number`,
    [id],
  );

  const pr = proofRow.rows[0];
  const proof = pr
    ? {
        method: pr.method,
        mediaUrl: pr.media_key ? await presignRead(pr.media_key) : null,
        note: pr.note,
        capturedAt: pr.captured_at.toISOString(),
      }
    : null;

  return {
    timeline: mapTimeline(ev.rows),
    proof,
    addressFull: own.rows[0]!.addr,
    packages: packages.rows.map((p) => ({ ref: p.order_number, fromShopCount: Number(p.from_shops) })),
  };
}

function mapTimeline(rows: EventRow[]): TimelineEntry[] {
  return rows.map((r) => ({ status: r.status, at: r.at.toISOString() }));
}
