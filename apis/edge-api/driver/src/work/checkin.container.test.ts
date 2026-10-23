import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { migrationSql } from "@effy/edge-shared/testing";

/** Hub check-in and collection against real Postgres. */

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

import { collectStop, hubCheckin } from "./complete";
import { collectionRun, NotFoundError, today } from "./service";
// The real gather query, not a copy, so loosening it fails this test.
import { gatherDeliveryWork } from "../../../fleet/src/planner/repository";

const RUN = process.env.CONTAINER_TESTS === "1";

async function q(sql: string, params: unknown[] = []) {
  return holder.pool!.query(sql, params as never[]);
}

/** A collect names every package still waiting. */
async function shown(stopId: string) {
  const { rows } = await q(`SELECT shop_fulfillment_id AS id FROM public.round_package WHERE stop_id = $1 AND state = 'assigned'`, [stopId]);
  return rows.map((r: any) => ({ packageId: r.id as string, outcome: "picked_up" as const }));
}

let seq = 0;

async function aCollectedRound(): Promise<{ runId: string; stopId: string; driverId: string; ids: string[] }> {
  seq += 1;
  const shop = await q(
    `INSERT INTO public.shop (name, code, status, address_line1, suburb, postcode, state)
     VALUES ($1, $2, 'active', '1 Test St', 'Fitzroy', '3065', 'VIC') RETURNING id`,
    [`Shop ${seq}`, `S${seq}`],
  );
  const d = await q(
    `INSERT INTO public.driver (cognito_sub, name, work_email, status)
     VALUES ($1, 'Ada', $2, 'active') RETURNING id`,
    [`sub-${seq}`, `ada${seq}@effyshopping.com`],
  );
  const wave = await q(
    `INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`,
  );
  const round = await q(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at)
     VALUES ($1, $2, 'collection', now() + interval '30 minutes') RETURNING id`,
    [wave.rows[0].id, d.rows[0].id],
  );
  const stop = await q(
    `INSERT INTO public.round_stop (round_id, kind, shop_id) VALUES ($1, 'shop_pickup', $2) RETURNING id`,
    [round.rows[0].id, shop.rows[0].id],
  );

  const ids: string[] = [];
  for (const method of ["same_day", "standard"]) {
    const c = await q(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`, [
      `c-${seq}-${method}`,
      `c${seq}${method}@example.com`,
    ]);
    const o = await q(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
                                   delivery_fee_amount, grand_total_amount, delivery_address, delivery_type, delivery_type_reason,
                                   courier_estimate, delivery_promise)
       VALUES ($1, $2, 'paid', 10, 0, 10, '{"city":"Fitzroy","postalCode":"3065"}'::jsonb, $3, $4, $5, $6) RETURNING id`,
      [c.rows[0].id, `EFY-${seq}${method === "same_day" ? "S" : "T"}`,
       ...(method === "same_day" ? ["effy", "in_coverage", null, "window"] : ["courier", "out_of_coverage", "2–4 business days", null])],
    );
    const sf = await q(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, delivery_method, item_count,
                                            subtotal_amount, state_changed_at)
       VALUES ($1, $2, 'ready_for_pickup', $3, 1, 10, now()) RETURNING id`,
      [o.rows[0].id, shop.rows[0].id, method],
    );
    await q(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id) VALUES ($1, $2)`, [
      stop.rows[0].id,
      sf.rows[0].id,
    ]);
    ids.push(sf.rows[0].id);
  }

  return { runId: round.rows[0].id, stopId: stop.rows[0].id, driverId: d.rows[0].id, ids };
}

describe.skipIf(!RUN)("hub check-in against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    holder.pool = new Pool({ connectionString: container.getConnectionUri() });
    await holder.pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await holder.pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await q(`TRUNCATE public.hub_checkin, public.round_package, public.round_stop,
                      public.driver_round, public.dispatch_wave, public.driver,
                      public.shop_fulfillment, public."order", public.customer, public.shop CASCADE`);
  });

  it("C13 — records arrival, and a short count shows the discrepancy (FR-022, FR-026)", async () => {
    const { runId, stopId, driverId, ids } = await aCollectedRound();

    // One collected, one not available.
    await collectStop(runId, stopId, driverId, {
      changeId: "c1",
      packages: [{ packageId: ids[0]!, outcome: "picked_up" }, { packageId: ids[1]!, outcome: "not_available", note: "Shelf was empty" }],
    });

    const res = await hubCheckin(runId, driverId);
    expect(res.scannedTotal).toBe(1);

    const row = await q(`SELECT packages_expected, packages_arrived FROM public.hub_checkin`);
    expect(row.rows[0].packages_expected).toBe(2);
    // The discrepancy is recorded: a short count must not look like a small round.
    expect(row.rows[0].packages_arrived).toBe(1);

    const note = await q(`SELECT note FROM public.round_package WHERE state = 'not_available'`);
    expect(note.rows[0].note).toBe("Shelf was empty");
  });

  it("C14 — a standard package is checked in and enters NO delivery round (FR-024, SC-010)", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });

    const res = await hubCheckin(runId, driverId);
    expect(res.scannedTotal).toBe(2);
    expect(res.courierCount).toBe(1);
    expect(res.effyCount).toBe(1);
    // No courier service is set up here, so there is no pickup to tell.
    expect(res.nextCourierPickupLabel).toBeNull();

    // A standard package must be structurally absent from the real delivery gather.
    const eligible = await gatherDeliveryWork(holder.pool!, null, new Date("9999-12-31T00:00:00Z"));
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.deliveredBy).toBe("effy");

    expect(res.effyCount).toBe(1);
    expect(res.effyGroups).toEqual([{ date: null, windowStart: null, windowEnd: null, label: "Effy delivery", count: 1, dueToday: true }]);
  });

  it("092 — check-in says when the default courier service next collects, when a courier parcel came in", async () => {
    await q(`DELETE FROM public.courier_service`);
    await q(`INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days,
                                                 pickup_weekdays, pickup_cutoff, is_default, updated_by)
             VALUES ('Test Couriers', 'Standard', '2–4 business days', 4, ARRAY[1,2,3,4,5,6,7], '23:59', true, 'test')`);
    const { runId, stopId, driverId } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });

    const res = await hubCheckin(runId, driverId);
    expect(res.courierCount).toBe(1);
    expect(res.nextCourierPickupLabel).toMatch(/11:59 pm/);
    await q(`DELETE FROM public.courier_service`);
  });

  /** Effy's parcels grouped by day and window, in the server's words. */
  it("082 P7 — check-in groups Effy's parcels by day and window; a later-day window is Effy's, not a courier's", async () => {
    const { runId, stopId, driverId, ids } = await aCollectedRound();
    const slot = async (start: string) =>
      (await q(`INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ($1::time, $1::time + interval '2 hours', '00:00', 9, 'test') RETURNING id`, [start])).rows[0].id;
    const sell = async (sfId: string, method: string, slotId: string, start: string, end: string) => {
      await q(`INSERT INTO public.order_package_delivery (order_id, shop_id, method, slot_id, window_start, window_end)
         SELECT order_id, shop_id, $2, $3, $4::timestamptz, $5::timestamptz FROM public.shop_fulfillment WHERE id = $1`, [sfId, method, slotId, start, end]);
      await q(`UPDATE public."order" SET delivery_type = 'effy', delivery_type_reason = 'in_coverage', courier_estimate = NULL
                WHERE id = (SELECT order_id FROM public.shop_fulfillment WHERE id = $1)`, [sfId]);
    };
    // Fixed days in 2031, so neither is ever "today".
    await sell(ids[0]!, "same_day", await slot("16:00"), "2031-03-04T05:00:00Z", "2031-03-04T07:00:00Z");
    await sell(ids[1]!, "standard", await slot("10:00"), "2031-03-06T23:00:00Z", "2031-03-07T01:00:00Z");
    await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });

    const res = await hubCheckin(runId, driverId);
    expect(res.courierCount).toBe(0);
    expect(res.effyCount).toBe(2);
    expect(res.effyGroups).toEqual([
      { date: "2031-03-04", windowStart: "2031-03-04T05:00:00.000Z", windowEnd: "2031-03-04T07:00:00.000Z", label: "Tue 4 Mar, 4 pm – 6 pm", count: 1, dueToday: false },
      { date: "2031-03-07", windowStart: "2031-03-06T23:00:00.000Z", windowEnd: "2031-03-07T01:00:00.000Z", label: "Fri 7 Mar, 10 am – 12 pm", count: 1, dueToday: false },
    ]);
    expect(res.scannedTotal).toBe(2);
  });

  it("advances the fulfillment out of ready_for_pickup, or the planner re-collects it forever", async () => {
    const { runId, stopId, driverId, ids } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });

    const states = await q(
      `SELECT status FROM public.shop_fulfillment WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids],
    );
    expect(states.rows.every((r) => r.status === "collected")).toBe(true);
  });

  it("leaves a not-available package ready, so a later wave can try again", async () => {
    const { runId, stopId, driverId, ids } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, {
      changeId: "c1",
      packages: [{ packageId: ids[0]!, outcome: "not_available" }, { packageId: ids[1]!, outcome: "picked_up" }],
    });

    const s = await q(`SELECT status FROM public.shop_fulfillment WHERE id = $1`, [ids[0]]);
    // A shop may supply it tomorrow: the work is kept, hence the partial unique index.
    expect(s.rows[0].status).toBe("ready_for_pickup");
  });

  it("is idempotent — checking in twice writes one row", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });
    await hubCheckin(runId, driverId);
    await hubCheckin(runId, driverId);
    const n = await q(`SELECT count(*)::int AS n FROM public.hub_checkin`);
    expect(n.rows[0].n).toBe(1);
  });

  it("is idempotent — collecting twice does not double-settle", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    const first = await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });
    const again = await collectStop(runId, stopId, driverId, { changeId: "c1", packages: await shown(stopId) });
    expect(again).toEqual(first);
  });

  // Another driver's run must answer exactly as a missing one.
  describe("C17 — a driver sees only their own work (FR-038)", () => {
    it("refuses another driver's round identically to a round that does not exist", async () => {
      const mine = await aCollectedRound();
      const theirs = await aCollectedRound();

      let refusedForTheirs: unknown;
      let refusedForNonsense: unknown;

      try {
        await collectionRun(theirs.runId, mine.driverId);
      } catch (e) {
        refusedForTheirs = e;
      }
      try {
        await collectionRun("00000000-0000-0000-0000-000000000000", mine.driverId);
      } catch (e) {
        refusedForNonsense = e;
      }

      expect(refusedForTheirs).toBeInstanceOf(NotFoundError);
      expect(refusedForNonsense).toBeInstanceOf(NotFoundError);
      // The same refusal, not merely two refusals.
      expect((refusedForTheirs as Error).message).toBe((refusedForNonsense as Error).message);
    });

    it("refuses to collect at another driver's stop", async () => {
      const mine = await aCollectedRound();
      const theirs = await aCollectedRound();
      await expect(
        collectStop(theirs.runId, theirs.stopId, mine.driverId, { changeId: "x", packages: await shown(theirs.stopId) }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("refuses to check in another driver's round", async () => {
      const mine = await aCollectedRound();
      const theirs = await aCollectedRound();
      await expect(hubCheckin(theirs.runId, mine.driverId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("shows a driver their own round and not anybody else's", async () => {
      const mine = await aCollectedRound();
      await aCollectedRound();
      const mineToday = await today(mine.driverId);
      expect(mineToday.activeRunId).toBe(mine.runId);
    });
  });
});
