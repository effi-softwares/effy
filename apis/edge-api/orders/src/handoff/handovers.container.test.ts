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
    // 078 — recording a handover runs in a transaction; give it the container's.
    withTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (actual.transactorFor as (p: Pool) => (f: typeof fn) => Promise<unknown>)(holder.pool!)(fn),
  };
});

import { migrationSql } from "@effy/edge-shared";
import { legacyOpenOrders, previewMove, recordDeliveryType } from "@effy/edge-shared/delivery";

import { deliveryTypeHistory, findOrder, packages } from "../orders/repository";
import { listHandovers, listOrders, toPackage } from "../orders/service";
import { OrderActionError } from "../lib/errors";
import { recordHandoff } from "./repository";

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

  it("078 — a standard package sold a WINDOW is Effy's: never listed, and a handover is refused", async () => {
    const start = new Date(Date.now() + 26 * 3_600_000);
    const windowed = await seedPackage({
      method: "standard",
      promisedDay: await melDay(1),
      window: { start: start.toISOString(), end: new Date(start.getTime() + 7_200_000).toISOString() },
    });
    const carrier = await seedPackage({ method: "standard", promisedDay: await melDay(1) });

    const listed = [...(await listHandovers("today")), ...(await listHandovers("overdue")), ...(await listHandovers("upcoming"))];
    expect(listed.map((p) => p.orderNumber)).toEqual([carrier.orderNumber]);

    const refused = await recordHandoff({ fulfillmentId: windowed.fulfillmentId, actorSub: "staff-1" } as never).then(() => null, (e: unknown) => e);
    expect(refused).toBeInstanceOf(OrderActionError);
    expect((refused as OrderActionError).reason).toBe("not_carrier");
    // …and one with no window still goes to the carrier.
    expect((await recordHandoff({ fulfillmentId: carrier.fulfillmentId, actorSub: "staff-1" } as never)).created).toBe(true);

    const pkg = await onlyWindowed(windowed.orderId);
    expect(pkg.handoverDueOn).toBeNull();
    expect(pkg.atRisk).toBe(false);
    expect(pkg.window).not.toBeNull();
  });
});

async function onlyWindowed(orderId: string) {
  const rows = await packages(orderId);
  expect(rows).toHaveLength(1);
  return toPackage(rows[0]!);
}

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

/** Make a seeded order one placed under 079: who delivers it, why, and the first history entry. */
async function sell(orderId: string, type: "effy" | "courier", reason: "in_coverage" | "out_of_coverage" | "no_window", estimate: string | null = null) {
  await pool.query(`UPDATE public."order" SET delivery_type = $2, delivery_type_reason = $3, courier_estimate = $4 WHERE id = $1`, [orderId, type, reason, estimate]);
  await recordDeliveryType(pool, { orderId, actor: { kind: "checkout" } });
}

d("079 — who delivers a package is one answer, for old orders and new (P12, P19)", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  const everywhere = async () =>
    [...(await listHandovers("today")), ...(await listHandovers("overdue")), ...(await listHandovers("upcoming"))].map((p) => p.orderNumber).sort();
  const refusal = (fulfillmentId: string) =>
    recordHandoff({ fulfillmentId, actorSub: "staff-1" } as never).then(() => null, (e: unknown) => (e as OrderActionError).reason);
  const later = (hours: number) => {
    const start = new Date(Date.now() + hours * 3_600_000);
    return { start: start.toISOString(), end: new Date(start.getTime() + 7_200_000).toISOString() };
  };

  it("a courier ORDER has no day and no window: it is listed, due the day it was placed, and can be handed over", async () => {
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    await sell(courier.orderId, "courier", "out_of_coverage", "2–4 business days");
    // The same package shape from before 069 — no day, no type — is still NOT listed: nothing to be due by.
    await seedPackage({ method: "standard", promisedDay: null });

    const today = await listHandovers("today");
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      fulfillmentId: courier.fulfillmentId, orderId: courier.orderId, orderNumber: courier.orderNumber, promisedDate: null,
      handoverDueOn: await melDay(0), atRisk: false, atHub: true,
      // 080 — an order from before courier services (none on it): no service, no pickup to be due by.
      service: null, dueOut: null, collection: "hub",
    });
    const pkg = toPackage((await packages(courier.orderId))[0]!);
    expect(pkg).toMatchObject({ deliveredBy: "courier", promisedDate: null, window: null, handoverDueOn: await melDay(0), atRisk: false, onTime: null });

    // A day later with no handover it is overdue and at risk.
    await pool.query(`UPDATE public."order" SET placed_at = now() - interval '2 days' WHERE id = $1`, [courier.orderId]);
    expect((await listHandovers("overdue")).map((p) => [p.orderNumber, p.atRisk])).toEqual([[courier.orderNumber, true]]);
    expect(toPackage((await packages(courier.orderId))[0]!).atRisk).toBe(true);

    expect(await refusal(courier.fulfillmentId)).toBeNull();
    expect(await everywhere()).toEqual([]);
  });

  it("an Effy order is never a carrier's — today's window or a later day's — and a handover is refused by name", async () => {
    const today = await seedPackage({ method: "same_day", promisedDay: await melDay(0), window: later(2) });
    const thursday = await seedPackage({ method: "standard", promisedDay: await melDay(2), window: later(50) });
    await sell(today.orderId, "effy", "in_coverage");
    await sell(thursday.orderId, "effy", "in_coverage");

    expect(await everywhere()).toEqual([]);
    expect(await refusal(today.fulfillmentId)).toBe("not_standard");
    expect(await refusal(thursday.fulfillmentId)).toBe("not_carrier");
    expect(toPackage((await packages(thursday.orderId))[0]!)).toMatchObject({ deliveredBy: "effy", handoverDueOn: null, atRisk: false });
  });

  it("⚠ the ORDER's type decides, not the package: a paid Effy order moved to a courier becomes a carrier's, window and all", async () => {
    const moved = await seedPackage({ method: "standard", promisedDay: await melDay(1), window: later(26) });
    await sell(moved.orderId, "effy", "in_coverage");
    expect(await everywhere()).toEqual([]);
    expect(await refusal(moved.fulfillmentId)).toBe("not_carrier");

    await recordDeliveryType(pool, {
      orderId: moved.orderId, actor: { kind: "staff", sub: "sub-manager" },
      change: { to: "courier", reason: "staff_change", courierEstimate: "3–5 business days", note: "Van off the road" },
    });
    expect(await everywhere()).toEqual([moved.orderNumber]);
    expect(toPackage((await packages(moved.orderId))[0]!).deliveredBy).toBe("courier");
    expect(await refusal(moved.fulfillmentId)).toBeNull();
  });

  it("the order list: filter by who delivers — and an order from before 079 is `legacy`, never guessed", async () => {
    const effy = await seedPackage({ method: "standard", promisedDay: await melDay(2), window: later(50) });
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    const old = await seedPackage({ method: "standard", promisedDay: await melDay(3) });
    await sell(effy.orderId, "effy", "in_coverage");
    await sell(courier.orderId, "courier", "no_window", "2–4 business days");

    const numbers = async (deliveryType?: "effy" | "courier" | "legacy") =>
      (await listOrders({ limit: 50, deliveryType })).items.map((o) => `${o.orderNumber}:${o.deliveryType}`).sort();
    expect(await numbers()).toEqual([`${effy.orderNumber}:effy`, `${courier.orderNumber}:courier`, `${old.orderNumber}:null`].sort());
    expect(await numbers("effy")).toEqual([`${effy.orderNumber}:effy`]);
    expect(await numbers("courier")).toEqual([`${courier.orderNumber}:courier`]);
    expect(await numbers("legacy")).toEqual([`${old.orderNumber}:null`]);
    // "Awaiting handover" finds the courier's and the old carrier's package, never Effy's.
    expect((await listOrders({ limit: 50, awaiting: "handover" })).items.map((o) => o.orderNumber).sort()).toEqual([courier.orderNumber, old.orderNumber].sort());
  });

  /**
   * ⚠ 083 P7 — AN ORDER SOLD THE OLD WAY FINISHES THE OLD WAY, WITH THE NEW MODEL ON. Nothing on this
   * path reads the switch: who delivers an old order is answered from what it was sold (079), so the
   * moment the new checkout starts changes nothing for a parcel already on its way.
   */
  it("⚠ 083 P7 — with the new model ON: an old standard order is still the carrier's and is handed over; an old same-day one is still Effy's", async () => {
    await pool.query(`INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, delivery_model_v2_from)
                      VALUES (1, -37.81, 144.96, 'test', now() - interval '2 days')`);
    expect((await pool.query(`SELECT public.delivery_model_v2_at(now()) AS on`)).rows[0].on).toBe(true);

    const std = await seedPackage({ method: "standard", promisedDay: await melDay(1) });
    const today = await seedPackage({ method: "same_day", promisedDay: await melDay(0), window: later(3) });

    // The carrier's: listed for handover as it always was, and Effy's is not.
    expect(await everywhere()).toEqual([std.orderNumber]);
    expect(await refusal(today.fulfillmentId)).toBe("not_standard");
    expect(await refusal(std.fulfillmentId)).toBeNull();
    expect(await everywhere()).toEqual([]);

    // Neither can be moved between Effy and courier: it keeps how it was sold (081).
    for (const o of [std, today]) {
      await pool.query(`INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status) VALUES ($1, 'stripe', $2, 12, 'AUD', 'succeeded')`, [o.orderId, `pi_${o.orderNumber}`]);
      expect((await previewMove(pool, o.orderId, "courier")).refusal?.code).toBe("no_delivery_type");
      expect((await findOrder(o.orderId))!.delivery_type).toBeNull();
    }
  });

  /**
   * ⚠ 083 P8 — THE LIST IS THE COUNT. The go-live page says "N old orders still open" and links here;
   * both read `LEGACY_OPEN_ORDER_SQL`, so the list can never show a different N.
   */
  it("⚠ 083 P8 — `still open` lists exactly the old-kind orders the go-live count counts", async () => {
    const open1 = await seedPackage({ method: "standard", promisedDay: await melDay(2) });
    const open2 = await seedPackage({ method: "same_day", promisedDay: await melDay(0), window: later(3) });
    const arrived = await seedPackage({ method: "standard", promisedDay: await melDay(1) });
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 's')`, [arrived.fulfillmentId]);
    const cancelled = await seedPackage({ method: "standard", promisedDay: await melDay(1), orderStatus: "canceled" });
    const typed = await seedPackage({ method: "standard", promisedDay: await melDay(2), window: later(50) });
    await sell(typed.orderId, "effy", "in_coverage");

    const listed = async (stillOpen: boolean) => (await listOrders({ limit: 50, deliveryType: "legacy", stillOpen })).items.map((o) => o.orderNumber).sort();
    expect(await listed(false)).toEqual([open1, open2, arrived, cancelled].map((o) => o.orderNumber).sort());
    expect(await listed(true)).toEqual([open1.orderNumber, open2.orderNumber].sort());
    expect((await legacyOpenOrders(pool)).open).toBe(2);

    // Close them the ways an order closes; the list and the count fall together.
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 's')`, [open1.fulfillmentId]);
    expect(await listed(true)).toEqual([open2.orderNumber]);
    expect((await legacyOpenOrders(pool)).open).toBe(1);
    await pool.query(`UPDATE public."order" SET status = 'canceled' WHERE id = $1`, [open2.orderId]);
    expect(await listed(true)).toEqual([]);
    expect(await legacyOpenOrders(pool)).toMatchObject({ open: 0, lastClosedAt: expect.any(Date) });
  });

  it("the order detail: type, why, the estimate as sold, and the history — nothing invented for an old order", async () => {
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    await sell(courier.orderId, "courier", "out_of_coverage", "2–4 business days");
    // The business changes its estimate afterwards; the order keeps the one it was sold.
    await pool.query(`INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, courier_estimate_text, updated_by) VALUES (1, -37.81, 144.96, '5–7 business days', 'test')`);

    // ⚠ The reads, not `getOrder`: that also reads refund proposals through the shared library's own
    // pool, which this file does not replace (as `delivery-instructions.container.test.ts` found).
    expect(await findOrder(courier.orderId)).toMatchObject({ delivery_type: "courier", delivery_type_reason: "out_of_coverage", courier_estimate: "2–4 business days" });
    expect(await deliveryTypeHistory(courier.orderId)).toEqual([
      { from_type: null, to_type: "courier", reason: "out_of_coverage", actor_kind: "checkout", actor_sub: null, note: null, created_at: expect.any(Date) },
    ]);
    expect(toPackage((await packages(courier.orderId))[0]!)).toMatchObject({ deliveredBy: "courier" });

    const old = await seedPackage({ method: "same_day", promisedDay: await melDay(0), window: later(2) });
    expect(await findOrder(old.orderId)).toMatchObject({ delivery_type: null, delivery_type_reason: null, courier_estimate: null });
    expect(await deliveryTypeHistory(old.orderId)).toEqual([]);
    // …and its package still says who took it.
    expect(toPackage((await packages(old.orderId))[0]!)).toMatchObject({ deliveredBy: "effy", deliveryMethod: "same_day" });
  });
});
