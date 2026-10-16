import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CUSTODY_BY_DRIVER } from "../lib/custody";
import { migrationSql } from "../lib/load-migrations";
import {
  ParcelReturnRoundNotFoundError,
  completeDeliveryRoundIfFinished,
  recordParcelReturn,
  toReturnOnRound,
} from "./parcel-return";

/**
 * 088 — a parcel from a failed drop is in the driver's van until it is returned to the hub, and the
 * round is not finished until then (quickstart P2–P4).
 */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let otherDriverId: string;
let roundId: string;
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

/** A drop on the round with one package, its stop in `stopStatus`. Returns the package's fulfillment id. */
async function drop(stopStatus: string, packageState = "assigned"): Promise<string> {
  n += 1;
  const cust = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@effyshopping.com')::citext) RETURNING id`,
    [`sub-c-${n}-${crypto.randomUUID()}`],
  )).rows[0]!.id;
  const order = (await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
     VALUES ($1, $2, 10, 15, '{"city":"Richmond","postalCode":"3121"}'::jsonb, 'paid') RETURNING id`,
    [cust, `EFY-R${String(n).padStart(4, "0")}`],
  )).rows[0]!.id;
  const shop = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${n}${crypto.randomUUID().slice(0, 4)}`],
  )).rows[0]!.id;
  const sf = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [order, shop],
  )).rows[0]!.id;
  const stop = (await pool.query<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, order_id, status) VALUES ($1, 'customer_drop', $2, $3) RETURNING id`,
    [roundId, order, stopStatus],
  )).rows[0]!.id;
  await pool.query(
    `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state) VALUES ($1, $2, $3)`,
    [stop, sf, packageState],
  );
  return sf;
}

const roundStatus = async () =>
  (await pool.query<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [roundId])).rows[0]!.status;

const custody = async () =>
  (await pool.query<{ package_id: string; to_return: boolean }>(CUSTODY_BY_DRIVER, [driverId])).rows;

d("088 — parcels to return to the hub", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.round_package, public.parcel_return, public.round_stop, public.driver_round,
                      public.dispatch_wave, public.shop_fulfillment, public."order", public.shop, public.customer,
                      public.driver CASCADE`);
    const mk = async (name: string) =>
      (await pool.query<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, $2, ($1 || '@effyshopping.com')::citext) RETURNING id`,
        [`sub-${name}-${crypto.randomUUID()}`, name],
      )).rows[0]!.id;
    driverId = await mk("ada");
    otherDriverId = await mk("bo");
    const wave = (await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
    )).rows[0]!.id;
    roundId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, status)
       VALUES ($1, $2, 'delivery', now() + interval '4 hours', 'in_progress') RETURNING id`,
      [wave, driverId],
    )).rows[0]!.id;
  });

  it("a failed drop's parcel is to return and in the driver's custody; a staged one is not", async () => {
    const failed = await drop("skipped");
    const moving = await drop("en_route");
    const staged = await drop("pending");

    expect((await toReturnOnRound(pool, roundId))?.count).toBe(1);
    const held = await custody();
    expect(held.find((h) => h.package_id === failed)?.to_return).toBe(true);
    expect(held.find((h) => h.package_id === moving)?.to_return).toBe(false);
    expect(held.some((h) => h.package_id === staged)).toBe(false);
  });

  it("the round is not finished while a parcel is to return, and is once it is returned", async () => {
    await drop("done", "delivered");
    await drop("skipped");

    expect(await tx((c) => completeDeliveryRoundIfFinished(c, roundId))).toBe(false);
    expect(await roundStatus()).toBe("in_progress");

    const r = await tx((c) =>
      recordParcelReturn(c, { roundId, driverId, recordedBy: "driver", recordedBySub: "sub-ada", changeId: crypto.randomUUID() }));
    expect(r).toMatchObject({ returned: 1, roundComplete: true, replayed: false });
    expect(await roundStatus()).toBe("completed");
    expect(await custody()).toHaveLength(0);
    expect(await toReturnOnRound(pool, roundId)).toBeNull();
  });

  it("is idempotent on changeId, and a second action finds nothing left", async () => {
    await drop("skipped");
    await drop("skipped");
    const changeId = crypto.randomUUID();
    const first = await tx((c) => recordParcelReturn(c, { roundId, driverId, recordedBy: "driver", recordedBySub: "s", changeId }));
    const replay = await tx((c) => recordParcelReturn(c, { roundId, driverId, recordedBy: "driver", recordedBySub: "s", changeId }));
    const again = await tx((c) =>
      recordParcelReturn(c, { roundId, driverId, recordedBy: "driver", recordedBySub: "s", changeId: crypto.randomUUID() }));

    expect(first.returned).toBe(2);
    expect(replay).toMatchObject({ returned: 2, replayed: true });
    expect(again.returned).toBe(0);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.parcel_return`);
    expect(rows.rows[0].n).toBe(1);
  });

  it("records a staff return against the round's driver, and refuses another driver's round", async () => {
    await drop("skipped");
    await expect(tx((c) =>
      recordParcelReturn(c, { roundId, driverId: otherDriverId, recordedBy: "driver", recordedBySub: "s", changeId: crypto.randomUUID() })),
    ).rejects.toBeInstanceOf(ParcelReturnRoundNotFoundError);

    const r = await tx((c) =>
      recordParcelReturn(c, { roundId, recordedBy: "staff", recordedBySub: "sub-staff", changeId: crypto.randomUUID() }));
    expect(r.driverId).toBe(driverId);
    const row = await pool.query(`SELECT recorded_by, recorded_by_sub, driver_id FROM public.parcel_return`);
    expect(row.rows[0]).toMatchObject({ recorded_by: "staff", recorded_by_sub: "sub-staff", driver_id: driverId });
  });

  it("a failed drop later delivered on the same round is not to return", async () => {
    await drop("done", "delivered");
    expect(await toReturnOnRound(pool, roundId)).toBeNull();
    expect(await tx((c) => completeDeliveryRoundIfFinished(c, roundId))).toBe(true);
  });
});
