// 092 rev 2 — test-only: the two points the run map reads (D25), seeded for a container test.
// ⚠ Like run-map.ts, this file is named in fleet's no-location guard on purpose; nothing else may
// write a point. It is imported by tests only.
import type { Pool } from "pg";

/** A postcode's place, as the locality list holds it. Replaces any row for that postcode. */
export async function seedPlace(pool: Pool, p: { name: string; state: string; postcode: string; lat: number; lng: number }) {
  await pool.query(`DELETE FROM public.locality WHERE postcode = $1`, [p.postcode]);
  await pool.query(
    `INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES ($1, $2, $3, $4, $5, 10)`,
    [p.name, p.state, p.postcode, p.lat, p.lng],
  );
}

/** The hub's point on the business's delivery settings. */
export async function seedHub(pool: Pool, lat: number, lng: number) {
  await pool.query(
    `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, $1, $2, 'test')
     ON CONFLICT (id) DO UPDATE SET hub_latitude = $1, hub_longitude = $2`,
    [lat, lng],
  );
}
