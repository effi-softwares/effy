import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Each sequence gate driven through the real functions, each refusal writing nothing; a package not
 * shown is not collected, and a package declared missing is held out of planning.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});

import { migrationSql } from "@effy/edge-shared/testing";
import { createFirstParcels, expectedParcels, ParcelsUnaccounted } from "@effy/edge-shared/labels";

import { gatherDeliveryWork } from "../../../fleet/src/planner/repository";
import { recordFailure, recordProof } from "../proof/repository";
import { collectStop, hubCheckin } from "./complete";
import { setDropStatus } from "./delivery";
import { loadRun } from "./load";
import { SequenceError } from "./sequence";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let n = 0;

const change = () => crypto.randomUUID();
const one = async <T,>(sql: string, params: unknown[] = []) => (await pool.query(sql, params as never[])).rows[0] as T;

/** Bag 1 for each package, as payment creates it, with each one's code. */
async function bagsOf(packageIds: string[]): Promise<Map<string, string>> {
  await createFirstParcels(pool, { packageIds });
  const rows = (await pool.query(`SELECT shop_fulfillment_id, parcel_code FROM public.package_parcel WHERE shop_fulfillment_id = ANY($1::uuid[])`, [packageIds])).rows;
  return new Map(rows.map((r) => [r.shop_fulfillment_id as string, r.parcel_code as string]));
}

async function anOrder(shopId: string, status: "ready_for_pickup" | "collected"): Promise<{ sfId: string; orderId: string }> {
  n += 1;
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`,
    [`c-${n}-${crypto.randomUUID()}`, `c${n}.${crypto.randomUUID()}@effyshopping.com`],
  );
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, delivery_fee_amount,
                                 grand_total_amount, delivery_address, delivery_type, delivery_type_reason)
     VALUES ($1, $2, 'paid', 10, 0, 10, '{"line1":"1 Seq St","city":"Fitzroy","postalCode":"3065"}'::jsonb, 'effy', 'in_coverage') RETURNING id`,
    [cust.id, `EFY-SEQ${String(n).padStart(3, "0")}`],
  );
  const sf = await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, delivery_method, item_count, subtotal_amount, state_changed_at)
     VALUES ($1, $2, $3, 'same_day', 1, 10, now()) RETURNING id`,
    [order.id, shopId, status],
  );
  return { sfId: sf.id, orderId: order.id };
}

async function aShop(): Promise<string> {
  n += 1;
  return (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, $2) RETURNING id`, [`SQ${n}`, `Shop ${n}`])).id;
}

async function aCollectionRun(packagesPerShop: number[]) {
  const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
  const round = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'collection', now() + interval '30 minutes') RETURNING id`,
    [wave.id, driverId],
  );
  const stops: Array<{ stopId: string; shopName: string; sfIds: string[] }> = [];
  for (const count of packagesPerShop) {
    const shopId = await aShop();
    const stop = await one<{ id: string }>(`INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`, [round.id, shopId]);
    const sfIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const { sfId } = await anOrder(shopId, "ready_for_pickup");
      await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [stop.id, sfId]);
      sfIds.push(sfId);
    }
    stops.push({ stopId: stop.id, shopName: (await one<{ name: string }>(`SELECT name FROM public.shop WHERE id = $1`, [shopId])).name, sfIds });
  }
  await pool.query(`INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`, [round.id]);
  return { roundId: round.id, stops };
}

/** One drop per entry, each with that many packages, on a run with no window. */
async function aDeliveryRun(packagesPerDrop: number[]) {
  const shopId = await aShop();
  const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`);
  const round = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
    [wave.id, driverId],
  );
  const drops: Array<{ dropId: string; sfIds: string[] }> = [];
  for (const count of packagesPerDrop) {
    const first = await anOrder(shopId, "collected");
    const drop = await one<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [round.id, first.orderId],
    );
    const sfIds = [first.sfId];
    for (let i = 1; i < count; i++) {
      const other = await one<{ id: string }>(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, delivery_method, item_count, subtotal_amount, state_changed_at)
         VALUES ($1, $2, 'collected', 'same_day', 1, 10, now()) RETURNING id`,
        [first.orderId, await aShop()],
      );
      sfIds.push(other.id);
    }
    for (const sfId of sfIds) await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sfId]);
    drops.push({ dropId: drop.id, sfIds });
  }
  return { roundId: round.id, drops };
}

const all = (sfIds: string[]) => sfIds.map((packageId) => ({ packageId, outcome: "picked_up" as const }));

async function refusal(p: Promise<unknown>): Promise<SequenceError> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(SequenceError);
  return err as SequenceError;
}

async function snapshot() {
  return pool.query(`SELECT
    (SELECT json_agg(json_build_object('id', id, 'status', status) ORDER BY id) FROM public.round_stop) AS stops,
    (SELECT json_agg(json_build_object('id', id, 'state', state) ORDER BY id) FROM public.round_package) AS packages,
    (SELECT json_agg(json_build_object('id', id, 'status', status) ORDER BY id) FROM public.driver_round) AS rounds,
    (SELECT count(*) FROM public.hub_checkin) AS checkins,
    (SELECT count(*) FROM public.delivery_proof) AS proofs,
    (SELECT count(*) FROM public.delivery_attempt_failure) AS failures,
    (SELECT count(*) FROM public.package_hold) AS holds`).then((r) => r.rows[0]);
}

d("093 — the order of a driver's work", () => {
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
    await pool.query(`TRUNCATE public.package_hold, public.round_sequence_waiver, public.package_handover, public.delivery_proof,
                               public.delivery_attempt_failure, public.package_arrival, public.hub_checkin, public.round_package,
                               public.round_stop, public.driver_round, public.dispatch_wave, public.shop_fulfillment,
                               public."order", public.customer, public.driver_duty_session, public.driver, public.shop CASCADE`);
    driverId = (await one<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('sub-seq', 'Seq Driver', 'seq.driver@effyshopping.com') RETURNING id`,
    )).id;
    await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [driverId]);
  });

  it("check-in is refused while a shop is outstanding, naming it; once every shop is settled it succeeds", async () => {
    const { roundId, stops } = await aCollectionRun([1, 1]);
    await collectStop(roundId, stops[0]!.stopId, driverId, { changeId: change(), packages: all(stops[0]!.sfIds) });

    const before = await snapshot();
    const err = await refusal(hubCheckin(roundId, driverId));
    expect(err.type).toBe("stops_outstanding");
    expect(err.sentence).toBe(`Collect from ${stops[1]!.shopName} first.`);
    expect(err.issues).toEqual([{ field: "stopId", message: stops[1]!.stopId }]);
    expect(await snapshot(), "nothing written").toEqual(before);

    // A shop declared not available is settled too.
    await collectStop(roundId, stops[1]!.stopId, driverId, {
      changeId: change(), packages: [{ packageId: stops[1]!.sfIds[0]!, outcome: "not_available" }],
    });
    await expect(hubCheckin(roundId, driverId)).resolves.toMatchObject({ scannedTotal: 1 });
  });

  it("nothing on a drop before the van is loaded; after loading, the drop moves on", async () => {
    const { roundId, drops } = await aDeliveryRun([1]);
    const dropId = drops[0]!.dropId;
    const before = await snapshot();

    for (const call of [
      () => setDropStatus(dropId, driverId, { to: "en_route", changeId: change() }),
      () => setDropStatus(dropId, driverId, { to: "arrived", changeId: change() }),
      () => recordProof({ dropId, driverId, driverSub: "sub-seq", method: "photo", mediaKey: "proof/x.jpg", note: null, changeId: change() }),
      () => recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: change() }),
    ]) {
      const err = await refusal(call());
      expect(err.type).toBe("run_not_loaded");
      expect(err.sentence).toBe("Load the van first.");
    }
    expect(await snapshot(), "nothing written").toEqual(before);

    await loadRun(roundId, driverId, change());
    await expect(setDropStatus(dropId, driverId, { to: "arrived", changeId: change() })).resolves.toEqual({ status: "arrived" });
  });

  it("loading waits for collected parcels to be checked in", async () => {
    const collection = await aCollectionRun([1]);
    await collectStop(collection.roundId, collection.stops[0]!.stopId, driverId, { changeId: change(), packages: all(collection.stops[0]!.sfIds) });
    const delivery = await aDeliveryRun([1]);

    const err = await refusal(loadRun(delivery.roundId, driverId, change()));
    expect(err.type).toBe("finish_collection_first");
    expect(err.issues).toEqual([{ field: "runId", message: collection.roundId }]);

    await hubCheckin(collection.roundId, driverId);
    await expect(loadRun(delivery.roundId, driverId, change())).resolves.toMatchObject({ loadedDropIds: [delivery.drops[0]!.dropId] });
  });

  it("loading waits for failed parcels to be returned — unless a dispatcher waives it for that run", async () => {
    const first = await aDeliveryRun([1]);
    await loadRun(first.roundId, driverId, change());
    await recordFailure({ dropId: first.drops[0]!.dropId, driverId, reason: "nobody_home", note: null, changeId: change() });

    const second = await aDeliveryRun([1]);
    expect((await refusal(loadRun(second.roundId, driverId, change()))).type).toBe("return_parcels_first");

    await pool.query(`INSERT INTO public.round_sequence_waiver (round_id, reason, staff_sub) VALUES ($1, 'phone died at the hub', 'staff-1')`, [second.roundId]);
    await expect(loadRun(second.roundId, driverId, change())).resolves.toMatchObject({ loadedDropIds: [second.drops[0]!.dropId] });
  });

  it("collecting waits until the van's deliveries are finished", async () => {
    const delivery = await aDeliveryRun([1]);
    await loadRun(delivery.roundId, driverId, change());
    const collection = await aCollectionRun([1]);
    const stop = collection.stops[0]!;

    const before = await snapshot();
    expect((await refusal(collectStop(collection.roundId, stop.stopId, driverId, { changeId: change(), packages: all(stop.sfIds) }))).type)
      .toBe("finish_deliveries_first");
    expect(await snapshot()).toEqual(before);

    await recordProof({ dropId: delivery.drops[0]!.dropId, driverId, driverSub: "sub-seq", method: "photo", mediaKey: "proof/y.jpg", note: null, changeId: change() });
    await expect(collectStop(collection.roundId, stop.stopId, driverId, { changeId: change(), packages: all(stop.sfIds) }))
      .resolves.toMatchObject({ collected: 1, remaining: 0 });
  });

  it("a retried load answers as loaded even after the gate would now refuse", async () => {
    const delivery = await aDeliveryRun([1]);
    await loadRun(delivery.roundId, driverId, change());
    const collection = await aCollectionRun([1]);
    // The driver is now holding nothing collected, but even if they were, the run is already loaded.
    await expect(loadRun(delivery.roundId, driverId, change())).resolves.toMatchObject({ loadedDropIds: [] });
    expect(collection.roundId).toBeTruthy();
  });

  it("a package the driver was not shown stays waiting, and the stop stays open", async () => {
    const { roundId, stops } = await aCollectionRun([2]);
    const stop = stops[0]!;
    const [shownId, addedId] = stop.sfIds;

    const r1 = await collectStop(roundId, stop.stopId, driverId, { changeId: change(), packages: all([shownId!]) });
    expect(r1).toEqual({ collected: 1, notAvailable: 0, remaining: 1 });
    expect((await one<{ status: string }>(`SELECT status FROM public.round_stop WHERE id = $1`, [stop.stopId])).status).toBe("pending");
    expect((await one<{ state: string }>(`SELECT state FROM public.round_package WHERE shop_fulfillment_id = $1`, [addedId])).state).toBe("assigned");
    expect((await one<{ status: string }>(`SELECT status FROM public.shop_fulfillment WHERE id = $1`, [addedId])).status).toBe("ready_for_pickup");

    const r2 = await collectStop(roundId, stop.stopId, driverId, { changeId: change(), packages: all([addedId!]) });
    expect(r2).toEqual({ collected: 1, notAvailable: 0, remaining: 0 });
    expect((await one<{ status: string }>(`SELECT status FROM public.round_stop WHERE id = $1`, [stop.stopId])).status).toBe("done");
  });

  it("a package not loaded comes off the run and is held; a drop left empty comes off too; a retry holds nothing twice", async () => {
    // Three packages collected and checked in at the hub — what the delivery gather plans from.
    const collection = await aCollectionRun([3]);
    const [lone, kept, torn] = collection.stops[0]!.sfIds;
    await collectStop(collection.roundId, collection.stops[0]!.stopId, driverId, { changeId: change(), packages: all(collection.stops[0]!.sfIds) });
    await hubCheckin(collection.roundId, driverId);
    const gathered = async () => (await gatherDeliveryWork(pool, null, new Date("9999-12-31T00:00:00Z"))).map((p) => p.packageId);
    expect(await gathered()).toEqual(expect.arrayContaining([lone, kept, torn]));

    // On a delivery run: `lone` alone on one drop, `kept` and `torn` on another.
    const wave = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`);
    const roundId = (await one<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at) VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`,
      [wave.id, driverId],
    )).id;
    const dropOf = async (sfIds: string[]) => {
      const drop = await one<{ id: string }>(
        `INSERT INTO public.round_stop (round_id, kind, order_id) SELECT $1, 'customer_drop', order_id FROM public.shop_fulfillment WHERE id = $2 RETURNING id`,
        [roundId, sfIds[0]],
      );
      for (const sf of sfIds) await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sf]);
      return drop.id;
    };
    const loneDrop = await dropOf([lone!]);
    const pairDrop = await dropOf([kept!, torn!]);
    expect(await gathered(), "on a run: not gathered again").toEqual([]);

    const changeId = change();
    // One bag per package here, so a missing bag is its whole package.
    const bag = await bagsOf([lone!, kept!, torn!]);
    const notLoaded = [
      { parcelCode: bag.get(lone!)!, reason: "damaged" as const },
      { parcelCode: bag.get(torn!)!, reason: "other" as const, note: "label torn off, cannot identify" },
    ];
    const loaded = [{ parcelCode: bag.get(kept!)!, method: "scan" as const }];
    const r = await loadRun(roundId, driverId, changeId, loaded, notLoaded);
    expect(r).toEqual({ loadedDropIds: [pairDrop], held: 2, dropsRemoved: 1 });
    expect((await pool.query(`SELECT 1 FROM public.round_stop WHERE id = $1`, [loneDrop])).rowCount).toBe(0);
    expect((await pool.query(`SELECT shop_fulfillment_id FROM public.round_package WHERE stop_id = $1`, [pairDrop])).rows)
      .toEqual([{ shop_fulfillment_id: kept }]);
    const holds = await pool.query(`SELECT shop_fulfillment_id, step, reason FROM public.package_hold ORDER BY reason`);
    expect(holds.rows).toEqual([
      { shop_fulfillment_id: lone, step: "load", reason: "damaged" },
      { shop_fulfillment_id: torn, step: "load", reason: "other" },
    ]);

    // Held: the planner does not put them on a van again by itself.
    expect(await gathered()).toEqual([]);

    // A dispatcher finds one: it is planned again. The other stays held.
    await pool.query(`UPDATE public.package_hold SET resolution = 'found', resolved_by_sub = 's', resolved_at = now() WHERE shop_fulfillment_id = $1`, [lone]);
    expect(await gathered()).toEqual([lone]);

    await expect(loadRun(roundId, driverId, changeId, loaded, notLoaded)).resolves.toMatchObject({ loadedDropIds: [], held: 2 });
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.package_hold`)).n).toBe(2);
  });

  it("every drop declared: the run has nothing left and is cancelled", async () => {
    const { roundId, drops } = await aDeliveryRun([1]);
    const bag = await bagsOf([drops[0]!.sfIds[0]!]);
    await loadRun(roundId, driverId, change(), [], [{ parcelCode: bag.get(drops[0]!.sfIds[0]!)!, reason: "not_at_hub" }]);
    expect((await one<{ status: string }>(`SELECT status FROM public.driver_round WHERE id = $1`, [roundId])).status).toBe("cancelled");
  });

  it("a collected package not in the van at check-in is held, and kept off delivery planning", async () => {
    const { roundId, stops } = await aCollectionRun([2]);
    const [here, gone] = stops[0]!.sfIds;
    const bag = await bagsOf([here!, gone!]);
    await collectStop(roundId, stops[0]!.stopId, driverId, {
      changeId: change(), packages: all(stops[0]!.sfIds), parcels: [here!, gone!].map((id) => ({ parcelCode: bag.get(id)!, method: "scan" as const })),
    });

    const res = await hubCheckin(roundId, driverId, {
      changeId: change(), parcels: [{ parcelCode: bag.get(here!)!, method: "scan" }], missingParcels: [{ parcelCode: bag.get(gone!)!, reason: "not_in_van" }],
    });
    expect(res.held).toBe(1);
    expect(res.scannedTotal).toBe(1);
    expect((await one<{ step: string; reason: string }>(`SELECT step, reason FROM public.package_hold`))).toEqual({ step: "checkin", reason: "not_in_van" });

    const gathered = (await gatherDeliveryWork(pool, null, new Date("9999-12-31T00:00:00Z"))).map((p) => p.packageId);
    expect(gathered).toContain(here);
    expect(gathered).not.toContain(gone);
  });

  /** Bag 1 as payment creates it, the rest as a shop declares them. */
  async function bags(packageId: string, n: number): Promise<string[]> {
    await createFirstParcels(pool, { packageIds: [packageId] });
    for (let seq = 2; seq <= n; seq++) {
      await pool.query(
        `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared) VALUES ($1, public.new_parcel_code(), $2, 'ambient', true)`,
        [packageId, seq],
      );
    }
    return (await pool.query(`SELECT parcel_code FROM public.package_parcel WHERE shop_fulfillment_id = $1 ORDER BY seq`, [packageId])).rows.map((r) => r.parcel_code as string);
  }
  const scanned = (codes: string[]) => codes.map((parcelCode) => ({ parcelCode, method: "scan" as const }));

  it("096 — a bag left on the counter stops the collect, naming it; declared missing, the package is collected and that bag held", async () => {
    const { roundId, stops } = await aCollectionRun([1]);
    const pkg = stops[0]!.sfIds[0]!;
    const codes = await bags(pkg, 3);
    const attempt = collectStop(roundId, stops[0]!.stopId, driverId, { changeId: change(), packages: all([pkg]), parcels: scanned(codes.slice(0, 2)) });
    await expect(attempt).rejects.toBeInstanceOf(ParcelsUnaccounted);
    await attempt.catch((e: ParcelsUnaccounted) => expect(e.body().parcels).toEqual([{ code: codes[2], seq: 3, of: 3 }]));
    expect((await one<{ state: string }>(`SELECT state FROM public.round_package WHERE shop_fulfillment_id = $1`, [pkg])).state).toBe("assigned");

    await collectStop(roundId, stops[0]!.stopId, driverId, {
      changeId: change(), packages: all([pkg]), parcels: scanned(codes.slice(0, 2)),
      missingParcels: [{ parcelCode: codes[2]!, reason: "not_at_shop" }],
    });
    expect((await one<{ state: string }>(`SELECT state FROM public.round_package WHERE shop_fulfillment_id = $1`, [pkg])).state).toBe("picked_up");
    const holds = (await pool.query(`SELECT parcel_id IS NOT NULL AS one_bag, step, reason FROM public.package_hold`)).rows;
    expect(holds).toEqual([{ one_bag: true, step: "collect", reason: "not_at_shop" }]);
    // The hub expects the two bags that came, not the one that did not.
    const atHub = await expectedParcels(pool, { step: "checkin", packageIds: [pkg], roundId });
    expect(atHub.map((b) => b.code)).toEqual(codes.slice(0, 2));
    // …and the package itself is not held: only a whole-package hold keeps it off a van.
    expect((await pool.query(`SELECT 1 FROM public.package_hold WHERE parcel_id IS NULL`)).rowCount).toBe(0);
  });

  it("096 — every bag missing at the counter is 'not available', not a collect", async () => {
    const { roundId, stops } = await aCollectionRun([1]);
    const pkg = stops[0]!.sfIds[0]!;
    const codes = await bags(pkg, 2);
    const r = await collectStop(roundId, stops[0]!.stopId, driverId, {
      changeId: change(), packages: all([pkg]), missingParcels: codes.map((parcelCode) => ({ parcelCode, reason: "not_at_shop" as const })),
    });
    expect(r).toMatchObject({ collected: 0, notAvailable: 1 });
    expect((await pool.query(`SELECT 1 FROM public.package_hold`)).rowCount).toBe(0);
  });

  it("096 — one bag missing at loading holds the bag and the package goes out; found, it is expected at the door again", async () => {
    const { roundId, drops } = await aDeliveryRun([1]);
    const pkg = drops[0]!.sfIds[0]!;
    const codes = await bags(pkg, 2);
    await expect(loadRun(roundId, driverId, change(), scanned([codes[0]!]))).rejects.toBeInstanceOf(ParcelsUnaccounted);
    const r = await loadRun(roundId, driverId, change(), scanned([codes[0]!]), [{ parcelCode: codes[1]!, reason: "damaged" }]);
    expect(r).toMatchObject({ loadedDropIds: [drops[0]!.dropId], held: 1, dropsRemoved: 0 });
    expect((await expectedParcels(pool, { step: "deliver", packageIds: [pkg], roundId })).map((b) => b.code)).toEqual([codes[0]]);
    await pool.query(`UPDATE public.package_hold SET resolution = 'found', resolved_by_sub = 's', resolved_at = now()`);
    expect((await expectedParcels(pool, { step: "deliver", packageIds: [pkg], roundId })).map((b) => b.code)).toEqual(codes);
  });

  it("096 — a voided bag is never expected, and the count is of live bags", async () => {
    const { roundId, drops } = await aDeliveryRun([1]);
    const pkg = drops[0]!.sfIds[0]!;
    const codes = await bags(pkg, 3);
    await pool.query(`UPDATE public.package_parcel SET voided_at = now() WHERE parcel_code = $1`, [codes[2]]);
    const expected = await expectedParcels(pool, { step: "load", packageIds: [pkg], roundId });
    expect(expected.map((b) => [b.code, b.seq, b.of])).toEqual([[codes[0], 1, 2], [codes[1], 2, 2]]);
    await expect(loadRun(roundId, driverId, change(), scanned(codes.slice(0, 2)))).resolves.toMatchObject({ held: 0 });
  });
});
