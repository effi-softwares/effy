// Repository for delivery exceptions (056 US3): raw parameterized SQL, no ORM.
//
// ⚠ THIS IS THE READER THAT NEVER EXISTED. `public.delivery_failure` and
// `public.collection_task_issue` have been written by the driver app since 049, both annotated
// "recorded for back-office follow-up" — and `apis/edge-api/driver` is the only code that has ever
// touched either, and it only INSERTs. A repo-wide search for a reader returns nothing.
//
// The consequence is the one the order-flow register names the top remaining structural gap: a
// driver marks a drop undeliverable, `shop_fulfillment` stays `collected`, no customer notification
// fires, no re-attempt is scheduled, and the shopper keeps seeing "on the way" — indefinitely, with
// nobody at Effy told. This file is the follow-up the word "follow-up" promised.
import { query } from "@effy/edge-shared";
import type { DriverException, DriverExceptionKind } from "@effy/shared-types";

interface ExceptionRow {
  kind: DriverExceptionKind;
  id: string;
  reason: string;
  note: string | null;
  driver_id: string | null;
  driver_name: string | null;
  order_id: string | null;
  order_reference: string | null;
  location: string | null;
  occurred_at: Date;
  resolved_at: Date | null;
  resolved_by_sub: string | null;
  resolution_note: string | null;
}

function toException(r: ExceptionRow): DriverException {
  return {
    kind: r.kind,
    id: r.id,
    reason: r.reason,
    note: r.note,
    driverId: r.driver_id,
    driverName: r.driver_name,
    orderId: r.order_id,
    orderReference: r.order_reference,
    location: r.location,
    occurredAt: r.occurred_at.toISOString(),
    resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
    resolvedBySub: r.resolved_by_sub,
    resolutionNote: r.resolution_note,
  };
}

/**
 * The two exception sources, unioned into one shape.
 *
 * ⚠ `location` is the delivery SUBURB for a failure and the SHOP NAME for a collection issue —
 * never a full street address. A triage queue does not need one, and putting a customer's street on
 * a list view is a disclosure nobody asked for.
 */
const UNION_SELECT = `
  SELECT 'delivery_failure'::text AS kind,
         df.id,
         df.reason,
         df.note,
         r.driver_id,
         dr.name          AS driver_name,
         dt.order_id,
         o.order_number   AS order_reference,
         ca.city          AS location,
         df.failed_at     AS occurred_at,
         df.resolved_at,
         df.resolved_by_sub,
         df.resolution_note
    FROM public.delivery_failure df
    JOIN public.delivery_task dt ON dt.id = df.delivery_task_id
    JOIN public.driver_run r     ON r.id = dt.run_id
    LEFT JOIN public.driver dr   ON dr.id = r.driver_id
    LEFT JOIN public."order" o   ON o.id = dt.order_id
    LEFT JOIN public.customer_address ca ON ca.id = dt.customer_address_id
  UNION ALL
  SELECT 'collection_issue'::text,
         cti.id,
         cti.kind,
         cti.note,
         r.driver_id,
         dr.name,
         sf.order_id,
         o.order_number,
         sh.name,
         cti.reported_at,
         cti.resolved_at,
         cti.resolved_by_sub,
         cti.resolution_note
    FROM public.collection_task_issue cti
    JOIN public.collection_task ct  ON ct.id = cti.collection_task_id
    JOIN public.driver_run r        ON r.id = ct.run_id
    LEFT JOIN public.driver dr      ON dr.id = r.driver_id
    LEFT JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
    LEFT JOIN public."order" o      ON o.id = sf.order_id
    LEFT JOIN public.shop sh        ON sh.id = ct.shop_id
`;

export interface ExceptionListParams {
  kind?: DriverExceptionKind;
  /** undefined = both; false = outstanding only (the default view); true = resolved only. */
  resolved?: boolean;
  driverId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export interface ExceptionListResult {
  items: DriverException[];
  nextCursor: string | null;
}

export function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ t: occurredAt, i: id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): { occurredAt: string; id: string } | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof p.t !== "string" || typeof p.i !== "string") return null;
    return { occurredAt: p.t, id: p.i };
  } catch {
    return null;
  }
}

/**
 * List exceptions (FR-027…FR-029).
 *
 * ⚠ Ordered `(occurred_at DESC, id DESC)` and the cursor is minted from THE SAME PAIR — 053's paging
 * defect was ordering on one column and minting from another, which re-showed rows.
 */
export async function listExceptions(params: ExceptionListParams): Promise<ExceptionListResult> {
  const where: string[] = [];
  const args: unknown[] = [];

  if (params.kind) {
    args.push(params.kind);
    where.push(`e.kind = $${args.length}`);
  }
  if (params.resolved === false) where.push(`e.resolved_at IS NULL`);
  if (params.resolved === true) where.push(`e.resolved_at IS NOT NULL`);
  if (params.driverId) {
    args.push(params.driverId);
    where.push(`e.driver_id = $${args.length}`);
  }
  if (params.from) {
    args.push(params.from);
    where.push(`e.occurred_at >= $${args.length}::timestamptz`);
  }
  if (params.to) {
    args.push(params.to);
    where.push(`e.occurred_at < $${args.length}::timestamptz`);
  }
  if (params.cursor) {
    const c = decodeCursor(params.cursor);
    if (c) {
      args.push(c.occurredAt, c.id);
      where.push(`(e.occurred_at, e.id) < ($${args.length - 1}::timestamptz, $${args.length}::uuid)`);
    }
  }

  args.push(params.limit + 1);
  const res = await query<ExceptionRow>(
    `SELECT * FROM (${UNION_SELECT}) e
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $${args.length}`,
    args,
  );
  const rows = res.rows.slice(0, params.limit);
  const hasMore = res.rows.length > params.limit;
  const last = rows[rows.length - 1];
  return {
    items: rows.map(toException),
    nextCursor: hasMore && last ? encodeCursor(last.occurred_at.toISOString(), last.id) : null,
  };
}

/**
 * How many exceptions are outstanding (FR-032).
 *
 * ⚠ Two cheap counts against the two PARTIAL indexes (`… WHERE resolved_at IS NULL`), not a count
 * over the union — the union would scan both tables in full to answer a number shown on every visit
 * to the Drivers area.
 */
export async function outstandingCount(): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT (
       (SELECT count(*) FROM public.delivery_failure       WHERE resolved_at IS NULL)
     + (SELECT count(*) FROM public.collection_task_issue  WHERE resolved_at IS NULL)
     )::text AS n`,
  );
  return Number(res.rows[0]?.n ?? 0);
}

export type ResolveOutcome = "resolved" | "not_found" | "already_resolved";

/**
 * Mark one exception resolved (FR-031).
 *
 * ⚠ ONE-WAY, AND NEVER A DELETE. `WHERE resolved_at IS NULL` in the UPDATE makes a double-resolve a
 * zero-row result rather than a silent overwrite of who resolved it first. An exception whose order
 * is later cancelled or refunded stays exactly where it is; the resolution note is where that
 * connection gets recorded.
 */
export async function resolveException(
  kind: DriverExceptionKind,
  id: string,
  bySub: string,
  note: string,
): Promise<ResolveOutcome> {
  const table =
    kind === "delivery_failure" ? "public.delivery_failure" : "public.collection_task_issue";
  const res = await query<{ id: string }>(
    `UPDATE ${table}
        SET resolved_at = now(), resolved_by_sub = $2, resolution_note = $3
      WHERE id = $1 AND resolved_at IS NULL
      RETURNING id`,
    [id, bySub, note],
  );
  if ((res.rowCount ?? 0) > 0) return "resolved";

  const exists = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1) AS ok`,
    [id],
  );
  return exists.rows[0]?.ok ? "already_resolved" : "not_found";
}

/** Read one exception back after resolving it, so the response reflects what was written. */
export async function getException(
  kind: DriverExceptionKind,
  id: string,
): Promise<DriverException | null> {
  const res = await query<ExceptionRow>(
    `SELECT * FROM (${UNION_SELECT}) e WHERE e.kind = $1 AND e.id = $2`,
    [kind, id],
  );
  const r = res.rows[0];
  return r ? toException(r) : null;
}
