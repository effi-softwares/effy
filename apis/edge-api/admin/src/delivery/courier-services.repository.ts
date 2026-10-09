// The courier services Effy uses (080): SQL only. Entered by the operator; nothing is seeded.
import type pg from "pg";

import { query, withTransaction } from "@effy/edge-shared";
import type { CourierServiceDTO } from "@effy/shared-types";

type Client = pg.PoolClient;

interface Row {
  id: string;
  courier_name: string;
  service_name: string;
  estimate_text: string;
  max_business_days: number;
  pickup_weekdays: number[];
  pickup_cutoff: string;
  collects_from_supplier: boolean;
  status: "active" | "retired";
  is_default: boolean;
}

const COLS = `id::text AS id, courier_name, service_name, estimate_text, max_business_days, pickup_weekdays::int[] AS pickup_weekdays,
              to_char(pickup_cutoff, 'HH24:MI') AS pickup_cutoff, collects_from_supplier, status, is_default`;

const toDTO = (r: Row): CourierServiceDTO => ({
  id: r.id, courierName: r.courier_name, serviceName: r.service_name, estimateText: r.estimate_text,
  maxBusinessDays: r.max_business_days, pickupWeekdays: r.pickup_weekdays, pickupCutoff: r.pickup_cutoff,
  collectsFromSupplier: r.collects_from_supplier, status: r.status, isDefault: r.is_default,
});

/** Active first, the default at the top; retired last. */
export async function listServices(): Promise<CourierServiceDTO[]> {
  const res = await query<Row>(`SELECT ${COLS} FROM public.courier_service ORDER BY status, is_default DESC, courier_name, service_name`);
  return res.rows.map(toDTO);
}

export async function readService(id: string): Promise<CourierServiceDTO | null> {
  const r = (await query<Row>(`SELECT ${COLS} FROM public.courier_service WHERE id = $1::uuid`, [id])).rows[0];
  return r ? toDTO(r) : null;
}

export interface ServiceValues {
  courierName: string;
  serviceName: string;
  estimateText: string;
  maxBusinessDays: number;
  pickupWeekdays: number[];
  pickupCutoff: string;
  collectsFromSupplier: boolean;
  status: "active" | "retired";
  isDefault: boolean;
}

async function audit(client: Client, actorSub: string, action: string, targetId: string, detail: unknown): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'courier_service', $3, $4::jsonb)`,
    [actorSub, action, targetId, JSON.stringify(detail)],
  );
}

export type SaveRefusal = "name_taken" | "default_service_required";

/**
 * Create (`id` null) or replace a service. Making one the default un-makes the previous one in the
 * same transaction. ⚠ Refused rather than leave the platform with no default while one existed:
 * courier delivery would then tell a customer no timeframe.
 */
export async function saveService(id: string | null, v: ServiceValues, actorSub: string): Promise<{ id: string } | { refused: SaveRefusal }> {
  return withTransaction(async (client) => {
    // One writer at a time decides which is the default.
    await client.query(`LOCK TABLE public.courier_service IN SHARE ROW EXCLUSIVE MODE`);
    const before = id ? (await client.query<Row>(`SELECT ${COLS} FROM public.courier_service WHERE id = $1::uuid`, [id])).rows[0] : undefined;
    if (before?.is_default && (!v.isDefault || v.status === "retired")) return { refused: "default_service_required" as const };
    const clash = await client.query(
      `SELECT 1 FROM public.courier_service WHERE lower(courier_name) = lower($1) AND lower(service_name) = lower($2) AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [v.courierName, v.serviceName, id],
    );
    if ((clash.rowCount ?? 0) > 0) return { refused: "name_taken" as const };
    if (v.isDefault) await client.query(`UPDATE public.courier_service SET is_default = false, updated_at = now() WHERE is_default AND ($1::uuid IS NULL OR id <> $1::uuid)`, [id]);

    const values = [v.courierName, v.serviceName, v.estimateText, v.maxBusinessDays, v.pickupWeekdays, v.pickupCutoff, v.collectsFromSupplier, v.status, v.isDefault, actorSub];
    const saved = id
      ? await client.query<{ id: string }>(
          `UPDATE public.courier_service
              SET courier_name = $1, service_name = $2, estimate_text = $3, max_business_days = $4, pickup_weekdays = $5::int[],
                  pickup_cutoff = $6::time, collects_from_supplier = $7, status = $8, is_default = $9, updated_by = $10, updated_at = now()
            WHERE id = $11::uuid RETURNING id::text AS id`,
          [...values, id],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO public.courier_service
               (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, collects_from_supplier, status, is_default, updated_by)
           VALUES ($1, $2, $3, $4, $5::int[], $6::time, $7, $8, $9, $10) RETURNING id::text AS id`,
          values,
        );
    const savedId = saved.rows[0]!.id;
    await audit(client, actorSub, id ? "courier_service.update" : "courier_service.create", savedId, { before: before ?? null, after: v });
    return { id: savedId };
  });
}
