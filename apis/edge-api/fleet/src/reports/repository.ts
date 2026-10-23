// Counts over Melbourne calendar days, inclusive.
import { query } from "@effy/edge-shared";

const IN_RANGE = (col: string) => `(${col} AT TIME ZONE 'Australia/Melbourne')::date BETWEEN $1::date AND $2::date`;

export interface MixRow {
  key: string | null;
  name: string | null;
  scan: number;
  typed: number;
  manual: number;
}

const MIX = `count(*) FILTER (WHERE ph.handover_method = 'scan')::int   AS scan,
             count(*) FILTER (WHERE ph.handover_method = 'typed')::int  AS typed,
             count(*) FILTER (WHERE ph.handover_method = 'manual')::int AS manual`;

export async function overall(from: string, to: string): Promise<MixRow> {
  const r = await query<MixRow>(`SELECT NULL AS key, NULL AS name, ${MIX} FROM public.package_handover ph WHERE ${IN_RANGE("ph.recorded_at")}`, [from, to]);
  return r.rows[0]!;
}

export async function byShop(from: string, to: string): Promise<MixRow[]> {
  const r = await query<MixRow>(
    `SELECT s.id::text AS key, s.name, ${MIX}
       FROM public.package_handover ph
       JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
       JOIN public.shop s ON s.id = sf.shop_id
      WHERE ${IN_RANGE("ph.recorded_at")}
      GROUP BY s.id, s.name`,
    [from, to],
  );
  return r.rows;
}

export async function byDriver(from: string, to: string): Promise<MixRow[]> {
  const r = await query<MixRow>(
    `SELECT d.id::text AS key, d.name, ${MIX}
       FROM public.package_handover ph
       JOIN public.driver d ON d.id = ph.driver_id
      WHERE ph.actor_kind = 'driver' AND ${IN_RANGE("ph.recorded_at")}
      GROUP BY d.id, d.name`,
    [from, to],
  );
  return r.rows;
}

export async function byActor(from: string, to: string): Promise<MixRow[]> {
  const r = await query<MixRow>(
    `SELECT ph.actor_kind AS key, NULL AS name, ${MIX}
       FROM public.package_handover ph
      WHERE ${IN_RANGE("ph.recorded_at")}
      GROUP BY ph.actor_kind`,
    [from, to],
  );
  return r.rows;
}

export async function refused(from: string, to: string): Promise<Array<{ outcome: string; surface: string; count: number }>> {
  const r = await query<{ outcome: string; surface: string; count: number }>(
    `SELECT server_outcome AS outcome, surface, count(*)::int AS count
       FROM public.label_read
      WHERE server_outcome <> 'accepted' AND ${IN_RANGE("received_at")}
      GROUP BY server_outcome, surface
      ORDER BY count(*) DESC, server_outcome, surface`,
    [from, to],
  );
  return r.rows;
}

export async function missing(from: string, to: string): Promise<Array<{ reason: string; count: number }>> {
  const r = await query<{ reason: string; count: number }>(
    `SELECT reason, count(*)::int AS count
       FROM public.package_hold
      WHERE ${IN_RANGE("created_at")}
      GROUP BY reason
      ORDER BY count(*) DESC, reason`,
    [from, to],
  );
  return r.rows;
}

export async function disagreements(from: string, to: string): Promise<number> {
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.label_read
      WHERE client_outcome IS NOT NULL AND client_outcome <> server_outcome AND ${IN_RANGE("received_at")}`,
    [from, to],
  );
  return Number(r.rows[0]?.n ?? 0);
}
