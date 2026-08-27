import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ THE LOAD-BEARING TEST OF THIS FEATURE, AGAINST REAL POSTGRESQL 16.
 *
 * Everything that makes `recordArrival` safe is a database behaviour, not a TypeScript behaviour:
 * the row lock that serialises two operators, the status-guarded UPDATE that makes a replay a no-op,
 * the UNIQUE that refuses a second arrival independently of this code, and the CHECK that makes an
 * unattributable staff assertion unrepresentable. A mock would agree with whatever the code does —
 * 027's R13 lesson, where every unit test passed because the fakes spoke Kotlin at both ends and
 * never crossed the wire.
 *
 * The transport is replaced (the shared `query` forces SSL with the embedded RDS CA bundle, which no
 * local container has). The SQL is NOT replaced — the statements under test are the real ones, and
 * so is the real `enqueueOrderDeliveredIfComplete` rollup from `@effy/edge-shared`.
 *
 * Gated on Docker, mirroring the Go side's `testing.Short()` convention.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  // The REAL completion rule — this test covers the shared rollup as well as the arrival.
  const completion = await import("../../../shared/src/lib/order-completion");
  return {
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    // ⚠ A REAL transaction with a REAL client, not the pool. `FOR UPDATE` only serialises inside
    // one, so a pool-backed stand-in would make the concurrency test pass while the race stayed live.
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

describe.skipIf(!RUN)("recordArrival — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;

    // The real shapes, including the constraints that ARE the guarantee. Deliberately minimal
    // otherwise: a future migration that renames a column fails here loudly rather than matching
    // nothing quietly.
    await pool.query(`
      CREATE SCHEMA admin;
      CREATE TABLE public.customer (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_sub text NOT NULL,
        email text
      );
      CREATE TABLE public."order" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL REFERENCES public.customer (id),
        order_number text NOT NULL DEFAULT 'EFY-TEST'
      );
      CREATE TABLE public.shop (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
      CREATE TABLE public.shop_fulfillment (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
        shop_id uuid NOT NULL REFERENCES public.shop (id),
        status text NOT NULL,
        state_changed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.order_package_delivery (
        order_id uuid NOT NULL, shop_id uuid NOT NULL, method text NOT NULL,
        CONSTRAINT opd_uq UNIQUE (order_id, shop_id)
      );
      CREATE TABLE public.delivery_task (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.carrier_handoff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id),
        reference text, carrier_name text,
        handed_over_at timestamptz NOT NULL DEFAULT now(),
        recorded_by_sub text NOT NULL, note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT carrier_handoff_package_uq UNIQUE (shop_fulfillment_id)
      );
      CREATE TABLE public.package_arrival (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id),
        arrived_at timestamptz NOT NULL DEFAULT now(),
        source text NOT NULL CHECK (source IN ('driver_proof','staff_recorded','carrier_signal')),
        recorded_by_sub text,
        delivery_task_id uuid REFERENCES public.delivery_task (id),
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT package_arrival_package_uq UNIQUE (shop_fulfillment_id),
        CONSTRAINT package_arrival_staff_attributed CHECK (
          source <> 'staff_recorded' OR recorded_by_sub IS NOT NULL
        )
      );
      CREATE TABLE public.fulfillment_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
        event_type text NOT NULL, from_status text, to_status text,
        occurred_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.notification_request (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_sub text NOT NULL, audience text NOT NULL, type text NOT NULL,
        channel text NOT NULL DEFAULT 'push' CHECK (channel IN ('push','email')),
        recipient_email text,
        payload jsonb NOT NULL, dedupe_key text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'pending',
        CONSTRAINT notification_request_email_addressed CHECK (
          channel <> 'email' OR recipient_email IS NOT NULL
        )
      );
      CREATE TABLE admin.audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_sub text NOT NULL, action text NOT NULL, target_type text NOT NULL,
        target_id uuid, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
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

  /** Seed an order with one package per entry in `methods`. */
  async function seedOrder(
    methods: ("standard" | "same_day")[],
    status = "collected",
    email: string | null = "shopper@example.com",
  ): Promise<Seeded> {
    const c = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ('cust-sub', $1) RETURNING id`,
      [email],
    );
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id) VALUES ($1) RETURNING id`,
      [c.rows[0]!.id],
    );
    const orderId = o.rows[0]!.id;
    const packages: string[] = [];
    for (const [i, method] of methods.entries()) {
      const s = await pool.query<{ id: string }>(
        `INSERT INTO public.shop (name) VALUES ($1) RETURNING id`,
        [`Shop ${i}`],
      );
      const f = await pool.query<{ id: string }>(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, status)
         VALUES ($1, $2, $3) RETURNING id`,
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

  /**
   * ⚠ SC-007. Five presses, one arrival, one push, one email — and critically the ORIGINAL time.
   * A "successful" repeat that silently moved `arrived_at` would corrupt the single fact this table
   * exists to hold, and would look exactly like success.
   */
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

  /**
   * ⚠ Run CONCURRENTLY, not sequentially. A sequential pair passes while the race is live — the
   * point is that `FOR UPDATE` serialises them.
   */
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
    expect(notifications.rowCount).toBe(2); // push + email, once
  });

  /** ⚠ FR-006 — the refusal that names the missing handover rather than just failing. */
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

  /**
   * ⚠ FR-007 — a rollup, not a max. This is the mixed order: one shop same-day, one standard. The
   * customer has not received their order until ALL of it has arrived, and must not be told
   * otherwise. The same rule `orders/stage.go` applies to the progress word.
   */
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
    expect(notifications.rowCount).toBe(2); // push + email, exactly once, for the ORDER
  });

  /** FR-014 — attributed, and retained where 009 put every other back-office action. */
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

  /** The append-only accountability record the shop console already reads (020 FR-019a). */
  it("appends the state change to fulfillment_event", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!);
    await arrive(packages[0]!);

    const events = await pool.query<{ from_status: string; to_status: string }>(
      `SELECT from_status, to_status FROM public.fulfillment_event`,
    );
    expect(events.rows).toEqual([{ from_status: "collected", to_status: "delivered" }]);
  });

  /**
   * ⚠ A customer with no address on file must still get their PUSH. Failing the whole arrival over a
   * missing email would mean an operational record cannot be written because of a contact detail.
   */
  it("still records the arrival and the push when the customer has no email", async () => {
    const { packages } = await seedOrder(["standard"], "collected", null);
    await seedHandoff(packages[0]!);

    const result = await arrive(packages[0]!);
    expect(result.created).toBe(true);

    const notifications = await pool.query<{ channel: string }>(
      `SELECT channel FROM public.notification_request`,
    );
    expect(notifications.rows.map((r) => r.channel)).toEqual(["push"]);
  });

  /** A handover with NO reference is a complete record (FR-003) — the arrival must accept it. */
  it("accepts an arrival on a handover recorded without a carrier reference", async () => {
    const { packages } = await seedOrder(["standard"]);
    await seedHandoff(packages[0]!, null);

    const result = await arrive(packages[0]!);
    expect(result.created).toBe(true);
    expect(result.orderFinished).toBe(true);
  });
});
