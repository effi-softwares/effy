import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Against real Postgres: the row lock, the status-guarded UPDATE, the unique and the attribution check
 * are what make `recordArrival` safe. Only the transport is replaced (no RDS ca locally).
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const completion = await import("../../../shared/src/lib/order-completion");
  return {
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    // A real transaction: `FOR UPDATE` only serialises inside one.
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    enqueueOrderDeliveredIfComplete: completion.enqueueOrderDeliveredIfComplete,
  };
});

import { OrderActionError } from "../lib/errors";
import { recordArrival } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";
const ACTOR = "staff-sub-admin";

describe.skipIf(!RUN)("recordArrival - against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;

    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE public.package_arrival, public.carrier_handoff, public.fulfillment_event,
               public.notification_request, admin.audit_log, public.order_package_delivery,
               public.shop_fulfillment, public."order", public.customer, public.shop
      RESTART IDENTITY CASCADE`);
  });

  interface Seeded {
    orderId: string;
    packages: string[];
  }

  async function seedOrder(
    methods: ("standard" | "same_day")[],
    status = "collected",
  ): Promise<Seeded> {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ('cust-sub', 'shopper@example.com') RETURNING id`,
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, delivery_address, item_subtotal_amount, grand_total_amount,
                                   delivery_type, delivery_type_reason, courier_estimate)
       VALUES ($1, 'EFY-ARR1', 'paid', '{}', 10, 10, 'courier', 'out_of_coverage', '2–4 business days') RETURNING id`,
      [c.rows[0]!.id],
    );
    const orderId = o.rows[0]!.id;
    const packages: string[] = [];
    for (const [i, method] of methods.entries()) {
      const s = await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name) VALUES ($1, $2) RETURNING id`,
        [`S${i}`, `Shop ${i}`],
      );
      const f = await pool.query<{ id: string }>(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
         VALUES ($1, $2, $3, 1, 10) RETURNING id`,
        [orderId, s.rows[0]!.id, status],
      );
      await pool.query(
        `INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, $3)`,
        [orderId, s.rows[0]!.id, method],
      );
      packages.push(f.rows[0]!.id);
    }
    return { orderId, packages };
  }

  async function seedHandoff(fulfillmentId: string, reference: string | null = null) {
    await pool.query(
      `INSERT INTO public.carrier_handoff (shop_fulfillment_id, reference, recorded_by_sub)
       VALUES ($1, $2, $3)`,
      [fulfillmentId, reference, ACTOR],
    );
  }

  const arrive = (fulfillmentId: string, changeId = "chg-1") =>
    recordArrival({ fulfillmentId, actorSub: ACTOR, changeId });

  it("advances a handed-over package to delivered and finishes a single-package order", async () => {
    const { orderId, packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);

    const result = await arrive(packages[0]!);

    expect(result.created).toBe(true);
    expect(result.orderFinished).toBe(true);
    expect(result.orderId).toBe(orderId);

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM public.shop_fulfillment WHERE id = $1`,
      [packages[0]!],
    );
    expect(status.rows[0]!.status).toBe("delivered");
  });

  /** Five presses: one arrival, one push, one email, and the original time. */
  it("records ONE arrival however many times it is called, preserving the original time", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);

    const first = await arrive(packages[0]!);
    const repeats = [];
    for (let i = 0; i < 4; i++) repeats.push(await arrive(packages[0]!, `chg-${i + 2}`));

    expect(first.created).toBe(true);
    expect(repeats.every((r) => !r.created)).toBe(true);
    for (const r of repeats) expect(r.arrivedAt).toBe(first.arrivedAt);

    const arrivals = await pool.query(`SELECT 1 FROM public.package_arrival`);
    expect(arrivals.rowCount).toBe(1);

    const notifications = await pool.query<{ channel: string }>(
      `SELECT channel FROM public.notification_request WHERE type = 'order_delivered' ORDER BY channel`,
    );
    expect(notifications.rows.map((r) => r.channel)).toEqual(["email", "push"]);
  });

  /** Concurrent, not sequential: a sequential pair passes while the race is live. */
  it("survives two operators recording the same arrival at the same instant", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);

    const results = await Promise.all([
      arrive(packages[0]!, "chg-a"),
      arrive(packages[0]!, "chg-b"),
    ]);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => !r.created)).toHaveLength(1);
    expect(results[0]!.arrivedAt).toBe(results[1]!.arrivedAt);

    const arrivals = await pool.query(`SELECT 1 FROM public.package_arrival`);
    expect(arrivals.rowCount).toBe(1);
    const notifications = await pool.query(`SELECT 1 FROM public.notification_request`);
    expect(notifications.rowCount).toBe(2);
  });

  /** The refusal names the missing handover. */
  it("refuses an arrival on a package with no recorded handover", async () => {
    const { packages } = await seedOrder(["standard"]);

    await expect(arrive(packages[0]!)).rejects.toThrow(OrderActionError);
    await expect(arrive(packages[0]!)).rejects.toMatchObject({ reason: "no_handoff" });

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM public.shop_fulfillment WHERE id = $1`,
      [packages[0]!],
    );
    expect(status.rows[0]!.status, "a refused arrival must not advance the package").toBe(
      "collected",
    );
  });

  it("refuses an arrival on a package still at its shop", async () => {
    const { packages } = await seedOrder(["standard"], "ready_for_pickup");
    await expect(arrive(packages[0]!)).rejects.toMatchObject({ reason: "not_collected" });
  });

  it("refuses an arrival on a package that does not exist", async () => {
    await expect(
      arrive("00000000-0000-0000-0000-000000000000"),
    ).rejects.toMatchObject({ reason: "not_found" });
  });

  /** A rollup, not a max: the order is delivered only when every package has arrived. */
  it("does not finish a mixed order until EVERY package has arrived", async () => {
    const { packages } = await seedOrder(["standard", "standard"]);
    await seedHandoff(packages[0]!);
    await seedHandoff(packages[1]!);

    const first = await arrive(packages[0]!);
    expect(first.created).toBe(true);
    expect(first.orderFinished, "one of two packages is not the whole order").toBe(false);

    let notifications = await pool.query(`SELECT 1 FROM public.notification_request`);
    expect(notifications.rowCount, "no message until the order is actually complete").toBe(0);

    const second = await arrive(packages[1]!);
    expect(second.orderFinished).toBe(true);

    notifications = await pool.query(`SELECT 1 FROM public.notification_request`);
    expect(notifications.rowCount).toBe(2);
  });

  it("writes an attributed audit entry", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);
    await arrive(packages[0]!);

    const audit = await pool.query<{ actor_sub: string; action: string }>(
      `SELECT actor_sub, action FROM admin.audit_log`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.actor_sub).toBe(ACTOR);
    expect(audit.rows[0]!.action).toBe("order.arrival_recorded");
  });

  it("appends the state change to fulfillment_event", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);
    await arrive(packages[0]!);

    const events = await pool.query<{ from_status: string; to_status: string }>(
      `SELECT from_status, to_status FROM public.fulfillment_event`,
    );
    expect(events.rows).toEqual([{ from_status: "collected", to_status: "delivered" }]);
  });

  /** A handover with no reference is a complete record. */
  it("accepts an arrival on a handover recorded without a carrier reference", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!, null);

    const result = await arrive(packages[0]!);
    expect(result.created).toBe(true);
    expect(result.orderFinished).toBe(true);
  });
});
