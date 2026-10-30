import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { instantAtLocalTime } from "../lib/collection-deadline";
import { migrationSql } from "../testing/migrations";
import { loadActivePlan } from "./plan";
import { quote } from "./quote";
import { windowKey } from "./windows";

/** Window surcharges against real data: they belong to the plan, apply once per order, and leave the windows alone. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

d("077 - window surcharges belong to the plan", () => {
  let c3: StartedPostgreSqlContainer;
  let p3: Pool;
  let shopA: string;
  let shopB: string;
  let slot: string;
  const PLAN3 = "00000000-0000-0000-0000-0000000000d3";

  beforeAll(async () => {
    c3 = await new PostgreSqlContainer("postgres:16-alpine").start();
    p3 = new Pool({ connectionString: c3.getConnectionUri() });
    await p3.query(migrationSql());
    await p3.query(`DELETE FROM public.delivery_fee_plan`);
    await p3.query(`TRUNCATE public.delivery_slot, public.delivery_collection_run CASCADE`);
    [shopA, shopB] = (await p3.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('W1','a'),('W2','b') RETURNING id::text AS id`)).rows.map((r) => r.id) as [string, string];
    await p3.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, sameday_hub_turnaround_min, updated_by)
        VALUES (1, -37.81, 144.96, 0, 0, 'test') ON CONFLICT (id) DO UPDATE SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0;
      INSERT INTO public.locality (name, state, postcode) VALUES ('RICHMOND', 'VIC', '3121') ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES (NULL, '3121', 3.4, 'manual', 'test');
      INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('12:00', 'active', 'test');
      INSERT INTO public.delivery_fee_plan (id, name, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN3}', 'Windows', 3.00, 0.50, 4.00, 60.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN3}', NULL, 6.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN3}', 100000, 0.00);`);
    slot = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES ('17:00','19:00','15:00',5,'active','test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ('${PLAN3}', $1, 2.00)`, [slot]);
    await p3.query(`SELECT public.delivery_plan_activate('${PLAN3}', 'test', false)`);
  }, 240_000);

  afterAll(async () => {
    await p3?.end();
    await c3?.stop();
  });

  const at10 = instantAtLocalTime(2026, 8, 24, 10, 0);
  const windowFee = async () => {
    const res = await quote(p3, null, "3121", [{ shopId: shopA, grams: 500 }, { shopId: shopB, grams: 500 }], at10, 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    return res.effyWindows.fees.get(windowKey(slot, "2026-08-24"))?.totalCents ?? null;
  };

  it("today's premium and the window's own apply ONCE for an order of two packages going today", async () => {
    expect(await windowFee()).toBe(1100); // 6.00 + 3.00 today + 2.00 for the window
  });

  it("a switched-off window leaves the plan readable and its premium unused", async () => {
    await p3.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [slot]);
    try {
      expect((await loadActivePlan(p3)).slotPremiumCents.has(slot)).toBe(false);
      expect(await windowFee()).toBeNull(); // the window is not offered at all
    } finally {
      await p3.query(`UPDATE public.delivery_slot SET status = 'active' WHERE id = $1`, [slot]);
    }
  });

  it("activating a plan with different premiums changes no window", async () => {
    const windows = async () => (await p3.query(`SELECT row_to_json(s)::text AS j FROM public.delivery_slot s ORDER BY id`)).rows;
    const before = await windows();
    const next = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_fee_plan (name, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
       VALUES ('Dearer evenings', 0.00, 0.50, 4.00, 60.00, 'test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ($1, NULL, 6.00)`, [next]);
    await p3.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, 100000, 0.00)`, [next]);
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, 4.00)`, [next, slot]);
    await p3.query(`SELECT public.delivery_plan_activate($1, 'test', false)`, [next]);
    expect(await windows()).toEqual(before);
    expect(await windowFee()).toBe(1000); // 6.00 + 4.00, no today premium in this plan
  });

  it("deleting a window that never carried an order takes its premium with it, even from an activated plan", async () => {
    const spare = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES ('19:00','21:00','17:00',5,'active','test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    // A draft gets a premium, is activated, and the window is then removed.
    const draft = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_fee_plan (name, rounding_step, floor_amount, cap_amount, created_by) VALUES ('Spare', 0.50, 4.00, 60.00, 'test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ($1, NULL, 6.00)`, [draft]);
    await p3.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, 1000, 0.00)`, [draft]);
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, 1.00)`, [draft, spare]);
    await p3.query(`SELECT public.delivery_plan_activate($1, 'test', false)`, [draft]);
    await p3.query(`DELETE FROM public.delivery_slot WHERE id = $1`, [spare]);
    expect((await p3.query(`SELECT 1 FROM public.delivery_slot_premium WHERE slot_id = $1`, [spare])).rowCount).toBe(0);
  });
});
