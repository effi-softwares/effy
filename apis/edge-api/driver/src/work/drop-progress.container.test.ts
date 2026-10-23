import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { seedHub, seedPlace } from "./run-map.fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Drives the app's real step sequence through the real functions and asserts the drop after each step. */

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
import { createFirstParcels, NothingToHandOver, ParcelsUnaccounted } from "@effy/edge-shared/labels";

import { recordFailure, recordProof } from "../proof/repository";
import { deliveryDrop, historyDetail, setDropStatus } from "./delivery";
import { loadRun } from "./load";
import { RoundNotOpenError } from "./open";
import { NotFoundError, deliveryRun, today } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let driverSub: string;
let roundId: string;
let dropId: string;

/** Loading the van puts a drop out for delivery; nothing happens before it. */
/** Every live bag scanned. */
const load = async () => {
  const codes = (await pool.query(`SELECT parcel_code FROM public.package_parcel WHERE voided_at IS NULL`)).rows.map((r) => r.parcel_code as string);
  return loadRun(roundId, driverId, crypto.randomUUID(), codes.map((c) => ({ parcelCode: c, method: "scan" as const })));
};

/** `out_for_delivery` is the van being loaded; the rest follow it. */
const dropStatus = async () => (await deliveryDrop(dropId, driverId)).status;

const step = async (to: string): Promise<{ status: string }> => {
  if (to === "out_for_delivery") {
    await load();
    return { status: await dropStatus() };
  }
  if ((await dropStatus()) === "staged") await load();
  return setDropStatus(dropId, driverId, { to, changeId: crypto.randomUUID() } as never);
};

d("064 fix — a drop advances through every state the app sends", () => {
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
    for (const t of [
      "package_handover", "delivery_proof", "delivery_attempt_failure", "package_arrival", "notification_request", "round_package", "round_stop",
      "driver_round", "dispatch_wave", "shop_fulfillment",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver_duty_session");
    await pool.query("DELETE FROM public.driver");

    driverSub = `sub-${crypto.randomUUID()}`;
    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ($1, 'Walk Driver', ($1 || '@effyshopping.com')::citext) RETURNING id`, [driverSub],
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.driver_duty_session (driver_id, started_at) VALUES ($1, now())`, [driverId]);

    const cust = (await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email)
       VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
    )).rows[0]!.id;
    const orderId = (await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-WALK01', 10, 12, '{"line1":"1 Walk St","city":"Melbourne","postalCode":"3000","region":"VIC"}'::jsonb, 'paid', 'effy', 'in_coverage')
       RETURNING id`, [cust],
    )).rows[0]!.id;
    const shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('SWALK', 'Walk Shop') RETURNING id`,
    )).rows[0]!.id;
    const sfId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
       VALUES ($1, $2, 1, 10, 'collected', 'same_day') RETURNING id`, [orderId, shopId],
    )).rows[0]!.id;

    const waveId = (await pool.query<{ id: string }>(
      `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`,
    )).rows[0]!.id;
    roundId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
       VALUES ($1, $2, 'delivery', now() + interval '6 hours') RETURNING id`, [waveId, driverId],
    )).rows[0]!.id;
    dropId = (await pool.query<{ id: string }>(
      `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
      [roundId, orderId],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state, settled_at)
       VALUES ($1, $2, 'picked_up', now())`, [dropId, sfId],
    );
  });

  const dropScreen = async () => (await deliveryDrop(dropId, driverId)).status;
  const runScreen = async () => (await deliveryRun(roundId, driverId)).drops[0]!.status;

  /** Today's card, progress and run map; the run list's street; the outcome. */
  it("092 rev 2 — Today carries progress, the card's details and a map from the postcode's place", async () => {
    await seedPlace(pool, { name: "Melbourne", state: "VIC", postcode: "3000", lat: -37.8136, lng: 144.9631 });
    await seedHub(pool, -37.8, 144.97);
    // Before loading, the one step is loading.
    const before = await today(driverId);
    expect(before.active).toBeNull();
    expect(before.loadStep).toEqual({ runId: roundId, dropCount: 1, packageCount: 1 });
    expect(before.stage).toBe("to_load");
    expect(before.upNext.map((i) => i.id)).toEqual([dropId]);
    await load();
    const t = await today(driverId);
    expect(t.stageLabel).toBe("Out 0 of 1");
    expect(t.progress).toEqual({ done: 0, total: 1, delivered: 0, notDelivered: 0 });
    expect(t.active).toMatchObject({ street: "1 Walk St", place: "Melbourne VIC 3000", packageCount: 1 });
    // A delivery run starts at the hub; the drop is next; its point is its postcode's place.
    expect(t.map?.stops).toEqual([
      { n: null, kind: "hub", status: "done", point: { lat: -37.8, lng: 144.97 } },
      { n: 1, kind: "customer", status: "next", point: { lat: -37.8136, lng: 144.9631 } },
    ]);
    expect(t.map?.hub).toEqual({ lat: -37.8, lng: 144.97 });
    const run = await deliveryRun(roundId, driverId);
    expect(run.drops[0]).toMatchObject({ street: "1 Walk St", proofMethod: null, failureReason: null });
    expect(run.map?.stops).toHaveLength(2);
  });

  /** Today carries what dispatch changed on the round, until there is nothing to say. */
  it("092 — Today carries the round's change note", async () => {
    expect((await today(driverId)).changedNote).toBeNull();
    await pool.query(`UPDATE public.driver_round SET changed_note = 'Added 2 drops' WHERE id = $1`, [roundId]);
    expect((await today(driverId)).changedNote).toBe("Added 2 drops");
  });

  /** A finished run's detail lists its stops. */
  it("092 — a finished run lists its stops; an unfinished or someone else's run is not found", async () => {
    await expect(historyDetail("run", roundId, driverId)).rejects.toBeInstanceOf(NotFoundError);
    await pool.query(`UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE id = $1`, [dropId]);
    await pool.query(`UPDATE public.driver_round SET status = 'completed' WHERE id = $1`, [roundId]);
    const run = await historyDetail("run", roundId, driverId);
    expect(run.stops).toEqual([
      expect.objectContaining({ stopId: dropId, sequence: 1, kind: "drop", title: "1 Walk St, Melbourne", status: "done", proofMethod: null }),
    ]);
    await expect(historyDetail("run", roundId, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("starts staged", async () => {
    expect(await dropScreen()).toBe("staged");
  });

  it("⚠ loading the van moves it to out_for_delivery, on BOTH screens", async () => {
    await step("out_for_delivery");
    expect(await dropScreen()).toBe("out_for_delivery");
    expect(await runScreen()).toBe("out_for_delivery");
  });

  it("'On my way' moves it to en_route", async () => {
    await step("out_for_delivery");
    await step("en_route");
    expect(await dropScreen()).toBe("en_route");
    expect(await runScreen()).toBe("en_route");
  });

  it("'I've arrived' moves it to arrived", async () => {
    await step("out_for_delivery");
    await step("en_route");
    await step("arrived");
    expect(await dropScreen()).toBe("arrived");
  });

  /** A started drop must stay on the Today screen's outstanding list. */
  it("⚠ a started drop stays on the driver's Today screen at every step", async () => {
    for (const to of ["out_for_delivery", "en_route", "arrived"]) {
      await step(to);
      const t = await today(driverId);
      expect(t.active?.id, `Today lost the drop at ${to}`).toBe(dropId);
      expect(t.remainingCount).toBe(1);
    }
  });

  it("the whole walk ends in a delivered order", async () => {
    await step("out_for_delivery");
    await step("en_route");
    await step("arrived");
    const r = await recordProof({
      dropId, driverId, driverSub, method: "photo", mediaKey: "proof/walk/1.jpg", note: null,
      changeId: crypto.randomUUID(),
    });
    expect(r.orderComplete).toBe(true);
    expect(await dropScreen()).toBe("delivered");
    const o = await pool.query(`SELECT sf.status FROM public.shop_fulfillment sf`);
    expect(o.rows[0].status).toBe("delivered");
  });

  /** A stale tap must not un-deliver a package. */
  it("⚠ never moves a delivered drop backwards", async () => {
    await step("arrived");
    await recordProof({
      dropId, driverId, driverSub, method: "photo", mediaKey: "proof/walk/2.jpg", note: null,
      changeId: crypto.randomUUID(),
    });
    const res = await step("out_for_delivery");
    expect(res.status).toBe("delivered");
    expect(await dropScreen()).toBe("delivered");
  });

  /** An offline replay of an earlier step must not undo a later one. */
  it("⚠ never moves an open drop backwards", async () => {
    await step("arrived");
    const res = await step("out_for_delivery");
    expect(res.status).toBe("arrived");
    expect(await dropScreen()).toBe("arrived");
    await step("en_route");
    expect(await dropScreen()).toBe("arrived");
  });

  /** A failed drop's parcel is "to return", the only work left. */
  it("088 — after the only drop fails, Today and the run carry the parcel to return; active is empty", async () => {
    await pool.query(`UPDATE public.round_package SET state = 'assigned', settled_at = NULL`);
    await step("arrived");
    await recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: crypto.randomUUID() });

    const t = await today(driverId);
    expect(t.activeRunId).toBe(roundId);
    expect(t.active).toBeNull();
    expect(t.toReturn).toMatchObject({ runId: roundId, count: 1, orders: ["EFY-WALK01"] });
    expect(t.toReturn?.parcels).toHaveLength(1);

    const run = await deliveryRun(roundId, driverId);
    expect(run.toReturn?.count).toBe(1);
  });

  it("088 — a run with nothing failed carries no return", async () => {
    expect((await today(driverId)).toReturn).toBeNull();
    expect((await deliveryRun(roundId, driverId)).toReturn).toBeNull();
  });

  /** Every package carries its label code. */
  it("089 — the drop and the run carry each package's label code", async () => {
    const { id: sf, package_code: code } = (await pool.query(`SELECT id, package_code FROM public.shop_fulfillment LIMIT 1`)).rows[0] as { id: string; package_code: string };
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    await createFirstParcels(pool, { packageIds: [sf] });
    const drop = await deliveryDrop(dropId, driverId);
    expect(drop.packages.map((p) => p.packageCode)).toEqual([code]);
    const run = await deliveryRun(roundId, driverId);
    expect(run.drops[0]!.parcels.map((b) => b.code)).toEqual([code]);
  });

  /** How each bag was handed over is recorded with the hand-over. */
  it("096 — records each bag's hand-over once, ignoring foreign bags and unknown methods", async () => {
    const { id: sf, package_code: code } = (await pool.query(`SELECT id, package_code FROM public.shop_fulfillment LIMIT 1`)).rows[0];
    await createFirstParcels(pool, { packageIds: [sf] });
    await pool.query(`UPDATE public.round_package SET state = 'assigned', settled_at = NULL`);
    await step("arrived");
    const changeId = crypto.randomUUID();
    const proof = {
      dropId, driverId, driverSub, method: "photo" as const, mediaKey: "proof/h/1.jpg", note: null, changeId,
      parcels: [
        { parcelCode: code, method: "scan" as const },
        { parcelCode: "ZZZZZZ", method: "scan" as const },
        { parcelCode: code, method: "telepathy" as never },
      ],
    };
    await recordProof(proof);
    await recordProof(proof);
    const rows = await pool.query(`SELECT shop_fulfillment_id, step, handover_method AS method FROM public.package_handover WHERE step = 'deliver'`);
    expect(rows.rows).toEqual([{ shop_fulfillment_id: sf, step: "deliver", method: "scan" }]);
  });

  /** One bag unaccounted for refuses the proof and writes nothing. */
  it("096 — a proof that leaves a bag unaccounted for is refused, naming it", async () => {
    const { id: sf } = (await pool.query(`SELECT id FROM public.shop_fulfillment LIMIT 1`)).rows[0];
    await createFirstParcels(pool, { packageIds: [sf] });
    await pool.query(`UPDATE public.round_package SET state = 'assigned', settled_at = NULL`);
    await step("arrived");
    await expect(recordProof({ dropId, driverId, driverSub, method: "photo", mediaKey: "proof/h/2.jpg", note: null, changeId: crypto.randomUUID() }))
      .rejects.toBeInstanceOf(ParcelsUnaccounted);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.package_handover WHERE step = 'deliver'`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.proof_of_delivery`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n).toBe(0);
  });

  it("096 — every bag declared missing at the door is not a delivery: use Can't deliver", async () => {
    const { id: sf, package_code: code } = (await pool.query(`SELECT id, package_code FROM public.shop_fulfillment LIMIT 1`)).rows[0];
    await createFirstParcels(pool, { packageIds: [sf] });
    await pool.query(`UPDATE public.round_package SET state = 'assigned', settled_at = NULL`);
    await step("arrived");
    await expect(recordProof({
      dropId, driverId, driverSub, method: "photo", mediaKey: "proof/h/3.jpg", note: null, changeId: crypto.randomUUID(),
      missingParcels: [{ parcelCode: code, reason: "not_in_van" }],
    })).rejects.toBeInstanceOf(NothingToHandOver);
  });

  it("090 — loading puts every staged drop out for delivery, once; a drop further along is untouched", async () => {
    const r1 = await loadRun(roundId, driverId, crypto.randomUUID());
    expect(r1.loadedDropIds).toEqual([dropId]);
    expect(await dropScreen()).toBe("out_for_delivery");
    const r2 = await loadRun(roundId, driverId, crypto.randomUUID());
    expect(r2.loadedDropIds).toEqual([]);

    await step("arrived");
    await loadRun(roundId, driverId, crypto.randomUUID());
    expect(await dropScreen()).toBe("arrived");
  });

  it("090 — loading is refused before the round opens, and for someone else's run", async () => {
    await pool.query(`UPDATE public.driver_round SET window_start_at = now() + interval '2 days', deadline_at = now() + interval '2 days 2 hours' WHERE id = $1`, [roundId]);
    await expect(loadRun(roundId, driverId, crypto.randomUUID())).rejects.toBeInstanceOf(RoundNotOpenError);
    expect(await dropScreen()).toBe("staged");
    await expect(loadRun(roundId, crypto.randomUUID(), crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a status the drop cannot be moved to by this route", async () => {
    await expect(step("delivered")).rejects.toBeDefined();
    await expect(step("pending")).rejects.toBeDefined();
  });

  it("the database refuses a state that does not exist", async () => {
    await expect(
      pool.query(`UPDATE public.round_stop SET status = 'teleported' WHERE id = $1`, [dropId]),
    ).rejects.toThrow(/round_stop_status_check/);
  });
});
