import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return { ...(await importOriginal<typeof import("@effy/edge-shared")>()), query, pooled: { query } };
});

import { migrationSql } from "@effy/edge-shared/testing";
import { createFirstParcels } from "@effy/edge-shared/labels";

import { getShopDetail } from "./repository";

/** Labels that did not scan, over 30 days. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

d("091 - label scanning per shop", () => {
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

  it("counts the last 30 days' hand-overs of this shop's packages, scanned and not; older ones are ignored", async () => {
    const one = async <T>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as T;
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c1', 'c1@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-S1', 10, 12, '{}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`, [cust.id]);
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('LS1', 'Labels') RETURNING id`);
    const other = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('LS2', 'Other') RETURNING id`);
    const pkg = await one<{ id: string }>(`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, shop.id]);
    const otherPkg = await one<{ id: string }>(`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, other.id]);
    const drv = await one<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d1', 'Ada', 'ada@effyshopping.com') RETURNING id`);
    const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
    const round = await one<{ id: string }>(`INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', now()) RETURNING id`, [wave.id, drv.id]);
    // A hand-over is per bag: each package gets its bag 1 first.
    const add = async (pkgId: string, method: string, daysAgo: number) => {
      await createFirstParcels(pool, { packageIds: [pkgId] });
      await pool.query(
        `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, round_id, driver_id, step, handover_method, change_id, recorded_at)
         SELECT $1, p.id, 'driver', $2, $3, 'collect', $4, gen_random_uuid(), now() - make_interval(days => $5)
           FROM public.package_parcel p WHERE p.shop_fulfillment_id = $1 AND p.seq = 1`,
        [pkgId, round.id, drv.id, method, daysAgo]);
    };

    expect((await getShopDetail(shop.id))!.labelScanning).toEqual({ scanned: 0, notScanned: 0, sinceDays: 30 });

    await add(pkg.id, "scan", 1);
    await add(pkg.id, "scan", 2);
    await add(pkg.id, "typed", 3);
    await add(pkg.id, "manual", 40);   // outside the window
    await add(otherPkg.id, "manual", 1); // another shop's

    expect((await getShopDetail(shop.id))!.labelScanning).toEqual({ scanned: 2, notScanned: 1, sinceDays: 30 });
  });
});
