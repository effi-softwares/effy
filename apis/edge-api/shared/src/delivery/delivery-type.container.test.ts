import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { recordDeliveryType } from "./delivery-type";

/**
 * 079 — the order's delivery type against the REAL schema: who takes a package (old orders and new),
 * the history's one writer, and the privileges that keep the history a history.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let customerId: string;

async function tx<T>(fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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
}

let n = 0;
async function order(type: "effy" | "courier" | null, reason: string | null = null, estimate: string | null = null): Promise<string> {
  n += 1;
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO public."order"
           (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency, delivery_address,
            delivery_type, delivery_type_reason, courier_estimate)
       VALUES ($1, $2, 'paid', 10, 0, 10, 'AUD', '{}'::jsonb, $3, $4, $5) RETURNING id::text AS id`,
      [`EFY-DT${String(n).padStart(3, "0")}`, customerId, type, reason, estimate],
    )
  ).rows[0]!.id;
}

const history = async (orderId: string) =>
  (
    await pool.query(
      `SELECT from_type, to_type, reason, actor_kind, actor_sub, note FROM public.order_delivery_type_change WHERE order_id = $1 ORDER BY created_at, from_type NULLS FIRST`,
      [orderId],
    )
  ).rows;

d("079 — the order's delivery type", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    customerId = (
      await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('sub-dt', 'dt@example.test') RETURNING id::text AS id`)
    ).rows[0]!.id;
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("P11 — who takes a package, for every kind of order there has ever been", async () => {
    const SLOT = "00000000-0000-0000-0000-0000000000a1";
    const by = async (type: string | null, method: string | null, slot: string | null) =>
      (await pool.query<{ by: string }>(`SELECT public.package_delivered_by($1, $2, $3::uuid) AS by`, [type, method, slot])).rows[0]!.by;

    // Placed under 079: the order says, and nothing about the package argues.
    expect(await by("effy", "same_day", SLOT)).toBe("effy");
    expect(await by("effy", "standard", SLOT)).toBe("effy");
    expect(await by("courier", "standard", null)).toBe("courier");
    // ⚠ A staff change (E7) moves a paid Effy order to a courier: its packages still carry the window
    // they were sold, and the ORDER's type wins.
    expect(await by("courier", "standard", SLOT)).toBe("courier");
    expect(await by("courier", "same_day", SLOT)).toBe("courier");

    // Placed before 079 (no type): read as what it effectively was.
    expect(await by(null, "same_day", SLOT), "069 same-day").toBe("effy");
    expect(await by(null, "same_day", null), "047 same-day, before windows").toBe("effy");
    expect(await by(null, "standard", null), "a carrier's").toBe("courier");
    expect(await by(null, "standard", SLOT), "078: standard, sold a window").toBe("effy");
    expect(await by(null, null, null), "before 047: no method at all").toBe("courier");
  });

  it("an order has a type and its reason together or neither; an estimate exactly when a courier delivers", async () => {
    await expect(order("effy", null)).rejects.toThrow(/order_delivery_type_pair_ck/);
    await expect(order(null, "in_coverage")).rejects.toThrow(/order_delivery_type_pair_ck/);
    await expect(order("courier", "out_of_coverage", null)).rejects.toThrow(/order_courier_estimate_ck/);
    await expect(order("effy", "in_coverage", "2–4 business days")).rejects.toThrow(/order_courier_estimate_ck/);
    await expect(order("effy", "because")).rejects.toThrow(/order_delivery_type_reason_ck/);
    await expect(order(null, null, "2–4 business days")).rejects.toThrow(/order_courier_estimate_ck/);
    await order("courier", "out_of_coverage", "2–4 business days");
    await order("effy", "in_coverage");
    await order(null);
  });

  it("P8 — the first entry is written once, however many times payment is finalised", async () => {
    const id = await order("courier", "out_of_coverage", "2–4 business days");
    expect(await tx((c) => recordDeliveryType(c, { orderId: id, actor: { kind: "checkout" } }))).toBe(true);
    expect(await tx((c) => recordDeliveryType(c, { orderId: id, actor: { kind: "checkout" } }))).toBe(false);
    expect(await history(id)).toEqual([
      { from_type: null, to_type: "courier", reason: "out_of_coverage", actor_kind: "checkout", actor_sub: null, note: null },
    ]);
  });

  it("an order placed before 079 gets no entry: its history is not invented", async () => {
    const id = await order(null);
    expect(await tx((c) => recordDeliveryType(c, { orderId: id, actor: { kind: "checkout" } }))).toBe(false);
    expect(await history(id)).toEqual([]);
  });

  it("a later change moves the order and adds an entry with who and why — the first entry stays", async () => {
    const id = await order("effy", "in_coverage");
    await tx((c) => recordDeliveryType(c, { orderId: id, actor: { kind: "checkout" } }));
    expect(
      await tx((c) => recordDeliveryType(c, {
        orderId: id, actor: { kind: "staff", sub: "sub-manager" },
        change: { to: "courier", reason: "staff_change", courierEstimate: "3–5 business days", note: "Van off the road" },
      })),
    ).toBe(true);
    expect(await history(id)).toEqual([
      { from_type: null, to_type: "effy", reason: "in_coverage", actor_kind: "checkout", actor_sub: null, note: null },
      { from_type: "effy", to_type: "courier", reason: "staff_change", actor_kind: "staff", actor_sub: "sub-manager", note: "Van off the road" },
    ]);
    expect((await pool.query(`SELECT delivery_type, delivery_type_reason, courier_estimate FROM public."order" WHERE id = $1`, [id])).rows[0]).toEqual({
      delivery_type: "courier", delivery_type_reason: "staff_change", courier_estimate: "3–5 business days",
    });
    // The same type again is not a change.
    expect(
      await tx((c) => recordDeliveryType(c, {
        orderId: id, actor: { kind: "staff", sub: "sub-manager" }, change: { to: "courier", reason: "staff_change", courierEstimate: "3–5 business days", note: null },
      })),
    ).toBe(false);
    expect(await history(id)).toHaveLength(2);
  });

  it("P14 — the role checkout runs as can add to the history and can never rewrite it", async () => {
    const id = await order("effy", "in_coverage");
    await tx((c) => recordDeliveryType(c, { orderId: id, actor: { kind: "checkout" } }));
    const shopper = await pool.connect();
    try {
      await shopper.query(`SET ROLE effy_shopper`);
      await expect(shopper.query(`UPDATE public.order_delivery_type_change SET reason = 'no_window' WHERE order_id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(shopper.query(`DELETE FROM public.order_delivery_type_change WHERE order_id = $1`, [id])).rejects.toThrow(/permission denied/);
      expect((await shopper.query(`SELECT count(*)::int AS n FROM public.order_delivery_type_change WHERE order_id = $1`, [id])).rows[0]).toEqual({ n: 1 });
    } finally {
      await shopper.query(`RESET ROLE`);
      shopper.release();
    }
  });
});
