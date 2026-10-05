import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { driverScope, opsScope, shopScope } from "./scope";

/**
 * 071 — whose updates a person may hear, against the REAL schema. The statements name columns and
 * status values; this proves the migrations define those columns and allow those values, and that
 * every way access ends (FR-023) yields "no scope".
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopA: string;
let shopB: string;
let driverId: string;

d("071 — live scope against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    const shop = async (code: string) =>
      (await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' shop') RETURNING id`,
        [code],
      )).rows[0]!.id;
    shopA = await shop("LVA");
    shopB = await shop("LVB");
    const closed = await shop("LVC");
    await pool.query(`UPDATE public.shop SET status = 'suspended' WHERE id = $1`, [closed]);

    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, shop_id, status) VALUES
         ('staff-a', $1, 'active'),
         ('staff-disabled', $1, 'disabled'),
         ('staff-unassigned', NULL, 'active'),
         ('staff-moved', $1, 'active'),
         ('staff-closed-shop', $2, 'active')`,
      [shopA, closed],
    );

    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('driver-a', 'A', 'a@example.test') RETURNING id`,
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.driver (cognito_sub, name, work_email, status) VALUES ('driver-off', 'B', 'b@example.test', 'suspended')`,
    );

    await pool.query(
      `INSERT INTO admin.staff (cognito_sub, email, status) VALUES
         ('admin-a', 'admin-a@example.test', 'active'),
         ('admin-off', 'admin-off@example.test', 'disabled')`,
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("an active operator at an active shop hears that shop", async () => {
    expect(await shopScope("staff-a", pool)).toBe(shopA);
  });

  it.each(["staff-disabled", "staff-unassigned", "staff-closed-shop", "staff-nobody"])(
    "%s hears no shop",
    async (sub) => {
      expect(await shopScope(sub, pool)).toBeNull();
    },
  );

  it("an operator moved to another shop hears the new one, not the old", async () => {
    await pool.query(`UPDATE public.shop_staff SET shop_id = $1 WHERE cognito_sub = 'staff-moved'`, [shopB]);
    expect(await shopScope("staff-moved", pool)).toBe(shopB);
  });

  it("an active driver hears their own work; a suspended or unknown one hears nothing", async () => {
    expect(await driverScope("driver-a", pool)).toBe(driverId);
    expect(await driverScope("driver-off", pool)).toBeNull();
    expect(await driverScope("driver-nobody", pool)).toBeNull();
  });

  it("an active back-office account hears operations; a disabled or unknown one does not", async () => {
    expect(await opsScope("admin-a", pool)).toBe(true);
    expect(await opsScope("admin-off", pool)).toBe(false);
    expect(await opsScope("admin-nobody", pool)).toBe(false);
  });

  it("a subject from one audience has no scope in another", async () => {
    expect(await shopScope("driver-a", pool)).toBeNull();
    expect(await driverScope("staff-a", pool)).toBeNull();
    expect(await opsScope("staff-a", pool)).toBe(false);
  });
});
