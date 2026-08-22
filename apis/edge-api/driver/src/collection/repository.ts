// Repository for the collection run (049 US1): raw SQL, no ORM. A "package" is a shop_fulfillment
// portion; a "stop" is a shop within the run (it may hold several packages). Every read/write is
// scoped to the driver's own run (driverId), so cross-driver access is impossible (FR-012, SC-008).

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

import type {
  CollectionPackage,
  CollectionStopDTO,
  CollectionStopStatus,
  CollectionStopSummary,
  DriverCollectionRunDTO,
} from "@effy/shared-types";

// ── Row shapes (never escape this module) ────────────────────────────────────────────────────────

interface RunRow {
  id: string;
  status: string;
}
interface StopRow {
  shop_id: string;
  shop_name: string;
  shop_code: string;
  package_count: string;
  collected_count: string;
  short_count: string;
  min_sequence: string;
}

/** Derive a stop's status from its packages: all collected → collected; any short → short; else assigned. */
function stopStatus(pkgCount: number, collected: number, short: number): CollectionStopStatus {
  if (short > 0 && collected + short >= pkgCount) return "short";
  if (collected >= pkgCount && pkgCount > 0) return "collected";
  return "assigned";
}

/** Confirm the run belongs to this driver and return it, or null. */
export async function runForDriver(runId: string, driverId: string): Promise<RunRow | null> {
  const r = await query<RunRow>(
    `SELECT id, status FROM public.driver_run
      WHERE id = $1 AND driver_id = $2 AND type = 'collection'`,
    [runId, driverId],
  );
  return r.rows[0] ?? null;
}

/** GET /collection/runs/{runId} — the ordered shop stops. */
export async function getRun(runId: string, driverId: string): Promise<DriverCollectionRunDTO | null> {
  const run = await runForDriver(runId, driverId);
  if (!run) return null;

  const rows = await query<StopRow>(
    `SELECT ct.shop_id,
            s.name AS shop_name,
            s.code AS shop_code,
            count(*)::text                                             AS package_count,
            count(*) FILTER (WHERE ct.status = 'collected')::text      AS collected_count,
            count(*) FILTER (WHERE ct.status = 'short')::text          AS short_count,
            min(ct.sequence)::text                                     AS min_sequence
       FROM public.collection_task ct
       JOIN public.shop s ON s.id = ct.shop_id
      WHERE ct.run_id = $1
      GROUP BY ct.shop_id, s.name, s.code
      ORDER BY min(ct.sequence) ASC`,
    [runId],
  );

  const stops: CollectionStopSummary[] = rows.rows.map((row) => {
    const pkg = Number(row.package_count);
    const collected = Number(row.collected_count);
    const short = Number(row.short_count);
    return {
      stopId: row.shop_id,
      sequence: Number(row.min_sequence),
      shopName: row.shop_name,
      shopCode: row.shop_code,
      packageCount: pkg,
      status: stopStatus(pkg, collected, short),
    };
  });
  return { runId: run.id, status: run.status, stops };
}

interface PackageRow {
  order_number: string;
  suburb: string | null;
  method: "same_day" | "standard" | null;
  status: CollectionStopStatus;
}
interface ManifestRow {
  order_number: string;
  product_name: string;
  quantity: number;
}

/** GET /collection/runs/{runId}/stops/{shopId} — a shop stop and its packages + manifests. */
export async function getStop(
  runId: string,
  driverId: string,
  shopId: string,
): Promise<CollectionStopDTO | null> {
  const run = await runForDriver(runId, driverId);
  if (!run) return null;

  const shop = await query<{ name: string; code: string }>(
    `SELECT name, code FROM public.shop WHERE id = $1`,
    [shopId],
  );
  if (!shop.rows[0]) return null;

  const pkgs = await query<PackageRow>(
    `SELECT o.order_number,
            o.delivery_address ->> 'city' AS suburb,
            opd.method,
            ct.status
       FROM public.collection_task ct
       JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
       JOIN public."order" o ON o.id = sf.order_id
       LEFT JOIN public.order_package_delivery opd
              ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
      WHERE ct.run_id = $1 AND ct.shop_id = $2
      ORDER BY o.order_number`,
    [runId, shopId],
  );

  // Manifests for every order at this shop, in one read (product_name + quantity from order_item).
  const manifests = await query<ManifestRow>(
    `SELECT o.order_number, oi.product_name, oi.quantity
       FROM public.collection_task ct
       JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
       JOIN public."order" o ON o.id = sf.order_id
       JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
      WHERE ct.run_id = $1 AND ct.shop_id = $2
      ORDER BY o.order_number, oi.product_name`,
    [runId, shopId],
  );
  const byOrder = new Map<string, { name: string; qty: number }[]>();
  for (const m of manifests.rows) {
    const list = byOrder.get(m.order_number) ?? [];
    list.push({ name: m.product_name, qty: m.quantity });
    byOrder.set(m.order_number, list);
  }

  const packages: CollectionPackage[] = pkgs.rows.map((p) => ({
    ref: p.order_number,
    destinationSuburb: p.suburb ?? "—",
    method: p.method ?? "standard",
    items: byOrder.get(p.order_number) ?? [],
  }));

  const allCollected = pkgs.rows.length > 0 && pkgs.rows.every((p) => p.status === "collected" || p.status === "short");
  return {
    stopId: shopId,
    shopName: shop.rows[0].name,
    shopCode: shop.rows[0].code,
    packages,
    status: allCollected ? "collected" : "assigned",
  };
}

/**
 * Mark every package at a shop stop collected (FR-014) — one action per shop. Advances each package's
 * shop_fulfillment ready_for_pickup → collected and the collection_task → collected, in one
 * transaction, and appends timeline events. Idempotent by changeId. Returns false if the run isn't
 * this driver's or the stop has no packages.
 */
export async function collectStop(
  runId: string,
  driverId: string,
  shopId: string,
  changeId: string,
): Promise<boolean> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const run = await tx.query(
      `SELECT id FROM public.driver_run
        WHERE id = $1 AND driver_id = $2 AND type = 'collection' FOR UPDATE`,
      [runId, driverId],
    );
    if (run.rowCount === 0) return false;

    // Idempotency: if this action already applied, no-op success.
    const seen = await tx.query(`SELECT 1 FROM public.driver_task_event WHERE change_id = $1`, [changeId]);
    if ((seen.rowCount ?? 0) > 0) return true;

    const tasks = await tx.query<{ id: string; shop_fulfillment_id: string }>(
      `SELECT id, shop_fulfillment_id FROM public.collection_task
        WHERE run_id = $1 AND shop_id = $2 AND status IN ('assigned', 'en_route')
        FOR UPDATE`,
      [runId, shopId],
    );
    if (tasks.rowCount === 0) return true; // nothing left to collect = already done

    for (const t of tasks.rows) {
      await tx.query(
        `UPDATE public.shop_fulfillment SET status = 'collected', updated_at = now()
          WHERE id = $1 AND status = 'ready_for_pickup'`,
        [t.shop_fulfillment_id],
      );
      await tx.query(
        `UPDATE public.collection_task SET status = 'collected', collected_at = now() WHERE id = $1`,
        [t.id],
      );
    }
    // One idempotency-keyed event for the action; per-task events without the key for the timeline.
    await tx.query(
      `INSERT INTO public.driver_task_event (collection_task_id, status, change_id)
       VALUES ($1, 'collected', $2)`,
      [tasks.rows[0]!.id, changeId],
    );
    return true;
  });
}

/** Report a missing/short package at a shop (FR-015). Marks the affected task `short`; non-blocking. */
export async function reportIssue(
  runId: string,
  driverId: string,
  shopId: string,
  input: { shopFulfillmentId?: string; kind: "missing" | "short"; note?: string },
): Promise<boolean> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const run = await tx.query(
      `SELECT id FROM public.driver_run WHERE id = $1 AND driver_id = $2 AND type = 'collection'`,
      [runId, driverId],
    );
    if (run.rowCount === 0) return false;

    const task = await tx.query<{ id: string }>(
      input.shopFulfillmentId
        ? `SELECT id FROM public.collection_task WHERE run_id = $1 AND shop_id = $2 AND shop_fulfillment_id = $3`
        : `SELECT id FROM public.collection_task WHERE run_id = $1 AND shop_id = $2 ORDER BY sequence LIMIT 1`,
      input.shopFulfillmentId ? [runId, shopId, input.shopFulfillmentId] : [runId, shopId],
    );
    const taskId = task.rows[0]?.id;
    if (!taskId) return false;

    await tx.query(
      `INSERT INTO public.collection_task_issue (collection_task_id, kind, note) VALUES ($1, $2, $3)`,
      [taskId, input.kind, input.note ?? null],
    );
    await tx.query(`UPDATE public.collection_task SET status = 'short' WHERE id = $1`, [taskId]);
    return true;
  });
}
