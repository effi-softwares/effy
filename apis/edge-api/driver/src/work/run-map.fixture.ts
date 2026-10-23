// Test-only: seeds the two points the run map reads. Named in fleet's no-location guard on purpose.
import type { Pool } from "pg";

/** Replaces any row for that postcode. */
export async function seedPlace(pool: Pool, p: { name: string; state: string; postcode: string; lat: number; lng: number }) {
  await pool.query(`DELETE FROM public.locality WHERE postcode = $1`, [p.postcode]);
  await pool.query(
    `INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES ($1, $2, $3, $4, $5, 10)`,
    [p.name, p.state, p.postcode, p.lat, p.lng],
  );
}

export async function seedHub(pool: Pool, lat: number, lng: number) {
  await pool.query(
    `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, $1, $2, 'test')
     ON CONFLICT (id) DO UPDATE SET hub_latitude = $1, hub_longitude = $2`,
    [lat, lng],
  );
}
