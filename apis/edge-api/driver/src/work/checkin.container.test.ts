import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { migrationSql } from "../../../fleet/src/shared/load-migrations";

/**
 * Hub check-in and collection against real PostgreSQL (063, US2).
 *
 * ⚠ C14 EXISTS BECAUSE ITS ABSENCE WAS FOUND BY A NEGATIVE PROOF. NP9 loosened the delivery gather
 * to admit standard packages and NOTHING FAILED — the test the quickstart listed had never been
 * written. A negative proof is only worth the guard it exercises.
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

import { collectStop, hubCheckin } from "./complete";
import { collectionRun, NotFoundError, today } from "./service";
// ⚠ THE REAL GATHER QUERY, NOT A COPY OF IT. The first version of C14 asserted against its own
// hand-written equivalent — so loosening the actual query changed nothing and the negative proof
// (NP9) sailed through. A test that agrees with a duplicate of the code proves only that the
// duplicate is consistent with itself: 028 recorded that shape five times in one slice.
import { gatherDeliveryWork } from "../../../fleet/src/planner/repository";

const RUN = process.env.CONTAINER_TESTS === "1";

async function q(sql: string, params: unknown[] = []) {
  return holder.pool!.query(sql, params as never[]);
}

let seq = 0;

/** A collection round with one stop and two packages: one same-day, one standard. */
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
     VALUES ($1, $2, 'collection', now() + interval '4 hours') RETURNING id`,
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
                                   delivery_fee_amount, grand_total_amount, delivery_address)
       VALUES ($1, $2, 'paid', 10, 0, 10, '{"city":"Fitzroy","postalCode":"3065"}'::jsonb) RETURNING id`,
      [c.rows[0].id, `EFY-${seq}${method === "same_day" ? "S" : "T"}`],
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
      packages: [{ packageId: ids[1]!, outcome: "not_available", note: "Shelf was empty" }],
    });

    const res = await hubCheckin(runId, driverId);
    expect(res.scannedTotal).toBe(1);

    const row = await q(`SELECT packages_expected, packages_arrived FROM public.hub_checkin`);
    expect(row.rows[0].packages_expected).toBe(2);
    // ⚠ The discrepancy is the point. Recording only what arrived makes a short count look like a
    // small round, and a package nobody is looking for is 056's finding all over again.
    expect(row.rows[0].packages_arrived).toBe(1);

    const note = await q(`SELECT note FROM public.round_package WHERE state = 'not_available'`);
    expect(note.rows[0].note).toBe("Shelf was empty");
  });

  // ⚠ C14 — THE TEST NP9 PROVED WAS MISSING.
  it("C14 — a standard package is checked in and enters NO delivery round (FR-024, SC-010)", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1" });

    const res = await hubCheckin(runId, driverId);
    expect(res.sameDayCount).toBe(1);
    expect(res.standardCount).toBe(1);

    // The REAL delivery gather is the thing under test: a standard package must be STRUCTURALLY
    // absent from it, not filtered out somewhere later.
    const eligible = await gatherDeliveryWork();
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.method).toBe("same_day");
  });

  it("advances the fulfillment out of ready_for_pickup, or the planner re-collects it forever", async () => {
    const { runId, stopId, driverId, ids } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1" });

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
      packages: [{ packageId: ids[0]!, outcome: "not_available" }],
    });

    const s = await q(`SELECT status FROM public.shop_fulfillment WHERE id = $1`, [ids[0]]);
    // ⚠ A shop that could not supply it today may supply it tomorrow. The discrepancy is recorded;
    // the work is not thrown away — which is why the unique index is partial.
    expect(s.rows[0].status).toBe("ready_for_pickup");
  });

  it("is idempotent — checking in twice writes one row", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    await collectStop(runId, stopId, driverId, { changeId: "c1" });
    await hubCheckin(runId, driverId);
    await hubCheckin(runId, driverId);
    const n = await q(`SELECT count(*)::int AS n FROM public.hub_checkin`);
    expect(n.rows[0].n).toBe(1);
  });

  it("is idempotent — collecting twice does not double-settle", async () => {
    const { runId, stopId, driverId } = await aCollectedRound();
    const first = await collectStop(runId, stopId, driverId, { changeId: "c1" });
    const again = await collectStop(runId, stopId, driverId, { changeId: "c1" });
    expect(again).toEqual(first);
  });

  // ⚠ C17 — I MARKED THIS DONE AND NEVER WROTE IT, and NP11 is what found that out. A negative proof
  // aimed at `ownsRound` passed happily because nothing exercised it.
  //
  // FR-038: a run belonging to ANOTHER driver must answer EXACTLY as a non-existent one does.
  // Distinguishing them turns the route into an oracle for which run ids are real — 052 made the same
  // two refusals byte-identical for that reason.
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
      // ⚠ The SAME refusal, not merely both refusals. Different messages would leak existence.
      expect((refusedForTheirs as Error).message).toBe((refusedForNonsense as Error).message);
    });

    it("refuses to collect at another driver's stop", async () => {
      const mine = await aCollectedRound();
      const theirs = await aCollectedRound();
      await expect(
        collectStop(theirs.runId, theirs.stopId, mine.driverId, { changeId: "x" }),
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
