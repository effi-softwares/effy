import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 070 — the shop refund gate against the REAL schema (ported from the retired backend's
 * shop-gate suite). The join was read off the migrations, and an invented column name here would
 * typecheck, pass every mocked test, and refuse every manager in production.
 *
 * The statement is read from the repository's own source so this runs the query that ships.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let sql: string;
let orderId: string;
let shopA: string;

const gate = async (sub: string, order = orderId) => (await pool.query<{ shop_id: string }>(sql, [sub, order])).rows[0]?.shop_id ?? null;

async function staff(sub: string, shopId: string | null, role: string | null, status = "active") {
  const { id } = (
    await pool.query<{ id: string }>(
      `INSERT INTO public.shop_staff (cognito_sub, email, shop_id, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      [sub, `${sub}@example.test`, shopId, status],
    )
  ).rows[0]!;
  if (role) await pool.query(`INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, $2)`, [id, role]);
}

d("070 — who may refund part of an order from the shop console", () => {
  beforeAll(async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
    sql = /const AUTHORIZE_SHOP_REFUND = `([\s\S]*?)`;/.exec(src)![1]!;

    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    const shops = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name, status) VALUES ('GTA', 'Gate A', 'active'), ('GTB', 'Gate B', 'active'), ('GTS', 'Suspended', 'suspended')
         RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id);
    shopA = shops[0]!;
    const customer = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('gt-c', 'gt@example.test') RETURNING id`)).rows[0]!.id;
    orderId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_address)
         VALUES ($1, 'EFY-GATE01', 'paid', 'AUD', 10, 10, '{}'::jsonb) RETURNING id::text AS id`,
        [customer],
      )
    ).rows[0]!.id;
    // Shop A has TWO rows' worth of reasons to match; the suspended shop is on the order too.
    for (const s of [shops[0], shops[2]]) {
      await pool.query(`INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount) VALUES ($1, $2, 1, 5)`, [orderId, s]);
    }

    await staff("mgr-a", shops[0]!, "shop_manager");
    await staff("staff-a", shops[0]!, "shop_staff");
    await staff("mgr-a-disabled", shops[0]!, "shop_manager", "disabled");
    await staff("mgr-b", shops[1]!, "shop_manager"); // a manager, at a shop NOT on this order
    await staff("mgr-suspended", shops[2]!, "shop_manager");
    await staff("mgr-unassigned", null, "shop_manager");
    await staff("no-role", shops[0]!, null);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("grants an active manager of an active shop that has a portion of the order — as THAT shop", async () => {
    expect(await gate("mgr-a")).toBe(shopA);
  });

  it.each([
    ["shop staff (not a manager)", "staff-a"],
    ["a disabled manager", "mgr-a-disabled"],
    ["a manager whose shop is not on this order", "mgr-b"],
    ["a manager of a suspended shop, even one on the order", "mgr-suspended"],
    ["a manager with no shop assigned", "mgr-unassigned"],
    ["an operator with no role", "no-role"],
    ["someone the platform has never met", "stranger"],
  ])("refuses %s", async (_who, sub) => {
    expect(await gate(sub)).toBeNull();
  });

  it("refuses an order that does not exist", async () => {
    expect(await gate("mgr-a", "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
