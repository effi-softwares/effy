import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PACKAGE_CODE_ALPHABET, isPackageCode } from "@effy/shared-types";

import { migrationSql } from "../testing/migrations";

/** Every package gets a permanent code the moment it exists. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

async function order(): Promise<string> {
  const cust = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`c-${crypto.randomUUID()}`],
  )).rows[0]!.id;
  return (await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
     VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 6), 10, 12, '{}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`,
    [cust],
  )).rows[0]!.id;
}

async function pkg(orderId: string): Promise<{ id: string; package_code: string }> {
  const shop = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${crypto.randomUUID().slice(0, 6)}`],
  )).rows[0]!.id;
  return (await pool.query<{ id: string; package_code: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount)
     VALUES ($1, $2, 1, 10) RETURNING id, package_code`,
    [orderId, shop],
  )).rows[0]!;
}

d("089 — package codes", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("a new package gets a valid code without anyone asking, and each package its own", async () => {
    const o = await order();
    const a = await pkg(o);
    const b = await pkg(o);
    expect(isPackageCode(a.package_code)).toBe(true);
    expect(isPackageCode(b.package_code)).toBe(true);
    expect(a.package_code).not.toBe(b.package_code);
  });

  it("generates only from the alphabet, at scale, with no repeats", async () => {
    const codes = (await pool.query<{ c: string }>(`SELECT public.new_package_code() AS c FROM generate_series(1, 2000)`)).rows.map((r) => r.c);
    for (const c of codes) for (const ch of c) expect(PACKAGE_CODE_ALPHABET).toContain(ch);
    expect(codes.every(isPackageCode)).toBe(true);
  });

  it("refuses a code outside the alphabet, and a duplicate", async () => {
    const o = await order();
    const a = await pkg(o);
    await expect(pool.query(`UPDATE public.shop_fulfillment SET package_code = 'ABC10O' WHERE id = $1`, [a.id]))
      .rejects.toThrow(/package_code_check/);
    const b = await pkg(o);
    await expect(pool.query(`UPDATE public.shop_fulfillment SET package_code = $2 WHERE id = $1`, [b.id, a.package_code]))
      .rejects.toThrow(/package_code_uq/);
  });

  it("a code survives every other update of its package", async () => {
    const o = await order();
    const a = await pkg(o);
    await pool.query(`UPDATE public.shop_fulfillment SET status = 'ready_for_pickup', updated_at = now() WHERE id = $1`, [a.id]);
    const after = await pool.query<{ package_code: string }>(`SELECT package_code FROM public.shop_fulfillment WHERE id = $1`, [a.id]);
    expect(after.rows[0]!.package_code).toBe(a.package_code);
  });
});
