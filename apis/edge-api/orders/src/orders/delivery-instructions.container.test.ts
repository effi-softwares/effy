import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Against the real schema (the transcribed schema beside it cannot prove a column exists). */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  };
});

import { migrationSql } from "@effy/edge-shared/testing";

import { findOrder } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

async function makeOrder(handover: string | null, note: string | null): Promise<string> {
  const c = await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const o = await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                 delivery_address, status, delivery_handover, delivery_note, delivery_type, delivery_type_reason)
     VALUES ($1, 'EFY-' || substr(md5(random()::text), 1, 6), 10, 12, '{"line1":"1 Test St"}'::jsonb,
             'paid', $2, $3, 'effy', 'in_coverage') RETURNING id`,
    [c.rows[0]!.id, handover, note],
  );
  return o.rows[0]!.id;
}

d("066 — delivery instructions on the back-office order read", () => {
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

  it("returns what the customer said, as it was stored", async () => {
    const id = await makeOrder("leave_at_door", "Side gate, code 4411");
    const row = await findOrder(id);
    expect(row!.delivery_handover).toBe("leave_at_door");
    expect(row!.delivery_note).toBe("Side gate, code 4411");
  });

  it("returns null for both when the customer said nothing", async () => {
    const row = await findOrder(await makeOrder(null, null));
    expect(row!.delivery_handover).toBeNull();
    expect(row!.delivery_note).toBeNull();
  });

  /** Not inside the address snapshot other audiences read. */
  it("⚠ the address snapshot carries neither value", async () => {
    const row = await findOrder(await makeOrder("meet_at_door", "SENTINEL-NOTE"));
    expect(JSON.stringify(row!.delivery_address)).not.toContain("SENTINEL-NOTE");
    expect(JSON.stringify(row!.delivery_address)).not.toContain("meet_at_door");
  });
});
