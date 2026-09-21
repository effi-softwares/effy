import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ THE LIVE DEFECT THIS SLICE FIXES AT THE MODEL (064, US4 — research R11).
 *
 * Found on 2026-09-21 with a real driver: they collected every shop on their round, left the run
 * screen, came back, and the app had nothing. `todayView` keeps only `pending`/`arrived` stops in
 * `outstanding`, so once the last shop went `done` the round emptied — and BOTH routes into it
 * disappeared together, because the hero card is drawn from `active` and the "Whole run" link only
 * renders when the queue is non-empty. Thirteen packages in a van, no way back into the round.
 *
 * A `hub_checkin` stop is what closes it: the round keeps outstanding work until the load is actually
 * checked in. `round_stop_kind_check` has permitted the kind since 063 and nothing ever created one.
 *
 * These tests assert the whole lifecycle against real PostgreSQL, because every part of it is a
 * relationship between rows rather than a value a unit test could stub.
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

import { migrationSql } from "@effy/edge-shared";

import { hubCheckin } from "./complete";
import { collectionRun, today } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let driverId: string;
let roundId: string;
let shopStopId: string;
let hubStopId: string;

d("064 — the hub check-in is real work", () => {
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
      "hub_checkin", "round_package", "round_stop", "driver_round", "dispatch_wave",
      "shop_fulfillment", "order_item",
    ]) {
      await pool.query(`DELETE FROM public.${t}`);
    }
    await pool.query('DELETE FROM public."order"');
    await pool.query("DELETE FROM public.shop");
    await pool.query("DELETE FROM public.customer");
    await pool.query("DELETE FROM public.driver");
    await pool.query("DELETE FROM public.driver_duty_session");

    const sub = `sub-${crypto.randomUUID()}`;
    driverId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.driver (cognito_sub, name, work_email)
         VALUES ($1, 'Hub Tester', ($1 || '@effyshopping.com')::citext) RETURNING id`,
        [sub],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.driver_duty_session (driver_id, started_at) VALUES ($1, now())`,
      [driverId],
    );

    const cust = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email)
         VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
      )
    ).rows[0]!.id;
    const orderId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
         VALUES ($1, 'EFY-HUB01', 10, 12, '{"city":"Richmond","postalCode":"3121"}'::jsonb, 'paid') RETURNING id`,
        [cust],
      )
    ).rows[0]!.id;
    const shopId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name) VALUES ('SHUB', 'Hub Shop') RETURNING id`,
      )
    ).rows[0]!.id;
    const sfId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method)
         VALUES ($1, $2, 1, 10, 'ready_for_pickup', 'same_day') RETURNING id`,
        [orderId, shopId],
      )
    ).rows[0]!.id;

    const waveId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.dispatch_wave (kind, planned_for, trigger)
         VALUES ('collection', now(), 'schedule') RETURNING id`,
      )
    ).rows[0]!.id;
    roundId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
         VALUES ($1, $2, 'collection', now() + interval '3 hours') RETURNING id`,
        [waveId, driverId],
      )
    ).rows[0]!.id;
    shopStopId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`,
        [roundId, shopId],
      )
    ).rows[0]!.id;
    // What `commitWave` now appends to every collection round.
    hubStopId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.round_stop (round_id, kind) VALUES ($1, 'hub_checkin') RETURNING id`,
        [roundId],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state)
       VALUES ($1, $2, 'assigned')`,
      [shopStopId, sfId],
    );
  });

  /** Collect the shop: its stop done, its package picked up — the state the defect appeared in. */
  async function collectTheShop() {
    await pool.query(`UPDATE public.round_package SET state = 'picked_up', settled_at = now() WHERE stop_id = $1`, [shopStopId]);
    await pool.query(`UPDATE public.shop_fulfillment SET status = 'collected'`);
    await pool.query(`UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE id = $1`, [shopStopId]);
    await pool.query(`UPDATE public.driver_round SET status = 'in_progress' WHERE id = $1`, [roundId]);
  }

  it("shows the shop first while it is still outstanding", async () => {
    const t = await today(driverId);
    expect(t.phase).toBe("collection");
    expect(t.active?.kind).toBe("collection_stop");
    expect(t.remainingCount).toBe(2); // the shop and the hub
  });

  /** ⚠ THE REGRESSION TEST FOR 2026-09-21. */
  it("⚠ after the last shop is collected, the HUB is the outstanding work", async () => {
    await collectTheShop();

    const t = await today(driverId);
    expect(t.activeRunId, "the round must still be reachable").toBe(roundId);
    expect(t.active, "there must be something to do, and something to tap").not.toBeNull();
    expect(t.active?.kind).toBe("hub_checkin");
    expect(t.active?.id).toBe(hubStopId);
    expect(t.remainingCount).toBe(1);
  });

  it("names the hub and says what is in the van, rather than defaulting to 'Shop'", async () => {
    await collectTheShop();
    const t = await today(driverId);
    expect(t.active?.title).toBe("Hub check-in");
    expect(t.active?.subtitle).toMatch(/1 package/);
  });

  /**
   * ⚠ T041 — the hub stop must NOT appear in the run detail.
   *
   * `collectionRun` maps stops onto `CollectionStopSummary`, which requires a shop name, code and
   * address. The hub has none — `round_stop_target_ck` forces its `shop_id` and `order_id` to NULL —
   * so an unfiltered projection emits a stop whose identity is three empty strings: a blank, tappable
   * row with no error in any log, test or screen.
   */
  it("⚠ the run detail lists shops ONLY — never an identity-less hub row", async () => {
    const run = await collectionRun(roundId, driverId);
    expect(run.stops).toHaveLength(1);
    expect(run.stops[0]!.shopName).toBe("Hub Shop");
    expect(run.stops.some((s) => s.shopName === "" || s.shopCode === "")).toBe(false);
  });

  it("checking in at the hub completes the hub stop, so it stops being offered", async () => {
    await collectTheShop();
    await hubCheckin(roundId, driverId);

    const stop = await pool.query(`SELECT status FROM public.round_stop WHERE id = $1`, [hubStopId]);
    expect(stop.rows[0].status).toBe("done");

    // ⚠ The mirror of the original defect: work that outlives the round it belongs to.
    const t = await today(driverId);
    expect(t.phase).toBe("idle");
  });

  it("checking in twice is a no-op, not an error", async () => {
    await collectTheShop();
    await hubCheckin(roundId, driverId);
    await expect(hubCheckin(roundId, driverId)).resolves.toBeDefined();
    const n = await pool.query(`SELECT count(*)::int AS n FROM public.hub_checkin`);
    expect(n.rows[0].n).toBe(1);
  });
});
