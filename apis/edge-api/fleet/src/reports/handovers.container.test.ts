import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { migrationSql } from "@effy/edge-shared";
import { createFirstParcels } from "@effy/edge-shared/labels";

import { handoverReport } from "./handovers";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

d("096 US6 — the hand-over report", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("counts every hand-over kind, every refusal and every missing bag, and the per-1,000 figure", async () => {
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('RPT', 'Report Shop') RETURNING id`);
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c1', 'c1@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
       VALUES ($1, 'EFY-RPT001', 10, 12, '{}'::jsonb, 'paid') RETURNING id`, [cust.id]);
    const pkg = await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, shop.id]);
    await createFirstParcels(pool, { packageIds: [pkg.id] });
    const bag = await one<{ id: string }>(`SELECT id FROM public.package_parcel WHERE shop_fulfillment_id = $1`, [pkg.id]);
    const drv = await one<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d1', 'Ada', 'ada@effyshopping.com') RETURNING id`);
    const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
    const round = await one<{ id: string }>(`INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', now()) RETURNING id`, [wave.id, drv.id]);
    const staff = await one<{ id: string }>(`INSERT INTO public.shop_staff (shop_id, cognito_sub, email) VALUES ($1, 's1', 's1@effyshopping.com') RETURNING id`, [shop.id]);

    const driverHandover = (step: string, method: string) => pool.query(
      `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, driver_id, round_id, step, handover_method, change_id)
       VALUES ($1, $2, 'driver', $3, $4, $5, $6, gen_random_uuid())`, [pkg.id, bag.id, drv.id, round.id, step, method]);
    await driverHandover("collect", "scan");
    await driverHandover("load", "typed");
    await driverHandover("deliver", "manual");
    await pool.query(
      `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, shop_staff_id, step, handover_method, change_id)
       VALUES ($1, $2, 'shop_staff', $3, 'pack', 'scan', gen_random_uuid())`, [pkg.id, bag.id, staff.id]);

    const readRow = (client: string | null, server: string) => pool.query(
      `INSERT INTO public.label_read (client_read_id, actor_kind, driver_id, surface, step, raw, read_method, client_outcome, server_outcome)
       VALUES (gen_random_uuid(), 'driver', $1, 'driver_app', 'collect', 'X', 'scan', $2, $3)`, [drv.id, client, server]);
    await readRow("accepted", "accepted");
    await readRow("belongs_elsewhere", "belongs_elsewhere");
    await readRow("already_counted", "already_counted");
    await readRow("accepted", "voided"); // voided while the phone was offline: a disagreement

    await pool.query(
      `INSERT INTO public.package_hold (shop_fulfillment_id, parcel_id, round_id, driver_id, step, reason, change_id)
       VALUES ($1, $2, $3, $4, 'collect', 'not_at_shop', gen_random_uuid())`, [pkg.id, bag.id, round.id, drv.id]);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
    const r = await handoverReport(today, today);
    expect(r.overall).toEqual({ scan: 2, typed: 1, manual: 1 });
    expect(r.byShop).toEqual([{ shopId: shop.id, shopName: "Report Shop", scan: 2, typed: 1, manual: 1 }]);
    expect(r.byDriver).toEqual([{ driverId: drv.id, driverName: "Ada", scan: 1, typed: 1, manual: 1 }]);
    expect(r.byActor.sort((a, b) => a.actor.localeCompare(b.actor))).toEqual([
      { actor: "driver", scan: 1, typed: 1, manual: 1 },
      { actor: "shop_staff", scan: 1, typed: 0, manual: 0 },
    ]);
    expect(r.refused.map((x) => [x.outcome, x.count]).sort()).toEqual([["already_counted", 1], ["belongs_elsewhere", 1], ["voided", 1]]);
    expect(r.missing).toEqual([{ reason: "not_at_shop", count: 1 }]);
    // belongs_elsewhere + voided + the missing bag; the repeat scan is not an exception. 3 of 4 → 750.
    expect(r.exceptions).toBe(3);
    expect(r.exceptionsPer1000).toBe(750);
    expect(r.disagreements).toBe(1);

    // An empty period has no rate, not a zero one.
    expect((await handoverReport("2020-01-01", "2020-01-02")).exceptionsPer1000).toBeNull();
    await expect(handoverReport("2026-01-01", "2026-12-31")).rejects.toMatchObject({ kind: "validation" });
  });
});
