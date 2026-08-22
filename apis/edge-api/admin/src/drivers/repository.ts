// Repository for back-office driver management (049): raw parameterized SQL, no ORM. Writes the
// platform `public.driver` record. Provisioning is Cognito-first (cognito.ts) → this idempotent
// upsert keyed on the returned sub (006/009 pattern).
import { query } from "@effy/edge-shared";

import type { AdminDriverRow } from "@effy/shared-types";

interface DriverListRow {
  id: string;
  name: string;
  work_email: string;
  zone_name: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  status: "active" | "disabled";
}

function toRow(r: DriverListRow): AdminDriverRow {
  return {
    id: r.id,
    name: r.name,
    workEmail: r.work_email,
    zone: r.zone_name,
    vehicle: { type: r.vehicle_type, plate: r.vehicle_plate },
    status: r.status,
  };
}

const SELECT_BASE = `
  SELECT d.id, d.name, d.work_email, z.name AS zone_name,
         d.vehicle_type, d.vehicle_plate, d.status
    FROM public.driver d
    LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
`;

export async function listDrivers(): Promise<AdminDriverRow[]> {
  const res = await query<DriverListRow>(`${SELECT_BASE} ORDER BY d.name ASC`);
  return res.rows.map(toRow);
}

export async function getDriver(id: string): Promise<AdminDriverRow | null> {
  const res = await query<DriverListRow>(`${SELECT_BASE} WHERE d.id = $1`, [id]);
  const row = res.rows[0];
  return row ? toRow(row) : null;
}

/** Idempotent upsert keyed on cognito_sub (the identity Cognito returned). */
export async function upsertDriver(input: {
  sub: string;
  name: string;
  workEmail: string;
  zoneId: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
}): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.driver
       (cognito_sub, name, work_email, delivery_zone_id, vehicle_type, vehicle_plate, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     ON CONFLICT (cognito_sub) DO UPDATE
       SET name = EXCLUDED.name,
           work_email = EXCLUDED.work_email,
           delivery_zone_id = EXCLUDED.delivery_zone_id,
           vehicle_type = EXCLUDED.vehicle_type,
           vehicle_plate = EXCLUDED.vehicle_plate,
           updated_at = now()
     RETURNING id`,
    [input.sub, input.name, input.workEmail, input.zoneId, input.vehicleType, input.vehiclePlate],
  );
  return res.rows[0]!.id;
}

export async function updateDriver(
  id: string,
  patch: { name?: string; zoneId?: string; vehicleType?: string; vehiclePlate?: string },
): Promise<void> {
  await query(
    `UPDATE public.driver
        SET name = COALESCE($2, name),
            delivery_zone_id = COALESCE($3, delivery_zone_id),
            vehicle_type = COALESCE($4, vehicle_type),
            vehicle_plate = COALESCE($5, vehicle_plate),
            updated_at = now()
      WHERE id = $1`,
    [id, patch.name ?? null, patch.zoneId ?? null, patch.vehicleType ?? null, patch.vehiclePlate ?? null],
  );
}

export async function setStatus(id: string, status: "active" | "disabled"): Promise<string | null> {
  const res = await query<{ work_email: string }>(
    `UPDATE public.driver SET status = $2, updated_at = now() WHERE id = $1 RETURNING work_email`,
    [id, status],
  );
  return res.rows[0]?.work_email ?? null;
}
