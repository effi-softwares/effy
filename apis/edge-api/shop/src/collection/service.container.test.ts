import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** The collection facts a shop is told (099), against the real migrations, rounds and stops. */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { nextRunInstant } from "@effy/edge-shared";

import { collectionsFor, nextCollectionFor } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "33333333-3333-4333-8333-000000000000";
/** A run every hour, so "the next run" is always within the hour of the test's clock. */
const HOURLY = Array.from({ length: 24 }, (_, h) => ({ hour: h, minute: 0 }));

describe.skipIf(!RUN)("collection facts for a shop — real PostgreSQL, real migrations", () => {
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
    await pool.query(
      `TRUNCATE public.customer, public.shop, public.driver, public.dispatch_wave, public.delivery_collection_run,
                public.delivery_settings RESTART IDENTITY CASCADE`,
    );
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`, [SHOP, OTHER_SHOP]);
    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, planning_lead_min)
       VALUES (1, -37.8, 144.9, 'test', 45)`,
    );
    for (const r of HOURLY) {
      await pool.query(`INSERT INTO public.delivery_collection_run (run_time, updated_by) VALUES (make_time($1, $2, 0), 'test')`, [r.hour, r.minute]);
    }
  });

  let seq = 0;
  async function order(status: string, opts: { shop?: string; courierSupplier?: boolean } = {}): Promise<string> {
    seq += 1;
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, delivery_fee_amount,
         grand_total_amount, delivery_address, placed_at, delivery_type, delivery_type_reason, courier_collection,
         courier_estimate)
       VALUES ($1, $2, 'paid', 10, 0, 10, '{"recipientName":"R","postalCode":"3000"}'::jsonb, now(), $3, $4, $5, $6)
       RETURNING id`,
      [
        CUST,
        `EFY-${seq}`,
        opts.courierSupplier ? "courier" : "effy",
        opts.courierSupplier ? "out_of_coverage" : "in_coverage",
        opts.courierSupplier ? "supplier" : null,
        opts.courierSupplier ? "2–4 business days" : null,
      ],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount, delivery_method)
       VALUES ($1, $2, $3, 1, 10, 'standard') RETURNING id`,
      [o.rows[0]!.id, opts.shop ?? SHOP, status],
    );
    return f.rows[0]!.id;
  }

  /** A collection round on `runAt` with this shop's pickup, its driver on or off duty. */
  async function round(runAt: Date, opts: { onDuty: boolean; stopStatus?: string; packages?: string[] }) {
    const d = await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'D', ($1 || '@effyshopping.com')::citext) RETURNING id`,
      [`sub-d-${runAt.getTime()}`],
    );
    if (opts.onDuty) await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [d.rows[0]!.id]);
    const w = await pool.query<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', $3) RETURNING id`,
      [w.rows[0]!.id, d.rows[0]!.id, runAt],
    );
    const s = await pool.query<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, shop_id, status) VALUES ($1, 'shop_pickup', $2, $3) RETURNING id`,
      [r.rows[0]!.id, SHOP, opts.stopStatus ?? "pending"],
    );
    for (const p of opts.packages ?? []) {
      await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state) VALUES ($1, $2, 'assigned')`, [s.rows[0]!.id, p]);
    }
  }

  it("names the next run, counts this shop's orders on it, and says no driver yet", async () => {
    const now = new Date();
    await order("ready_for_pickup");
    await order("picking");
    await order("received");
    await order("picking", { shop: OTHER_SHOP });
    const next = await nextCollectionFor(SHOP, now);
    expect(next?.runAt).toBe(nextRunInstant(HOURLY, now)!.toISOString());
    expect(next?.due).toEqual({ ready: 1, picking: 2 });
    expect(next?.driver).toBe("none");
  });

  it("says a driver is on the way once the round is open and the driver on duty", async () => {
    const now = new Date();
    const runAt = nextRunInstant(HOURLY, now)!;
    const ready = await order("ready_for_pickup");
    // Lead 45 min, run within the hour: the round may already be open; make the opening certain.
    await pool.query(`UPDATE public.delivery_settings SET planning_lead_min = 120`);
    await round(runAt, { onDuty: true, packages: [ready] });
    const next = await nextCollectionFor(SHOP, now);
    expect(next?.driver).toBe("on_the_way");
    expect(next?.driverOnDuty).toBe(true);
    const runs = await collectionsFor(SHOP, [ready], now);
    expect(runs.get(ready)).toMatchObject({ runAt: runAt.toISOString(), driver: "on_the_way" });
  });

  it("moves to the following run once this shop's stop is collected", async () => {
    const now = new Date();
    const runAt = nextRunInstant(HOURLY, now)!;
    const later = new Date(runAt.getTime() + 60 * 60_000);
    const waiting = await order("picking");
    await round(runAt, { onDuty: true, stopStatus: "done" });
    await round(later, { onDuty: false, packages: [waiting] });
    const next = await nextCollectionFor(SHOP, now);
    expect(next?.runAt).toBe(later.toISOString());
    expect(next?.driver).toBe("assigned");
    expect(next?.due).toEqual({ ready: 0, picking: 1 });
  });

  it("never gives a courier's own pickup an Effy run", async () => {
    const own = await order("ready_for_pickup", { courierSupplier: true });
    const runs = await collectionsFor(SHOP, [own], new Date());
    expect(runs.has(own)).toBe(false);
    expect((await nextCollectionFor(SHOP, new Date()))?.due).toEqual({ ready: 0, picking: 0 });
  });

  it("is null when no collection runs are set up", async () => {
    await pool.query(`TRUNCATE public.delivery_collection_run CASCADE`);
    expect(await nextCollectionFor(SHOP, new Date())).toBeNull();
  });
});
