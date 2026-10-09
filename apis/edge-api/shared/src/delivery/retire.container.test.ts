import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { LEGACY_OPEN_ORDER_SQL } from "./legacy";

/**
 * 083 P10 — the migration that REMOVES the old delivery arrangement, against a database that has
 * lived: built to the migration before it, given orders, then asked to apply.
 *
 * ⚠ It is not reversible, so what it must get right is when it REFUSES:
 *   · while an order sold the old way is still open — it is being finished by the path this removes;
 *   · on a database that has taken orders and was never switched to the new model.
 * And a database with no order at all (a new environment, every other container test) must proceed.
 *
 * ⚠ The migration restates "still open" in SQL, because it cannot import `LEGACY_OPEN_ORDER_SQL`.
 * This runs both against the same orders: if they ever disagree, the guard is protecting the wrong ones.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const RETIRE = "20261009150000";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shop: string;
let customer: string;
let n = 0;

const apply = () => pool.query(migrationSql({ from: RETIRE })).then(() => null, (e: Error) => e.message);
const openByDefinition = async () => Number((await pool.query(`SELECT count(*) AS n FROM public."order" o WHERE ${LEGACY_OPEN_ORDER_SQL("o")}`)).rows[0].n);
const columnExists = async (table: string, column: string) =>
  ((await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, column])).rowCount ?? 0) > 0;

async function order(o: { type?: "effy" | "courier" | null; status?: string; arrived?: boolean } = {}): Promise<{ id: string; sf: string }> {
  n += 1;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency, delivery_address,
                                 delivery_type, delivery_type_reason)
     VALUES ($1, $2, $3, 20, 6, 26, 'AUD', '{}'::jsonb, $4, $5) RETURNING id::text AS id`,
    [`EFY-RT${n}`, customer, o.status ?? "paid", o.type ?? null, o.type ? "in_coverage" : null],
  )).rows[0]!.id;
  const sf = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method) VALUES ($1, $2, 1, 20, 'collected', 'standard') RETURNING id::text AS id`,
    [id, shop],
  )).rows[0]!.id;
  if (o.arrived) await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 's')`, [sf]);
  return { id, sf };
}

d("083 — removing the old delivery arrangement (the migration)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql({ before: RETIRE }));
    await pool.query(`INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test') ON CONFLICT (id) DO NOTHING`);
    shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('RT', 'Shop') RETURNING id::text AS id`)).rows[0]!.id;
    customer = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('rt', 'rt@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    // A driver cleared under BOTH old methods for one area — two rows for one clearance.
    const driver = (await pool.query<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('rt-d', 'Dana', 'dana@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id, created_at) VALUES
         ($1, 'delivery', 'same_day', NULL, now() - interval '2 days'), ($1, 'delivery', 'standard', NULL, now() - interval '1 day'),
         ($1, 'collection', 'standard', NULL, now())`,
      [driver],
    );
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("⚠ refuses while an order sold the old way is still open — and changes nothing", async () => {
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = now() - interval '3 days' WHERE id = 1`);
    const open = await order();
    await order({ arrived: true });          // old, finished
    await order({ status: "canceled" });     // old, cancelled
    await order({ type: "effy" });           // new kind, open — not the migration's business
    expect(await openByDefinition()).toBe(1);

    expect(await apply()).toMatch(/083: 1 order\(s\) sold under the old delivery arrangement are still open/);
    expect(await columnExists("delivery_settings", "legacy_model_removed_at")).toBe(false);
    expect(await columnExists("driver_zone_capability", "method")).toBe(true);

    // Finished the way an order is finished; the guard and the shared definition agree it is closed.
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 's')`, [open.sf]);
    expect(await openByDefinition()).toBe(0);
  });

  it("⚠ refuses on a database that has taken orders and was never switched over — or whose switch is still ahead", async () => {
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = NULL WHERE id = 1`);
    expect(await apply()).toMatch(/083: the new delivery model is not switched on/);
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = now() + interval '1 hour' WHERE id = 1`);
    expect(await apply()).toMatch(/083: the new delivery model is not switched on/);
    expect(await columnExists("delivery_settings", "legacy_model_removed_at")).toBe(false);
  });

  it("applies once the model is on and no old order is open: the marker, one model, one row per clearance", async () => {
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = now() - interval '3 days' WHERE id = 1`);
    expect(await apply()).toBeNull();

    expect((await pool.query(`SELECT legacy_model_removed_at IS NOT NULL AS removed FROM public.delivery_settings WHERE id = 1`)).rows[0].removed).toBe(true);
    expect((await pool.query(`SELECT public.delivery_model_v2_at('2020-01-01'::timestamptz) AS on`)).rows[0].on).toBe(true);

    for (const [table, column] of [
      ["delivery_zone", "sameday_eligible"], ["delivery_fee_plan", "same_day_factor"], ["delivery_fee_plan", "standard_factor"],
      ["delivery_settings", "standard_lookahead_days"], ["delivery_settings", "carrier_lead_days"], ["delivery_settings", "courier_estimate_text"],
      ["order_package_delivery", "delivery_fee_amount"], ["shop_fulfillment", "delivery_fee_amount"],
      ["driver_round", "locked_by_sub"], ["driver_round", "locked_at"], ["driver_zone_capability", "method"],
    ] as const) expect(await columnExists(table, column), `${table}.${column}`).toBe(false);
    expect((await pool.query(`SELECT to_regclass('public.shop_sameday_exception') AS t`)).rows[0].t).toBeNull();

    // ⚠ Kept: what an old order was sold, and the order's own fee.
    expect(await columnExists("shop_fulfillment", "delivery_method")).toBe(true);
    expect(await columnExists("order_package_delivery", "method")).toBe(true);
    expect(await columnExists("order", "delivery_fee_amount")).toBe(true);

    // One row per clearance — the OLDEST kept — and a second "everywhere" is a conflict, not a row.
    const caps = (await pool.query(`SELECT function, (created_at < now() - interval '36 hours') AS oldest FROM public.driver_zone_capability ORDER BY function`)).rows;
    expect(caps).toEqual([{ function: "collection", oldest: false }, { function: "delivery", oldest: true }]);
    await expect(pool.query(`INSERT INTO public.driver_zone_capability (driver_id, function, zone_id) SELECT driver_id, 'delivery', NULL FROM public.driver_zone_capability LIMIT 1`))
      .rejects.toThrow(/driver_zone_capability_uq/);
  });

  it("every order is still there, and an old one still says who delivered it", async () => {
    expect(Number((await pool.query(`SELECT count(*) AS n FROM public."order"`)).rows[0].n)).toBe(4);
    const old = (await pool.query(
      `SELECT public.package_delivered_by(o.delivery_type, sf.delivery_method, NULL) AS by, sf.delivery_method AS method
         FROM public."order" o JOIN public.shop_fulfillment sf ON sf.order_id = o.id WHERE o.delivery_type IS NULL LIMIT 1`,
    )).rows[0];
    expect(old).toEqual({ by: "courier", method: "standard" });
  });
});

d("083 — the removal on a database with no order", () => {
  it("a new environment migrates from nothing, switch never set", async () => {
    const c = await new PostgreSqlContainer("postgres:16-alpine").start();
    const p = new Pool({ connectionString: c.getConnectionUri() });
    try {
      await p.query(migrationSql());
      expect((await p.query(`SELECT public.delivery_model_v2_at(now()) AS on`)).rows[0].on).toBe(true);
    } finally {
      await p.end();
      await c.stop();
    }
  }, 240_000);
});
