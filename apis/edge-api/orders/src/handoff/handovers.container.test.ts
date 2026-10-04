import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 069 US7 — the carrier handover list and the package promise, against the REAL migrations.
 *
 * ⚠ REAL MIGRATIONS, NOT A TRANSCRIBED SCHEMA. The queries under test read five columns this slice
 * added and one view-adjacent table; 063 recorded six column names that typechecked perfectly and
 * failed only when a query ran.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  };
});

import { migrationSql } from "@effy/edge-shared";

import { packages } from "../orders/repository";
import { listHandovers, toPackage } from "../orders/service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let seq = 0;

/** Melbourne's date `offset` days from today, as PostgreSQL computes it. */
async function melDay(offset: number): Promise<string> {
  const r = await pool.query<{ day: string }>(
    `SELECT ((now() AT TIME ZONE 'Australia/Melbourne')::date + $1::int)::text AS day`,
    [offset],
  );
  return r.rows[0]!.day;
}

interface Seeded {
  orderId: string;
  fulfillmentId: string;
  orderNumber: string;
}

async function seedPackage(opts: {
  method: "standard" | "same_day";
  promisedDay: string | null;
  status?: string;
  orderStatus?: string;
  window?: { start: string; end: string };
}): Promise<Seeded> {
  seq += 1;
  const orderNumber = `EFY-H${String(seq).padStart(4, "0")}`;
  const c = await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const o = await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                 delivery_address, status, placed_at)
     VALUES ($1, $2, 10, 12, '{"line1":"1 Test St"}'::jsonb, $3, now()) RETURNING id`,
    [c.rows[0]!.id, orderNumber, opts.orderStatus ?? "paid"],
  );
  const s = await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ('S' || substr(md5(random()::text), 1, 6), 'Shop') RETURNING id`,
  );
  const f = await pool.query<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status)
     VALUES ($1, $2, 1, 10, $3) RETURNING id`,
    [o.rows[0]!.id, s.rows[0]!.id, opts.status ?? "collected"],
  );

  let slotId: string | null = null;
  if (opts.window) {
    const slot = await pool.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
       VALUES (('00:00'::time + ($1 || ' minutes')::interval), ('00:00'::time + ($1 || ' minutes')::interval + interval '1 minute'), '00:00', 5, 'test')
       RETURNING id`,
      [seq],
    );
    slotId = slot.rows[0]!.id;
  }
  await pool.query(
    `INSERT INTO public.order_package_delivery
       (order_id, shop_id, method, delivery_fee_amount, promised_from, promised_to, slot_id, window_start, window_end)
     VALUES ($1, $2, $3, 6, $4::date, $4::date, $5, $6, $7)`,
    [o.rows[0]!.id, s.rows[0]!.id, opts.method, opts.promisedDay, slotId, opts.window?.start ?? null, opts.window?.end ?? null],
  );
  return { orderId: o.rows[0]!.id, fulfillmentId: f.rows[0]!.id, orderNumber };
}

async function handOver(fulfillmentId: string, daysAgo: number) {
  await pool.query(
    `INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub, handed_over_at)
     VALUES ($1, 'staff-1', now() - ($2 || ' days')::interval)`,
    [fulfillmentId, daysAgo],
  );
}

// One container for the whole file: both suites read the same schema and truncate between tests.
beforeAll(async () => {
  if (!RUN) return;
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  holder.pool = pool;
  await pool.query(migrationSql());
}, 300_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

d("069 — carrier handover list", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  it("partitions by the day each package must leave the hub — its day minus the carrier lead time", async () => {
    // Lead time defaults to 1 with no settings row: due the day BEFORE the promised day.
    const dueToday = await seedPackage({ method: "standard", promisedDay: await melDay(1) });
    const overdue = await seedPackage({ method: "standard", promisedDay: await melDay(0) });
    const upcoming = await seedPackage({ method: "standard", promisedDay: await melDay(4) });

    const today = await listHandovers("today");
    expect(today.map((r) => r.orderNumber)).toEqual([dueToday.orderNumber]);
    expect(today[0]).toMatchObject({
      fulfillmentId: dueToday.fulfillmentId,
      promisedDate: await melDay(1),
      handoverDueOn: await melDay(0),
      atRisk: false,
      atHub: true,
    });

    const late = await listHandovers("overdue");
    expect(late.map((r) => r.orderNumber)).toEqual([overdue.orderNumber]);
    expect(late[0]!.atRisk).toBe(true);
    expect(late[0]!.handoverDueOn).toBe(await melDay(-1));

    const later = await listHandovers("upcoming");
    expect(later.map((r) => r.orderNumber)).toEqual([upcoming.orderNumber]);
    expect(later[0]!.atRisk).toBe(false);
  });

  it("reads the carrier lead time from the settings, not a constant", async () => {
    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, carrier_lead_days)
       VALUES (1, -37.8, 144.9, 'test', 3)`,
    );
    const p = await seedPackage({ method: "standard", promisedDay: await melDay(3) });

    const today = await listHandovers("today");
    expect(today.map((r) => r.orderNumber)).toEqual([p.orderNumber]);
    expect(today[0]!.handoverDueOn).toBe(await melDay(0));
  });

  it("drops a package once it has been handed over", async () => {
    const p = await seedPackage({ method: "standard", promisedDay: await melDay(1) });
    expect(await listHandovers("today")).toHaveLength(1);
    await handOver(p.fulfillmentId, 0);
    expect(await listHandovers("today")).toHaveLength(0);
  });

  it("shows a package that is due but has not reached the hub yet, and says so", async () => {
    await seedPackage({ method: "standard", promisedDay: await melDay(1), status: "ready_for_pickup" });
    const today = await listHandovers("today");
    expect(today).toHaveLength(1);
    expect(today[0]!.atHub).toBe(false);
  });

  it("never lists same-day packages, cancelled orders, withdrawn portions or an order with no promised day", async () => {
    const now = new Date();
    await seedPackage({
      method: "same_day",
      promisedDay: await melDay(0),
      window: { start: now.toISOString(), end: new Date(now.getTime() + 7_200_000).toISOString() },
    });
    await seedPackage({ method: "standard", promisedDay: await melDay(0), orderStatus: "canceled" });
    await seedPackage({ method: "standard", promisedDay: await melDay(0), status: "withdrawn" });
    // ⚠ Every order placed before 069: promised no day, so it cannot be overdue against one.
    await seedPackage({ method: "standard", promisedDay: null });

    for (const due of ["today", "overdue", "upcoming"] as const) {
      expect(await listHandovers(due), due).toEqual([]);
    }
  });
});

d("069 — the promise on the back-office order detail", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  async function onlyPackage(orderId: string) {
    const rows = await packages(orderId);
    expect(rows).toHaveLength(1);
    return toPackage(rows[0]!);
  }

  it("a standard package shows its day, when it is due out, and that it is at risk once that has passed", async () => {
    const p = await seedPackage({ method: "standard", promisedDay: await melDay(0) });
    const pkg = await onlyPackage(p.orderId);

    expect(pkg.promisedDate).toBe(await melDay(0));
    expect(pkg.handoverDueOn).toBe(await melDay(-1));
    expect(pkg.atRisk).toBe(true);
    expect(pkg.window).toBeNull();
    expect(pkg.onTime).toBeNull();
    expect(pkg.overCapacity).toBe(false);
  });

  it("a same-day package shows its window and is judged against it on arrival", async () => {
    const start = new Date(Date.now() - 3 * 3_600_000);
    const end = new Date(Date.now() - 1 * 3_600_000);
    const p = await seedPackage({
      method: "same_day",
      promisedDay: await melDay(0),
      window: { start: start.toISOString(), end: end.toISOString() },
    });

    let pkg = await onlyPackage(p.orderId);
    expect(pkg.window).toEqual({ startAt: start.toISOString(), endAt: end.toISOString() });
    expect(pkg.handoverDueOn).toBeNull();
    expect(pkg.atRisk).toBe(false);
    expect(pkg.onTime).toBeNull();

    // It arrives now — an hour after its window closed.
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source) VALUES ($1, 'driver_proof')`,
      [p.fulfillmentId],
    );
    pkg = await onlyPackage(p.orderId);
    expect(pkg.onTime).toBe(false);
  });

  it("flags a late payer's package as over capacity, for staff only", async () => {
    const start = new Date(Date.now() + 3_600_000);
    const end = new Date(Date.now() + 7_200_000);
    const p = await seedPackage({
      method: "same_day",
      promisedDay: await melDay(0),
      window: { start: start.toISOString(), end: end.toISOString() },
    });
    await pool.query(
      `INSERT INTO public.delivery_slot_booking
         (slot_id, delivery_date, order_id, state, window_start, window_end, over_capacity)
       SELECT opd.slot_id, opd.promised_to, opd.order_id, 'confirmed', opd.window_start, opd.window_end, true
         FROM public.order_package_delivery opd WHERE opd.order_id = $1`,
      [p.orderId],
    );
    expect((await onlyPackage(p.orderId)).overCapacity).toBe(true);
  });

  it("an order placed before 069 has no day, no window and is never at risk", async () => {
    const p = await seedPackage({ method: "standard", promisedDay: null });
    const pkg = await onlyPackage(p.orderId);
    expect(pkg).toMatchObject({
      promisedDate: null,
      window: null,
      handoverDueOn: null,
      atRisk: false,
      onTime: null,
      overCapacity: false,
    });
  });
});
