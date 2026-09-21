import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { migrationSql } from "../shared/load-migrations";

/**
 * The wave planner against real PostgreSQL 16, on the REAL migrations (063).
 *
 * ⚠ WHY THIS FILE DECIDES WHETHER THE SLICE WORKS. `commitWave` writes five tables in one
 * transaction and leans on a PARTIAL UNIQUE INDEX for its correctness (FR-005). None of that can be
 * demonstrated by a mocked test: a mock cannot lose a race, cannot violate a constraint, and cannot
 * tell you that `ON CONFLICT (…) WHERE state = 'assigned'` matches the index you think it does.
 *
 * 058's container tests found THREE defects a fully green suite had missed, one of which broke every
 * second recompute — the exact idempotency its whole design rested on. 056's found a microsecond
 * truncation that would have made every save fail. This slice has already produced eight defects
 * `tsc` could not see.
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

import * as repo from "./repository";
import * as svc from "../dispatch/service";
import { planWave } from "./assign";
import type { PlannablePackage, PlannerCandidate } from "./types";

const RUN = process.env.CONTAINER_TESTS === "1";

const DEADLINE = new Date(Date.now() + 4 * 3600_000);
const NOW = new Date();

// ── fixture builders ─────────────────────────────────────────────────────────────────────────────

async function q(sql: string, params: unknown[] = []) {
  return holder.pool!.query(sql, params as never[]);
}

async function makeShop(name: string, code: string): Promise<string> {
  const r = await q(
    `INSERT INTO public.shop (name, code, status, address_line1, suburb, postcode, state)
     VALUES ($1, $2, 'active', '1 Test St', 'Fitzroy', '3065', 'VIC') RETURNING id`,
    [name, code],
  );
  return r.rows[0].id;
}

/**
 * ⚠ Rings are NOT seeded by the migrations — 047 creates the table and back-office fills it. A
 * fixture that assumed otherwise would fail here rather than in dev, which is the point of building
 * on the real schema.
 */
async function ensureRing(): Promise<string> {
  const existing = await q(`SELECT id FROM public.delivery_ring ORDER BY ordinal LIMIT 1`);
  if (existing.rows[0]) return existing.rows[0].id;
  const r = await q(
    `INSERT INTO public.delivery_ring (code, name, ordinal, status, updated_by)
     VALUES ('INNER', 'Inner', 1, 'active', 'test') RETURNING id`,
  );
  return r.rows[0].id;
}

async function makeZone(name: string, postcode: string): Promise<string> {
  const ringId = await ensureRing();
  const r = await q(
    `INSERT INTO public.delivery_zone (code, name, ring_id, status, updated_by)
     VALUES ($1, $2, $3, 'active', 'test') RETURNING id`,
    [`Z-${postcode}`, name, ringId],
  );
  await q(`INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ($1, $2)`, [
    r.rows[0].id,
    postcode,
  ]);
  return r.rows[0].id;
}

async function makeDriver(
  name: string,
  opts: { onDuty?: boolean; status?: string; licence?: string | null; vehicle?: boolean; frozen?: boolean; payloadKg?: number } = {},
): Promise<string> {
  const {
    onDuty = true,
    status = "active",
    licence = "2030-01-01",
    vehicle = true,
    frozen = true,
    payloadKg = 900,
  } = opts;
  const d = await q(
    `INSERT INTO public.driver (cognito_sub, name, work_email, status, licence_expires_on)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`sub-${name}`, name, `${name}@effyshopping.com`, status, licence],
  );
  const id = d.rows[0].id;
  if (onDuty) await q(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [id]);
  if (vehicle) {
    const v = await q(
      `INSERT INTO public.vehicle (registration_plate, make, model, body_type, ownership, status,
                                   payload_kg, can_carry_chilled, can_carry_frozen)
       VALUES ($1, 'Test', 'Van', 'van', 'effy_owned', 'active', $2, true, $3) RETURNING id`,
      [`P-${name}`.slice(0, 10).toUpperCase(), payloadKg, frozen],
    );
    await q(`INSERT INTO public.vehicle_holding (vehicle_id, driver_id) VALUES ($1, $2)`, [v.rows[0].id, id]);
  }
  return id;
}

async function clear(driverId: string, fn: string, method: string, zoneId: string | null) {
  await q(
    `INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id)
     VALUES ($1, $2, $3, $4)`,
    [driverId, fn, method, zoneId],
  );
}

let orderSeq = 0;
async function makeReadyPackage(shopId: string, postcode = "3065", method = "standard"): Promise<string> {
  orderSeq += 1;
  const cust = await q(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`,
    [`cust-${orderSeq}`, `c${orderSeq}@example.com`],
  );
  const addr = JSON.stringify({ recipientName: "Pat", line1: "9 Home Rd", city: "Fitzroy", postalCode: postcode, region: "VIC", country: "AU" });
  const o = await q(
    `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
                                 delivery_fee_amount, grand_total_amount, delivery_address)
     VALUES ($1, $2, 'paid', 10, 0, 10, $3::jsonb) RETURNING id`,
    [cust.rows[0].id, `EFY-T${orderSeq}`, addr],
  );
  const sf = await q(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, delivery_method,
                                          item_count, subtotal_amount, state_changed_at)
     VALUES ($1, $2, 'ready_for_pickup', $3, 1, 10, now()) RETURNING id`,
    [o.rows[0].id, shopId, method],
  );
  return sf.rows[0].id;
}

/** Run a real collection wave over whatever is currently ready. */
async function runWave(now = NOW) {
  const [packages, candidates] = await Promise.all([repo.gatherCollectionWork(), repo.loadCandidates()]);
  const openStops = new Map<string, { stopId: string; driverId: string; deadlineAt: Date; locked: boolean }>();
  for (const shopId of new Set(packages.map((p) => p.shopId))) {
    const open = await repo.findOpenStopForShop(shopId);
    if (open) openStops.set(shopId, open);
  }
  const plan = planWave({
    kind: "collection",
    packages,
    candidates,
    plannedFor: now,
    deadlineAt: DEADLINE,
    now,
    perStopAllowanceMin: 12,
    openStops,
  });
  return { plan, result: await repo.commitWave(plan, "schedule", null, null) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe.skipIf(!RUN)("wave planner against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    holder.pool = new Pool({ connectionString: container.getConnectionUri() });
    // ⚠ The REAL migrations — not a transcription that can drift (see load-migrations.ts).
    await holder.pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await holder.pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await q(`TRUNCATE public.assignment_exclusion, public.hub_checkin, public.round_package,
                      public.round_stop, public.driver_round, public.dispatch_wave,
                      public.driver_zone_capability, public.vehicle_holding, public.vehicle,
                      public.driver_duty_session, public.driver, public.shop_fulfillment,
                      public."order", public.customer, public.delivery_zone_postcode,
                      public.delivery_zone, public.shop CASCADE`);
  });

  it("C0 — places ready work on an eligible on-duty driver, end to end", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const driver = await makeDriver("ada");
    await clear(driver, "collection", "standard", zone);
    await makeReadyPackage(shop);

    const { result } = await runWave();
    expect(result.assigned).toBe(1);

    const rounds = await q(`SELECT driver_id, kind, status FROM public.driver_round`);
    expect(rounds.rows).toHaveLength(1);
    expect(rounds.rows[0].driver_id).toBe(driver);
    expect(rounds.rows[0].kind).toBe("collection");
  });

  // ⚠ FR-005 / SC-004 — the property the whole design rests on.
  it("C1 — a second planning pass assigns nothing twice", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    await makeReadyPackage(shop);

    const first = await runWave();
    const second = await runWave();

    expect(first.result.assigned).toBe(1);
    expect(second.result.assigned).toBe(0);
    expect(second.plan.considered).toBe(0); // the gather itself already excludes it
    const rp = await q(`SELECT count(*)::int AS n FROM public.round_package`);
    expect(rp.rows[0].n).toBe(1);
  });

  // ⚠ The index, not the service, is what makes this true (research R6).
  it("C2 — two CONCURRENT passes cannot both assign the same package", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d1 = await makeDriver("ada");
    const d2 = await makeDriver("bea");
    await clear(d1, "collection", "standard", zone);
    await clear(d2, "collection", "standard", zone);
    const pkg = await makeReadyPackage(shop);

    // Both passes gather BEFORE either commits — the interleaving a check-then-write cannot survive.
    const [packages, candidates] = await Promise.all([repo.gatherCollectionWork(), repo.loadCandidates()]);
    const mk = (driverId: string) =>
      planWave({
        kind: "collection",
        packages,
        candidates: candidates.filter((c) => c.driverId === driverId),
        plannedFor: NOW,
        deadlineAt: DEADLINE,
        now: NOW,
        perStopAllowanceMin: 12,
        openStops: new Map(),
      });

    const [a, b] = await Promise.all([
      repo.commitWave(mk(d1), "schedule", null, null),
      repo.commitWave(mk(d2), "schedule", null, null),
    ]);

    expect(a.assigned + b.assigned).toBe(1);
    const open = await q(
      `SELECT count(*)::int AS n FROM public.round_package WHERE shop_fulfillment_id = $1 AND state = 'assigned'`,
      [pkg],
    );
    expect(open.rows[0].n).toBe(1);
  });

  // ⚠ The index is PARTIAL on purpose — a package a driver could not collect on Monday is ordinary
  // work on Tuesday, and a total index would forbid that forever.
  it("C3 — a settled package can be assigned again in a later wave", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    const pkg = await makeReadyPackage(shop);

    await runWave();
    await q(`UPDATE public.round_package SET state = 'not_available', settled_at = now()`);
    const again = await runWave();

    expect(again.result.assigned).toBe(1);
    const rows = await q(
      `SELECT state FROM public.round_package WHERE shop_fulfillment_id = $1 ORDER BY created_at`,
      [pkg],
    );
    expect(rows.rows.map((r) => r.state)).toEqual(["not_available", "assigned"]);
  });

  // ⚠ 062 FR-011 — the behaviour whose absence is completely invisible.
  it("C4 — an every-zone clearance covers a zone created AFTER it was granted", async () => {
    const shop = await makeShop("Shop One", "S1");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", null); // everywhere
    const newZone = await makeZone("Zone Created Later", "3121");
    await makeReadyPackage(shop, "3121");

    const { result } = await runWave();
    expect(result.assigned).toBe(1);
    const stop = await q(`SELECT zone_id FROM public.round_stop`);
    expect(stop.rows[0].zone_id).toBe(newZone);
  });

  // ⚠ FR-015 / SC-003 — the engine may fail to assign; it may never fail quietly.
  it("C5 — every hard gate excludes independently and writes its own reason", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    await makeReadyPackage(shop);

    const cases: Array<[string, Parameters<typeof makeDriver>[1], string]> = [
      ["offduty", { onDuty: false }, "not_on_duty"],
      ["standown", { status: "suspended" }, "not_employable"],
      ["lapsed", { licence: "2020-01-01" }, "licence_expired"],
      ["novan", { vehicle: false }, "no_vehicle"],
    ];

    for (const [name, opts, expected] of cases) {
      await q(`TRUNCATE public.assignment_exclusion, public.round_package, public.round_stop,
                        public.driver_round, public.dispatch_wave, public.driver_zone_capability,
                        public.vehicle_holding, public.vehicle, public.driver_duty_session,
                        public.driver CASCADE`);
      const d = await makeDriver(name, opts);
      await clear(d, "collection", "standard", zone);

      const { result } = await runWave();
      expect(result.assigned, `${name} should not have been given work`).toBe(0);

      const reasons = await q(`SELECT DISTINCT reason FROM public.assignment_exclusion`);
      expect(reasons.rows.map((r) => r.reason), `${name} must record ${expected}`).toContain(expected);
    }
  });

  it("C5b — a cleared-for-nothing driver is excluded as not_cleared, naming them", async () => {
    const shop = await makeShop("Shop One", "S1");
    await makeZone("Inner North", "3065");
    const d = await makeDriver("ada"); // no clearances at all
    await makeReadyPackage(shop);

    await runWave();
    const ex = await q(`SELECT driver_id, reason FROM public.assignment_exclusion`);
    expect(ex.rows.some((r) => r.reason === "not_cleared" && r.driver_id === d)).toBe(true);
  });

  it("C5c — no candidate at all is recorded with driver_id NULL, a different problem", async () => {
    const shop = await makeShop("Shop One", "S1");
    await makeZone("Inner North", "3065");
    await makeReadyPackage(shop); // nobody exists

    await runWave();
    const ex = await q(`SELECT driver_id, reason FROM public.assignment_exclusion`);
    expect(ex.rows).toHaveLength(1);
    expect(ex.rows[0].driver_id).toBeNull();
  });

  it("C8 — a round is not assigned beyond the vehicle's payload", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada", { payloadKg: 1 }); // 1 kg
    await clear(d, "collection", "standard", zone);
    const sf = await makeReadyPackage(shop);
    // 5 kg of goods against a 1 kg van.
    await q(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, sku,
                                   price_amount, short_description, created_by, status, weight_grams)
       VALUES ($1,
               (SELECT id FROM public.product_type LIMIT 1),
               (SELECT id FROM public.category LIMIT 1),
               'Heavy', 'SKU-H', 1, 'A heavy thing', 'test', 'active', 5000) RETURNING id`,
      [shop],
    ).then(async (p) => {
      const o = await q(`SELECT order_id FROM public.shop_fulfillment WHERE id = $1`, [sf]);
      await q(
        `INSERT INTO public.order_item (order_id, shop_id, product_id, product_name, quantity,
                                        unit_price_amount, line_subtotal_amount)
         VALUES ($1, $2, $3, 'Heavy', 1, 1, 1)`,
        [o.rows[0].order_id, shop, p.rows[0].id],
      );
    });

    const { result } = await runWave();
    expect(result.assigned).toBe(0);
    const ex = await q(`SELECT reason FROM public.assignment_exclusion`);
    expect(ex.rows.map((r) => r.reason)).toContain("over_capacity");
  });

  // ⚠ TWO SHOPS, NOT ONE, AND THE FIRST DRAFT OF THIS TEST GOT IT WRONG. A second package at the
  // SAME shop joins the existing stop (FR-004a) — one shop, one stop, one van goes there — so it
  // proves nothing about balancing. Load balancing decides who gets a NEW stop.
  it("C10 — a new stop goes to the driver carrying fewest today, stably", async () => {
    const shopA = await makeShop("Shop One", "S1");
    const shopB = await makeShop("Shop Two", "S2");
    const zone = await makeZone("Inner North", "3065");
    const zoe = await makeDriver("zoe");
    const amy = await makeDriver("amy");
    await clear(zoe, "collection", "standard", zone);
    await clear(amy, "collection", "standard", zone);

    await makeReadyPackage(shopA);
    await runWave();
    const firstHolder = (await q(`SELECT driver_id FROM public.driver_round`)).rows[0].driver_id;

    await makeReadyPackage(shopB); // a DIFFERENT shop — a genuinely new stop
    await runWave();
    const holders = (await q(`SELECT driver_id FROM public.driver_round ORDER BY created_at`)).rows;
    expect(holders).toHaveLength(2);
    expect(holders[1].driver_id, "the lighter driver must take the new stop").not.toBe(firstHolder);
  });

  // ⚠ FR-004a — the operator's decision, against a real round.
  it("C11 — a late package joins an in-flight round when that shop's stop is outstanding", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    await makeReadyPackage(shop);
    await runWave();

    await q(`UPDATE public.driver_round SET status = 'in_progress'`);
    await makeReadyPackage(shop); // the shop finishes one more while the van is coming

    const { result } = await runWave();
    expect(result.assigned).toBe(1);

    const rounds = await q(`SELECT id, changed_note FROM public.driver_round`);
    expect(rounds.rows, "it must JOIN the round, not create a second").toHaveLength(1);
    // ⚠ FR-004b — the driver must be told it changed.
    expect(rounds.rows[0].changed_note).toMatch(/Added EFY-T/);

    // ⚠ COUNTS SHOP STOPS, NOT ALL STOPS (updated by 064). This asserted `count(*) = 1` and began
    // failing when 064 gave every collection round a `hub_checkin` stop — correctly, because the
    // round genuinely has two stops now. The behaviour under test is that a late package JOINS the
    // existing shop stop instead of minting a second one, so the count is scoped to the kind that
    // claim is about; a looser assertion would have stopped testing it.
    const shopStops = await q(
      `SELECT count(*)::int AS n FROM public.round_stop WHERE kind = 'shop_pickup'`,
    );
    expect(shopStops.rows[0].n, "one shop, one stop").toBe(1);

    // And the hub stop is there — a collection round ends at the hub (064, FR-015).
    const hub = await q(
      `SELECT count(*)::int AS n FROM public.round_stop WHERE kind = 'hub_checkin'`,
    );
    expect(hub.rows[0].n, "a collection round ends at the hub").toBe(1);
  });

  it("C12 — it waits for the next wave when that shop's stop is already done", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    await makeReadyPackage(shop);
    await runWave();

    await q(`UPDATE public.round_stop SET status = 'done', completed_at = now()`);
    await q(`UPDATE public.round_package SET state = 'picked_up', settled_at = now()`);
    // ⚠ A COLLECTED PACKAGE MUST LEAVE `ready_for_pickup`. The gather query's ONLY protection
    // against collecting the same package twice is the fulfillment's own status — marking the
    // round_package `picked_up` is not enough, because the partial index only excludes rows that
    // are still `assigned`. The first draft of this fixture left the fulfillment ready, and the
    // planner dutifully sent a second driver for a package already in the first one's van.
    await q(`UPDATE public.shop_fulfillment SET status = 'collected', state_changed_at = now()
              WHERE id IN (SELECT shop_fulfillment_id FROM public.round_package WHERE state = 'picked_up')`);
    await makeReadyPackage(shop);

    const { result } = await runWave();
    expect(result.assigned).toBe(1);
    const rounds = await q(`SELECT count(*)::int AS n FROM public.driver_round`);
    expect(rounds.rows[0].n, "a NEW round, not an addition to the finished one").toBe(2);
  });

  // ⚠ THE INVARIANT C12 EXPOSED, STATED DIRECTLY. Collection and the fulfillment status are coupled:
  // if completing a stop ever stops advancing `shop_fulfillment.status`, EVERY subsequent wave
  // re-collects work already in a van, and nothing else fails. US2 owns that write; this pins why.
  it("never re-collects a package whose fulfillment has left ready_for_pickup", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    await makeReadyPackage(shop);
    await runWave();

    await q(`UPDATE public.round_package SET state = 'picked_up', settled_at = now()`);
    await q(`UPDATE public.shop_fulfillment SET status = 'collected'`);

    const again = await runWave();
    expect(again.plan.considered, "a collected package is not work").toBe(0);
    expect(again.result.assigned).toBe(0);
  });

  it("records what each wave decided, so it is explainable afterwards (FR-006)", async () => {
    const shop = await makeShop("Shop One", "S1");
    await makeZone("Inner North", "3065");
    await makeReadyPackage(shop); // nobody can take it

    await runWave();
    const w = await q(`SELECT packages_considered, packages_assigned, packages_unassigned, finished_at
                         FROM public.dispatch_wave`);
    expect(w.rows[0].packages_considered).toBe(1);
    expect(w.rows[0].packages_assigned).toBe(0);
    expect(w.rows[0].packages_unassigned).toBe(1);
    expect(w.rows[0].finished_at).not.toBeNull();
  });

// ─── US4: the dispatcher's overrides, against real PostgreSQL ────────────────────────────────────

// ⚠ NESTED, not a sibling. A second top-level describe runs AFTER the first one's afterAll has
// closed the pool — "Cannot use a pool after calling end on the pool". The container's lifecycle
// belongs to one owner.
describe("dispatcher overrides against real PostgreSQL", () => {

  /** A planned round with one driver, ready to be overridden. */
  async function aPlannedRound() {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const ada = await makeDriver("ada");
    const bea = await makeDriver("bea");
    await clear(ada, "collection", "standard", zone);
    await clear(bea, "collection", "standard", zone);
    await makeReadyPackage(shop);
    await runWave();
    const r = await q(`SELECT id, driver_id FROM public.driver_round`);
    return { roundId: r.rows[0].id, holder: r.rows[0].driver_id, ada, bea, zone };
  }

  async function token(roundId: string): Promise<string> {
    const r = await q(
      `SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t
         FROM public.driver_round WHERE id = $1`,
      [roundId],
    );
    return r.rows[0].t;
  }

  // ⚠ FR-032 / SC-006 — a locked decision must survive the engine.
  it("C6 — a locked round is untouched by the next planning pass", async () => {
    const { roundId, holder } = await aPlannedRound();
    await svc.setLock(roundId, true, await token(roundId), "staff-1");

    // More work at the same shop: without the lock this would join the round (FR-004a).
    const shopId = (await q(`SELECT shop_id FROM public.round_stop WHERE round_id = $1`, [roundId])).rows[0].shop_id;
    await makeReadyPackage(shopId);
    await runWave();

    const after = await q(`SELECT driver_id, locked_by_sub FROM public.driver_round WHERE id = $1`, [roundId]);
    expect(after.rows[0].driver_id, "the holder must not change").toBe(holder);
    expect(after.rows[0].locked_by_sub).toBe("staff-1");

    const joined = await q(
      `SELECT count(*)::int AS n FROM public.round_package rp
         JOIN public.round_stop rs ON rs.id = rp.stop_id WHERE rs.round_id = $1`,
      [roundId],
    );
    expect(joined.rows[0].n, "nothing may be added to a locked round").toBe(1);
  });

  // ⚠ FR-034 / SC-005 — a person may override a preference, never a fact.
  it("C7 — reassigning to an ineligible driver is refused, naming the condition", async () => {
    const { roundId, holder, ada, bea } = await aPlannedRound();
    const other = holder === ada ? bea : ada;

    // Take their licence away.
    await q(`UPDATE public.driver SET licence_expires_on = '2020-01-01' WHERE id = $1`, [other]);

    await expect(svc.reassign(roundId, other, await token(roundId), "staff-1")).rejects.toMatchObject({
      kind: "ineligible",
      reasons: expect.arrayContaining(["licence_expired"]),
    });

    const after = await q(`SELECT driver_id FROM public.driver_round WHERE id = $1`, [roundId]);
    expect(after.rows[0].driver_id, "the round must not have moved").toBe(holder);
  });

  it("C7b — reassigning to an eligible driver succeeds and is audited", async () => {
    const { roundId, holder, ada, bea } = await aPlannedRound();
    const other = holder === ada ? bea : ada;

    await svc.reassign(roundId, other, await token(roundId), "staff-1");

    const after = await q(`SELECT driver_id FROM public.driver_round WHERE id = $1`, [roundId]);
    expect(after.rows[0].driver_id).toBe(other);

    // ⚠ FR-033 — who, and when. The engine's choices are reconstructable from dispatch_wave; a
    // person's are not.
    const audit = await q(`SELECT actor_sub, action, target_type FROM admin.audit_log`);
    expect(audit.rows).toContainEqual(
      expect.objectContaining({ actor_sub: "staff-1", action: "dispatch.reassign", target_type: "driver_round" }),
    );
  });

  // ⚠ 056's defect, in a new place. toISOString() truncates to milliseconds; PostgreSQL stores
  // microseconds. Without the to_char(...US) round-trip EVERY save fails claiming a conflict.
  it("C16 — the concurrency token survives microsecond precision", async () => {
    const { roundId, holder, ada, bea } = await aPlannedRound();
    const other = holder === ada ? bea : ada;

    const good = await token(roundId);
    await expect(svc.reassign(roundId, other, good, "staff-1")).resolves.toBeUndefined();

    // A millisecond-truncated token must be REJECTED — that is the bug, made visible.
    const truncated = new Date(await token(roundId)).toISOString();
    const fresh = await token(roundId);
    if (truncated !== fresh) {
      await expect(svc.reassign(roundId, holder, truncated, "staff-1")).rejects.toMatchObject({ kind: "stale" });
    }
  });

  it("C15 — unassign returns planned work but leaves collected work attributed", async () => {
    const { roundId, holder } = await aPlannedRound();
    const shopId = (await q(`SELECT shop_id FROM public.round_stop WHERE round_id = $1`, [roundId])).rows[0].shop_id;
    await makeReadyPackage(shopId);
    await runWave(); // a second package joins the round

    // One is collected, one is not.
    const pkgs = await q(
      `SELECT rp.id FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
        WHERE rs.round_id = $1 ORDER BY rp.created_at`,
      [roundId],
    );
    await q(`UPDATE public.round_package SET state = 'picked_up', settled_at = now() WHERE id = $1`, [
      pkgs.rows[0].id,
    ]);

    await svc.unassign(roundId, await token(roundId), "staff-1");

    const remaining = await q(
      `SELECT rp.state FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
        WHERE rs.round_id = $1`,
      [roundId],
    );
    // ⚠ 056's stranded-work finding: the collected package is physically in a van, and no query can
    // know otherwise. Releasing it would send a second driver for goods somebody already has.
    expect(remaining.rows.map((r) => r.state)).toEqual(["picked_up"]);
    expect(holder).toBeTruthy();
  });

  it("refuses a partial reorder — every stop, exactly once", async () => {
    const { roundId } = await aPlannedRound();
    await expect(svc.reorder(roundId, [], await token(roundId), "staff-1")).rejects.toMatchObject({
      kind: "invalid",
    });
  });

  it("shows unassigned work WITH its reason on the day view (FR-028)", async () => {
    const shop = await makeShop("Shop One", "S1");
    await makeZone("Inner North", "3065");
    await makeDriver("ada"); // exists but cleared for nothing
    await makeReadyPackage(shop);
    await runWave();

    const day = await svc.readDay();
    expect(day.unassigned).toHaveLength(1);
    expect(day.unassigned[0]!.reasons).toContain("not_cleared");
  });
});
});
