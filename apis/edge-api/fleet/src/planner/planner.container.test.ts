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
import * as manual from "../assignments/service";
import { planWave } from "./assign";
import { runPass } from "./service";
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

/**
 * Run the collection planner over whatever is currently ready, against a FIXED deadline — the
 * repository and the pure planner without the schedule. `runPass` (below) is the whole thing.
 */
async function runWave(now = NOW) {
  const db = holder.pool!;
  const [packages, candidates, rounds] = await Promise.all([
    repo.gatherCollectionWork(),
    repo.loadCandidates(),
    repo.loadBucketRounds(db, "collection", DEADLINE, null),
  ]);
  const plan = planWave({
    kind: "collection",
    packages,
    candidates,
    plannedFor: now,
    deadlineAt: DEADLINE,
    now,
    perStopAllowanceMin: 12,
    rounds,
  });
  const result = await repo.commitWave(plan, "schedule", null, null);
  await repo.replaceExclusions(db, "collection", plan.exclusions);
  return { plan, result };
}

/** One order line of `grams` on a package, optionally with a storage class. */
let skuSeq = 0;
async function addLine(sfId: string, shopId: string, grams: number, storage: "chilled" | "frozen" | null = null) {
  skuSeq += 1;
  const p = await q(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, sku,
                                 price_amount, short_description, created_by, status, weight_grams, approved_at)
     VALUES ($1,
             (SELECT id FROM public.product_type LIMIT 1),
             (SELECT id FROM public.category LIMIT 1),
             $2, $3, 1, 'A thing', 'test', 'active', $4, now()) RETURNING id`,
    [shopId, `Thing ${skuSeq}`, `SKU-L${skuSeq}`, grams],
  );
  const o = await q(`SELECT order_id FROM public.shop_fulfillment WHERE id = $1`, [sfId]);
  await q(
    `INSERT INTO public.order_item (order_id, shop_id, product_id, product_name, quantity,
                                    unit_price_amount, line_subtotal_amount)
     VALUES ($1, $2, $3, 'Thing', 1, 1, 1)`,
    [o.rows[0].order_id, shopId, p.rows[0].id],
  );
  if (storage) {
    await q(
      `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text)
       VALUES ($1, (SELECT id FROM public.attribute_definition WHERE key = 'storage'), $2)`,
      [p.rows[0].id, storage],
    );
  }
  return p.rows[0].id as string;
}

/**
 * An active collection run `minutesAhead` of the real clock, as Melbourne wall-clock — and the
 * instant it falls on. ⚠ The real clock, because `public.round_opens_at` and the driver's gate are
 * judged against the database's `now()`; a pretend `now` here would disagree with them.
 */
async function seedRun(minutesAhead: number): Promise<Date> {
  const at = new Date(Math.floor((Date.now() + minutesAhead * 60_000) / 60_000) * 60_000);
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  await q(`INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ($1, 'active', 'test')`, [hhmm]);
  return at;
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
                                   price_amount, short_description, created_by, status, weight_grams, approved_at)
       VALUES ($1,
               (SELECT id FROM public.product_type LIMIT 1),
               (SELECT id FROM public.category LIMIT 1),
               'Heavy', 'SKU-H', 1, 'A heavy thing', 'test', 'active', 5000, now()) RETURNING id`,
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

    // The driver has been to the shop: collecting a stop is what moves a round to in_progress.
    await q(`UPDATE public.driver_round SET status = 'in_progress'`);
    await q(`UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE kind = 'shop_pickup'`);
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

  // ⚠ 072 — the planner runs every few minutes all day. A row per pass that decided nothing is a
  // log of nothing happening.
  it("records a pass that assigned something, and writes NO row for one that assigned nothing", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    await makeReadyPackage(shop); // nobody can take it

    await runWave();
    expect((await q(`SELECT count(*)::int AS n FROM public.dispatch_wave`)).rows[0].n).toBe(0);

    const d = await makeDriver("ada");
    await clear(d, "collection", "standard", zone);
    await runWave();
    const w = await q(`SELECT packages_considered, packages_assigned, packages_unassigned, finished_at
                         FROM public.dispatch_wave`);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0].packages_considered).toBe(1);
    expect(w.rows[0].packages_assigned).toBe(1);
    expect(w.rows[0].packages_unassigned).toBe(0);
    expect(w.rows[0].finished_at).not.toBeNull();
  });

  // ⚠ 072 — found while seeding a round's weight. The gather joined every attribute value a product
  // has, so a product with three contributed its weight three times.
  it("weighs an order line once, however many attributes its product has", async () => {
    const shop = await makeShop("Shop One", "S1");
    await makeZone("Inner North", "3065");
    const sf = await makeReadyPackage(shop);
    const product = await addLine(sf, shop, 4000, "chilled");
    await q(
      `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text)
       SELECT $1, id, 'x' FROM public.attribute_definition WHERE key <> 'storage' ORDER BY key LIMIT 2`,
      [product],
    );

    const [pkg] = await repo.gatherCollectionWork();
    expect(pkg!.weightGrams).toBe(4000);
    expect(pkg!.itemCount).toBe(1);
    expect(pkg!.requiresChilled).toBe(true);
    expect(pkg!.requiresFrozen).toBe(false);
  });

// ─── US4: the dispatcher's overrides, against real PostgreSQL ────────────────────────────────────

// ⚠ NESTED, not a sibling. A second top-level describe runs AFTER the first one's afterAll has
// closed the pool — "Cannot use a pool after calling end on the pool". The container's lifecycle
// belongs to one owner.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 069 — delivery windows. The wave is planned PER WINDOW, shortly before it opens, against its end.

// ⚠ Nested in the suite above, like the dispatcher overrides below: it shares that suite's container
// and must not start or end one of its own.
describe("069 + 072 — delivery is planned per window, and assigned at once", () => {
  beforeEach(async () => {
    await q(`TRUNCATE public.delivery_collection_run, public.assignment_exclusion, public.hub_checkin, public.round_package,
                      public.round_stop, public.driver_round, public.dispatch_wave,
                      public.driver_zone_capability, public.vehicle_holding, public.vehicle,
                      public.driver_duty_session, public.driver, public.shop_fulfillment,
                      public."order", public.customer, public.delivery_zone_postcode,
                      public.delivery_zone, public.delivery_slot, public.shop CASCADE`);
  });

  // 5–7 pm and 7–9 pm Melbourne on 2026-10-08 (AEDT, UTC+11).
  const EARLY = { start: "2026-10-08T06:00:00Z", end: "2026-10-08T08:00:00Z" };
  const LATE = { start: "2026-10-08T08:00:00Z", end: "2026-10-08T10:00:00Z" };
  let slotSeq = 0;

  /** A same-day package that has been collected and checked in at the hub, sold `window` (or none). */
  async function atHub(collector: string, shopId: string, window: { start: string; end: string } | null) {
    const sfId = await makeReadyPackage(shopId, "3065", "same_day");
    const wave = await q(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('collection', now(), 'schedule') RETURNING id`);
    const round = await q(
      `INSERT INTO public.driver_round (wave_id, driver_id, kind, deadline_at, status)
       VALUES ($1, $2, 'collection', now(), 'completed') RETURNING id`,
      [wave.rows[0].id, collector],
    );
    const stop = await q(
      `INSERT INTO public.round_stop (round_id, kind, shop_id, status) VALUES ($1, 'shop_pickup', $2, 'done') RETURNING id`,
      [round.rows[0].id, shopId],
    );
    await q(`INSERT INTO public.round_package (stop_id, shop_fulfillment_id, state) VALUES ($1, $2, 'picked_up')`, [stop.rows[0].id, sfId]);
    await q(
      `INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived) VALUES ($1, $2, 1, 1)`,
      [round.rows[0].id, collector],
    );
    await q(`UPDATE public.shop_fulfillment SET status = 'collected' WHERE id = $1`, [sfId]);

    const order = await q(`SELECT order_id FROM public.shop_fulfillment WHERE id = $1`, [sfId]);
    let slotId: string | null = null;
    if (window) {
      slotSeq += 1;
      const slot = await q(
        `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
         VALUES ('00:00'::time + ($1 || ' minutes')::interval, '00:00'::time + ($1 || ' minutes')::interval + interval '30 seconds', '00:00', 9, 'test')
         RETURNING id`,
        [slotSeq],
      );
      slotId = slot.rows[0].id;
    }
    await q(
      `INSERT INTO public.order_package_delivery (order_id, shop_id, method, delivery_fee_amount, slot_id, window_start, window_end)
       VALUES ($1, $2, 'same_day', 8, $3, $4, $5)`,
      [order.rows[0].order_id, shopId, slotId, window?.start ?? null, window?.end ?? null],
    );
    return sfId;
  }

  async function world() {
    const zoneId = await makeZone("Inner North", "3065");
    const shopId = await makeShop("Shop One", "SHOP1");
    const driverId = await makeDriver("dana");
    await clear(driverId, "delivery", "same_day", zoneId);
    return { shopId, driverId };
  }

  async function deliveryRounds() {
    return (await q(
      `SELECT dr.deadline_at, dr.window_start_at,
              public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
              count(rp.id)::int AS packages
         FROM public.driver_round dr
         JOIN public.round_stop rs ON rs.round_id = dr.id
         JOIN public.round_package rp ON rp.stop_id = rs.id
        WHERE dr.kind = 'delivery'
        GROUP BY dr.id, dr.deadline_at, dr.window_start_at ORDER BY dr.deadline_at`,
    )).rows as Array<{ deadline_at: Date; window_start_at: Date | null; opens_at: Date | null; packages: number }>;
  }

  it("the gather reads each package's window as stored instants", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);
    await atHub(driverId, shopId, null);

    const work = await repo.gatherDeliveryWork();
    const windows = work.map((p) => (p.windowStart ? p.windowStart.toISOString() : null)).sort();
    expect(windows).toEqual(["2026-10-08T06:00:00.000Z", null].sort());
  });

  // ⚠ C2 (072) — THE RULE THIS REPLACED. 069 held a window's packages at the hub, unassigned, until
  // 45 minutes before the window. They are assigned on the next pass now; the ROUND waits instead.
  it("⚠ C2 — a window's package is assigned hours before the window, on a round that has not opened", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);

    // Midday Melbourne: the 5 pm window is five hours off.
    const outcome = await runPass(new Date("2026-10-08T01:00:00Z"));

    expect(outcome.delivery).toMatchObject({ considered: 1, assigned: 1, unassigned: 0, unassignedPastOpening: 0 });
    const rounds = await deliveryRounds();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.deadline_at).toEqual(new Date(EARLY.end));
    expect(rounds[0]!.window_start_at).toEqual(new Date(EARLY.start));
    // 45 minutes before the window starts — derived by the database, stored nowhere.
    expect(rounds[0]!.opens_at).toEqual(new Date("2026-10-08T05:15:00Z"));
  });

  it("⚠ each window's round works to the window's END, not the end of the day (NP6)", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);
    await atHub(driverId, shopId, LATE);

    const outcome = await runPass(new Date("2026-10-08T01:00:00Z"));

    expect(outcome.delivery.assigned).toBe(2);
    const rounds = await deliveryRounds();
    expect(rounds.map((r) => r.deadline_at), "one round per window").toEqual([new Date(EARLY.end), new Date(LATE.end)]);
    expect(rounds.map((r) => r.packages)).toEqual([1, 1]);
  });

  // ⚠ C3, delivery side — packages for one window reach the hub across several collection runs.
  it("a later package for the same window joins the driver's round for it", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);
    await runPass(new Date("2026-10-08T01:00:00Z"));
    await atHub(driverId, shopId, EARLY);
    await runPass(new Date("2026-10-08T01:05:00Z"));

    const rounds = await deliveryRounds();
    expect(rounds, "one round, not two").toHaveLength(1);
    expect(rounds[0]!.packages).toBe(2);
    // Not begun, so nobody is told about each addition (FR-018).
    expect((await q(`SELECT changed_note FROM public.driver_round WHERE kind = 'delivery'`)).rows[0].changed_note).toBeNull();
  });

  // The van has left the hub; the new package is AT the hub.
  it("nothing joins a delivery round that is under way — a further round is made", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);
    await runPass(new Date("2026-10-08T05:30:00Z"));
    await q(`UPDATE public.driver_round SET status = 'in_progress' WHERE kind = 'delivery'`);

    await atHub(driverId, shopId, EARLY);
    await runPass(new Date("2026-10-08T05:35:00Z"));

    expect((await deliveryRounds()).map((r) => r.packages)).toEqual([1, 1]);
  });

  it("an order placed before 069 is planned at once, against the end of the day, and is open", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, null);

    const outcome = await runPass(new Date("2026-10-08T01:00:00Z")); // midday Melbourne

    expect(outcome.delivery.assigned).toBe(1);
    const rounds = await deliveryRounds();
    expect(rounds).toHaveLength(1);
    // The end of 8 October in Melbourne (AEDT) is 12:59:59 UTC.
    expect(rounds[0]!.deadline_at.toISOString().slice(0, 13)).toBe("2026-10-08T12");
    expect(rounds[0]!.window_start_at).toBeNull();
    expect(rounds[0]!.opens_at, "no window means no lock").toBeNull();
  });

  it("a window that has already closed is still sent out, late and open, rather than left at the hub", async () => {
    const { shopId, driverId } = await world();
    await atHub(driverId, shopId, EARLY);

    const outcome = await runPass(new Date("2026-10-08T08:30:00Z"));

    expect(outcome.delivery.assigned).toBe(1);
    const rounds = await deliveryRounds();
    expect(rounds[0]!.deadline_at.toISOString().slice(0, 13)).toBe("2026-10-08T12");
    expect(rounds[0]!.opens_at).toBeNull();
  });

  it("does nothing, and says so, when nothing is at the hub", async () => {
    await world();
    const outcome = await runPass(NOW);
    expect(outcome.skipped).toBeNull();
    expect(outcome.delivery).toMatchObject({ considered: 0, assigned: 0, unassigned: 0 });
    expect((await q(`SELECT count(*)::int AS n FROM public.dispatch_wave WHERE kind = 'delivery'`)).rows[0].n).toBe(0);
  });

  // ⚠ 072 — FOUND WHILE REMOVING THE WINDOW. The gather had no test for "already delivered": a
  // delivered package's collection row is `picked_up` for ever and its delivery row is `delivered`,
  // not `assigned`, so it matched again and the next pass put it on a new round.
  it("⚠ a package that HAS been delivered is never planned again", async () => {
    const { shopId, driverId } = await world();
    const sf = await atHub(driverId, shopId, null);
    await runPass(new Date("2026-10-08T01:00:00Z"));

    await q(
      `UPDATE public.round_package rp SET state = 'delivered', settled_at = now()
         FROM public.round_stop rs JOIN public.driver_round dr ON dr.id = rs.round_id
        WHERE rs.id = rp.stop_id AND dr.kind = 'delivery'`,
    );
    await q(`UPDATE public.shop_fulfillment SET status = 'delivered' WHERE id = $1`, [sf]);
    await q(`UPDATE public.driver_round SET status = 'completed' WHERE kind = 'delivery'`);

    const again = await runPass(new Date("2026-10-08T01:05:00Z"));
    expect(again.delivery.considered, "a delivered package is not work").toBe(0);
    expect(await deliveryRounds()).toHaveLength(1);
  });

  it("lists a hub-side package nobody can deliver, once, with its reason and what it is waiting for", async () => {
    const zoneId = await makeZone("Inner North", "3065");
    const shopId = await makeShop("Shop One", "SHOP1");
    const collector = await makeDriver("cole");
    await clear(collector, "collection", "same_day", zoneId); // may collect; may NOT deliver
    await atHub(collector, shopId, EARLY);

    await runPass(new Date("2026-10-08T01:00:00Z"));
    await runPass(new Date("2026-10-08T01:05:00Z"));

    const day = await svc.readDay();
    expect(day.unassigned).toHaveLength(1);
    expect(day.unassigned[0]).toMatchObject({ stage: "delivery", method: "same_day" });
    expect(day.unassigned[0]!.reasons).toEqual(["not_cleared"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 072 — the whole pass, on the real clock and the real schedule.
//
// ⚠ Nested in the suite above for the same reason as its neighbours: one container, one owner.
describe("072 — work is assigned the moment a driver can take it", () => {
  beforeEach(async () => {
    await q(`TRUNCATE public.delivery_collection_run, public.delivery_settings, public.assignment_exclusion,
                      public.hub_checkin, public.round_package, public.round_stop, public.driver_round,
                      public.dispatch_wave, public.driver_zone_capability, public.vehicle_holding,
                      public.vehicle, public.driver_duty_session, public.driver, public.shop_fulfillment,
                      public."order", public.customer, public.delivery_zone_postcode,
                      public.delivery_zone, public.shop CASCADE`);
    await q(`DELETE FROM admin.audit_log`);
  });

  async function world(drivers: string[] = ["ada"]) {
    const zone = await makeZone("Inner North", "3065");
    const ids: string[] = [];
    for (const name of drivers) {
      const id = await makeDriver(name);
      await clear(id, "collection", "standard", zone);
      ids.push(id);
    }
    return { zone, drivers: ids };
  }

  async function rounds() {
    return (await q(
      `SELECT dr.id, dr.driver_id, dr.status, dr.deadline_at,
              public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
              (SELECT count(*)::int FROM public.round_stop rs WHERE rs.round_id = dr.id AND rs.kind = 'shop_pickup') AS shop_stops,
              (SELECT count(*)::int FROM public.round_stop rs WHERE rs.round_id = dr.id AND rs.kind = 'hub_checkin') AS hub_stops,
              (SELECT count(*)::int FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
                WHERE rs.round_id = dr.id) AS packages
         FROM public.driver_round dr ORDER BY dr.created_at, dr.id`,
    )).rows as Array<{
      id: string; driver_id: string; status: string; deadline_at: Date;
      opens_at: Date | null; shop_stops: number; hub_stops: number; packages: number;
    }>;
  }

  const offDuty = (driverId: string) =>
    q(`UPDATE public.driver_duty_session SET ended_at = now() WHERE driver_id = $1 AND ended_at IS NULL`, [driverId]);

  // ⚠ C1 — THE FEATURE. Until 072 this package had nobody's name on it until 45 minutes before the run.
  it("⚠ C1 — a package ready three hours before its run is assigned on the next pass", async () => {
    const run = await seedRun(180);
    const { drivers } = await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));

    const outcome = await runPass();

    expect(outcome.collection).toMatchObject({ considered: 1, assigned: 1, unassigned: 0 });
    expect(outcome.driverIds).toEqual(drivers);
    const [round] = await rounds();
    expect(round!.driver_id).toBe(drivers[0]);
    expect(round!.deadline_at, "the round belongs to the run").toEqual(run);
    // It is visible now and cannot be worked for another two and a quarter hours.
    expect(round!.opens_at).toEqual(new Date(run.getTime() - 45 * 60_000));
    expect(round!.opens_at!.getTime()).toBeGreaterThan(Date.now());
  });

  // ⚠ C3 — without this, C1 turns every pass into a new round.
  it("⚠ C3 — three shops readying at three times before one run leave ONE round", async () => {
    await seedRun(180);
    await world();
    for (const code of ["S1", "S2", "S3"]) {
      await makeReadyPackage(await makeShop(`Shop ${code}`, code));
      await runPass();
    }

    const all = await rounds();
    expect(all, "one round, not three").toHaveLength(1);
    expect(all[0]).toMatchObject({ shop_stops: 3, hub_stops: 1, packages: 3, status: "planned" });
    // A pass that added to a round is recorded like one that created it.
    expect((await q(`SELECT count(*)::int AS n FROM public.dispatch_wave`)).rows[0].n).toBe(3);
  });

  // ⚠ C4 — a round opens 45 minutes before its run; at 12 minutes a stop that is three stops. The
  // FOURTH is refused although this pass is only adding ONE: the gate reads the whole round.
  it("⚠ C4 — the deadline is judged over the whole accumulated round, from when it opens", async () => {
    await seedRun(180);
    await world();
    for (const code of ["S1", "S2", "S3", "S4"]) {
      await makeReadyPackage(await makeShop(`Shop ${code}`, code));
      await runPass();
    }

    const all = await rounds();
    expect(all).toHaveLength(1);
    expect(all[0]!.shop_stops).toBe(3);
    const ex = await q(`SELECT reason, kind FROM public.assignment_exclusion`);
    expect(ex.rows).toEqual([{ reason: "cannot_meet_deadline", kind: "collection" }]);
  });

  // M1 (073) — every assignment says how it was made, written once on the row.
  it("M1 — the planner writes a one-line note on every assignment", async () => {
    await seedRun(180);
    await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    await runPass();
    const r = await q(`SELECT assigned_note, assigned_by_sub FROM public.round_package`);
    expect(r.rows).toEqual([{ assigned_note: "Auto-assigned — the only driver who could take it", assigned_by_sub: null }]);
  });

  it("C4b — and so is the vehicle's payload", async () => {
    await seedRun(180);
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada", { payloadKg: 10 });
    await clear(d, "collection", "standard", zone);
    const shopA = await makeShop("Shop One", "S1");
    const shopB = await makeShop("Shop Two", "S2");

    await addLine(await makeReadyPackage(shopA), shopA, 6000);
    await runPass();
    await addLine(await makeReadyPackage(shopB), shopB, 6000); // 12 kg in a 10 kg van
    const second = await runPass();

    expect(second.collection.assigned).toBe(0);
    expect((await rounds())[0]!.packages).toBe(1);
    expect((await q(`SELECT reason FROM public.assignment_exclusion`)).rows).toEqual([{ reason: "over_capacity" }]);
  });

  // ⚠ C5 / FR-009 — first come, first served. Chosen over rebalancing, deliberately.
  it("⚠ C5 — a driver who comes on duty later takes nothing already assigned", async () => {
    await seedRun(180);
    const zone = await makeZone("Inner North", "3065");
    const early = await makeDriver("early");
    await clear(early, "collection", "standard", zone);
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    await makeReadyPackage(await makeShop("Shop Two", "S2"));
    await runPass();

    const late = await makeDriver("late");
    await clear(late, "collection", "standard", zone);
    const idle = await runPass();
    expect(idle.collection.considered, "nothing is unassigned, so nothing is moved").toBe(0);
    expect((await rounds()).map((r) => [r.driver_id, r.packages])).toEqual([[early, 2]]);

    // What becomes ready AFTER they clock on is theirs: they have been given the least today.
    await makeReadyPackage(await makeShop("Shop Three", "S3"));
    await runPass();
    expect((await rounds()).map((r) => [r.driver_id, r.packages])).toEqual([[early, 2], [late, 1]]);
  });

  it("C6 — after the day's last run, a package is assigned at once to TOMORROW's run", async () => {
    await seedRun(-60); // the only run was an hour ago
    await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));

    const outcome = await runPass();

    expect(outcome.collection.assigned).toBe(1);
    const [round] = await rounds();
    const hoursAway = (round!.deadline_at.getTime() - Date.now()) / 3600_000;
    expect(hoursAway).toBeGreaterThan(21);
    expect(hoursAway).toBeLessThan(25);
  });

  it("plans nothing, and cancels nothing it should not, when no collection run is configured", async () => {
    await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    const outcome = await runPass();
    expect(outcome.collection).toMatchObject({ skippedReason: "no_active_collection_runs", assigned: 0 });
    expect(await rounds()).toEqual([]);
  });

  // ⚠ C10 — 063 FR-035, WHICH NOTHING IMPLEMENTED. Without it a driver given tomorrow's run at 18:00
  // goes home and keeps it.
  it("⚠ C10 — a driver who goes off duty loses a round they have not begun", async () => {
    await seedRun(180);
    const { drivers } = await world();
    const sf = await makeReadyPackage(await makeShop("Shop One", "S1"));
    await runPass();

    await offDuty(drivers[0]!);
    const outcome = await runPass();

    expect(outcome.released).toBe(1);
    expect(outcome.driverIds, "their app is told").toEqual(drivers);
    expect((await rounds()).map((r) => [r.status, r.packages])).toEqual([["cancelled", 0]]);
    // The package is plain unassigned work again, with a reason — never silently parked.
    const ex = await q(`SELECT reason FROM public.assignment_exclusion WHERE shop_fulfillment_id = $1`, [sf]);
    expect(ex.rows.map((r) => r.reason)).toContain("not_on_duty");
    const audit = await q(`SELECT actor_sub, action, detail FROM admin.audit_log WHERE action = 'driver.work_released'`);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].detail).toMatchObject({ packages: 1, why: "driver_unavailable" });
  });

  it("C10b — it goes straight to another driver who qualifies, in the same pass", async () => {
    await seedRun(180);
    const zone = await makeZone("Inner North", "3065");
    const first = await makeDriver("first");
    await clear(first, "collection", "standard", zone);
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    await runPass();

    const second = await makeDriver("second");
    await clear(second, "collection", "standard", zone);
    await offDuty(first);
    const outcome = await runPass();

    expect(outcome).toMatchObject({ released: 1 });
    expect(outcome.collection.assigned).toBe(1);
    expect((await rounds()).map((r) => [r.driver_id, r.status, r.packages])).toEqual([
      [first, "cancelled", 0],
      [second, "planned", 1],
    ]);
  });

  // ⚠ 056's stranded-work finding: collected goods are physically in a van.
  it("⚠ C10c — collected packages stay theirs; only what is still at a shop is returned", async () => {
    await seedRun(180);
    const { drivers } = await world();
    const shopA = await makeShop("Shop One", "S1");
    const shopB = await makeShop("Shop Two", "S2");
    const collected = await makeReadyPackage(shopA);
    const waiting = await makeReadyPackage(shopB);
    await runPass();

    // The driver collected at Shop One, then went off duty before Shop Two.
    await q(`UPDATE public.driver_round SET status = 'in_progress'`);
    await q(`UPDATE public.round_stop SET status = 'done', completed_at = now() WHERE shop_id = $1`, [shopA]);
    await q(`UPDATE public.round_package SET state = 'picked_up', settled_at = now() WHERE shop_fulfillment_id = $1`, [collected]);
    await q(`UPDATE public.shop_fulfillment SET status = 'collected' WHERE id = $1`, [collected]);
    await offDuty(drivers[0]!);

    const outcome = await runPass();

    expect(outcome.released).toBe(1);
    const rows = await q(`SELECT shop_fulfillment_id, state FROM public.round_package`);
    expect(rows.rows).toEqual([{ shop_fulfillment_id: collected, state: "picked_up" }]);
    const [round] = await rounds();
    expect(round!.status, "the round goes on to the hub with what it holds").toBe("in_progress");
    expect((await q(`SELECT status FROM public.round_stop WHERE shop_id = $1`, [shopB])).rows[0].status).toBe("skipped");
    expect((await q(`SELECT 1 FROM public.assignment_exclusion WHERE shop_fulfillment_id = $1`, [waiting])).rowCount).toBeGreaterThan(0);
  });

  // ⚠ 073 — THE ROUND LOCK IS GONE. What it protected was a person's decision; since 072 the planner
  // never moves assigned work, so a hand-placed package stays put without one. (072's C11 asserted
  // the lock and was removed with it.)
  it("C11 — work already assigned is never moved by later passes", async () => {
    await seedRun(180);
    const { drivers } = await world(["ada", "bea"]);
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    await runPass();
    const [before] = await rounds();
    for (let i = 0; i < 3; i += 1) await runPass();
    const after = await rounds();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before!.id, driver_id: before!.driver_id, packages: 1 });
    expect(drivers).toContain(before!.driver_id);
  });

  // ⚠ C12 / FR-014 — a round not yet begun follows the schedule as it now stands.
  it("⚠ C12 — deleting a run ends its unbegun rounds and moves the work to the next run", async () => {
    const first = await seedRun(120);
    const second = await seedRun(300);
    const { drivers } = await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));
    await runPass();
    expect((await rounds())[0]!.deadline_at).toEqual(first);

    await q(`DELETE FROM public.delivery_collection_run WHERE run_time = ($1::timestamptz AT TIME ZONE 'Australia/Melbourne')::time`, [first]);
    const outcome = await runPass();

    expect(outcome.released).toBe(1);
    expect((await rounds()).map((r) => [r.status, r.packages, r.deadline_at.getTime()])).toEqual([
      ["cancelled", 0, first.getTime()],
      ["planned", 1, second.getTime()],
    ]);
    const audit = await q(`SELECT detail FROM admin.audit_log WHERE action = 'driver.work_released'`);
    expect(audit.rows[0].detail).toMatchObject({ why: "run_removed" });
    expect(drivers).toHaveLength(1);
  });

  // ⚠ C13 / SC-007 — 288 passes a day must not be 288 copies of one fact.
  it("⚠ C13 — ten passes over a package nobody can take leave ONE set of reasons and no wave rows", async () => {
    await seedRun(180);
    await makeZone("Inner North", "3065");
    await makeDriver("ada"); // on duty, holding a van, cleared for nothing
    await makeReadyPackage(await makeShop("Shop One", "S1"));

    const first = await runPass();
    expect(first.reasonsChanged).toBe(true);
    const stamped = await q(`SELECT id, reason, updated_at FROM public.assignment_exclusion ORDER BY id`);

    for (let i = 0; i < 9; i += 1) {
      const again = await runPass();
      expect(again.reasonsChanged, "nothing changed, so nothing is written or announced").toBe(false);
    }

    const after = await q(`SELECT id, reason, updated_at FROM public.assignment_exclusion ORDER BY id`);
    expect(after.rows, "the very same rows, untouched").toEqual(stamped.rows);
    expect(after.rows.map((r) => r.reason)).toEqual(["not_cleared"]);
    expect((await q(`SELECT count(*)::int AS n FROM public.dispatch_wave`)).rows[0].n).toBe(0);
  });

  it("C13b — the reason follows the world, and goes when the package is assigned", async () => {
    await seedRun(180);
    const zone = await makeZone("Inner North", "3065");
    const d = await makeDriver("ada");
    await makeReadyPackage(await makeShop("Shop One", "S1"));

    await runPass();
    await q(`UPDATE public.driver SET licence_expires_on = '2020-01-01' WHERE id = $1`, [d]);
    const changed = await runPass();
    expect(changed.reasonsChanged).toBe(true);
    expect((await q(`SELECT reason FROM public.assignment_exclusion ORDER BY reason`)).rows.map((r) => r.reason)).toEqual([
      "licence_expired",
      "not_cleared",
    ]);

    await q(`UPDATE public.driver SET licence_expires_on = '2030-01-01' WHERE id = $1`, [d]);
    await clear(d, "collection", "standard", zone);
    const assigned = await runPass();
    expect(assigned.collection.assigned).toBe(1);
    expect((await q(`SELECT count(*)::int AS n FROM public.assignment_exclusion`)).rows[0].n).toBe(0);
  });

  // ⚠ C16 — find-then-create is a check-then-write; the lock is what makes it safe.
  it("⚠ C16 — a pass that cannot take the lock does nothing at all", async () => {
    await seedRun(180);
    await world();
    await makeReadyPackage(await makeShop("Shop One", "S1"));

    const other = await holder.pool!.connect();
    try {
      await other.query("BEGIN");
      await other.query("SELECT pg_advisory_xact_lock(72063001)");

      const blocked = await runPass();
      expect(blocked.skipped).toBe("pass_in_progress");
      expect(await rounds()).toEqual([]);
    } finally {
      await other.query("ROLLBACK");
      other.release();
    }

    const free = await runPass();
    expect(free.skipped).toBeNull();
    expect(free.collection.assigned).toBe(1);
    expect((await q(`SELECT count(*)::int AS n FROM public.round_package`)).rows[0].n).toBe(1);
  });

  // The alarm's input (research R12).
  it("counts an unassigned package against the alarm only once its round would be open", async () => {
    await seedRun(180);
    await makeZone("Inner North", "3065");
    await makeReadyPackage(await makeShop("Shop One", "S1")); // no driver at all

    const early = await runPass();
    expect(early.collection).toMatchObject({ unassigned: 1, unassignedPastOpening: 0 });

    await q(`DELETE FROM public.delivery_collection_run`);
    await seedRun(30); // opened fifteen minutes ago
    const open = await runPass();
    expect(open.collection).toMatchObject({ unassigned: 1, unassignedPastOpening: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 073 — Assign to… and Unassign: a person's two actions. Nested for the shared container.
describe("073 — Assign to… and Unassign", () => {
  beforeEach(async () => {
    await q(`TRUNCATE public.delivery_collection_run, public.delivery_settings, public.assignment_exclusion,
                      public.hub_checkin, public.round_package, public.round_stop, public.driver_round,
                      public.dispatch_wave, public.driver_zone_capability, public.vehicle_holding,
                      public.vehicle, public.driver_duty_session, public.driver, public.shop_fulfillment,
                      public."order", public.customer, public.delivery_zone_postcode,
                      public.delivery_zone, public.shop CASCADE`);
    await q(`DELETE FROM admin.audit_log`);
    await q(`INSERT INTO admin.staff (cognito_sub, email, name) VALUES ('staff-ann', 'ann@effyshopping.com', 'Ann')
             ON CONFLICT (cognito_sub) DO NOTHING`);
  });

  const placed = async () =>
    (await q(`SELECT rp.id, rp.assigned_note, rp.assigned_by_sub, dr.driver_id, dr.status AS round_status
                FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
                JOIN public.driver_round dr ON dr.id = rs.round_id WHERE rp.state = 'assigned'`)).rows;

  async function setup() {
    await seedRun(180);
    const zone = await makeZone("Inner North", "3065");
    const ada = await makeDriver("ada");
    const ben = await makeDriver("ben");
    await clear(ada, "collection", "standard", zone);
    await clear(ben, "collection", "standard", zone);
    const pkg = await makeReadyPackage(await makeShop("Shop One", "S1"));
    return { zone, ada, ben, pkg };
  }

  // M2 — assign an unassigned package; move it; unassign it.
  it("M2 — assigns a package nobody has, records who, and the planner leaves it there", async () => {
    const { ben, pkg } = await setup();
    const out = await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" });
    expect(out).toEqual({ message: "Assigned to ben", driverIds: [ben] });
    expect(await placed()).toMatchObject([{ driver_id: ben, assigned_note: "Assigned by Ann", assigned_by_sub: "staff-ann" }]);

    await runPass();
    expect((await placed()).map((r) => r.driver_id)).toEqual([ben]);
  });

  it("M2 — moves a package from one driver to another; both are told; the empty round is cancelled", async () => {
    const { ada, ben, pkg } = await setup();
    await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ada, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" });
    const [first] = await placed();

    const out = await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: first!.id, acceptConcerns: false, actorSub: "staff-ann" });
    expect(out.driverIds.sort()).toEqual([ada, ben].sort());
    expect((await placed()).map((r) => r.driver_id)).toEqual([ben]);
    const adaRound = await q(`SELECT status FROM public.driver_round WHERE driver_id = $1`, [ada]);
    expect(adaRound.rows.map((r) => r.status)).toEqual(["cancelled"]);
  });

  it("M2 — unassign hands it back, and the next pass assigns it again", async () => {
    const { ada, pkg } = await setup();
    await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ada, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" });
    const [row] = await placed();
    const out = await manual.unassign({ packageId: pkg, stage: "collection", expectedAssignmentId: row!.id, actorSub: "staff-ann" });
    expect(out.message).toBe("Unassigned — auto-assign will pick it up within 5 minutes");
    expect(await placed()).toEqual([]);
    await runPass();
    expect(await placed()).toHaveLength(1);
  });

  // M3 — cannot vs concern.
  it("M3 — a driver who cannot take it is refused in one line, and nothing moves", async () => {
    const { ben, pkg } = await setup();
    await q(`UPDATE public.driver_duty_session SET ended_at = now() WHERE driver_id = $1`, [ben]);
    await expect(
      manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: true, actorSub: "staff-ann" }),
    ).rejects.toMatchObject({ kind: "cannot_take", detail: "ben can't take it — off duty." });
    expect(await placed()).toEqual([]);
  });

  it("M3 — a concern needs a confirm, then succeeds and says what was accepted", async () => {
    const { zone, ben, pkg } = await setup();
    await q(`DELETE FROM public.driver_zone_capability WHERE driver_id = $1 AND zone_id = $2`, [ben, zone]);
    await expect(
      manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" }),
    ).rejects.toMatchObject({ kind: "needs_confirm", detail: "Not cleared for this area. Assign anyway?" });

    await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: true, actorSub: "staff-ann" });
    expect(await placed()).toMatchObject([{ driver_id: ben, assigned_note: "Assigned by Ann — accepted: not cleared for this area" }]);
  });

  it("M3 — the driver list puts fine first and says why for the rest", async () => {
    const { ada, ben, pkg } = await setup();
    await q(`UPDATE public.driver_duty_session SET ended_at = now() WHERE driver_id = $1`, [ben]);
    const list = await manual.driversFor(pkg, "collection");
    expect(list.map((d) => [d.driverId, d.fit])).toEqual([[ada, "fine"], [ben, "cannot"]]);
    expect(list[1]!.notes).toEqual(["Off duty"]);
  });

  // M4 — collected, stale.
  it("M4 — a collected package cannot be moved or unassigned", async () => {
    const { ada, ben, pkg } = await setup();
    await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ada, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" });
    await q(`UPDATE public.round_package SET state = 'picked_up', settled_at = now()`);
    await q(`UPDATE public.shop_fulfillment SET status = 'collected'`);
    await expect(
      manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" }),
    ).rejects.toMatchObject({ kind: "collected", detail: "It's already in ada's van." });
  });

  it("M4 — a stale token is refused and nothing changes", async () => {
    const { ada, ben, pkg } = await setup();
    await manual.assignTo({ packageId: pkg, stage: "collection", driverId: ada, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" });
    await expect(
      manual.assignTo({ packageId: pkg, stage: "collection", driverId: ben, expectedAssignmentId: null, acceptConcerns: false, actorSub: "staff-ann" }),
    ).rejects.toMatchObject({ kind: "changed" });
    expect((await placed()).map((r) => r.driver_id)).toEqual([ada]);
  });
});

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

  // ⚠ C14 / SC-008 — until 072 this check asked about a round that needed no refrigeration, whatever
  // the round actually carried. A dispatcher could do what the planner never would.
  it("⚠ C14 — reassigning a chilled round to a van that cannot carry chilled is refused", async () => {
    const shop = await makeShop("Shop One", "S1");
    const zone = await makeZone("Inner North", "3065");
    const cold = await makeDriver("cold");
    await clear(cold, "collection", "standard", zone);
    await addLine(await makeReadyPackage(shop), shop, 2000, "chilled");
    await runWave();
    const roundId = (await q(`SELECT id FROM public.driver_round`)).rows[0].id;

    const warm = await makeDriver("warm");
    await clear(warm, "collection", "standard", zone);
    await q(
      `UPDATE public.vehicle SET can_carry_chilled = false
        WHERE id = (SELECT vehicle_id FROM public.vehicle_holding WHERE driver_id = $1)`,
      [warm],
    );

    await expect(svc.reassign(roundId, warm, await token(roundId), "staff-1")).rejects.toMatchObject({
      kind: "ineligible",
      reasons: ["no_refrigeration"],
    });
    expect((await q(`SELECT driver_id FROM public.driver_round WHERE id = $1`, [roundId])).rows[0].driver_id).toBe(cold);
  });

  it("C14b — and to a driver not cleared for a zone the round goes to", async () => {
    const { roundId, holder, ada, bea, zone } = await aPlannedRound();
    const other = holder === ada ? bea : ada;
    await q(`DELETE FROM public.driver_zone_capability WHERE driver_id = $1 AND zone_id = $2`, [other, zone]);
    const elsewhere = await makeZone("Far South", "3199");
    await clear(other, "collection", "standard", elsewhere);

    await expect(svc.reassign(roundId, other, await token(roundId), "staff-1")).rejects.toMatchObject({
      kind: "ineligible",
      reasons: ["not_cleared"],
    });
  });

  // FR-031 — every override behaves on an unopened round exactly as on an open one.
  it("every override works on a round that has not opened", async () => {
    const { roundId, holder, ada, bea } = await aPlannedRound();
    const other = holder === ada ? bea : ada;
    const read = await svc.readRound(roundId);
    expect(new Date(read.opensAt!).getTime(), "the fixture's round opens hours from now").toBeGreaterThan(Date.now());

    const stopIds = (await q(`SELECT id FROM public.round_stop WHERE round_id = $1 ORDER BY id`, [roundId])).rows.map((r) => r.id);
    await svc.reorder(roundId, stopIds.reverse(), await token(roundId), "staff-1");
    await svc.reassign(roundId, other, await token(roundId), "staff-1");
    await svc.unassign(roundId, await token(roundId), "staff-1");

    const after = await q(`SELECT driver_id, status FROM public.driver_round WHERE id = $1`, [roundId]);
    expect(after.rows[0]).toEqual({ driver_id: other, status: "cancelled" });
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
    expect(day.unassigned[0]!.stage).toBe("collection");
  });

  it("shows each round's opening time on the day view, and a round assigned on an earlier day", async () => {
    const { roundId } = await aPlannedRound();
    // Assigned yesterday evening for today's run — "created today" would have hidden it.
    await q(`UPDATE public.driver_round SET created_at = now() - interval '20 hours', updated_at = now() - interval '20 hours'`);

    const day = await svc.readDay();
    const row = day.rounds.find((r) => r.round.id === roundId);
    expect(row, "an unfinished round is always listed").toBeDefined();
    expect(row!.round.opensAt).toBe(new Date(DEADLINE.getTime() - 45 * 60_000).toISOString());
  });
});
});
