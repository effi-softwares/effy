import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { activityEntries, migrationSql } from "@effy/edge-shared/testing";

import { createFirstParcels } from "@effy/edge-shared/labels";

import { orderActivitySource } from "../activity/order";
import { parcels } from "./repository";

/** Each package's hand-overs, oldest first, with the driver. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

d("091 — hand-overs on the order", () => {
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

  it("lists a package's hand-overs oldest first, and nothing for a package with none", async () => {
    const one = async <T>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as T;
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c1', 'c1@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-H1', 10, 12, '{}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`, [cust.id]);
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SH1', 'Shop') RETURNING id`);
    const a = await one<{ id: string }>(`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, shop.id]);
    const shop2 = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SH2', 'Shop 2') RETURNING id`);
    const b = await one<{ id: string }>(`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, shop2.id]);
    const drv = await one<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d1', 'Ada', 'ada@effyshopping.com') RETURNING id`);
    const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
    const round = await one<{ id: string }>(`INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', now()) RETURNING id`, [wave.id, drv.id]);
    await createFirstParcels(pool, { packageIds: [a.id, b.id] });
    const bag = await one<{ id: string; parcel_code: string }>(`SELECT id, parcel_code FROM public.package_parcel WHERE shop_fulfillment_id = $1`, [a.id]);
    const staff = await one<{ id: string }>(
      `INSERT INTO public.shop_staff (shop_id, cognito_sub, email, name) VALUES ($1, 's1', 's1@effyshopping.com', 'Sam') RETURNING id`, [shop.id]);
    const add = (step: string, method: string, at: string) => pool.query(
      `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, round_id, driver_id, step, handover_method, change_id, recorded_at)
       VALUES ($1, $2, 'driver', $3, $4, $5, $6, gen_random_uuid(), $7)`, [a.id, bag.id, round.id, drv.id, step, method, at]);
    await add("deliver", "manual", "2026-10-16T05:00:00Z");
    await add("collect", "scan", "2026-10-16T01:00:00Z");
    // Shop staff record the pack: no driver on the row, and it still lists.
    await pool.query(
      `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, shop_staff_id, step, handover_method, change_id, recorded_at)
       VALUES ($1, $2, 'shop_staff', $3, 'pack', 'scan', gen_random_uuid(), '2026-10-16T00:30:00Z')`, [a.id, bag.id, staff.id]);

    // In the order's activity (104), oldest first: each bag's step, how, and who — a shop's pack named by its staff.
    const rows = (await activityEntries(pool, orderActivitySource(order.id))).filter((e) => e.kind === "handover").reverse();
    expect(rows.map((r) => [r.title, r.detail, r.actor, r.subject])).toEqual([
      ["Packed at the shop", "scanned", "Sam", `Shop · bag ${bag.parcel_code}`],
      ["Collected", "scanned", "Ada", `Shop · bag ${bag.parcel_code}`],
      ["Delivered", "by hand", "Ada", `Shop · bag ${bag.parcel_code}`],
    ]);
    expect(rows.some((r) => r.subject?.startsWith("Shop 2"))).toBe(false);

    // One bag each; the latest step decides custody.
    const bags = await parcels([a.id, b.id]);
    expect(bags.map((x) => [x.package_id, x.seq, x.of, x.voided, x.print_count, x.last_step])).toEqual([
      [a.id, 1, 1, false, 0, "deliver"],
      [b.id, 1, 1, false, 0, null],
    ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))));
  });
});
