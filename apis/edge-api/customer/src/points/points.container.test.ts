import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 074 US1 — the customer's own balance and history, against the REAL migrations.
 *
 * Proves what the customer is shown: expired lots and live holds do not count, history lines carry
 * the customer's words and never the staff note, and a barred account is refused.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
}));

import { migrationSql, transactorFor } from "@effy/edge-shared";
import { credit, hold, updateSettings } from "@effy/edge-shared/points";

import { CustomerBarredError } from "../customer/service";
import { createPointsService } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("074 — the customer's points", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let seq = 0;

  async function customer(status = "active") {
    const sub = `cp-${++seq}`;
    const id = (
      await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email, status) VALUES ($1, $2, $3) RETURNING id::text AS id`, [sub, `${sub}@example.test`, status])
    ).rows[0]!.id;
    return { sub, id };
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 6 });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("shows only unexpired points not held by a checkout, the next expiry, and customer words with no note", async () => {
    const { sub, id } = await customer();
    const transact = transactorFor(pool);
    const now = new Date();
    await transact((tx) => updateSettings(tx, { expiryMonths: 1 }, "admin"));
    await transact((tx) => credit(tx, { customerId: id, points: 300, kind: "staff_credit", reason: "late_delivery", note: "INTERNAL ONLY", author: { kind: "staff", sub: "s" }, now }));
    await transact((tx) => updateSettings(tx, { expiryMonths: 12 }, "admin"));
    await transact((tx) => credit(tx, { customerId: id, points: 700, kind: "staff_credit", reason: "goodwill", author: { kind: "staff", sub: "s" }, now }));
    const orderId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
         VALUES ($1, 'EFY-CP0001', 'pending_payment', 'AUD', 10, 10, 0, '{}'::jsonb) RETURNING id::text AS id`,
        [id],
      )
    ).rows[0]!.id;
    await transact((tx) => hold(tx, { customerId: id, orderId, points: 100, now }));

    const svc = createPointsService({ db: pool, now: () => now });
    const balance = await svc.overview(sub, undefined, 10);
    expect(balance).toMatchObject({ points: 900, valueAmount: "9.00", centsPerPoint: 1 });
    expect(balance.nextExpiry?.points).toBe(300);

    // A month and a bit later the 300 have expired with no sweep run.
    const later = createPointsService({ db: pool, now: () => new Date(now.getTime() + 40 * 86_400_000) });
    expect((await later.overview(sub, undefined, 10)).points).toBe(700);

    const page = balance.history;
    expect(page.entries.map((e) => e.words)).toEqual(["A thank-you from Effy", "Sorry your order was late"]);
    expect(JSON.stringify(page)).not.toContain("INTERNAL ONLY");
  });

  it("refuses a barred account", async () => {
    const { sub } = await customer("barred");
    await expect(createPointsService({ db: pool }).overview(sub, undefined, 10)).rejects.toBeInstanceOf(CustomerBarredError);
  });
});
