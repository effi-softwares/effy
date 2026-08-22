// Repository for the same-day delivery run (049 US2): raw SQL, no ORM. A DROP is one order's same-day
// packages. The drop address comes from order.delivery_address (jsonb snapshot). Every read/write is
// scoped to the driver's own run (FR-012, SC-008). No currency ever crosses this layer (FR-013).

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

import type {
  DeliveryDropDTO,
  DeliveryDropStatus,
  DeliveryDropSummary,
  DeliveryRunDTO,
  DropPackageRef,
  ProofMethod,
} from "@effy/shared-types";

interface RunRow {
  id: string;
  status: string;
}

export async function runForDriver(runId: string, driverId: string): Promise<RunRow | null> {
  const r = await query<RunRow>(
    `SELECT id, status FROM public.driver_run
      WHERE id = $1 AND driver_id = $2 AND type = 'same_day_delivery'`,
    [runId, driverId],
  );
  return r.rows[0] ?? null;
}

interface DropSummaryRow {
  drop_id: string;
  sequence: number;
  order_number: string;
  suburb: string | null;
  package_count: string;
  status: DeliveryDropStatus;
}

/** GET /delivery/runs/{runId} — the ordered drops. */
export async function getRun(runId: string, driverId: string): Promise<DeliveryRunDTO | null> {
  const run = await runForDriver(runId, driverId);
  if (!run) return null;
  const rows = await query<DropSummaryRow>(
    `SELECT dt.id AS drop_id, dt.sequence,
            o.order_number,
            o.delivery_address ->> 'city' AS suburb,
            (SELECT count(*)::text FROM public.delivery_task_package p WHERE p.delivery_task_id = dt.id) AS package_count,
            dt.status
       FROM public.delivery_task dt
       JOIN public."order" o ON o.id = dt.order_id
      WHERE dt.run_id = $1
      ORDER BY dt.sequence`,
    [runId],
  );
  const drops: DeliveryDropSummary[] = rows.rows.map((r) => ({
    dropId: r.drop_id,
    sequence: r.sequence,
    orderRef: r.order_number,
    customerSuburb: r.suburb ?? "—",
    packageCount: Number(r.package_count),
    window: null,
    status: r.status,
  }));
  return { runId: run.id, status: run.status, drops };
}

interface DropDetailRow {
  order_number: string;
  status: DeliveryDropStatus;
  recipient: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  postal: string | null;
  instructions: string | null;
}

/** Confirm a drop belongs to the driver and return its detail, or null. */
export async function getDrop(dropId: string, driverId: string): Promise<DeliveryDropDTO | null> {
  const rows = await query<DropDetailRow>(
    `SELECT o.order_number,
            dt.status,
            o.delivery_address ->> 'recipientName' AS recipient,
            o.delivery_address ->> 'line1'         AS line1,
            o.delivery_address ->> 'line2'         AS line2,
            o.delivery_address ->> 'city'          AS city,
            o.delivery_address ->> 'postalCode'    AS postal,
            o.delivery_address ->> 'instructions'  AS instructions
       FROM public.delivery_task dt
       JOIN public.driver_run r ON r.id = dt.run_id
       JOIN public."order" o ON o.id = dt.order_id
      WHERE dt.id = $1 AND r.driver_id = $2`,
    [dropId, driverId],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const pkgs = await query<{ order_number: string; from_shops: string }>(
    `SELECT o.order_number, count(DISTINCT sf.shop_id)::text AS from_shops
       FROM public.delivery_task_package dtp
       JOIN public.shop_fulfillment sf ON sf.id = dtp.shop_fulfillment_id
       JOIN public."order" o ON o.id = sf.order_id
      WHERE dtp.delivery_task_id = $1
      GROUP BY o.order_number`,
    [dropId],
  );
  const packages: DropPackageRef[] = pkgs.rows.map((p) => ({
    ref: p.order_number,
    fromShopCount: Number(p.from_shops),
  }));

  const addr = [row.line1, row.line2, row.city, row.postal].filter(Boolean).join(", ");
  return {
    dropId,
    orderRef: row.order_number,
    customerName: row.recipient ?? "Customer",
    addressFull: addr || "—",
    instructions: row.instructions,
    packages,
    status: row.status,
  };
}

const FORWARD: Record<string, DeliveryDropStatus[]> = {
  out_for_delivery: ["staged"],
  en_route: ["staged", "out_for_delivery"],
  arrived: ["out_for_delivery", "en_route"],
};

/** Advance a drop's status (FR-019). Guarded so only a legal forward transition applies. Idempotent. */
export async function advanceStatus(
  dropId: string,
  driverId: string,
  to: "out_for_delivery" | "en_route" | "arrived",
  changeId: string,
): Promise<DeliveryDropStatus | null> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const cur = await tx.query<{ status: DeliveryDropStatus }>(
      `SELECT dt.status FROM public.delivery_task dt
         JOIN public.driver_run r ON r.id = dt.run_id
        WHERE dt.id = $1 AND r.driver_id = $2 FOR UPDATE OF dt`,
      [dropId, driverId],
    );
    const status = cur.rows[0]?.status;
    if (!status) return null;
    if (status === to) return status; // idempotent

    const seen = await tx.query(`SELECT 1 FROM public.driver_task_event WHERE change_id = $1`, [changeId]);
    if ((seen.rowCount ?? 0) > 0) return to;

    if (!FORWARD[to]?.includes(status)) return status; // illegal transition → no-op, return current
    await tx.query(`UPDATE public.delivery_task SET status = $2 WHERE id = $1`, [dropId, to]);
    await tx.query(
      `INSERT INTO public.driver_task_event (delivery_task_id, status, change_id) VALUES ($1, $2, $3)`,
      [dropId, to, changeId],
    );
    return to;
  });
}

/**
 * Complete a drop with proof (FR-024–027). Writes proof_of_delivery, advances the drop to `delivered`,
 * and advances EVERY constituent shop_fulfillment collected → delivered — all in one transaction. A
 * drop cannot reach delivered without a proof. Idempotent by changeId. Returns false if not the
 * driver's drop; throws {code:"code_invalid"} when a delivery-code proof fails verification.
 */
export async function completeWithProof(
  dropId: string,
  driverId: string,
  input: { method: ProofMethod; mediaKey?: string; code?: string; note?: string; changeId: string },
): Promise<boolean> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const drop = await tx.query<{ status: DeliveryDropStatus }>(
      `SELECT dt.status FROM public.delivery_task dt
         JOIN public.driver_run r ON r.id = dt.run_id
        WHERE dt.id = $1 AND r.driver_id = $2 FOR UPDATE OF dt`,
      [dropId, driverId],
    );
    if (drop.rowCount === 0) return false;
    if (drop.rows[0]!.status === "delivered") return true; // idempotent

    if (input.method === "code") {
      // A delivery code is verified server-side. For this slice the expected code is derived from the
      // order number's tail (a deterministic dev stand-in until a per-order code is issued); a real
      // per-order OTP is a recorded follow-up.
      const ok = await verifyDeliveryCode(tx, dropId, input.code ?? "");
      if (!ok) {
        const err = new Error("delivery code does not match");
        (err as { code?: string }).code = "code_invalid";
        throw err;
      }
    }

    await tx.query(
      `INSERT INTO public.proof_of_delivery (delivery_task_id, method, media_key, code_verified, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (delivery_task_id) DO NOTHING`,
      [dropId, input.method, input.mediaKey ?? null, input.method === "code" ? true : null, input.note ?? null],
    );
    await tx.query(
      `UPDATE public.delivery_task SET status = 'delivered', delivered_at = now() WHERE id = $1`,
      [dropId],
    );
    await tx.query(
      `UPDATE public.shop_fulfillment SET status = 'delivered', updated_at = now()
        WHERE id IN (SELECT shop_fulfillment_id FROM public.delivery_task_package WHERE delivery_task_id = $1)
          AND status = 'collected'`,
      [dropId],
    );
    await tx.query(
      `INSERT INTO public.driver_task_event (delivery_task_id, status, change_id) VALUES ($1, 'delivered', $2)
       ON CONFLICT (change_id) DO NOTHING`,
      [dropId, input.changeId],
    );
    return true;
  });
}

async function verifyDeliveryCode(tx: pg.PoolClient, dropId: string, code: string): Promise<boolean> {
  const r = await tx.query<{ order_number: string }>(
    `SELECT o.order_number FROM public.delivery_task dt
       JOIN public."order" o ON o.id = dt.order_id WHERE dt.id = $1`,
    [dropId],
  );
  const orderNumber = r.rows[0]?.order_number ?? "";
  const expected = orderNumber.replace(/[^0-9]/g, "").slice(-4).padStart(4, "0");
  return code.trim() === expected;
}

/** Mark a drop undeliverable (FR-028). */
export async function failDrop(
  dropId: string,
  driverId: string,
  input: { reason: string; note?: string },
): Promise<boolean> {
  return withTransaction(async (tx: pg.PoolClient) => {
    const drop = await tx.query(
      `SELECT dt.id FROM public.delivery_task dt
         JOIN public.driver_run r ON r.id = dt.run_id
        WHERE dt.id = $1 AND r.driver_id = $2 FOR UPDATE OF dt`,
      [dropId, driverId],
    );
    if (drop.rowCount === 0) return false;
    await tx.query(
      `INSERT INTO public.delivery_failure (delivery_task_id, reason, note) VALUES ($1, $2, $3)`,
      [dropId, input.reason, input.note ?? null],
    );
    await tx.query(`UPDATE public.delivery_task SET status = 'failed' WHERE id = $1`, [dropId]);
    await tx.query(
      `INSERT INTO public.driver_task_event (delivery_task_id, status) VALUES ($1, 'failed')`,
      [dropId],
    );
    return true;
  });
}
