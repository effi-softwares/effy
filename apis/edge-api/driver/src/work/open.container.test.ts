import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Before a round opens every progressing route refuses and writes nothing; after, the same calls
 * succeed. Real Postgres, because `public.round_opens_at` and `now` are the database's.
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
    // The gate must refuse before an upload slot is minted.
    presignUpload: vi.fn(async () => ({ uploadUrl: "https://upload.invalid/x", storageKey: "proof/x.jpg" })),
  };
});

import { presignUpload } from "@effy/edge-shared";
import { migrationSql } from "@effy/edge-shared/testing";
import { recordFailure, recordProof } from "../proof/repository";
import { presignProof } from "../proof/service";
import { collectStop, hubCheckin } from "./complete";
import { deliveryDrop, setDropStatus } from "./delivery";
import { loadRun } from "./load";
import { RoundNotOpenError } from "./open";
import { collectionRun, collectionStop, deliveryRun, today } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let shopId: string;
let seq = 0;

const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await pool.query<T>(sql, params as never[])).rows[0]!;

async function aPackage(status: "ready_for_pickup" | "collected" = "ready_for_pickup"): Promise<{ sfId: string; orderId: string }> {
  seq += 1;
  const cust = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
  );
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, delivery_type, delivery_type_reason)
     VALUES ($1, $2, 10, 12, '{"city":"Richmond","postalCode":"3121"}'::jsonb, 'paid', 'effy', 'in_coverage') RETURNING id`,
    [cust.id, `EFY-OPEN${seq}`],
  );
  const sf = await one<{ id: string }>(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
     VALUES ($1, $2, 1, 10, $3, 'same_day') RETURNING id`,
    [order.id, shopId, status],
  );
  return { sfId: sf.id, orderId: order.id };
}

async function aWave(kind: "collection" | "delivery"): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ($1, now(), 'schedule') RETURNING id`,
    [kind],
  )).id;
}

/** One shop stop with one package, and the hub, for a run `minutesToRun` away. */
/** A collect names every package the driver was shown. */
async function shown(stopId: string) {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT shop_fulfillment_id AS id FROM public.round_package WHERE stop_id = $1 AND state = 'assigned'`,
    [stopId],
  );
  return rows.map((r) => ({ packageId: r.id, outcome: "picked_up" as const }));
}

async function collectionRound(minutesToRun: number, forDriver = driverId) {
  const { sfId } = await aPackage();
  const round = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, 'collection', now() + make_interval(mins => $3)) RETURNING id`,
    [await aWave("collection"), forDriver, minutesToRun],
  );
  const stop = await one<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`,
    [round.id, shopId],
  );
  await pool.query(`INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin')`, [round.id]);
  await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [stop.id, sfId]);
  return { roundId: round.id, stopId: stop.id, sfId };
}

/** One drop, for a window `minutesToWindow` away (null: no window). */
async function deliveryRound(minutesToWindow: number | null) {
  const { sfId, orderId } = await aPackage("collected");
  const round = await one<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, window_start_at)
     VALUES ($1, $2, 'delivery',
             now() + make_interval(mins => COALESCE($3, 0) + 120),
             CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3) END)
     RETURNING id`,
    [await aWave("delivery"), driverId, minutesToWindow],
  );
  const drop = await one<{ id: string }>(
    `INSERT INTO public.round_stop (round_id, kind, order_id) VALUES ($1, 'customer_drop', $2) RETURNING id`,
    [round.id, orderId],
  );
  await pool.query(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [drop.id, sfId]);
  return { roundId: round.id, dropId: drop.id, sfId };
}

async function snapshot() {
  const q = async (sql: string) => (await pool.query(sql)).rows;
  return {
    rounds: await q(`SELECT id, status, changed_note FROM public.driver_round ORDER BY id`),
    stops: await q(`SELECT id, status, completed_at FROM public.round_stop ORDER BY id`),
    packages: await q(`SELECT id, state, settled_at, note FROM public.round_package ORDER BY id`),
    fulfillments: await q(`SELECT id, status FROM public.shop_fulfillment ORDER BY id`),
    checkins: await q(`SELECT count(*)::int AS n FROM public.hub_checkin`),
    proofs: await q(`SELECT count(*)::int AS n FROM public.delivery_proof`),
    failures: await q(`SELECT count(*)::int AS n FROM public.delivery_attempt_failure`),
    arrivals: await q(`SELECT count(*)::int AS n FROM public.package_arrival`),
  };
}

const change = () => crypto.randomUUID();

d("072 — a round cannot be worked before it opens", () => {
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
    vi.mocked(presignUpload).mockClear();
    await pool.query(`TRUNCATE public.delivery_settings, public.package_arrival, public.delivery_attempt_failure,
                               public.delivery_proof, public.hub_checkin, public.round_package,
                               public.round_stop, public.driver_round, public.dispatch_wave,
                               public.shop_fulfillment, public."order", public.customer,
                               public.driver_duty_session, public.driver, public.shop CASCADE`);
    driverId = (await one<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email)
       VALUES ('sub-open', 'Open Tester', 'open.tester@effyshopping.com') RETURNING id`,
    )).id;
    await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [driverId]);
    shopId = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SOPEN', 'Open Shop') RETURNING id`)).id;
  });

  describe("C7 — before it opens, every progressing route refuses and writes nothing", () => {
    it("collection: collect, hub check-in", async () => {
      // A run three hours off opens in two and a quarter.
      const { roundId, stopId } = await collectionRound(180);
      const before = await snapshot();

      const calls: Array<[string, () => Promise<unknown>]> = [
        ["collect", async () => collectStop(roundId, stopId, driverId, { changeId: change(), packages: await shown(stopId) })],
        ["hub check-in", () => hubCheckin(roundId, driverId)],
      ];
      for (const [name, call] of calls) {
        const err = await call().then(() => null, (e: unknown) => e);
        expect(err, `${name} must be refused`).toBeInstanceOf(RoundNotOpenError);
        // It says when, by the database's instant.
        const opensIn = (new Date((err as RoundNotOpenError).opensAt).getTime() - Date.now()) / 60_000;
        expect(opensIn, `${name}: opens 45 minutes before the run`).toBeGreaterThan(133);
        expect(opensIn).toBeLessThan(136);
      }

      expect(await snapshot(), "nothing may have been written").toEqual(before);
    });

    it("delivery: start / on my way / arrived, proof upload slot, proof, failed attempt", async () => {
      // A window three hours off: the round opens in two and a quarter.
      const { roundId, dropId } = await deliveryRound(180);
      const before = await snapshot();

      const calls: Array<[string, () => Promise<unknown>]> = [
        ["load", () => loadRun(roundId, driverId, change())],
        ["on my way", () => setDropStatus(dropId, driverId, { to: "en_route", changeId: change() })],
        ["arrived", () => setDropStatus(dropId, driverId, { to: "arrived", changeId: change() })],
        ["proof presign", () => presignProof(dropId, driverId, { contentType: "image/jpeg", fileSize: 1000, changeId: change() })],
        ["proof", () => recordProof({ dropId, driverId, driverSub: "sub-open", method: "photo", mediaKey: "proof/x.jpg", note: null, changeId: change() })],
        ["fail", () => recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: change() })],
      ];
      for (const [name, call] of calls) {
        await expect(call(), `${name} must be refused`).rejects.toBeInstanceOf(RoundNotOpenError);
      }

      expect(await snapshot(), "nothing may have been written").toEqual(before);
      expect(presignUpload, "no upload slot is minted for a delivery that cannot have happened").not.toHaveBeenCalled();
    });

    // "Not open yet" for another driver's round would reveal the id is real.
    it("another driver's unopened round still answers NOT FOUND, never 'not open'", async () => {
      const other = (await one<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email)
         VALUES ('sub-other', 'Other', 'other.driver@effyshopping.com') RETURNING id`,
      )).id;
      const { roundId, stopId } = await collectionRound(180, other);

      await expect(collectStop(roundId, stopId, driverId, { changeId: change(), packages: await shown(stopId) })).rejects.toMatchObject({ name: "NotFoundError" });
      await expect(hubCheckin(roundId, driverId)).rejects.toMatchObject({ name: "NotFoundError" });
    });
  });

  // C8

  describe("C8 — once it has opened, the same calls succeed", () => {
    it("collection round whose run is inside the lead time", async () => {
      const { roundId, stopId } = await collectionRound(30); // opened fifteen minutes ago
      await expect(collectStop(roundId, stopId, driverId, { changeId: change(), packages: await shown(stopId) })).resolves.toMatchObject({ collected: 1 });
      await expect(hubCheckin(roundId, driverId)).resolves.toMatchObject({ scannedTotal: 1 });
    });

    it("delivery round whose window is inside the lead time", async () => {
      const { roundId, dropId } = await deliveryRound(30);
      await expect(loadRun(roundId, driverId, change())).resolves.toMatchObject({ loadedDropIds: [dropId] });
      await expect(
        recordFailure({ dropId, driverId, reason: "nobody_home", note: null, changeId: change() }),
      ).resolves.toMatchObject({ replayed: false });
    });

    it("a delivery round with NO window is open the moment it is assigned", async () => {
      const { roundId, dropId } = await deliveryRound(null);
      await expect(loadRun(roundId, driverId, change())).resolves.toBeDefined();
      await expect(
        recordProof({ dropId, driverId, driverSub: "sub-open", method: "photo", mediaKey: "proof/x.jpg", note: null, changeId: change() }),
      ).resolves.toMatchObject({ replayed: false });
    });
  });

  // The opening time is derived; a stored one would still say 45 minutes here.
  it("C9 — changing the lead moves the opening time of a round that already exists", async () => {
    const { roundId, stopId } = await collectionRound(120);
    await expect(collectStop(roundId, stopId, driverId, { changeId: change(), packages: await shown(stopId) })).rejects.toBeInstanceOf(RoundNotOpenError);

    await pool.query(
      `INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by, planning_lead_min)
       VALUES (1, -37.8, 144.9, 'test', 150)`,
    );

    // The lead is now two and a half hours: the same round, untouched, has been open for thirty minutes.
    await expect(collectStop(roundId, stopId, driverId, { changeId: change(), packages: await shown(stopId) })).resolves.toMatchObject({ collected: 1 });
  });

  describe("the driver sees the round in full before it opens (FR-020)", () => {
    it("today names the round, when it opens and when it is due", async () => {
      const { roundId } = await collectionRound(180);
      const t = await today(driverId);

      expect(t.activeRunId).toBe(roundId);
      expect(t.phase).toBe("collection");
      expect(t.active?.kind).toBe("collection_stop");
      expect(t.remainingCount).toBe(2);
      const opensIn = (new Date(t.opening!.at).getTime() - Date.now()) / 60_000;
      expect(opensIn).toBeGreaterThan(133);
      expect(opensIn).toBeLessThan(136);
      // In words too, in Melbourne time.
      expect(t.opening!.label).toMatch(/\d{1,2}(:\d{2})? (am|pm)$/);
      expect(t.dueLabel).toMatch(/\d{1,2}(:\d{2})? (am|pm)$/);
      expect((new Date(t.deadlineAt!).getTime() - Date.now()) / 60_000).toBeGreaterThan(178);
    });

    it("the run itself is readable, stops and all", async () => {
      const { roundId } = await collectionRound(180);
      const run = await collectionRun(roundId, driverId);
      expect(run.stops).toHaveLength(1);
      expect(run.opening).not.toBeNull();
      expect(new Date(run.deadlineAt).getTime()).toBeGreaterThan(Date.now());
      const stop = await collectionStop(roundId, run.stops[0]!.stopId, driverId);
      expect(stop.packages).toHaveLength(1);
      expect(stop.opening).toEqual(run.opening);
    });

    // The database's clock, so a wrong phone clock cannot lock an open round.
    it("an open round is sent with NO opening time", async () => {
      const { roundId } = await collectionRound(30);
      expect((await today(driverId)).opening).toBeNull();
      expect((await collectionRun(roundId, driverId)).opening).toBeNull();
    });

    it("a windowless delivery round has no opening time either", async () => {
      const { roundId, dropId } = await deliveryRound(null);
      expect((await deliveryRun(roundId, driverId)).opening).toBeNull();
      expect((await deliveryDrop(dropId, driverId)).opening).toBeNull();
    });

    it("a drop on a round that has not opened is readable, and says when it opens", async () => {
      const { roundId, dropId } = await deliveryRound(180);
      const drop = await deliveryDrop(dropId, driverId);
      expect(drop.packages).toHaveLength(1);
      expect(drop.opening).toEqual((await deliveryRun(roundId, driverId)).opening);
      expect(drop.opening).not.toBeNull();
    });
  });

  describe("C15 — what to do next is always open work (FR-027)", () => {
    // Not "delivery before collection": that put the evening's unopened delivery round first.
    it("an open collection round is current although an unopened delivery round is older", async () => {
      const evening = await deliveryRound(300);
      const now = await collectionRound(30);

      const t = await today(driverId);
      expect(t.activeRunId).toBe(now.roundId);
      expect(t.opening).toBeNull();
      expect(t.upcoming.map((u) => u.runId)).toEqual([evening.roundId]);
      expect(t.upcoming[0]).toMatchObject({ kind: "delivery", stopCount: 1, packageCount: 1 });
      expect(t.upcoming[0]!.opening).not.toBeNull();
    });

    it("a round under way comes before every other", async () => {
      const open = await collectionRound(20);
      const underWay = await deliveryRound(null);
      await pool.query(`UPDATE public.driver_round SET status = 'in_progress' WHERE id = $1`, [underWay.roundId]);

      const t = await today(driverId);
      expect(t.activeRunId).toBe(underWay.roundId);
      expect(t.upcoming.map((u) => u.runId)).toEqual([open.roundId]);
    });

    it("with nothing open, the round that opens soonest is current, and the rest follow in order", async () => {
      const later = await collectionRound(600);
      const sooner = await collectionRound(180);
      const window = await deliveryRound(400);

      const t = await today(driverId);
      expect(t.activeRunId).toBe(sooner.roundId);
      expect(t.opening).not.toBeNull();
      expect(t.upcoming.map((u) => u.runId)).toEqual([window.roundId, later.roundId]);
      expect(t.upcoming[1]).toMatchObject({ kind: "collection", stopCount: 1, packageCount: 1 });
    });

    it("idle only when the driver holds no unfinished round at all", async () => {
      expect(await today(driverId)).toEqual({
        phase: "idle",
        activeRunId: null,
        active: null,
        upNext: [],
        remainingCount: 0,
        opening: null,
        deadlineAt: null,
        dueLabel: null,
        upcoming: [],
      });
    });
  });
});
