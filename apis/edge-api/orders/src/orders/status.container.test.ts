import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 073 — WHERE A PACKAGE IS, on the order reads, against the REAL migrations.
 *
 * ⚠ THE DEFECT THIS PINS was found live: a package a driver had just collected read "At hub" (standard)
 * or "Out for delivery" (same-day) in back-office, and checking it in at the hub changed nothing,
 * because the screen guessed from the shop's status alone. The status is now derived from the
 * dispatch rows, and the only way to prove a join across six tables picks the right rows is to run it.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
  // Reads through the library's own pool, which this test does not configure; not under test here.
  proposedRefunds: async () => [],
}));

import { migrationSql } from "@effy/edge-shared";

import { getOrder, listOrders } from "./service";


const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("073 — package status on the order reads (real migrations)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let seq = 0;

  const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pool.query<T>(sql, params as never[])).rows[0]!;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.delivery_attempt_failure, public.delivery_proof, public.package_arrival,
                               public.carrier_handoff, public.hub_checkin, public.round_package,
                               public.round_stop, public.driver_round, public.dispatch_wave,
                               public.shop_fulfillment, public."order", public.customer,
                               public.driver, public.shop CASCADE`);
  });

  /** A paid order with one package from one shop, in `status`. */
  async function aPackage(method: "standard" | "same_day", status = "ready_for_pickup") {
    seq += 1;
    const cust = await one<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`,
      [`c-${seq}`, `c${seq}@example.com`],
    );
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, delivery_fee_amount,
                                   grand_total_amount, delivery_address, placed_at)
       VALUES ($1, $2, 'paid', 10, 0, 10, '{"city":"Richmond","postalCode":"3121"}'::jsonb, now()) RETURNING id`,
      [cust.id, `EFY-ST${seq}`],
    );
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${seq}`]);
    const sf = await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, $3, $4) RETURNING id`,
      [order.id, shop.id, status, method],
    );
    return { orderId: order.id, sfId: sf.id, shopId: shop.id };
  }

  async function aDriver(name: string) {
    return (await one<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, $2, $3) RETURNING id`,
      [`sub-${name}-${seq}`, name, `${name.toLowerCase()}${seq}@effyshopping.com`],
    )).id;
  }

  /** Put the package on a round of `kind` for `driverId`, in `state`, at a stop in `stopStatus`. */
  async function onRound(kind: "collection" | "delivery", p: { sfId: string; shopId: string; orderId: string }, driverId: string, state: string, stopStatus = "pending") {
    const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ($1, now(), 'schedule') RETURNING id`, [kind]);
    const round = await one<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, $3, now() + interval '2 hours') RETURNING id`,
      [wave.id, driverId, kind],
    );
    const stop = await one<{ id: string }>(
      kind === "collection"
        ? `INSERT INTO public.round_stop (round_id, kind, shop_id, status) VALUES ($1, 'shop_pickup', $2, $3) RETURNING id`
        : `INSERT INTO public.round_stop (round_id, kind, order_id, status) VALUES ($1, 'customer_drop', $2, $3) RETURNING id`,
      [round.id, kind === "collection" ? p.shopId : p.orderId, stopStatus],
    );
    await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state) VALUES ($1, $2, $3)`, [stop.id, p.sfId, state]);
    return { roundId: round.id, stopId: stop.id };
  }

  const statusOf = async (orderId: string) => (await getOrder(orderId))!.packages[0]!.statusView!;

  // ⚠ S2 — THE DEFECT. This read "At hub" / "Out for delivery" until 073.
  it.each(["standard", "same_day"] as const)("S2 — a %s package just collected is With driver, naming them", async (method) => {
    const p = await aPackage(method, "collected");
    await onRound("collection", p, await aDriver("Ada"), "picked_up", "done");

    expect(await statusOf(p.orderId)).toEqual({ status: "with_driver", word: "With driver", detail: null, driverName: "Ada" });
    // The list row says the same thing.
    const { items } = await listOrders({ limit: 10 });
    expect(items.find((i) => i.id === p.orderId)!.statusView!.status).toBe("with_driver");
  });

  it("checked in at the hub → At hub", async () => {
    const p = await aPackage("standard", "collected");
    const ada = await aDriver("Ada");
    const { roundId } = await onRound("collection", p, ada, "picked_up", "done");
    await pool.query(`INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived) VALUES ($1, $2, 1, 1)`, [roundId, ada]);

    expect((await statusOf(p.orderId)).status).toBe("at_hub");
  });

  // S4 — same-day out, delivered, failed.
  it("S4 — same-day: on a round → At hub; drop started → Out for delivery; proof → Delivered", async () => {
    const p = await aPackage("same_day", "collected");
    const ada = await aDriver("Ada");
    const ben = await aDriver("Ben");
    const c = await onRound("collection", p, ada, "picked_up", "done");
    await pool.query(`INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived) VALUES ($1, $2, 1, 1)`, [c.roundId, ada]);
    const d = await onRound("delivery", p, ben, "assigned", "pending");
    expect((await statusOf(p.orderId)).status).toBe("at_hub");

    await pool.query(`UPDATE public.round_stop SET status = 'out_for_delivery' WHERE id = $1`, [d.stopId]);
    expect(await statusOf(p.orderId)).toMatchObject({ status: "out_for_delivery", driverName: "Ben" });

    await pool.query(`UPDATE public.shop_fulfillment SET status = 'delivered' WHERE id = $1`, [p.sfId]);
    expect((await statusOf(p.orderId)).status).toBe("delivered");
  });

  it("S4 — a failed attempt → Problem, saying why", async () => {
    const p = await aPackage("same_day", "collected");
    const ben = await aDriver("Ben");
    const d = await onRound("delivery", p, ben, "assigned", "skipped");
    await pool.query(
      `INSERT INTO public.delivery_attempt_failure (stop_id, reason, driver_id, failed_at, change_id)
       VALUES ($1, 'nobody_home', $2, now(), gen_random_uuid())`,
      [d.stopId, ben],
    );
    expect(await statusOf(p.orderId)).toMatchObject({ status: "problem", detail: "Delivery attempt failed — nobody home" });
  });

  // S5 — standard to the carrier.
  it("S5 — standard: handed over → With carrier; arrival → Delivered", async () => {
    const p = await aPackage("standard", "collected");
    await pool.query(`INSERT INTO public.carrier_handoff (shop_fulfillment_id, recorded_by_sub) VALUES ($1, 'staff')`, [p.sfId]);
    expect((await statusOf(p.orderId)).status).toBe("with_carrier");
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub) VALUES ($1, 'staff_recorded', 'staff')`, [p.sfId]);
    expect((await statusOf(p.orderId)).status).toBe("delivered");
  });

  it("not collected at the shop → Problem, not Ready", async () => {
    const p = await aPackage("standard", "ready_for_pickup");
    await onRound("collection", p, await aDriver("Ada"), "not_available", "done");
    expect(await statusOf(p.orderId)).toMatchObject({ status: "problem", detail: "Not collected at the shop" });
  });

  it("ready with nobody yet → Ready", async () => {
    const p = await aPackage("standard");
    expect((await statusOf(p.orderId)).status).toBe("ready");
  });

  // ── 073 US2 — who has it ────────────────────────────────────────────────────────────────────────

  it("shows the collecting driver, how they were chosen, and whether it can still be moved", async () => {
    const p = await aPackage("standard");
    const ada = await aDriver("Ada");
    await onRound("collection", p, ada, "assigned");
    await pool.query(`UPDATE public.round_package SET assigned_note = 'Auto-assigned — fewest packages today (2)'`);

    const pkg = (await getOrder(p.orderId))!.packages[0]!;
    expect(pkg.collect).toMatchObject({ driver: { id: ada, name: "Ada" }, how: "Auto-assigned — fewest packages today (2)", movable: true });
    expect(pkg.deliver).toBeNull();
    const row = (await listOrders({ limit: 10 })).items.find((i) => i.id === p.orderId)!;
    expect(row.drivers.collect).toEqual(["Ada"]);
    expect(row.needsDriver).toBe(false);
  });

  it("a collected package is not movable", async () => {
    const p = await aPackage("standard", "collected");
    await onRound("collection", p, await aDriver("Ada"), "picked_up", "done");
    expect((await getOrder(p.orderId))!.packages[0]!.collect).toMatchObject({ movable: false });
  });

  it("an unassigned package says why in one line, and the list filter finds it", async () => {
    const waiting = await aPackage("standard");
    const placed = await aPackage("standard");
    await onRound("collection", placed, await aDriver("Ada"), "assigned");
    await pool.query(
      `INSERT INTO public.assignment_exclusion (kind, shop_fulfillment_id, driver_id, reason) VALUES ('collection', $1, NULL, 'not_on_duty')`,
      [waiting.sfId],
    );

    const pkg = (await getOrder(waiting.orderId))!.packages[0]!;
    expect(pkg.collect).toMatchObject({ assignmentId: null, unassignedReason: "No driver is on duty", movable: true });

    const filtered = (await listOrders({ limit: 10, needsDriver: true })).items.map((i) => i.id);
    expect(filtered).toEqual([waiting.orderId]);
  });

  it("a same-day package at the hub with nobody to deliver it needs a driver", async () => {
    const p = await aPackage("same_day", "collected");
    const ada = await aDriver("Ada");
    const c = await onRound("collection", p, ada, "picked_up", "done");
    await pool.query(`INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived) VALUES ($1, $2, 1, 1)`, [c.roundId, ada]);

    const pkg = (await getOrder(p.orderId))!.packages[0]!;
    expect(pkg.collect).toMatchObject({ movable: false, driver: { name: "Ada" } });
    expect(pkg.deliver).toMatchObject({ assignmentId: null, unassignedReason: "Waiting for auto-assign (every 5 minutes)" });
    expect((await listOrders({ limit: 10, needsDriver: true })).items.map((i) => i.id)).toEqual([p.orderId]);
  });
});

