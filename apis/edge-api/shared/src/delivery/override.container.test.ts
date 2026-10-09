import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { slotLoad } from "./slots";
import { DeliveryMoveError, deliveryMovesFor, latestMoveForCustomer, moveToCourier, moveToEffy, previewMove } from "./override";

/**
 * 081 — moving an order between Effy and courier delivery, against the REAL schema: one transaction,
 * every part (P2, P3), each compensation by its own means (P4), a dearer courier costing the customer
 * nothing (P5), the guards (P6), stale and repeated confirmations (P7), the move back (P9) and the
 * message (P10).
 *
 * ⚠ The courier service here is obviously fictional. A real courier's name is the operator's to enter.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const NOW = new Date("2026-12-01T09:00:00+11:00"); // a Tuesday morning in Melbourne
const TODAY = "2026-12-01";
const TOMORROW = "2026-12-02";
const STAFF = "sub-manager";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopA: string;
let shopB: string;
let slot: string;
let tightSlot: string;
let serviceId: string;
let driverC: string;
let driverD: string;
let n = 0;

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof DeliveryMoveError ? e.code : String(e)));

async function round(driverId: string, kind: "collection" | "delivery", status = "planned") {
  const wave = (await one<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger, triggered_by_sub) VALUES ($1, now(), 'manual', 'test') RETURNING id::text AS id`, [kind],
  )).id;
  return (await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, status, deadline_at) VALUES ($1, $2, $3, $4, now() + interval '4 hours') RETURNING id::text AS id`,
    [wave, driverId, kind, status],
  )).id;
}

/**
 * A paid Effy order from two shops, in today's 4–6 pm window, $9.00 delivery: both parcels on a
 * driver's collection round, and on a (planned) delivery round.
 */
async function effyOrder(opts: { deliveryRound?: "planned" | "in_progress"; paidCents?: number } = {}) {
  n += 1;
  const tag = `ov-${n}`;
  const customerId = (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
  const order = (await one<{ id: string }>(
    `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency,
                                 delivery_address, delivery_fee_breakdown, delivery_type, delivery_type_reason, placed_at)
     VALUES ($1, $2, 'paid', 40, 9, 49, 'AUD', '{"postalCode":"3121"}'::jsonb, '{"inputs":{"grams":2000,"basketCents":4000}}'::jsonb,
             'effy', 'in_coverage', now())
     RETURNING id::text AS id`,
    [`EFY-${tag}`, customerId],
  )).id;
  await pool.query(
    `INSERT INTO public.order_delivery_type_change (order_id, from_type, to_type, reason, actor_kind) VALUES ($1, NULL, 'effy', 'in_coverage', 'checkout')`,
    [order],
  );
  await pool.query(
    `INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status) VALUES ($1, 'stripe', $2, 49, 'AUD', 'succeeded')`,
    [order, `pi_${tag}`],
  );
  const packages: string[] = [];
  for (const shop of [shopA, shopB]) {
    packages.push((await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 20, 'ready_for_pickup', 'same_day') RETURNING id::text AS id`,
      [order, shop],
    )).id);
    await pool.query(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, promised_from, promised_to, slot_id, window_start, window_end)
       VALUES ($1, $2, 'same_day', $3::date, $3::date, $4, $5, $6)`,
      [order, shop, TODAY, slot, `${TODAY}T05:00:00Z`, `${TODAY}T07:00:00Z`],
    );
  }
  await pool.query(
    `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, window_start, window_end)
     VALUES ($1, $2, $3, 'confirmed', $4, $5)`,
    [slot, TODAY, order, `${TODAY}T05:00:00Z`, `${TODAY}T07:00:00Z`],
  );

  const collect = await round(driverC, "collection");
  for (const [i, shop] of [shopA, shopB].entries()) {
    const stop = (await one<{ id: string }>(`INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id::text AS id`, [collect, shop])).id;
    await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [stop, packages[i]]);
  }
  let deliver: string | null = null;
  if (opts.deliveryRound) {
    // On a delivery round means collected first: one open assignment per parcel (063).
    await pool.query(
      `UPDATE public.round_package SET state = 'picked_up', settled_at = now() WHERE shop_fulfillment_id = ANY($1::uuid[])`, [packages],
    );
    deliver = await round(driverD, "delivery", opts.deliveryRound);
    const drop = (await one<{ id: string }>(`INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id::text AS id`, [deliver, order])).id;
    for (const p of packages) await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop, p]);
  }
  return { order, customerId, packages, collect, deliver };
}

const updatedAt = async (order: string) => (await previewMove(pool, order, "courier", NOW)).updatedAt;
const toCourier = (order: string, compensation: Parameters<typeof moveToCourier>[1]["compensation"], expectedAmountCents: number, at: string, note: string | null = null) =>
  tx((c) => moveToCourier(c, {
    orderId: order, actorSub: STAFF, reason: "Van off the road", compensation, compensationNote: note,
    expectedUpdatedAt: at, expectedAmountCents, now: NOW,
  }));

d("081 — moving an order between Effy and courier delivery", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    shopA = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('OV-A', 'Shop A') RETURNING id::text AS id`)).id;
    shopB = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('OV-B', 'Shop B') RETURNING id::text AS id`)).id;
    slot = (await one<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('16:00', '18:00', '14:00', 50, 'test') RETURNING id::text AS id`,
    )).id;
    tightSlot = (await one<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('18:00', '20:00', '15:00', 1, 'test') RETURNING id::text AS id`,
    )).id;
    await pool.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test')
        ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude;
      INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES ('RICHMOND', 'VIC', '3121', -37.823, 144.998, 9000)
        ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_zone_postcode (postcode, distance_km, distance_source, added_by) VALUES ('3121', 5, 'manual', 'test');
      INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('00000000-0000-0000-0000-0000000081c0', 'courier', 'Courier table', true, 6.50, 0.50, 0.00, 90.00, 'test');
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('00000000-0000-0000-0000-0000000081c0', 100000, 0.00);`);
    serviceId = (await one<{ id: string }>(
      `INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, is_default, updated_by)
       VALUES ('Test Courier', 'Parcel', '2–4 business days', 4, '{1,2,3,4,5}', '14:00', true, 'test') RETURNING id::text AS id`,
    )).id;
    const driver = (sub: string) => one<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, $1, $1 || '@example.test') RETURNING id::text AS id`, [sub],
    ).then((r) => r.id);
    driverC = await driver("drv-collect");
    driverD = await driver("drv-deliver");
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("P2/P10 — to courier, via the hub, with points for the difference: one step, every part", async () => {
    const o = await effyOrder({ deliveryRound: "planned" });
    const preview = await previewMove(pool, o.order, "courier", NOW);
    expect(preview).toMatchObject({
      allowed: true, paidDeliveryAmount: "9.00", courierFeeAmount: "6.50", differenceAmount: "2.50",
      courier: { courierName: "Test Courier", serviceName: "Parcel", estimate: "2–4 business days", collection: "hub" },
    });
    expect(preview.choices[0]).toMatchObject({ kind: "points_difference", amount: "2.50", points: 250, default: true });
    const loadBefore = (await slotLoad(pool, TODAY)).get(slot) ?? 0;

    const r = await toCourier(o.order, "points_difference", 250, preview.updatedAt);
    expect(r.driverIds).toEqual([driverD]);
    expect(r.refundToSubmit).toBeNull();

    // The type, through 079's writer, with the staff reason.
    expect(await one(`SELECT delivery_type, delivery_type_reason, courier_estimate, courier_service_id::text AS s, courier_collection FROM public."order" WHERE id = $1`, [o.order]))
      .toEqual({ delivery_type: "courier", delivery_type_reason: "staff_change", courier_estimate: "2–4 business days", s: serviceId, courier_collection: "hub" });
    expect(await one(`SELECT from_type, to_type, actor_kind, actor_sub, note FROM public.order_delivery_type_change WHERE order_id = $1 AND from_type IS NOT NULL`, [o.order]))
      .toEqual({ from_type: "effy", to_type: "courier", actor_kind: "staff", actor_sub: STAFF, note: "Van off the road" });
    // The window place is given back, and counts at once.
    expect((await slotLoad(pool, TODAY)).get(slot) ?? 0).toBe(loadBefore - 1);
    // Routing: standard, no window, no day.
    expect((await pool.query(`SELECT method, slot_id, promised_from FROM public.order_package_delivery WHERE order_id = $1`, [o.order])).rows)
      .toEqual([{ method: "standard", slot_id: null, promised_from: null }, { method: "standard", slot_id: null, promised_from: null }]);
    // Off the delivery round (which, now empty and not begun, is over); the collected parcels stay collected.
    expect((await one<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [o.deliver])).status).toBe("cancelled");
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id WHERE rs.round_id = $1`, [o.collect])).n)).toBe(2);
    // The compensation: a quiet automatic credit, attributed to the person.
    expect(await one(`SELECT kind, points, reason, author_kind, author_sub, order_id::text AS order_id FROM public.points_entry WHERE customer_id = $1`, [o.customerId]))
      .toEqual({ kind: "auto_credit", points: 250, reason: "courier_override_compensation", author_kind: "staff", author_sub: STAFF, order_id: o.order });
    // ⚠ P10 — ONE message, push and email; the points credit sends none of its own.
    expect((await pool.query(`SELECT type, channel FROM public.notification_request WHERE recipient_sub = $1 ORDER BY type, channel`, [`ov-${n}`])).rows)
      .toEqual([{ type: "order_delivery_changed", channel: "email" }, { type: "order_delivery_changed", channel: "push" }]);
    // The record.
    const [move] = await deliveryMovesFor(pool, o.order);
    expect(move).toMatchObject({
      to: "courier", reason: "Van off the road", paidDeliveryAmount: "9.00", courierFeeAmount: "6.50", differenceAmount: "2.50",
      compensation: "points_difference", amount: "2.50", points: 250, window: { date: TODAY },
      courier: { courierName: "Test Courier", collection: "hub" },
    });
    // What the customer is told: to, when, what they got. Nothing else.
    const latest = await latestMoveForCustomer(pool, o.order);
    expect(latest).toMatchObject({ to: "courier", compensation: { kind: "points", amount: "2.50", points: 250 } });
    expect(Object.keys(latest!).sort()).toEqual(["at", "compensation", "to"]);
    // The customer was charged nothing and the order total is what it was.
    expect((await one<{ g: string }>(`SELECT grand_total_amount::text AS g FROM public."order" WHERE id = $1`, [o.order])).g).toBe("49.00");
  });

  it("P2 — pickup from the supplier: collection work is withdrawn too; once a parcel has left, it goes via the hub", async () => {
    await pool.query(`UPDATE public.delivery_settings SET courier_collection_default = 'supplier' WHERE id = 1`);
    try {
      const o = await effyOrder();
      const r = await toCourier(o.order, "points_difference", 250, await updatedAt(o.order));
      expect(r.driverIds).toEqual([driverC]);
      expect((await one<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [o.collect])).status).toBe("cancelled");
      expect((await one<{ m: string }>(`SELECT courier_collection AS m FROM public."order" WHERE id = $1`, [o.order])).m).toBe("supplier");

      const picked = await effyOrder();
      await pool.query(
        `UPDATE public.round_package SET state = 'picked_up' WHERE shop_fulfillment_id = $1`, [picked.packages[0]],
      );
      expect((await previewMove(pool, picked.order, "courier", NOW)).courier?.collection).toBe("hub");
      await toCourier(picked.order, "points_difference", 250, await updatedAt(picked.order));
      expect((await one<{ m: string }>(`SELECT courier_collection AS m FROM public."order" WHERE id = $1`, [picked.order])).m).toBe("hub");
      // The parcel in the van stays in the van.
      expect((await one<{ state: string }>(`SELECT state FROM public.round_package WHERE shop_fulfillment_id = $1`, [picked.packages[0]])).state).toBe("picked_up");
    } finally {
      await pool.query(`UPDATE public.delivery_settings SET courier_collection_default = 'hub' WHERE id = 1`);
    }
  });

  it("P3 — a failure at the last step leaves NOTHING changed: no points, the window kept, the drivers' work kept", async () => {
    const o = await effyOrder({ deliveryRound: "planned" });
    await pool.query(`
      CREATE FUNCTION pg_temp_fail_override() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
      CREATE TRIGGER fail_override BEFORE INSERT ON public.delivery_override FOR EACH ROW EXECUTE FUNCTION pg_temp_fail_override();`);
    try {
      expect(await refusal(toCourier(o.order, "points_difference", 250, await updatedAt(o.order)))).toMatch(/injected/);
    } finally {
      await pool.query(`DROP TRIGGER fail_override ON public.delivery_override; DROP FUNCTION pg_temp_fail_override();`);
    }
    expect((await one<{ t: string }>(`SELECT delivery_type AS t FROM public."order" WHERE id = $1`, [o.order])).t).toBe("effy");
    expect((await one<{ s: string }>(`SELECT state AS s FROM public.delivery_slot_booking WHERE order_id = $1`, [o.order])).s).toBe("confirmed");
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1`, [o.customerId])).n)).toBe(0);
    expect((await one<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [o.deliver])).status).toBe("planned");
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.notification_request WHERE recipient_sub = $1`, [`ov-${n}`])).n)).toBe(0);
  });

  it("P4 — free delivery as points, free delivery to the card, the difference to the card, or nothing with a note", async () => {
    const a = await effyOrder();
    await toCourier(a.order, "free_delivery_points", 900, await updatedAt(a.order));
    expect((await one<{ p: number }>(`SELECT points AS p FROM public.points_entry WHERE customer_id = $1`, [a.customerId])).p).toBe(900);

    const b = await effyOrder();
    const rb = await toCourier(b.order, "free_delivery_refund", 900, await updatedAt(b.order));
    expect(await one(`SELECT kind, reason, amount::text AS amount, status, actor_kind FROM public.refund WHERE order_id = $1`, [b.order]))
      .toEqual({ kind: "delivery", reason: "courier_override", amount: "9.00", status: "submitting", actor_kind: "back_office" });
    expect(rb.refundToSubmit).not.toBeNull();
    expect((await deliveryMovesFor(pool, b.order))[0]).toMatchObject({ compensation: "free_delivery_refund", amount: "9.00", refundStatus: "submitting" });

    const c = await effyOrder();
    await toCourier(c.order, "refund_difference", 250, await updatedAt(c.order));
    expect((await one<{ amount: string }>(`SELECT amount::text AS amount FROM public.refund WHERE order_id = $1`, [c.order])).amount).toBe("2.50");

    const e = await effyOrder();
    await toCourier(e.order, "none", 0, await updatedAt(e.order), "Customer asked for courier");
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1`, [e.customerId])).n)).toBe(0);
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.refund WHERE order_id = $1`, [e.order])).n)).toBe(0);
    expect(await latestMoveForCustomer(pool, e.order)).toMatchObject({ compensation: null });
    // Nothing given with no reason why is refused by the database itself.
    const f = await effyOrder();
    expect(await refusal(toCourier(f.order, "none", 0, await updatedAt(f.order)))).toMatch(/delivery_override_none_note_ck/);
  });

  it("P5 — a dearer courier: the difference is zero, nothing is given or taken, and Effy bears it", async () => {
    await pool.query(`UPDATE public.delivery_fee_plan SET base_amount = 14.00 WHERE kind = 'courier'`);
    try {
      const o = await effyOrder();
      const preview = await previewMove(pool, o.order, "courier", NOW);
      expect(preview).toMatchObject({ courierFeeAmount: "14.00", differenceAmount: "0.00" });
      await toCourier(o.order, "points_difference", 0, preview.updatedAt);
      expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1`, [o.customerId])).n)).toBe(0);
      expect((await deliveryMovesFor(pool, o.order))[0]).toMatchObject({ differenceAmount: "0.00", amount: "0.00", points: 0 });
      expect((await one<{ g: string; f: string }>(`SELECT grand_total_amount::text AS g, delivery_fee_amount::text AS f FROM public."order" WHERE id = $1`, [o.order])))
        .toEqual({ g: "49.00", f: "9.00" });
    } finally {
      await pool.query(`UPDATE public.delivery_fee_plan SET base_amount = 6.50 WHERE kind = 'courier'`);
    }
  });

  it("P6 — refused while out for delivery, after a handover or a delivery, before payment, without a type, without a courier", async () => {
    const out = await effyOrder({ deliveryRound: "in_progress" });
    expect((await previewMove(pool, out.order, "courier", NOW)).refusal?.code).toBe("out_for_delivery");
    expect(await refusal(toCourier(out.order, "points_difference", 250, await updatedAt(out.order)))).toBe("out_for_delivery");

    const handed = await effyOrder();
    await pool.query(`INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 'x')`, [handed.packages[0]]);
    expect(await refusal(toCourier(handed.order, "points_difference", 250, await updatedAt(handed.order)))).toBe("handed_over");

    const delivered = await effyOrder();
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 'x')`, [delivered.packages[1]]);
    expect(await refusal(toCourier(delivered.order, "points_difference", 250, await updatedAt(delivered.order)))).toBe("delivered");

    const unpaid = await effyOrder();
    await pool.query(`UPDATE public.payment SET status = 'requires_payment' WHERE order_id = $1`, [unpaid.order]);
    expect(await refusal(toCourier(unpaid.order, "points_difference", 250, await updatedAt(unpaid.order)))).toBe("not_paid");

    const old = await effyOrder();
    await pool.query(`UPDATE public."order" SET delivery_type = NULL, delivery_type_reason = NULL WHERE id = $1`, [old.order]);
    expect(await refusal(toCourier(old.order, "points_difference", 250, await updatedAt(old.order)))).toBe("no_delivery_type");

    const noService = await effyOrder();
    await pool.query(`UPDATE public.courier_service SET is_default = false`);
    try {
      expect(await refusal(toCourier(noService.order, "points_difference", 250, await updatedAt(noService.order)))).toBe("courier_not_ready");
    } finally {
      await pool.query(`UPDATE public.courier_service SET is_default = true WHERE id = $1`, [serviceId]);
    }
  });

  it("P7 — a stale amount or a stale order is refused; a second confirmation gives nothing twice", async () => {
    const o = await effyOrder();
    const at = await updatedAt(o.order);
    const stale = await refusal(toCourier(o.order, "points_difference", 300, at));
    expect(stale).toBe("compensation_changed");
    expect(await refusal(toCourier(o.order, "points_difference", 250, "2020-01-01T00:00:00.000Z"))).toBe("changed");

    await toCourier(o.order, "points_difference", 250, at);
    expect(await refusal(toCourier(o.order, "points_difference", 250, at))).toBe("already_courier");
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1`, [o.customerId])).n)).toBe(1);
    expect(await deliveryMovesFor(pool, o.order)).toHaveLength(1);
  });

  it("P9 — back to Effy: an open window is taken, a booking cancelled, no money moves, compensation already given stays", async () => {
    const o = await effyOrder();
    await toCourier(o.order, "points_difference", 250, await updatedAt(o.order));
    // A courier booking made for one parcel, not yet handed over.
    const booked = (await one<{ id: string }>(
      `INSERT INTO public.courier_consignment (shop_fulfillment_id, courier_service_id, collection, state, created_by) VALUES ($1, $2, 'hub', 'booked', 'x') RETURNING id::text AS id`,
      [o.packages[0], serviceId],
    )).id;

    const back = await previewMove(pool, o.order, "effy", NOW);
    expect(back.allowed).toBe(true);
    const w = back.windows!.find((x) => x.date === TOMORROW && x.slotId === slot)!;
    expect(w.label).toMatch(/4 pm – 6 pm/);

    await tx((c) => moveToEffy(c, { orderId: o.order, actorSub: STAFF, reason: "Van back", window: { slotId: slot, date: TOMORROW }, expectedUpdatedAt: back.updatedAt, now: NOW }));
    expect(await one(`SELECT delivery_type, courier_estimate, courier_service_id, courier_collection FROM public."order" WHERE id = $1`, [o.order]))
      .toEqual({ delivery_type: "effy", courier_estimate: null, courier_service_id: null, courier_collection: null });
    expect(await one(`SELECT state, delivery_date::text AS d, slot_id::text AS s FROM public.delivery_slot_booking WHERE order_id = $1`, [o.order]))
      .toEqual({ state: "confirmed", d: TOMORROW, s: slot });
    expect((await pool.query(`SELECT DISTINCT method, promised_from::text AS d FROM public.order_package_delivery WHERE order_id = $1`, [o.order])).rows)
      .toEqual([{ method: "standard", d: TOMORROW }]);
    expect((await one<{ state: string }>(`SELECT state FROM public.courier_consignment WHERE id = $1`, [booked])).state).toBe("cancelled");
    // No money either way; the points from the first move stay.
    expect(Number((await one<{ n: string }>(`SELECT COALESCE(SUM(points), 0) AS n FROM public.points_entry WHERE customer_id = $1`, [o.customerId])).n)).toBe(250);
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.refund WHERE order_id = $1`, [o.order])).n)).toBe(0);
    const moves = await deliveryMovesFor(pool, o.order);
    expect(moves.map((m) => [m.to, m.compensation, m.amount])).toEqual([["courier", "points_difference", "2.50"], ["effy", "none", "0.00"]]);
    expect(await latestMoveForCustomer(pool, o.order)).toMatchObject({ to: "effy", compensation: null });
  });

  it("P9 — back to Effy is refused for a full window, an address Effy does not reach, or a parcel with the courier", async () => {
    const full = await effyOrder();
    await toCourier(full.order, "none", 0, await updatedAt(full.order), "test");
    const other = await effyOrder();
    await pool.query(
      `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, window_start, window_end) VALUES ($1, $2, $3, 'confirmed', $4, $5)
       ON CONFLICT (order_id) DO UPDATE SET slot_id = EXCLUDED.slot_id, delivery_date = EXCLUDED.delivery_date, window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end`,
      [tightSlot, TOMORROW, other.order, `${TOMORROW}T07:00:00Z`, `${TOMORROW}T09:00:00Z`],
    );
    const preview = await previewMove(pool, full.order, "effy", NOW);
    expect(preview.windows!.some((x) => x.slotId === tightSlot && x.date === TOMORROW)).toBe(false);
    expect(await refusal(tx((c) => moveToEffy(c, {
      orderId: full.order, actorSub: STAFF, reason: "x", window: { slotId: tightSlot, date: TOMORROW }, expectedUpdatedAt: preview.updatedAt, now: NOW,
    })))).toBe("window_unavailable");

    const away = await effyOrder();
    await toCourier(away.order, "none", 0, await updatedAt(away.order), "test");
    await pool.query(`UPDATE public."order" SET delivery_address = '{"postalCode":"7000"}'::jsonb WHERE id = $1`, [away.order]);
    expect((await previewMove(pool, away.order, "effy", NOW)).refusal?.code).toBe("not_in_area");

    const handed = await effyOrder();
    await toCourier(handed.order, "none", 0, await updatedAt(handed.order), "test");
    await pool.query(`INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 'x')`, [handed.packages[0]]);
    expect((await previewMove(pool, handed.order, "effy", NOW)).refusal?.code).toBe("handed_over");
  });

  it("the record is append-only for the shopper role", async () => {
    await pool.query(`CREATE ROLE ov_probe; GRANT effy_shopper TO ov_probe`).catch(() => undefined);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE effy_shopper");
      await expect(c.query(`UPDATE public.delivery_override SET amount_cents = 0`)).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  });
});
