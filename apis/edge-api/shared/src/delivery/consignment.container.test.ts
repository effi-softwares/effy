import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { packageStatuses } from "../status";
import {
  bookConsignment, changeCourierCollection, ConsignmentRefusal, consignmentsFor, handOver, recordConsignmentStep,
} from "./consignment";

/**
 * 080 — the consignment writer against the REAL schema: a courier parcel's journey, the facts 053
 * records beside it, what the customer is told, and the collection mode's rules.
 *
 * ⚠ The courier service here is obviously fictional. A real courier's name is the operator's to enter.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const STAFF = { kind: "staff" as const, sub: "sub-staff" };

let container: StartedPostgreSqlContainer;
let pool: Pool;
let customerId: string;
let shopA: string;
let shopB: string;
let hubService: string;
let supplierService: string;
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
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof ConsignmentRefusal ? e.code : String(e)));

/** A paid courier order from the given shops; each package `status`. */
async function courierOrder(mode: "hub" | "supplier", shops: string[], status = "collected") {
  n += 1;
  const order = (
    await pool.query<{ id: string }>(
      `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency,
                                   delivery_address, delivery_type, delivery_type_reason, courier_estimate, courier_service_id, courier_collection, placed_at)
       VALUES ($1, $2, 'paid', 10, 9, 19, 'AUD', '{}'::jsonb, 'courier', 'out_of_coverage', '2–4 business days', $3, $4, now())
       RETURNING id::text AS id`,
      [`EFY-CN${String(n).padStart(3, "0")}`, customerId, hubService, mode],
    )
  ).rows[0]!.id;
  const packages: string[] = [];
  for (const shop of shops) {
    packages.push(
      (
        await pool.query<{ id: string }>(
          `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
           VALUES ($1, $2, 1, 5, $3, 'standard') RETURNING id::text AS id`,
          [order, shop, status],
        )
      ).rows[0]!.id,
    );
    await pool.query(`INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, 'standard')`, [order, shop]);
  }
  return { order, packages };
}

d("080 — courier consignments", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    customerId = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('sub-cust', 'c@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    shopA = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('CN-A', 'Shop A') RETURNING id::text AS id`)).rows[0]!.id;
    shopB = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('CN-B', 'Shop B') RETURNING id::text AS id`)).rows[0]!.id;
    const service = (name: string, supplier: boolean, isDefault: boolean) =>
      pool
        .query<{ id: string }>(
          `INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff,
                                               collects_from_supplier, is_default, updated_by)
           VALUES ('Test Courier', $1, '2–4 business days', 4, '{1,2,3,4,5}', '14:00', $2, $3, 'test') RETURNING id::text AS id`,
          [name, supplier, isDefault],
        )
        .then((r) => r.rows[0]!.id);
    hubService = await service("Hub parcel", false, true);
    supplierService = await service("Door pickup", true, false);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("P3/P5 — via the hub: a handover nobody booked makes the consignment; delivered completes the order", async () => {
    const { order, packages } = await courierOrder("hub", [shopA]);
    const pkg = packages[0]!;

    const first = await tx((c) => handOver(c, { packageId: pkg, actor: STAFF, reference: "ABC123" }));
    expect(first).toMatchObject({ created: true, reference: "ABC123", carrierName: "Test Courier", orderId: order });
    expect(first.consignmentId).not.toBeNull();
    // ⚠ 053's record of the handover is written WITH it — status, arrival guard and completion read it.
    expect((await pool.query(`SELECT reference FROM public.carrier_handoff WHERE shop_fulfillment_id = $1`, [pkg])).rows).toEqual([{ reference: "ABC123" }]);
    expect((await packageStatuses(pool, [pkg])).get(pkg)?.status).toBe("with_carrier");
    // Repeating it is a replay, not a second handover.
    expect((await tx((c) => handOver(c, { packageId: pkg, actor: STAFF }))).created).toBe(false);
    // The customer is told once.
    // ⚠ Push AND email, once each per consignment — the email is the per-parcel tracking (Q8).
    expect((await pool.query(`SELECT channel, payload->>'entityId' AS entity, recipient_email IS NOT NULL AS has_email
                                FROM public.notification_request WHERE type = 'order_with_courier' ORDER BY channel`)).rows)
      .toEqual([
        { channel: "email", entity: first.consignmentId, has_email: true },
        { channel: "push", entity: first.consignmentId, has_email: false },
      ]);

    await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "in_transit", actor: STAFF }));
    const done = await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "delivered", actor: STAFF }));
    expect(done).toEqual({ orderId: order, orderFinished: true });
    expect((await packageStatuses(pool, [pkg])).get(pkg)?.status).toBe("delivered");
    expect((await pool.query(`SELECT source FROM public.package_arrival WHERE shop_fulfillment_id = $1`, [pkg])).rows).toEqual([{ source: "staff_recorded" }]);
    const c = (await consignmentsFor(pool, [pkg])).get(pkg)!;
    expect(c.state).toBe("delivered");
    expect(c.events.map((e) => e.kind)).toEqual(["handed_over", "in_transit", "delivered"]);
    // Nothing more after delivered.
    expect(await refusal(tx((x) => recordConsignmentStep(x, { packageId: pkg, kind: "lost", actor: STAFF })))).toBe("invalid_step");
  });

  it("a hub parcel not yet brought in cannot be handed over; an Effy-delivered one never can", async () => {
    const { packages } = await courierOrder("hub", [shopA], "ready_for_pickup");
    expect(await refusal(tx((c) => handOver(c, { packageId: packages[0]!, actor: STAFF })))).toBe("not_collected");
    const effy = await courierOrder("hub", [shopA]);
    await pool.query(`UPDATE public."order" SET delivery_type = 'effy', delivery_type_reason = 'in_coverage', courier_estimate = NULL WHERE id = $1`, [effy.order]);
    expect(await refusal(tx((c) => handOver(c, { packageId: effy.packages[0]!, actor: STAFF })))).toBe("not_carrier");
  });

  it("from the supplier: booked with a supplier service, handed over by the shop, never At hub", async () => {
    const { packages } = await courierOrder("supplier", [shopA, shopB], "ready_for_pickup");
    const [a, b] = packages as [string, string];
    const shop = { kind: "shop" as const, sub: "sub-shop-a", staffId: null };
    // Not booked yet: the shop cannot hand it over.
    expect(await refusal(tx((c) => handOver(c, { packageId: a, actor: shop })))).toBe("not_booked");
    // A hub-only service cannot collect from a supplier.
    expect(await refusal(tx((c) => bookConsignment(c, { packageId: a, serviceId: hubService, actor: STAFF, now: new Date() })))).toBe("service_not_supplier");
    // A pickup day in the past is refused.
    expect(await refusal(tx((c) => bookConsignment(c, { packageId: a, serviceId: supplierService, pickup: { date: "2020-01-01" }, actor: STAFF, now: new Date() }))))
      .toBe("pickup_in_past");

    for (const p of [a, b]) {
      await tx((c) => bookConsignment(c, { packageId: p, serviceId: supplierService, reference: `R-${p.slice(0, 4)}`, actor: STAFF, now: new Date() }));
    }
    await tx((c) => handOver(c, { packageId: a, actor: shop }));
    expect((await pool.query(`SELECT status FROM public.shop_fulfillment WHERE id = $1`, [a])).rows[0]).toEqual({ status: "collected" });
    expect((await packageStatuses(pool, [a])).get(a)?.status).toBe("with_carrier");
    expect((await packageStatuses(pool, [b])).get(b)?.status).toBe("ready");
    // Two consignments, one per parcel; each the shop's own.
    const both = await consignmentsFor(pool, [a, b]);
    expect([both.get(a)?.state, both.get(b)?.state]).toEqual(["handed_over", "booked"]);
    expect(both.get(a)?.collection).toBe("supplier");
  });

  it("P6 — a problem is a Problem until resolved; resolving puts it back where it was", async () => {
    const { packages } = await courierOrder("hub", [shopA]);
    const pkg = packages[0]!;
    await tx((c) => handOver(c, { packageId: pkg, actor: STAFF }));
    await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "in_transit", actor: STAFF }));
    await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "lost", actor: STAFF, note: "Courier cannot find it" }));
    expect((await packageStatuses(pool, [pkg])).get(pkg)).toMatchObject({ status: "problem", detail: "With the courier — lost" });
    expect(await refusal(tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "in_transit", actor: STAFF })))).toBe("invalid_step");
    await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "resolved", actor: STAFF, note: "Found at depot" }));
    expect((await consignmentsFor(pool, [pkg])).get(pkg)?.state).toBe("in_transit");
    expect((await packageStatuses(pool, [pkg])).get(pkg)?.status).toBe("with_carrier");
    // Resolving with nothing open is refused.
    expect(await refusal(tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "resolved", actor: STAFF })))).toBe("invalid_step");
  });

  it("a booking can be cancelled before handover, never after; a new one can then be made", async () => {
    const { packages } = await courierOrder("hub", [shopA]);
    const pkg = packages[0]!;
    await tx((c) => bookConsignment(c, { packageId: pkg, serviceId: hubService, actor: STAFF, now: new Date() }));
    await tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "cancelled", actor: STAFF }));
    expect((await consignmentsFor(pool, [pkg])).size).toBe(0);
    await tx((c) => bookConsignment(c, { packageId: pkg, serviceId: hubService, reference: "SECOND", actor: STAFF, now: new Date() }));
    await tx((c) => handOver(c, { packageId: pkg, actor: STAFF }));
    expect(await refusal(tx((c) => recordConsignmentStep(c, { packageId: pkg, kind: "cancelled", actor: STAFF })))).toBe("invalid_step");
    // After handover the service is history.
    expect(await refusal(tx((c) => bookConsignment(c, { packageId: pkg, serviceId: supplierService, actor: STAFF, now: new Date() })))).toBe("consignment_handed_over");
    expect((await consignmentsFor(pool, [pkg])).get(pkg)?.reference).toBe("SECOND");
  });

  it("P7 — the mode changes until something leaves, with history; a supplier booking is cancelled by moving to the hub", async () => {
    const { order, packages } = await courierOrder("supplier", [shopA], "ready_for_pickup");
    await tx((c) => bookConsignment(c, { packageId: packages[0]!, serviceId: supplierService, actor: STAFF, now: new Date() }));
    expect(await tx((c) => changeCourierCollection(c, { orderId: order, to: "hub", actorSub: "sub-staff", note: "Courier cannot reach the shop" })))
      .toMatchObject({ changed: true });
    expect((await consignmentsFor(pool, packages)).size).toBe(0);
    expect((await pool.query(`SELECT from_mode, to_mode, note FROM public.order_courier_collection_change WHERE order_id = $1`, [order])).rows)
      .toEqual([{ from_mode: "supplier", to_mode: "hub", note: "Courier cannot reach the shop" }]);

    await pool.query(`UPDATE public.shop_fulfillment SET status = 'collected' WHERE id = $1`, [packages[0]]);
    await tx((c) => handOver(c, { packageId: packages[0]!, actor: STAFF }));
    expect(await refusal(tx((c) => changeCourierCollection(c, { orderId: order, to: "supplier", actorSub: "sub-staff" })))).toBe("collection_locked");
  });

  it("P14 — the history tables cannot be rewritten by the role checkout runs as", async () => {
    const c = await pool.connect();
    try {
      await c.query(`SET ROLE effy_shopper`);
      await expect(c.query(`DELETE FROM public.courier_consignment_event`)).rejects.toThrow(/permission denied/);
      await expect(c.query(`UPDATE public.order_courier_collection_change SET note = 'x'`)).rejects.toThrow(/permission denied/);
    } finally {
      await c.query(`RESET ROLE`);
      c.release();
    }
  });
});
