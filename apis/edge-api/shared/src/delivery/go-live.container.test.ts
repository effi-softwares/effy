import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { legacyOpenOrders, LEGACY_OPEN_ORDER_SQL } from "./legacy";
import { goLiveReadiness } from "./readiness";

/**
 * 083 — going live, against the REAL schema: whether the platform is ready for the new delivery
 * model (P1), and which orders sold the old way are still open (P8).
 * ⚠ The courier service is fictional; real ones are the operator's to enter.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const PLAN = "00000000-0000-0000-0000-0000000083a1";
const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
const item = async (key: string) => (await goLiveReadiness(pool)).items.find((i) => i.key === key)!;

d("083 — going live", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    // Start from nothing: whatever the migrations seeded is not this test's platform.
    await pool.query(`
      DELETE FROM public.delivery_fee_plan; DELETE FROM public.delivery_zone_postcode; DELETE FROM public.delivery_slot;
      DELETE FROM public.delivery_collection_run; DELETE FROM public.courier_service;
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test')
        ON CONFLICT (id) DO UPDATE SET courier_offered = false;`);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("P1 — an empty platform is not ready, and every required item says what is missing", async () => {
    const r = await goLiveReadiness(pool);
    expect(r.ready).toBe(false);
    const state = Object.fromEntries(r.items.map((i) => [i.key, [i.required, i.ready]]));
    expect(state).toEqual({
      coverage: [true, false], hub: [true, true], effy_plan: [true, false], windows: [true, false],
      collection_runs: [true, false], courier: [true, true], // courier is OFF: nothing to set up
      drivers: [false, false], out_of_area: [false, false],
    });
    for (const i of r.items) {
      expect(i.detail.length).toBeGreaterThan(10);
      expect(i.fixAt).toMatch(/^\/(delivery|drivers)/);
    }
    expect((await item("out_of_area")).detail).toMatch(/refused at checkout/);
  });

  it("P1 — it becomes ready one required thing at a time, and taking any one away fails exactly that item", async () => {
    await pool.query(`
      INSERT INTO public.delivery_zone_postcode (postcode, distance_km, distance_source, added_by) VALUES ('3121', 4, 'manual', 't'), ('3977', 42, 'manual', 't');
      INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN}', 'effy', 'Launch plan', true, 5.00, 0.50, 4.00, 60.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN}', 10, 0.00), ('${PLAN}', NULL, 6.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN}', 100000, 0.00);
      INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('16:00', '18:00', '14:00', 20, 'test');
      INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('14:00', 'active', 'test');`);
    const ready = await goLiveReadiness(pool);
    expect(ready.items.filter((i) => i.required && !i.ready)).toEqual([]);
    // ⚠ Advisories do not block: nobody is cleared to drive yet, courier is off — and it is still ready.
    expect(ready.ready).toBe(true);
    expect((await item("effy_plan")).detail).toMatch(/Launch plan.*prices every listed postcode/);

    const failing = async () => (await goLiveReadiness(pool)).items.filter((i) => i.required && !i.ready).map((i) => i.key);
    const without = async (breakIt: string, restore: string) => {
      await pool.query(breakIt);
      try { return await failing(); } finally { await pool.query(restore); }
    };
    expect(await without(`UPDATE public.delivery_slot SET status = 'disabled'`, `UPDATE public.delivery_slot SET status = 'active'`)).toEqual(["windows"]);
    expect(await without(`UPDATE public.delivery_collection_run SET status = 'disabled'`, `UPDATE public.delivery_collection_run SET status = 'active'`)).toEqual(["collection_runs"]);
    expect(await without(`UPDATE public.delivery_fee_plan SET is_active = false`, `UPDATE public.delivery_fee_plan SET is_active = true`)).toEqual(["effy_plan"]);
  });

  it("⚠ P1 — a plan that cannot price the farthest listed postcode is NOT ready, and says which distance", async () => {
    // Take away the open-ended band: the plan now stops at 10 km and the list reaches 42.
    await pool.query(`DELETE FROM public.delivery_distance_band WHERE plan_id = '${PLAN}' AND upper_km IS NULL`);
    try {
      const plan = await item("effy_plan");
      expect(plan.ready).toBe(false);
      expect(plan.detail).toMatch(/no distance band for a postcode 42 km/);
      expect((await goLiveReadiness(pool)).ready).toBe(false);
    } finally {
      await pool.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN}', NULL, 6.00)`);
    }
  });

  it("P1 — courier: off needs nothing; on needs a fee table AND a default service", async () => {
    await pool.query(`UPDATE public.delivery_settings SET courier_offered = true WHERE id = 1`);
    expect(await item("courier")).toMatchObject({ ready: false, detail: expect.stringMatching(/fee table and a default courier service/) });
    await pool.query(`
      INSERT INTO public.delivery_fee_plan (kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('courier', 'Courier table', true, 9.00, 0.50, 0.00, 90.00, 'test')`);
    await pool.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount)
                      SELECT id, 100000, 0 FROM public.delivery_fee_plan WHERE kind = 'courier'`);
    expect((await item("courier")).detail).toMatch(/needs a default courier service$/);
    await pool.query(`INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, is_default, updated_by)
                      VALUES ('Test Courier', 'Parcel', '2–4 business days', 4, '{1,2,3,4,5}', '14:00', true, 'test')`);
    expect(await item("courier")).toMatchObject({ ready: true });
    expect(await item("out_of_area")).toMatchObject({ ready: true });
    expect((await goLiveReadiness(pool)).ready).toBe(true);
  });

  it("P1 — drivers are advisory: named when missing, counted when there", async () => {
    expect((await item("drivers")).detail).toBe("No driver may deliver or collect yet");
    const driver = (await one<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d1', 'Dana', 'dana@example.test') RETURNING id::text AS id`)).id;
    await pool.query(`INSERT INTO public.driver_zone_capability (driver_id, function, zone_id) VALUES ($1, 'delivery', NULL)`, [driver]);
    expect(await item("drivers")).toMatchObject({ ready: false, detail: "No driver may collect yet" });
    await pool.query(`INSERT INTO public.driver_zone_capability (driver_id, function, zone_id) VALUES ($1, 'collection', NULL)`, [driver]);
    expect(await item("drivers")).toMatchObject({ ready: true, detail: "1 driver may deliver and 1 may collect" });
  });

  /**
   * ⚠ P8 — WHICH OLD ORDERS ARE STILL OPEN. The go-live count, the order list's filter, the alert and
   * the guard on the removal migration all read this one fragment.
   */
  it("P8 — old-kind and still open: paid, a parcel not arrived, not fully refunded — and nothing else", async () => {
    const customer = (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('lg', 'lg@example.test') RETURNING id::text AS id`)).id;
    const shop = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('LG', 'Shop') RETURNING id::text AS id`)).id;
    let n = 0;
    const order = async (o: { type?: string | null; status?: string; arrived?: boolean; refunded?: string; withdrawn?: boolean }) => {
      n += 1;
      const id = (await one<{ id: string }>(
        `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency, delivery_address,
                                     delivery_type, delivery_type_reason)
         VALUES ($1, $2, $3, 20, 6, 26, 'AUD', '{}'::jsonb, $4, $5) RETURNING id::text AS id`,
        [`EFY-LG${n}`, customer, o.status ?? "paid", o.type ?? null, o.type ? "in_coverage" : null],
      )).id;
      const sf = (await one<{ id: string }>(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method) VALUES ($1, $2, 1, 20, $3, 'same_day') RETURNING id::text AS id`,
        [id, shop, o.withdrawn ? "withdrawn" : "collected"],
      )).id;
      if (o.arrived) await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 's')`, [sf]);
      if (o.refunded) {
        await pool.query(
          `INSERT INTO public.refund (order_id, kind, amount, reason, note, idempotency_key, actor_kind, actor_sub, status)
           VALUES ($1, 'goodwill', $2::numeric, 'goodwill', 'n', $3, 'back_office', 's', 'succeeded')`, [id, o.refunded, `lg-${n}`]);
      }
      return id;
    };
    const open = await order({});                                   // old, paid, on its way
    const partRefund = await order({ refunded: "5.00" });           // part refunded: still to deliver
    await order({ arrived: true });                                 // delivered
    await order({ status: "canceled" });                            // cancelled
    await order({ refunded: "26.00" });                             // fully refunded
    await order({ withdrawn: true });                               // nothing left to deliver
    await order({ status: "pending_payment" });                     // never paid
    await order({ type: "effy" });                                  // sold under the new model

    const ids = (await pool.query<{ id: string }>(`SELECT o.id::text AS id FROM public."order" o WHERE ${LEGACY_OPEN_ORDER_SQL("o")} ORDER BY o.order_number`)).rows.map((r) => r.id);
    expect(ids).toEqual([open, partRefund]);
    expect(await legacyOpenOrders(pool)).toEqual({ open: 2, lastClosedAt: null });

    // Close them: the count reaches zero and says when the last one closed.
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub)
                      SELECT sf.id, 'staff_recorded', 's' FROM public.shop_fulfillment sf WHERE sf.order_id = ANY($1::uuid[])`, [[open, partRefund]]);
    const done = await legacyOpenOrders(pool);
    expect(done.open).toBe(0);
    expect(done.lastClosedAt).toBeInstanceOf(Date);
  });
});
