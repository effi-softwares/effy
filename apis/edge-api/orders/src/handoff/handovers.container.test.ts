import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** The carrier handover list against the real schema. */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (actual.transactorFor as (p: Pool) => (f: typeof fn) => Promise<unknown>)(holder.pool!)(fn),
  };
});

import { activityEntries, migrationSql } from "@effy/edge-shared/testing";
import { parseListQuery } from "@effy/edge-shared";
import { ORDER_LIST_SPEC } from "../orders/list";

/** A list request as the route parses it (103). */
const req = (qs: Record<string, string | undefined>) => parseListQuery({ pageSize: "100", ...qs }, ORDER_LIST_SPEC);
import { recordDeliveryType } from "@effy/edge-shared/delivery";
import { orderActivitySource } from "../activity/order";
import { findOrder, packages } from "../orders/repository";
import { listCourierParcels, listOrders, toPackage } from "../orders/service";
import { OrderActionError } from "../lib/errors";
import { recordHandoff } from "./repository";

const atHub = async () => [...(await listCourierParcels("hub_due")), ...(await listCourierParcels("hub_late"))];

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
                                 delivery_address, status, placed_at, delivery_type, delivery_type_reason)
     VALUES ($1, $2, 10, 12, '{"line1":"1 Test St"}'::jsonb, $3, now(), 'effy', 'in_coverage') RETURNING id`,
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
       (order_id, shop_id, method, promised_from, promised_to, slot_id, window_start, window_end)
     VALUES ($1, $2, $3, $4::date, $4::date, $5, $6, $7)`,
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

d("069 - carrier handover list", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  /** A parcel of an order sold as a courier delivery, the only kind this list holds. */
  async function courierParcel(opts: { placedDaysAgo?: number; status?: string } = {}): Promise<Seeded> {
    const p = await seedPackage({ method: "standard", promisedDay: null, status: opts.status });
    await sell(p.orderId, "courier", "out_of_coverage", "2–4 business days");
    if (opts.placedDaysAgo) await pool.query(`UPDATE public."order" SET placed_at = now() - ($2 || ' days')::interval WHERE id = $1`, [p.orderId, opts.placedDaysAgo]);
    return p;
  }

  it("partitions by the day each parcel is due out - the day it was placed, with no courier service to ask", async () => {
    const dueToday = await courierParcel();
    const overdue = await courierParcel({ placedDaysAgo: 2 });

    const today = await listCourierParcels("hub_due");
    expect(today.map((r) => r.orderNumber)).toEqual([dueToday.orderNumber]);
    expect(today[0]).toMatchObject({ fulfillmentId: dueToday.fulfillmentId, promisedDate: null, handoverDueOn: await melDay(0), atRisk: false, atHub: true });

    const late = await listCourierParcels("hub_late");
    expect(late.map((r) => r.orderNumber)).toEqual([overdue.orderNumber]);
    expect(late[0]).toMatchObject({ atRisk: true, handoverDueOn: await melDay(-2) });
  });

  it("drops a parcel once it has been handed over", async () => {
    const p = await courierParcel();
    expect(await listCourierParcels("hub_due")).toHaveLength(1);
    await handOver(p.fulfillmentId, 0);
    expect(await listCourierParcels("hub_due")).toHaveLength(0);
  });

  it("shows a parcel that is due but has not reached the hub yet, and says so", async () => {
    await courierParcel({ status: "ready_for_pickup" });
    const today = await listCourierParcels("hub_due");
    expect(today).toHaveLength(1);
    expect(today[0]!.atHub).toBe(false);
  });

  it("never lists Effy's packages, cancelled orders, withdrawn portions - or a carrier's package from before delivery types", async () => {
    const now = new Date();
    await seedPackage({
      method: "same_day",
      promisedDay: await melDay(0),
      window: { start: now.toISOString(), end: new Date(now.getTime() + 7_200_000).toISOString() },
    });
    const cancelled = await seedPackage({ method: "standard", promisedDay: null, orderStatus: "canceled" });
    await sell(cancelled.orderId, "courier", "out_of_coverage", "2–4 business days");
    const withdrawn = await seedPackage({ method: "standard", promisedDay: null, status: "withdrawn" });
    await sell(withdrawn.orderId, "courier", "out_of_coverage", "2–4 business days");
    await seedPackage({ method: "standard", promisedDay: await melDay(0) });
    await seedPackage({ method: "standard", promisedDay: null });

    expect(await atHub()).toEqual([]);
  });
});

d("069 - the promise on the back-office order detail", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  async function onlyPackage(orderId: string) {
    const rows = await packages(orderId);
    expect(rows).toHaveLength(1);
    return toPackage(rows[0]!);
  }

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

    // It arrives now - an hour after its window closed.
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

/** Who delivers, why, and the first history entry. */
async function sell(orderId: string, type: "effy" | "courier", reason: "in_coverage" | "out_of_coverage" | "no_window", estimate: string | null = null) {
  await pool.query(`UPDATE public."order" SET delivery_type = $2, delivery_type_reason = $3, courier_estimate = $4 WHERE id = $1`, [orderId, type, reason, estimate]);
  await recordDeliveryType(pool, { orderId, actor: { kind: "checkout" } });
}

d("079 - who delivers a package is one answer, for old orders and new (P12, P19)", () => {
  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order", public.delivery_slot CASCADE`);
    await pool.query(`DELETE FROM public.delivery_settings`);
  });

  const everywhere = async () =>
    (await atHub()).map((p) => p.orderNumber).sort();
  const refusal = (fulfillmentId: string) =>
    recordHandoff({ fulfillmentId, actorSub: "staff-1" } as never).then(() => null, (e: unknown) => (e as OrderActionError).reason);
  const later = (hours: number) => {
    const start = new Date(Date.now() + hours * 3_600_000);
    return { start: start.toISOString(), end: new Date(start.getTime() + 7_200_000).toISOString() };
  };

  it("a courier ORDER has no day and no window: it is listed, due the day it was placed, and can be handed over", async () => {
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    await sell(courier.orderId, "courier", "out_of_coverage", "2–4 business days");
    await seedPackage({ method: "standard", promisedDay: null });

    const today = await listCourierParcels("hub_due");
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({
      fulfillmentId: courier.fulfillmentId, orderId: courier.orderId, orderNumber: courier.orderNumber, promisedDate: null,
      handoverDueOn: await melDay(0), atRisk: false, atHub: true,
      service: null, dueOut: null, collection: "hub",
    });
    const pkg = toPackage((await packages(courier.orderId))[0]!);
    expect(pkg).toMatchObject({ deliveredBy: "courier", promisedDate: null, window: null, handoverDueOn: await melDay(0), atRisk: false, onTime: null });

    // A day later with no handover it is overdue and at risk.
    await pool.query(`UPDATE public."order" SET placed_at = now() - interval '2 days' WHERE id = $1`, [courier.orderId]);
    expect((await listCourierParcels("hub_late")).map((p) => [p.orderNumber, p.atRisk])).toEqual([[courier.orderNumber, true]]);
    expect(toPackage((await packages(courier.orderId))[0]!).atRisk).toBe(true);

    expect(await refusal(courier.fulfillmentId)).toBeNull();
    expect(await everywhere()).toEqual([]);
  });

  it("an Effy order is never a carrier's - today's window or a later day's - and a handover is refused by name", async () => {
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

  it("the order list: filter by who delivers", async () => {
    const effy = await seedPackage({ method: "standard", promisedDay: await melDay(2), window: later(50) });
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    await sell(effy.orderId, "effy", "in_coverage");
    await sell(courier.orderId, "courier", "no_window", "2–4 business days");

    const numbers = async (deliveryType?: "effy" | "courier") =>
      (await listOrders(req({ deliveryType }))).items.map((o) => `${o.orderNumber}:${o.deliveryType}`).sort();
    expect(await numbers()).toEqual([`${effy.orderNumber}:effy`, `${courier.orderNumber}:courier`].sort());
    expect(await numbers("effy")).toEqual([`${effy.orderNumber}:effy`]);
    expect(await numbers("courier")).toEqual([`${courier.orderNumber}:courier`]);
    // "Awaiting handover" finds the courier's package, never Effy's.
    expect((await listOrders(req({ view: "handover" }))).items.map((o) => o.orderNumber).sort()).toEqual([courier.orderNumber]);
  });

  it("the order detail: type, why, the estimate as sold, and the history", async () => {
    const courier = await seedPackage({ method: "standard", promisedDay: null });
    await sell(courier.orderId, "courier", "out_of_coverage", "2–4 business days");
    // The business changes its estimate afterwards; the order keeps the one it was sold.
    await pool.query(`UPDATE public.courier_service SET estimate_text = '5–7 business days'`);

    // Not `getOrder`: it reads refund proposals through the shared library's own pool.
    expect(await findOrder(courier.orderId)).toMatchObject({ delivery_type: "courier", delivery_type_reason: "out_of_coverage", courier_estimate: "2–4 business days" });
    const log = await activityEntries(pool, orderActivitySource(courier.orderId));
    expect(log.filter((e) => e.kind === "delivery")).toEqual([
      expect.objectContaining({ title: "Courier delivery", detail: "The address is outside Effy's delivery area", actor: "Checkout" }),
    ]);
    expect(toPackage((await packages(courier.orderId))[0]!)).toMatchObject({ deliveredBy: "courier" });

  });
});
