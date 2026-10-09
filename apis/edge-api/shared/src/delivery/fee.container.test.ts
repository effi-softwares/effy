import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { instantAtLocalTime } from "../lib/collection-deadline";
import { migrationSql } from "../lib/load-migrations";
import { loadActivePlan, loadPlan } from "./plan";
import { quote } from "./quote";
import { windowKey } from "./windows";

/**
 * 077 — the fee engine's migration against REAL data.
 *
 * ⚠ THE FIRST HALF IS A RELEASE-SAFETY NET, WRITTEN BEFORE THE CODE IT GUARDS. The migration turns
 * the prices the live checkout charges into a different shape, on the tables it charges from. A
 * migration tested only on an empty database has had its DDL checked and its carry-over not run at
 * all. So this builds the schema as it was BEFORE 077, puts tiers, plans and postcodes in it, records
 * what every postcode paid with the OLD arithmetic, applies the migration, and compares.
 *
 *   P15  every plan's distance bands equal its tier prices; the active plan is complete; the
 *        migration refuses to run without the same-day amount, or with a standard multiplier ≠ 1
 *   P16  wherever a postcode's tier matched its own distance, its fee is unchanged — and the
 *        pre-flight lists exactly the postcodes where it did not
 *   P17  a delivery today costs the later-day fee plus the amount the operator gave
 *   P10  a postcode added afterwards, at any distance, is priced with no plan change
 *   P3   one supplier or five, the same goods cost the same to deliver
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const M077 = "20261008135721";

const RING_INNER = "00000000-0000-0000-0000-0000000000f1"; // ≤ 10 km   $6
const RING_MID = "00000000-0000-0000-0000-0000000000f2"; //   ≤ 25 km   $9
const RING_FAR = "00000000-0000-0000-0000-0000000000f3"; //   open      $15
const RING_OFF = "00000000-0000-0000-0000-0000000000f4"; //   disabled  ≤ 40 km
const Z_INNER = "00000000-0000-0000-0000-0000000000e1";
const Z_BY_HAND = "00000000-0000-0000-0000-0000000000e2"; // 3 km away, put on the FAR tier by hand
const Z_MID = "00000000-0000-0000-0000-0000000000e3";
const PLAN = "00000000-0000-0000-0000-0000000000d1";
const DRAFT = "00000000-0000-0000-0000-0000000000d2";

const STEP = 50;
const FLOOR = 400;
const CAP = 6000;
const TODAY_PREMIUM = "3.00";

/** The 047 arithmetic, restated: factor 1 × (tier price + weight add), rounded up, held in limits. */
function oldStandardFee(tierPriceCents: number, grams: number): number {
  const weight = grams <= 2000 ? 0 : 200; // the plan below: ≤2 kg +0, heavier +2.00
  const snapped = Math.ceil((tierPriceCents + weight) / STEP) * STEP;
  return Math.min(Math.max(snapped, FLOOR), CAP);
}

/** What each listed postcode is priced on TODAY (the 076 bridge), and what its own distance says. */
const BEFORE = `
  SELECT zp.postcode,
         (rp.price_amount * 100)::int AS tier_price_cents,
         COALESCE(z.ring_id, public.coverage_ring_for_km(zp.distance_km)) = public.coverage_ring_for_km(zp.distance_km) AS tier_matches_distance
    FROM public.delivery_zone_postcode zp
    LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
    JOIN public.delivery_ring_price rp
      ON rp.plan_id = '${PLAN}' AND rp.ring_id = COALESCE(z.ring_id, public.coverage_ring_for_km(zp.distance_km))
   ORDER BY zp.postcode`;

async function seedBefore077(pool: Pool, standardFactor = "1.000"): Promise<void> {
  await pool.query(`DELETE FROM public.delivery_fee_plan`);
  await pool.query(`DELETE FROM public.delivery_zone_postcode`);
  await pool.query(`DELETE FROM public.delivery_zone`);
  await pool.query(`DELETE FROM public.delivery_ring`);
  await pool.query(`
    INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by)
      VALUES (1, -37.8136, 144.9631, 'test')
      ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude;
    INSERT INTO public.delivery_ring (id, code, name, ordinal, suggest_upper_km, status, updated_by) VALUES
      ('${RING_INNER}', 'T-INNER', 'Inner', 1, 10,   'active',   'test'),
      ('${RING_MID}',   'T-MID',   'Mid',   2, 25,   'active',   'test'),
      ('${RING_OFF}',   'T-OFF',   'Retired tier', 3, 40, 'disabled', 'test'),
      ('${RING_FAR}',   'T-FAR',   'Far',   4, NULL, 'active',   'test');
    INSERT INTO public.delivery_zone (id, code, name, ring_id, sameday_eligible, status, updated_by) VALUES
      ('${Z_INNER}',   'T-IN', 'Inner East',     '${RING_INNER}', true, 'active', 'test'),
      ('${Z_BY_HAND}', 'T-BH', 'Priced by hand', '${RING_FAR}',   true, 'active', 'test'),
      ('${Z_MID}',     'T-MD', 'Middle',         '${RING_MID}',   true, 'active', 'test');
    INSERT INTO public.locality (name, state, postcode) VALUES
      ('RICHMOND', 'VIC', '3121'), ('SOUTH YARRA', 'VIC', '3141'), ('DANDENONG', 'VIC', '3175'),
      ('GEELONG', 'VIC', '3220'), ('MILDURA', 'VIC', '3500')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES
      ('${Z_INNER}',   '3121',  3.30, 'computed', 'test'),
      ('${Z_BY_HAND}', '3141',  3.00, 'computed', 'test'),
      ('${Z_MID}',     '3175', 25.00, 'computed', 'test'),
      (NULL,           '3220', 65.00, 'computed', 'test');
    INSERT INTO public.delivery_fee_plan (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by)
      VALUES ('${PLAN}',  'Live plan', true,  0.50, 4.00, 60.00, 1.800, ${standardFactor}, 'test'),
             ('${DRAFT}', 'Half-built', false, 0.50, 4.00, 60.00, 1.500, 1.000, 'test');
    INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES
      ('${PLAN}',  '${RING_INNER}', 6.00), ('${PLAN}',  '${RING_MID}', 9.00), ('${PLAN}', '${RING_FAR}', 15.00),
      ('${PLAN}',  '${RING_OFF}',  11.00),
      ('${DRAFT}', '${RING_INNER}', 7.00), ('${DRAFT}', '${RING_FAR}', 20.00);
    INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
      ('${PLAN}', 2000, 0.00), ('${PLAN}', 10000, 2.00), ('${DRAFT}', 5000, 0.00);
  `);
}

function preflightSql(): string {
  let cur = __dirname;
  for (let i = 0; i < 12; i += 1) {
    const candidate = resolve(cur, "specs", "077-delivery-fee-engine-v2", "preflight.sql");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    cur = dirname(cur);
  }
  throw new Error("could not find specs/077-delivery-fee-engine-v2/preflight.sql");
}

/** Run a migration that is expected to fail, in a transaction that is then thrown away. */
async function expectRefused(pool: Pool, sql: string, message: RegExp): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await expect(client.query(sql)).rejects.toThrow(message);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let before: { postcode: string; tier_price_cents: number; tier_matches_distance: boolean }[];
let preflight: { postcode: string; tier_today: string; tier_after: string; fee_1kg_today: string; fee_1kg_after: string }[];
let preflightVerdict: { standard_factor: string; verdict: string }[];
let shop: string;

d("077 — the fee engine migration carries today's prices across", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    await pool.query(migrationSql({ before: M077 }));
    await seedBefore077(pool);
    before = (await pool.query(BEFORE)).rows;

    // The pre-flight is two statements; the driver returns one result per statement.
    const results = (await pool.query(preflightSql())) as unknown as { rows: never[] }[];
    preflightVerdict = results[0]!.rows;
    preflight = results[1]!.rows;

    // P15 — refused, and nothing changed, before it is ever applied properly.
    await expectRefused(pool, migrationSql({ from: M077, before: "20261008135722" }), /EFFY_TODAY_PREMIUM is not set/);
    await expectRefused(pool, migrationSql({ from: M077, before: "20261008135722", env: { EFFY_TODAY_PREMIUM: "" } }), /EFFY_TODAY_PREMIUM is not set/);
    await expectRefused(pool, migrationSql({ from: M077, before: "20261008135722", env: { EFFY_TODAY_PREMIUM: "three" } }), /must be an amount like 3\.00/);
    await expectRefused(pool, migrationSql({ from: M077, before: "20261008135722", env: { EFFY_TODAY_PREMIUM: "0.30" } }), /multiple of the active plan's rounding step/);

    await pool.query(migrationSql({ from: M077, env: { EFFY_TODAY_PREMIUM: TODAY_PREMIUM } }));

    shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('FEE', 'Fee shop') RETURNING id::text AS id`)).rows[0]!.id;
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const laterDayFee = async (postcode: string, grams: number, basketCents = 5000, shops: string[] = [shop]) => {
    const pkgs = shops.map((shopId) => ({ shopId, grams: grams / shops.length }));
    const res = await quote(pool, null, postcode, pkgs, new Date(), basketCents);
    if (!res.serviced || res.coverage !== "effy") throw new Error(`${postcode} not serviced`);
    return res.baseFee;
  };

  it("the test is looking at something", () => {
    expect(before.map((r) => r.postcode)).toEqual(["3121", "3141", "3175", "3220"]);
    expect(before.filter((r) => !r.tier_matches_distance).map((r) => r.postcode)).toEqual(["3141"]);
  });

  it("T035 — after both migrations the tiers are gone and every listed postcode still prices", async () => {
    for (const t of ["delivery_ring", "delivery_ring_price"]) {
      expect((await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [t])).rowCount, t).toBe(0);
    }
    const cols = await pool.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'delivery_zone'`);
    expect(cols.rows.map((r) => r.c)).not.toEqual(expect.arrayContaining(["ring_id"]));
    for (const postcode of ["3121", "3141", "3175", "3220"]) expect((await laterDayFee(postcode, 500)).totalCents).toBeGreaterThan(0);
  });

  it("P15 — a refused run left the schema as it was, and the real run then applied", async () => {
    // `kind` exists only because the last, accepted, run added it: each refusal rolled everything back.
    const plan = await loadActivePlan(pool);
    expect(plan).toMatchObject({ id: PLAN, kind: "effy", baseCents: 0, todayPremiumCents: 300 });
  });

  it("P15 — every plan's distance bands are its tier prices, on the same boundaries", async () => {
    expect((await loadActivePlan(pool)).distanceBands).toEqual([
      { upperKm: 10, addCents: 600 },
      { upperKm: 25, addCents: 900 },
      { upperKm: null, addCents: 1500 },
    ]);
    // A draft is carried too — and stays exactly as incomplete as it was.
    expect((await loadPlan(pool, DRAFT))?.distanceBands).toEqual([
      { upperKm: 10, addCents: 700 },
      { upperKm: null, addCents: 2000 },
    ]);
    expect((await loadPlan(pool, DRAFT))?.todayPremiumCents).toBe(0);
  });

  it("P15 — a price on a DISABLED tier is not carried: no postcode was priced on it", async () => {
    const bands = await pool.query(`SELECT 1 FROM public.delivery_distance_band WHERE plan_id = '${PLAN}' AND upper_km = 40`);
    expect(bands.rowCount).toBe(0);
  });

  it("P15 — weight bands, rounding and limits are untouched, and no basket rule appeared", async () => {
    expect(await loadActivePlan(pool)).toMatchObject({
      weightBands: [{ upperGrams: 2000, addCents: 0 }, { upperGrams: 10000, addCents: 200 }],
      stepCents: STEP, floorCents: FLOOR, capCents: CAP,
      freeOverCents: null, smallOrderUnderCents: null, smallOrderFeeCents: 0,
    });
  });

  it("P15 — the active plan is complete, and the migration recorded what it did", async () => {
    expect((await pool.query<{ ok: boolean }>(`SELECT public.delivery_plan_is_complete('${PLAN}') AS ok`)).rows[0]!.ok).toBe(true);
    const audit = await pool.query<{ detail: { todayPremium: number; replacedSameDayFactor: number; distanceBands: unknown[] } }>(
      `SELECT detail FROM admin.audit_log WHERE actor_sub = 'migration:077' AND action = 'pricing.migrate_077'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(Number(audit.rows[0]!.detail.todayPremium)).toBe(3);
    expect(Number(audit.rows[0]!.detail.replacedSameDayFactor)).toBe(1.8);
    expect(audit.rows[0]!.detail.distanceBands).toHaveLength(3);
  });

  it("P16 — wherever the tier matched the distance, the fee is the same as before", async () => {
    for (const row of before.filter((r) => r.tier_matches_distance)) {
      for (const grams of [500, 2000, 2001, 9000, 40000]) {
        expect((await laterDayFee(row.postcode, grams)).totalCents, `${row.postcode} at ${grams} g`).toBe(oldStandardFee(row.tier_price_cents, grams));
      }
    }
  });

  it("P16 — a postcode exactly on a tier boundary stays in the lower one", async () => {
    expect((await laterDayFee("3175", 500)).breakdown).toMatchObject({ km: 25, distanceBandUpperKm: 25, distanceCents: 900 });
  });

  it("P16 — the one postcode whose tier was picked by hand moves, to where it actually is", async () => {
    const was = before.find((r) => r.postcode === "3141")!;
    expect(oldStandardFee(was.tier_price_cents, 500)).toBe(1500);
    expect((await laterDayFee("3141", 500)).totalCents).toBe(600);
  });

  it("P16 — and the pre-flight showed the operator exactly that postcode, with both fees, before anything changed", () => {
    expect(preflightVerdict).toHaveLength(1);
    expect(Number(preflightVerdict[0]!.standard_factor)).toBe(1);
    expect(preflightVerdict[0]!.verdict).toMatch(/^ok/);
    expect(preflight).toEqual([
      expect.objectContaining({ postcode: "3141", tier_today: "Far", tier_after: "Inner", fee_1kg_today: "15.00", fee_1kg_after: "6.00" }),
    ]);
    // …which is precisely the complement of the set P16 proved unchanged.
    expect(preflight.map((r) => r.postcode)).toEqual(before.filter((r) => !r.tier_matches_distance).map((r) => r.postcode));
  });

  it("P10 — a postcode added afterwards, far beyond every band, is priced without touching the plan", async () => {
    await pool.query(
      `INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES (NULL, '3500', 900, 'manual', 'test')`,
    );
    expect((await laterDayFee("3500", 500)).totalCents).toBe(1500);
    expect((await laterDayFee("3500", 500)).breakdown.distanceBandUpperKm).toBeNull();
  });

  it("P3 — one supplier or five, the same goods cost the same to deliver", async () => {
    const five = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name) VALUES ('FE1','a'),('FE2','b'),('FE3','c'),('FE4','d') RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id);
    const one = await laterDayFee("3121", 6000);
    const split = await laterDayFee("3121", 6000, 5000, [shop, ...five]);
    expect(one.totalCents).toBe(800); // 6.00 + 2.00
    expect(split.totalCents).toBe(one.totalCents);
    expect(split.breakdown.grams).toBe(6000);
  });

  it("P17 — a delivery today costs the later-day fee plus the amount the operator gave", async () => {
    await pool.query(`TRUNCATE public.delivery_slot, public.delivery_collection_run CASCADE`);
    await pool.query(`UPDATE public.delivery_settings SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0 WHERE id = 1`);
    await pool.query(`INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('12:00', 'active', 'test')`);
    await pool.query(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES ('17:00', '19:00', '15:00', 5, 'active', 'test')`,
    );
    const now = instantAtLocalTime(2026, 8, 24, 10, 0);
    const res = await quote(pool, null, "3121", [{ shopId: shop, grams: 500 }], now, 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    const windows = res.effyWindows.days[0]!.windows;
    expect(windows).toHaveLength(1);
    const today = res.effyWindows.fees.get(windowKey(windows[0]!.id, "2026-08-24"))!;
    expect(res.baseFee.totalCents).toBe(600);
    expect(today.totalCents).toBe(900);
    expect(today.lines).toEqual([{ kind: "delivery", cents: 600 }, { kind: "window_surcharge", cents: 300 }]);
  });
});

d("077 — window surcharges belong to the plan (T071)", () => {
  let c3: StartedPostgreSqlContainer;
  let p3: Pool;
  let shopA: string;
  let shopB: string;
  let slot: string;
  const PLAN3 = "00000000-0000-0000-0000-0000000000d3";

  beforeAll(async () => {
    c3 = await new PostgreSqlContainer("postgres:16-alpine").start();
    p3 = new Pool({ connectionString: c3.getConnectionUri() });
    await p3.query(migrationSql());
    await p3.query(`DELETE FROM public.delivery_fee_plan`);
    await p3.query(`TRUNCATE public.delivery_slot, public.delivery_collection_run CASCADE`);
    [shopA, shopB] = (await p3.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('W1','a'),('W2','b') RETURNING id::text AS id`)).rows.map((r) => r.id) as [string, string];
    await p3.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, sameday_hub_turnaround_min, updated_by)
        VALUES (1, -37.81, 144.96, 0, 0, 'test') ON CONFLICT (id) DO UPDATE SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0;
      INSERT INTO public.locality (name, state, postcode) VALUES ('RICHMOND', 'VIC', '3121') ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES (NULL, '3121', 3.4, 'manual', 'test');
      INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('12:00', 'active', 'test');
      INSERT INTO public.delivery_fee_plan (id, name, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN3}', 'Windows', 3.00, 0.50, 4.00, 60.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN3}', NULL, 6.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN3}', 100000, 0.00);`);
    slot = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES ('17:00','19:00','15:00',5,'active','test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ('${PLAN3}', $1, 2.00)`, [slot]);
    await p3.query(`SELECT public.delivery_plan_activate('${PLAN3}', 'test', false)`);
  }, 240_000);

  afterAll(async () => {
    await p3?.end();
    await c3?.stop();
  });

  const at10 = instantAtLocalTime(2026, 8, 24, 10, 0);
  const windowFee = async () => {
    const res = await quote(p3, null, "3121", [{ shopId: shopA, grams: 500 }, { shopId: shopB, grams: 500 }], at10, 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    return res.effyWindows.fees.get(windowKey(slot, "2026-08-24"))?.totalCents ?? null;
  };

  it("today's premium and the window's own apply ONCE for an order of two packages going today", async () => {
    expect(await windowFee()).toBe(1100); // 6.00 + 3.00 today + 2.00 for the window
  });

  it("a switched-off window leaves the plan readable and its premium unused", async () => {
    await p3.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [slot]);
    try {
      expect((await loadActivePlan(p3)).slotPremiumCents.has(slot)).toBe(false);
      expect(await windowFee()).toBeNull(); // the window is not offered at all
    } finally {
      await p3.query(`UPDATE public.delivery_slot SET status = 'active' WHERE id = $1`, [slot]);
    }
  });

  it("activating a plan with different premiums changes no window", async () => {
    const windows = async () => (await p3.query(`SELECT row_to_json(s)::text AS j FROM public.delivery_slot s ORDER BY id`)).rows;
    const before = await windows();
    const next = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_fee_plan (name, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
       VALUES ('Dearer evenings', 0.00, 0.50, 4.00, 60.00, 'test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ($1, NULL, 6.00)`, [next]);
    await p3.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, 100000, 0.00)`, [next]);
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, 4.00)`, [next, slot]);
    await p3.query(`SELECT public.delivery_plan_activate($1, 'test', false)`, [next]);
    expect(await windows()).toEqual(before);
    expect(await windowFee()).toBe(1000); // 6.00 + 4.00, no today premium in this plan
  });

  it("deleting a window that never carried an order takes its premium with it, even from an activated plan", async () => {
    const spare = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES ('19:00','21:00','17:00',5,'active','test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    // A draft gets a premium on it, is activated, and the window is then removed.
    const draft = (await p3.query<{ id: string }>(
      `INSERT INTO public.delivery_fee_plan (name, rounding_step, floor_amount, cap_amount, created_by) VALUES ('Spare', 0.50, 4.00, 60.00, 'test') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await p3.query(`INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ($1, NULL, 6.00)`, [draft]);
    await p3.query(`INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ($1, 1000, 0.00)`, [draft]);
    await p3.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, 1.00)`, [draft, spare]);
    await p3.query(`SELECT public.delivery_plan_activate($1, 'test', false)`, [draft]);
    await p3.query(`DELETE FROM public.delivery_slot WHERE id = $1`, [spare]);
    expect((await p3.query(`SELECT 1 FROM public.delivery_slot_premium WHERE slot_id = $1`, [spare])).rowCount).toBe(0);
  });
});

d("077 — the migration refuses a standard multiplier other than 1", () => {
  let c2: StartedPostgreSqlContainer;
  let p2: Pool;

  beforeAll(async () => {
    c2 = await new PostgreSqlContainer("postgres:16-alpine").start();
    p2 = new Pool({ connectionString: c2.getConnectionUri() });
    await p2.query(migrationSql({ before: M077 }));
    // same_day_factor must stay ≥ standard_factor (a 047 CHECK), so lift both.
    await seedBefore077(p2, "1.200");
  }, 240_000);

  afterAll(async () => {
    await p2?.end();
    await c2?.stop();
  });

  it("P15 — it stops, names the multiplier, and changes nothing", async () => {
    await expectRefused(p2, migrationSql({ from: M077, env: { EFFY_TODAY_PREMIUM: TODAY_PREMIUM } }), /standard multiplier of 1\.200, not 1/);
    const cols = await p2.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_fee_plan' AND column_name = 'kind'`);
    expect(cols.rowCount).toBe(0);
  });

  it("the pre-flight says so first", async () => {
    const results = (await p2.query(preflightSql())) as unknown as { rows: { verdict: string }[] }[];
    expect(results[0]!.rows[0]!.verdict).toMatch(/^STOP/);
  });

  it("T035 — the tier-dropping migration refuses to run before the fee engine's first", async () => {
    await expectRefused(p2, migrationSql({ from: "20261008145221" }), /first migration has not been applied/);
    expect((await p2.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_ring'`)).rowCount).toBe(1);
  });

  it("a database with no active plan asks for nothing", async () => {
    await p2.query(`UPDATE public.delivery_fee_plan SET is_active = false`);
    await p2.query(migrationSql({ from: M077 }));
    expect((await p2.query(`SELECT 1 FROM public.delivery_fee_plan WHERE today_premium_amount <> 0`)).rowCount).toBe(0);
  });
});
