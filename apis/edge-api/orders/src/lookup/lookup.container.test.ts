import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});

import { migrationSql } from "@effy/edge-shared";
import { createFirstParcels } from "@effy/edge-shared/labels";

import { lookup } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

d("096 US5 — scan anything to find it", () => {
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

  it("finds a bag by label, by typed code and by order number; a miss is null; every lookup is a read", async () => {
    const one = async <T>(sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0] as T;
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c1', 'c1@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
       VALUES ($1, 'EFY-LK0001', 10, 12, '{}'::jsonb, 'paid') RETURNING id`, [cust.id]);
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('LK1', 'Shop') RETURNING id`);
    const pkg = await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 10) RETURNING id`, [order.id, shop.id]);
    await createFirstParcels(pool, { packageIds: [pkg.id] });
    const bag = await one<{ id: string; parcel_code: string }>(`SELECT id, parcel_code FROM public.package_parcel WHERE shop_fulfillment_id = $1`, [pkg.id]);

    const want = { orderId: order.id, orderNumber: "EFY-LK0001", fulfillmentId: pkg.id, parcelId: bag.id };
    expect(await lookup("staff-1", `EFY1:${bag.parcel_code}`, "scan")).toEqual(want);
    const grouped = `${bag.parcel_code.slice(0, 3)} ${bag.parcel_code.slice(3)}`.toLowerCase();
    expect(await lookup("staff-1", grouped, "typed")).toEqual(want);
    expect(await lookup("staff-1", "efy-lk0001", "typed")).toEqual({ orderId: order.id, orderNumber: "EFY-LK0001" });
    expect(await lookup("staff-1", "EFY1:22222X", "scan")).toBeNull();

    // A voided bag is still found, and says so (bag 1 can never be voided, so bag 2).
    const two = await one<{ id: string; parcel_code: string }>(
      `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared, voided_at)
       VALUES ($1, public.new_parcel_code(), 2, 'ambient', true, now()) RETURNING id, parcel_code`, [pkg.id]);
    expect(await lookup("staff-1", two.parcel_code, "typed")).toMatchObject({ parcelId: two.id, voided: true });

    const reads = await pool.query(
      `SELECT actor_kind, admin_sub, surface, step, read_method, server_outcome FROM public.label_read ORDER BY received_at, id`);
    expect(reads.rows).toHaveLength(5);
    expect(reads.rows.every((r) => r.actor_kind === "admin_staff" && r.admin_sub === "staff-1" && r.surface === "back_office" && r.step === "lookup")).toBe(true);
    expect(reads.rows.map((r) => r.server_outcome)).toContain("not_found");
  });
});
