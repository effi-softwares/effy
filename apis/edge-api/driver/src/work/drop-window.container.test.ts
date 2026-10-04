import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 069 US4 — the driver sees the window the customer was sold, against the REAL migrations.
 *
 * `DeliveryDropSummary.window` has existed since 049 and was hard-coded null: no window was ever
 * sold. This proves it now comes from the ORDER's own packages, that earlier windows are ordered
 * first through the ONE shared ordering rule, and that an order placed before 069 still says nothing.
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

import { deliveryDrop } from "./delivery";
import { NotFoundError, deliveryRun } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let slotSeq = 0;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params as never[])).rows[0]!;

async function makeDriver(): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email)
     VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`sub-${crypto.randomUUID()}`],
  )).id;
}

async function makeRound(driverId: string): Promise<string> {
  const wave = await one<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
  );
  return (await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
    [wave.id, driverId],
  )).id;
}

/** A customer drop on a round. `window` null is an order placed before 069. */
async function addDrop(
  roundId: string,
  suburb: string,
  window: { start: string; end: string } | null,
  packages = 1,
): Promise<string> {
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount,
                                 delivery_address, status)
     VALUES ($1, 'EFY-' || substr(md5(random()::text), 1, 6), 10, 12,
             jsonb_build_object('recipientName', 'Pat', 'line1', '1 Test St', 'city', $2::text,
                                'postalCode', '3053', 'region', 'VIC'),
             'paid') RETURNING id`,
    [cust.id, suburb],
  );
  const drop = await one<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
    [roundId, order.id],
  );

  let slotId: string | null = null;
  if (window) {
    slotSeq += 1;
    slotId = (await one<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
       VALUES ('00:00'::time + ($1 || ' minutes')::interval,
               '00:00'::time + ($1 || ' minutes')::interval + interval '30 seconds', '00:00', 5, 'test')
       RETURNING id`,
      [slotSeq],
    )).id;
  }

  for (let i = 0; i < packages; i++) {
    const shop = await one<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('S' || substr(md5(random()::text), 1, 6), 'Shop') RETURNING id`,
    );
    const sf = await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`,
      [order.id, shop.id],
    );
    await pool.query(
      `INSERT INTO public.order_package_delivery
         (order_id, shop_id, method, delivery_fee_amount, slot_id, window_start, window_end)
       VALUES ($1, $2, 'same_day', 8, $3, $4, $5)`,
      [order.id, shop.id, slotId, window?.start ?? null, window?.end ?? null],
    );
    await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sf.id]);
  }
  return drop.id;
}

const EARLY = { start: "2026-10-08T06:00:00.000Z", end: "2026-10-08T08:00:00.000Z" }; // 5–7 pm AEDT
const LATE = { start: "2026-10-08T08:00:00.000Z", end: "2026-10-08T10:00:00.000Z" }; //  7–9 pm AEDT

d("069 — the delivery window on the driver's work", () => {
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
    for (const t of ["round_package", "round_stop", "driver_round", "dispatch_wave", "shop_fulfillment"]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.delivery_slot");
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");
  });

  it("the drop carries the window the customer was sold, as instants", async () => {
    const driverId = await makeDriver();
    const dropId = await addDrop(await makeRound(driverId), "Carlton", EARLY);

    const drop = await deliveryDrop(dropId, driverId);
    expect(drop.deliveryWindow).toEqual({ startAt: EARLY.start, endAt: EARLY.end });
    // The label is the server's, in Melbourne time — the app never formats a time itself.
    expect(drop.window).toBe("5 pm – 7 pm");
  });

  it("an order with two packages still has ONE window", async () => {
    const driverId = await makeDriver();
    const dropId = await addDrop(await makeRound(driverId), "Carlton", EARLY, 2);

    const drop = await deliveryDrop(dropId, driverId);
    expect(drop.packages).toHaveLength(2);
    expect(drop.deliveryWindow).toEqual({ startAt: EARLY.start, endAt: EARLY.end });
  });

  it("an order placed before 069 has no window, and nothing is invented in its place", async () => {
    const driverId = await makeDriver();
    const roundId = await makeRound(driverId);
    const dropId = await addDrop(roundId, "Carlton", null);

    expect(await deliveryDrop(dropId, driverId)).toMatchObject({ deliveryWindow: null, window: null });
    const run = await deliveryRun(roundId, driverId);
    expect(run.drops[0]).toMatchObject({ window: null, deliveryWindow: null });
  });

  it("⚠ the round lists earlier windows first, and labels each in Melbourne time", async () => {
    const driverId = await makeDriver();
    const roundId = await makeRound(driverId);
    // Inserted LATE first, so insertion order cannot be what puts EARLY on top.
    await addDrop(roundId, "Late Suburb", LATE);
    await addDrop(roundId, "No Window", null);
    await addDrop(roundId, "Early Suburb", EARLY);

    const run = await deliveryRun(roundId, driverId);

    expect(run.drops.map((x) => x.customerSuburb)).toEqual(["Early Suburb", "Late Suburb", "No Window"]);
    expect(run.drops.map((x) => x.sequence)).toEqual([1, 2, 3]);
    expect(run.drops[0]).toMatchObject({
      window: "5 pm – 7 pm",
      deliveryWindow: { startAt: EARLY.start, endAt: EARLY.end },
    });
    expect(run.drops[1]!.window).toBe("7 pm – 9 pm");
  });

  it("another driver cannot read the drop or its window", async () => {
    const owner = await makeDriver();
    const other = await makeDriver();
    const dropId = await addDrop(await makeRound(owner), "Carlton", EARLY);

    await expect(deliveryDrop(dropId, other)).rejects.toBeInstanceOf(NotFoundError);
  });
});
