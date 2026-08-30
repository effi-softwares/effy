// Driver work history and proof (056 US5): raw parameterized SQL, no ORM.
//
// This is what makes the profile a RECORD OF EMPLOYMENT rather than a contact card, and it is the
// only way to answer a customer who says a delivery never arrived.
//
// ⚠ COUNTS ONLY. No currency appears anywhere in this file (FR-049) — the driver domain has never
// carried money and back-office does not introduce it here. The period summary is activity, not a
// timesheet, and must never be presented as one.
import { presignRead, query } from "@effy/edge-shared";
import type {
  DriverPeriodSummary,
  DriverProofResponse,
  DriverRunDetail,
  DriverRunStop,
  DriverRunSummary,
  ProofMethod,
} from "@effy/shared-types";

interface RunRow {
  run_id: string;
  type: DriverRunSummary["type"];
  status: string;
  business_date: Date;
  assigned_at: Date;
  completed_at: Date | null;
  completed_stops: string;
  total_stops: string;
}

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toRunSummary(r: RunRow): DriverRunSummary {
  return {
    runId: r.run_id,
    type: r.type,
    status: r.status,
    businessDate: dateOnly(r.business_date),
    assignedAt: r.assigned_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    completedStops: Number(r.completed_stops),
    totalStops: Number(r.total_stops),
  };
}

const RUN_SELECT = `
  SELECT r.id            AS run_id,
         r.type,
         r.status,
         r.business_date,
         r.assigned_at,
         r.completed_at,
         (SELECT count(*) FROM public.collection_task ct
           WHERE ct.run_id = r.id AND ct.status IN ('collected', 'short'))::int
       + (SELECT count(*) FROM public.delivery_task dt
           WHERE dt.run_id = r.id AND dt.status IN ('delivered', 'failed'))::int AS completed_stops,
         (SELECT count(*) FROM public.collection_task ct WHERE ct.run_id = r.id)::int
       + (SELECT count(*) FROM public.delivery_task dt WHERE dt.run_id = r.id)::int AS total_stops
    FROM public.driver_run r
`;

export interface HistoryParams {
  driverId: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export function encodeCursor(assignedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: assignedAt, i: id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): { assignedAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { t?: unknown; i?: unknown };
    if (typeof p.t !== "string" || typeof p.i !== "string") return null;
    return { assignedAt: p.t, id: p.i };
  } catch {
    return null;
  }
}

/**
 * A driver's runs, newest first by working day (FR-039).
 *
 * ⚠ Ordered `(assigned_at DESC, id DESC)` with the cursor minted from THE SAME PAIR (research R9).
 */
export async function listRuns(
  params: HistoryParams,
): Promise<{ items: DriverRunSummary[]; nextCursor: string | null }> {
  const where = ["r.driver_id = $1"];
  const args: unknown[] = [params.driverId];

  if (params.from) {
    args.push(params.from);
    where.push(`r.business_date >= $${args.length}::date`);
  }
  if (params.to) {
    args.push(params.to);
    where.push(`r.business_date <= $${args.length}::date`);
  }
  if (params.cursor) {
    const c = decodeCursor(params.cursor);
    if (c) {
      args.push(c.assignedAt, c.id);
      where.push(`(r.assigned_at, r.id) < ($${args.length - 1}::timestamptz, $${args.length}::uuid)`);
    }
  }

  args.push(params.limit + 1);
  const res = await query<RunRow>(
    `${RUN_SELECT} WHERE ${where.join(" AND ")}
      ORDER BY r.assigned_at DESC, r.id DESC
      LIMIT $${args.length}`,
    args,
  );
  const rows = res.rows.slice(0, params.limit);
  const hasMore = res.rows.length > params.limit;
  const last = rows[rows.length - 1];
  return {
    items: rows.map(toRunSummary),
    nextCursor: hasMore && last ? encodeCursor(last.assigned_at.toISOString(), last.run_id) : null,
  };
}

/** One run's stops in order, each with the time it reached each state (FR-040). */
export async function getRunDetail(runId: string): Promise<DriverRunDetail | null> {
  // ⚠ Written out rather than string-patching RUN_SELECT. A `.replace()` on SQL is a query that
  // breaks silently the next time someone reformats the constant it edits.
  const runRes = await query<RunRow & { driver_id: string; driver_name: string }>(
    `SELECT r.id            AS run_id,
            r.type,
            r.status,
            r.business_date,
            r.assigned_at,
            r.completed_at,
            d.id            AS driver_id,
            d.name          AS driver_name,
            (SELECT count(*) FROM public.collection_task ct
              WHERE ct.run_id = r.id AND ct.status IN ('collected', 'short'))::int
          + (SELECT count(*) FROM public.delivery_task dt
              WHERE dt.run_id = r.id AND dt.status IN ('delivered', 'failed'))::int AS completed_stops,
            (SELECT count(*) FROM public.collection_task ct WHERE ct.run_id = r.id)::int
          + (SELECT count(*) FROM public.delivery_task dt   WHERE dt.run_id = r.id)::int AS total_stops
       FROM public.driver_run r
       JOIN public.driver d ON d.id = r.driver_id
      WHERE r.id = $1`,
    [runId],
  );
  const run = runRes.rows[0];
  if (!run) return null;

  const stopRes = await query<{
    task_id: string;
    kind: "collection" | "delivery";
    sequence: number;
    label: string | null;
    status: string;
    order_id: string | null;
    order_reference: string | null;
    has_proof: boolean;
  }>(
    `SELECT ct.id AS task_id, 'collection'::text AS kind, ct.sequence, sh.name AS label,
            ct.status, sf.order_id, o.order_number AS order_reference, false AS has_proof
       FROM public.collection_task ct
       LEFT JOIN public.shop sh        ON sh.id = ct.shop_id
       LEFT JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
       LEFT JOIN public."order" o      ON o.id = sf.order_id
      WHERE ct.run_id = $1
      UNION ALL
     SELECT dt.id, 'delivery'::text, dt.sequence, ca.city, dt.status, dt.order_id, o.order_number,
            EXISTS (SELECT 1 FROM public.proof_of_delivery p WHERE p.delivery_task_id = dt.id)
       FROM public.delivery_task dt
       LEFT JOIN public.customer_address ca ON ca.id = dt.customer_address_id
       LEFT JOIN public."order" o           ON o.id = dt.order_id
      WHERE dt.run_id = $1
      ORDER BY sequence ASC`,
    [runId],
  );

  const eventRes = await query<{ task_id: string; status: string; at: Date }>(
    `SELECT COALESCE(collection_task_id, delivery_task_id) AS task_id, status, at
       FROM public.driver_task_event
      WHERE collection_task_id IN (SELECT id FROM public.collection_task WHERE run_id = $1)
         OR delivery_task_id   IN (SELECT id FROM public.delivery_task   WHERE run_id = $1)
      ORDER BY at ASC`,
    [runId],
  );
  const timelines = new Map<string, { status: string; at: string }[]>();
  for (const e of eventRes.rows) {
    const list = timelines.get(e.task_id) ?? [];
    list.push({ status: e.status, at: e.at.toISOString() });
    timelines.set(e.task_id, list);
  }

  const stops: DriverRunStop[] = stopRes.rows.map((s) => ({
    taskId: s.task_id,
    kind: s.kind,
    sequence: s.sequence,
    label: s.label ?? "—",
    status: s.status,
    orderId: s.order_id,
    orderReference: s.order_reference,
    timeline: timelines.get(s.task_id) ?? [],
    hasProof: s.has_proof,
  }));

  return {
    run: toRunSummary(run),
    driverId: run.driver_id,
    driverName: run.driver_name,
    stops,
  };
}

/**
 * Proof of delivery for one drop (FR-041, FR-042).
 *
 * ⚠ `mediaUrl` is a TIME-LIMITED PRESIGNED URL, minted here and never stored. The bucket is private
 * and there is no durable public address for a photograph of somebody's front door.
 *
 * ⚠ THE HONEST LIMIT: the caller AUDITS the minting, not the fetching. A URL issued and never opened
 * still produces an audit row, and one that is opened five times produces one. Presigning cannot
 * report a fetch, and pretending otherwise in the audit trail would be worse than stating the limit.
 */
export async function getProof(deliveryTaskId: string): Promise<DriverProofResponse | null> {
  const res = await query<{
    method: ProofMethod;
    media_key: string | null;
    note: string | null;
    captured_at: Date;
    driver_id: string | null;
    driver_name: string | null;
  }>(
    `SELECT p.method, p.media_key, p.note, p.captured_at,
            d.id AS driver_id, d.name AS driver_name
       FROM public.proof_of_delivery p
       JOIN public.delivery_task dt ON dt.id = p.delivery_task_id
       JOIN public.driver_run r     ON r.id = dt.run_id
       LEFT JOIN public.driver d    ON d.id = r.driver_id
      WHERE p.delivery_task_id = $1`,
    [deliveryTaskId],
  );
  const r = res.rows[0];
  if (!r) return null;

  let mediaUrl: string | null = null;
  if (r.media_key) {
    // A missing or unreadable object must SAY SO rather than render a broken placeholder (spec edge
    // case), so a presign failure yields null and the screen states it.
    try {
      mediaUrl = await presignRead(r.media_key);
    } catch {
      mediaUrl = null;
    }
  }

  return {
    method: r.method,
    mediaUrl,
    note: r.note,
    capturedAt: r.captured_at.toISOString(),
    capturedByDriverId: r.driver_id,
    capturedByDriverName: r.driver_name,
  };
}

/** Activity counts over a period (FR-043). ⚠ Counts, never currency, never hours-for-payment. */
export async function periodSummary(
  driverId: string,
  from: string,
  to: string,
): Promise<DriverPeriodSummary> {
  const res = await query<{
    days_worked: string;
    runs_completed: string;
    packages_collected: string;
    drops_delivered: string;
    drops_failed: string;
  }>(
    `SELECT (SELECT count(DISTINCT r.business_date) FROM public.driver_run r
              WHERE r.driver_id = $1 AND r.business_date BETWEEN $2::date AND $3::date)::text AS days_worked,
            (SELECT count(*) FROM public.driver_run r
              WHERE r.driver_id = $1 AND r.status = 'completed'
                AND r.business_date BETWEEN $2::date AND $3::date)::text AS runs_completed,
            (SELECT count(*) FROM public.collection_task ct
               JOIN public.driver_run r ON r.id = ct.run_id
              WHERE r.driver_id = $1 AND ct.status IN ('collected', 'short')
                AND r.business_date BETWEEN $2::date AND $3::date)::text AS packages_collected,
            (SELECT count(*) FROM public.delivery_task dt
               JOIN public.driver_run r ON r.id = dt.run_id
              WHERE r.driver_id = $1 AND dt.status = 'delivered'
                AND r.business_date BETWEEN $2::date AND $3::date)::text AS drops_delivered,
            (SELECT count(*) FROM public.delivery_task dt
               JOIN public.driver_run r ON r.id = dt.run_id
              WHERE r.driver_id = $1 AND dt.status = 'failed'
                AND r.business_date BETWEEN $2::date AND $3::date)::text AS drops_failed`,
    [driverId, from, to],
  );
  const r = res.rows[0];
  return {
    from,
    to,
    daysWorked: Number(r?.days_worked ?? 0),
    runsCompleted: Number(r?.runs_completed ?? 0),
    packagesCollected: Number(r?.packages_collected ?? 0),
    dropsDelivered: Number(r?.drops_delivered ?? 0),
    dropsFailed: Number(r?.drops_failed ?? 0),
  };
}
