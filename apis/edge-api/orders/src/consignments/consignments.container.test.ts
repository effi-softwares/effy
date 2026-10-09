import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 080 — back-office's courier work against the REAL schema: booking, recording progress, the Courier
 * tab's views, when a hub parcel is due out, and the order page's consignment block.
 * ⚠ The courier service is fictional; real ones are the operator's to enter.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as string[] }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (actual.transactorFor as (p: Pool) => (f: typeof fn) => Promise<unknown>)(holder.pool!)(fn),
    // The order page's refund proposals read through the shared module's own pool; none exist here.
    proposedRefunds: async () => [],
  };
});
vi.mock("@effy/edge-shared/live", () => ({ announceOrder: async (id: string) => void holder.announced.push(id) }));

import { migrationSql } from "@effy/edge-shared";

import { packages } from "../orders/repository";
import { getOrder, listCourierParcels, listHandovers, listOrders, toPackage } from "../orders/service";
import { recordHandoff } from "../handoff/repository";
import { changeCollection, recordStep, saveConsignment } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const STAFF = "sub-staff";
const SERVICE = "00000000-0000-0000-0000-0000000000cc";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let customerId: string;
let n = 0;

async function courierOrder(mode: "hub" | "supplier", status = "collected") {
  n += 1;
  const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id::text AS id`, [`CO${n}`])).rows[0]!.id;
  const order = (
    await pool.query<{ id: string }>(
      `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount,
                                   delivery_address, delivery_type, delivery_type_reason, courier_estimate, courier_service_id, courier_collection, placed_at)
       VALUES ($1, $2, 'paid', 10, 9, 19, '{}'::jsonb, 'courier', 'out_of_coverage', '2–4 business days', $3, $4, now()) RETURNING id::text AS id`,
      [`EFY-CO${String(n).padStart(3, "0")}`, customerId, SERVICE, mode],
    )
  ).rows[0]!.id;
  const pkg = (
    await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, $3, 'standard') RETURNING id::text AS id`,
      [order, shop, status],
    )
  ).rows[0]!.id;
  await pool.query(`INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, 'standard')`, [order, shop]);
  return { order, pkg, number: `EFY-CO${String(n).padStart(3, "0")}` };
}
const refusal = (p: Promise<unknown>) =>
  p.then(() => null, (e: { code?: string; reason?: string; fields?: { field: string }[] }) => e.code ?? e.reason ?? e.fields?.map((f) => f.field).join(",") ?? String(e));
const mel = (iso: string) => new Date(iso);

d("080 — courier work in back-office", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    customerId = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('sub-c', 'c@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    // Mon–Fri, cutoff 2 pm; collects from suppliers.
    await pool.query(
      `INSERT INTO public.courier_service (id, courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff,
                                           collects_from_supplier, is_default, updated_by)
       VALUES ($1, 'Test Courier', 'Parcel', '2–4 business days', 3, '{1,2,3,4,5}', '14:00', true, true, 'test')`,
      [SERVICE],
    );
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE public."order" CASCADE`);
    holder.announced = [];
  });

  it("P8 — a hub parcel is due out at its service's next pickup; late once that has passed", async () => {
    const o = await courierOrder("hub");
    // Fri 9 Oct 2026, 10:00 Melbourne → due out 2 pm today.
    const morning = mel("2026-10-09T10:00:00+11:00");
    let rows = await listCourierParcels("hub_due", morning);
    expect(rows).toEqual([expect.objectContaining({
      orderNumber: o.number, service: "Test Courier · Parcel", dueOut: "2026-10-09T14:00:00+11:00", atRisk: false, collection: "hub",
    })]);
    expect(toPackage((await packages(o.order))[0]!, null, undefined, null, morning)).toMatchObject({ dueOut: "2026-10-09T14:00:00+11:00", late: false });
    // Not yet at the hub at 3 pm: from now, the next pickup is Monday's. (A parcel already checked in
    // keeps the pickup it missed — the next test.)
    rows = await listCourierParcels("hub_due", mel("2026-10-09T15:00:00+11:00"));
    expect(rows[0]).toMatchObject({ dueOut: "2026-10-12T14:00:00+11:00" });
  });

  it("P8 — a parcel CHECKED IN before a pickup it then misses is late", async () => {
    const o = await courierOrder("hub");
    const driver = (await pool.query<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('sub-d', 'Ada', 'ada@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    const wave = (await pool.query<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id::text AS id`)).rows[0]!.id;
    const round = (await pool.query<{ id: string }>(`INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', now()) RETURNING id::text AS id`, [wave, driver])).rows[0]!.id;
    const shop = (await pool.query<{ shop_id: string }>(`SELECT shop_id::text AS shop_id FROM public.shop_fulfillment WHERE id = $1`, [o.pkg])).rows[0]!.shop_id;
    const stop = (await pool.query<{ id: string }>(`INSERT INTO public.round_stop (round_id, kind, seq, shop_id) VALUES ($1, 'shop_pickup', 1, $2) RETURNING id::text AS id`, [round, shop])).rows[0]!.id;
    await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state) VALUES ($1, $2, 'picked_up')`, [stop, o.pkg]);
    await pool.query(`INSERT INTO public.hub_checkin (round_id, driver_id, checked_in_at, packages_expected, packages_arrived) VALUES ($1, $2, '2026-10-09T11:00:00+11:00', 1, 1)`, [round, driver]);

    const at3pm = mel("2026-10-09T15:00:00+11:00");
    expect(await listCourierParcels("hub_due", at3pm)).toEqual([]);
    expect(await listCourierParcels("hub_late", at3pm)).toEqual([expect.objectContaining({ orderNumber: o.number, dueOut: "2026-10-09T14:00:00+11:00", atRisk: true })]);
    expect(toPackage((await packages(o.order))[0]!, null, undefined, null, at3pm)).toMatchObject({ late: true, handoverDueOn: "2026-10-09" });
    // The 069 list still finds it, by its day.
    expect((await listHandovers("overdue", mel("2026-10-10T09:00:00+11:00"))).map((r) => r.orderNumber)).toEqual([o.number]);
  });

  it("P3/P5 — book, hand over from the hub list, in transit, delivered: the Courier tab follows it and the order completes", async () => {
    const o = await courierOrder("hub");
    expect(await saveConsignment(o.pkg, { serviceId: SERVICE, reference: "  ABC123 ", trackingUrl: "https://track.example.test/ABC123" }, STAFF))
      .toMatchObject({ created: true });
    // The hub screen's handover completes the booked consignment — one record of "handed over".
    expect(await recordHandoff({ fulfillmentId: o.pkg, actorSub: STAFF, changeId: "c1" })).toMatchObject({ created: true, reference: "ABC123", carrierName: "Test Courier" });
    expect(await listCourierParcels("with_courier")).toEqual([expect.objectContaining({ orderNumber: o.number, consignmentState: "handed_over" })]);
    await recordStep(o.pkg, { kind: "in_transit" }, STAFF);
    expect(await recordStep(o.pkg, { kind: "delivered" }, STAFF)).toEqual({ orderFinished: true });
    expect(await listCourierParcels("with_courier")).toEqual([]);
    const pkg = toPackage((await packages(o.order))[0]!);
    expect(pkg.arrival).not.toBeNull();
    expect(holder.announced.length).toBeGreaterThanOrEqual(3);
  });

  it("problems are their own view until resolved; refusals name what to fix", async () => {
    const o = await courierOrder("hub");
    await recordHandoff({ fulfillmentId: o.pkg, actorSub: STAFF, changeId: "c2" });
    await recordStep(o.pkg, { kind: "damaged", note: "Box crushed" }, STAFF);
    expect(await listCourierParcels("problems")).toEqual([expect.objectContaining({ orderNumber: o.number, problem: "damaged" })]);
    await recordStep(o.pkg, { kind: "resolved" }, STAFF);
    expect(await listCourierParcels("problems")).toEqual([]);

    expect(await refusal(recordStep(o.pkg, { kind: "booked" as never }, STAFF))).toBe("kind");
    expect(await refusal(saveConsignment(o.pkg, { serviceId: "nope" }, STAFF))).toBe("serviceId");
    expect(await refusal(saveConsignment(o.pkg, { serviceId: SERVICE, trackingUrl: "http://plain" }, STAFF))).toBe("trackingUrl");
    expect(await refusal(recordStep(o.pkg, { kind: "cancelled" }, STAFF))).toBe("invalid_step");
  });

  it("⚠ 080 P6 — a courier problem reaches the order list (badge and filter agree) until it is resolved", async () => {
    const o = await courierOrder("hub");
    await recordHandoff({ fulfillmentId: o.pkg, actorSub: STAFF, changeId: "c6" });
    const awaitingOf = async () => (await listOrders({ limit: 50 })).items.find((x) => x.id === o.order)?.awaiting;
    const filtered = async () => (await listOrders({ limit: 50, awaiting: "courier_problem" })).items.map((x) => x.id);

    expect(await filtered()).toEqual([]);
    await recordStep(o.pkg, { kind: "lost", note: "Courier cannot find it" }, STAFF);
    expect(await awaitingOf()).toBe("courier_problem");
    expect(await filtered()).toEqual([o.order]);
    expect((await getOrder(o.order))?.awaiting).toBe("courier_problem");

    await recordStep(o.pkg, { kind: "resolved", note: "Found at the depot" }, STAFF);
    expect(await awaitingOf()).not.toBe("courier_problem");
    expect(await filtered()).toEqual([]);
    expect((await getOrder(o.order))?.awaiting).not.toBe("courier_problem");
  });

  it("supplier pickups are their own view; a pickup day gone with no handover is late", async () => {
    const o = await courierOrder("supplier", "ready_for_pickup");
    expect(await listCourierParcels("supplier", mel("2026-10-09T09:00:00+11:00"))).toEqual([expect.objectContaining({ orderNumber: o.number, consignmentState: null, atRisk: false })]);
    expect(await listCourierParcels("hub_due", mel("2026-10-09T09:00:00+11:00"))).toEqual([]);
    await saveConsignment(o.pkg, { serviceId: SERVICE, pickup: { date: "2099-01-05", from: "13:00", to: "15:00" } }, STAFF);
    await pool.query(`UPDATE public.courier_consignment SET pickup_date = '2026-10-08'`);
    expect(await listCourierParcels("supplier", mel("2026-10-09T09:00:00+11:00"))).toEqual([expect.objectContaining({ atRisk: true, pickup: { date: "2026-10-08", from: "13:00", to: "15:00" } })]);
  });

  it("P7 — the mode changes through the route, with history on the order", async () => {
    const o = await courierOrder("supplier", "ready_for_pickup");
    expect(await changeCollection(o.order, { mode: "hub", note: "Courier cannot reach the shop" }, STAFF)).toEqual({ changed: true });
    expect(await changeCollection(o.order, { mode: "hub" }, STAFF)).toEqual({ changed: false });
    expect(await refusal(changeCollection(o.order, { mode: "drone" as never }, STAFF))).toBe("mode");
    expect((await pool.query(`SELECT from_mode, to_mode FROM public.order_courier_collection_change WHERE order_id = $1`, [o.order])).rows)
      .toEqual([{ from_mode: "supplier", to_mode: "hub" }]);
  });
});
