import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../lib/load-migrations";
import { courierReachesPostcode, coverageForPostcode } from "./coverage";
import { quote } from "./quote";
import { serviceableForPostcode, zoneForPostcode } from "./zone";

/**
 * 076 — the coverage migration against REAL data, and the one function that decides.
 *
 * ⚠ THE FIRST HALF OF THIS FILE IS A RELEASE-SAFETY NET, AND IT WAS WRITTEN BEFORE THE CODE.
 * The migration rewrites what "Effy delivers here" means for every reader on the platform, on a
 * table the live checkout prices from. Two things must be true the moment it lands:
 *
 *   P1  nobody gains or loses delivery (FR-029, SC-002);
 *   P7  nobody's fee tier or same-day flag moves (FR-032).
 *
 * A migration tested only on an empty database has had its DDL checked and its backfill not run at
 * all. So this builds the schema as it was BEFORE 076, puts zones and postcodes in it, records the
 * old answers with the OLD join, applies 076, and compares.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const M076 = "20261008114600";

const RING_INNER = "00000000-0000-0000-0000-0000000000f1"; // ≤ 10 km
const RING_MID = "00000000-0000-0000-0000-0000000000f2"; //   ≤ 25 km
const RING_FAR = "00000000-0000-0000-0000-0000000000f3"; //   open-ended
const Z_INNER = "00000000-0000-0000-0000-0000000000e1"; // inner, same-day
const Z_OVERRIDE = "00000000-0000-0000-0000-0000000000e2"; // 3 km away but priced FAR by hand; not same-day
const Z_OFF = "00000000-0000-0000-0000-0000000000e3"; // disabled
const Z_NOCOORD = "00000000-0000-0000-0000-0000000000e4"; // its postcode has no located place
const PLAN = "00000000-0000-0000-0000-0000000000d1";

/** Hub: Melbourne CBD. */
const HUB = { lat: -37.8136, lon: 144.9631 };

/** The OLD serviceability predicate, verbatim from 047 — what "served" meant before 076. */
const OLD_SERVED = `
  SELECT zp.postcode, z.ring_id::text AS ring_id, z.sameday_eligible
    FROM public.delivery_zone_postcode zp
    JOIN public.delivery_zone z ON z.id = zp.zone_id
   WHERE z.status = 'active'
   ORDER BY zp.postcode`;

async function seedBefore076(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM public.delivery_fee_plan`);
  await pool.query(`DELETE FROM public.delivery_zone`);
  await pool.query(`DELETE FROM public.delivery_ring`);
  await pool.query(`
    INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by)
      VALUES (1, ${HUB.lat}, ${HUB.lon}, 'test')
      ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude;
    INSERT INTO public.delivery_ring (id, code, name, ordinal, suggest_upper_km, updated_by) VALUES
      ('${RING_INNER}', 'T-INNER', 'Inner', 1, 10, 'test'),
      ('${RING_MID}',   'T-MID',   'Mid',   2, 25, 'test'),
      ('${RING_FAR}',   'T-FAR',   'Far',   3, NULL, 'test');
    INSERT INTO public.delivery_zone (id, code, name, ring_id, sameday_eligible, hub_distance_km, status, updated_by) VALUES
      ('${Z_INNER}',    'T-IN',  'Inner East',  '${RING_INNER}', true,  NULL,  'active',   'test'),
      ('${Z_OVERRIDE}', 'T-OV',  'Priced far',  '${RING_FAR}',   false, NULL,  'active',   'test'),
      ('${Z_OFF}',      'T-OFF', 'Switched off','${RING_INNER}', true,  NULL,  'disabled', 'test'),
      ('${Z_NOCOORD}',  'T-NC',  'No location', '${RING_MID}',   false, 18.50, 'active',   'test');
    INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES
      ('RICHMOND',   'VIC', '3121', -37.8230, 144.9980, 9000),
      ('BURNLEY',    'VIC', '3121', -37.8280, 145.0080, 400),
      ('SOUTH YARRA','VIC', '3141', -37.8400, 144.9930, 8000),
      ('BENDIGO',    'VIC', '3550', -36.7570, 144.2790, 5000),
      ('GEELONG',    'VIC', '3220', -38.1490, 144.3610, 7000),
      ('BOX ONLY',   'VIC', '3900', NULL, NULL, 0),
      ('HOBART',     'TAS', '7000', -42.8820, 147.3270, 6000)
      ON CONFLICT (name, state, postcode) DO UPDATE
        SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, address_count = EXCLUDED.address_count;
    INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES
      ('${Z_INNER}', '3121'), ('${Z_OVERRIDE}', '3141'), ('${Z_OFF}', '3550'), ('${Z_NOCOORD}', '3900');
    INSERT INTO public.delivery_fee_plan (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by)
      VALUES ('${PLAN}', 'Test plan', true, 0.50, 4.00, 60.00, 1.800, 1.000, 'test');
    INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES
      ('${PLAN}', '${RING_INNER}', 6.00), ('${PLAN}', '${RING_MID}', 9.00), ('${PLAN}', '${RING_FAR}', 15.00);
    INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN}', 2000, 0.00), ('${PLAN}', 10000, 2.00);
  `);
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let before: { postcode: string; ring_id: string; sameday_eligible: boolean }[];
let allPostcodes: string[];
let shopId: string;

d("076 — the coverage migration changes nothing for anyone", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });

    await pool.query(migrationSql({ before: M076 }));
    await seedBefore076(pool);
    before = (await pool.query(OLD_SERVED)).rows;
    allPostcodes = (await pool.query<{ postcode: string }>(`SELECT DISTINCT postcode FROM public.locality ORDER BY 1`)).rows.map((r) => r.postcode);

    // ⚠ Everything from 076 ON — which since 077 includes the fee engine's migration, and that asks
    // for the same-day amount whenever a plan is active (as one is here).
    await pool.query(migrationSql({ from: M076, env: { EFFY_TODAY_PREMIUM: "3.00" } }));

    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('COV', 'Coverage shop') RETURNING id::text AS id`)).rows[0]!.id;
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("the test is looking at something: postcodes were served before", () => {
    expect(before.map((r) => r.postcode)).toEqual(["3121", "3141", "3900"]);
    expect(allPostcodes.length).toBeGreaterThanOrEqual(6);
  });

  it("P1 — the same postcodes are served after as before, for every postcode in the country's data", async () => {
    const servedBefore = new Set(before.map((r) => r.postcode));
    for (const postcode of allPostcodes) {
      expect(await serviceableForPostcode(pool, postcode), `${postcode} served before=${servedBefore.has(postcode)}`).toBe(servedBefore.has(postcode));
    }
  });

  it("P1 — a disabled zone's postcodes left the list, and the migration recorded which", async () => {
    expect((await pool.query(`SELECT 1 FROM public.delivery_zone_postcode WHERE postcode = '3550'`)).rowCount).toBe(0);
    const audit = await pool.query<{ detail: { postcodes: string[] } }>(
      `SELECT detail FROM admin.audit_log WHERE actor_sub = 'migration:076' AND action = 'coverage.postcode.remove'`,
    );
    expect(audit.rows.map((r) => r.detail.postcodes)).toEqual([["3550"]]);
  });

  it("P7 — every postcode served before keeps its same-day flag", async () => {
    for (const row of before) {
      const zone = await zoneForPostcode(pool, row.postcode);
      expect(zone?.sameDayEligible, `${row.postcode}: same-day flag moved`).toBe(row.sameday_eligible);
    }
  });

  // ⚠ 077 ENDED THE FEE-TIER HALF OF P7, deliberately. Until the fee engine, a pre-076 postcode kept
  // its zone's tier and this asserted that nobody's fee moved. Delivery is now priced from each
  // postcode's OWN distance, so a postcode whose zone was put on a tier by hand is priced where it
  // actually is. `fee.container.test.ts` P16 holds what replaced this: the fee is unchanged wherever
  // the old tier matched the distance, and the operator is shown every postcode where it did not.
  it("since 077 — a listed postcode is priced from its own distance", async () => {
    const fee = async (postcode: string) => {
      const res = await quote(pool, null, postcode, [{ shopId, grams: 1500 }], new Date(), 5000);
      if (!res.serviced || res.coverage !== "effy") throw new Error(`${postcode} not serviced`);
      return res.standardFee.totalCents;
    };
    expect(await fee("3121")).toBe(600); // 3.3 km — inner, as before
    expect(await fee("3900")).toBe(900); // 18.5 km by hand — mid, as before
    expect(await fee("3141")).toBe(600); // 3 km away; was priced FAR ($15) by a hand-picked tier
  });

  it("P2 — every listed postcode has a distance: worked out where the place is located, the zone's own where it is not", async () => {
    const rows = (
      await pool.query<{ postcode: string; km: string; distance_source: string; distance_review: boolean; added_by: string }>(
        `SELECT postcode, distance_km::text AS km, distance_source, distance_review, added_by FROM public.delivery_zone_postcode ORDER BY postcode`,
      )
    ).rows;
    expect(rows.map((r) => r.postcode)).toEqual(["3121", "3141", "3900"]);
    const by = Object.fromEntries(rows.map((r) => [r.postcode, r]));
    // Richmond, not Burnley: the place with the most addresses stands for the postcode.
    expect(Number(by["3121"]!.km)).toBeGreaterThan(3);
    expect(Number(by["3121"]!.km)).toBeLessThan(3.5);
    expect(by["3121"]).toMatchObject({ distance_source: "computed", distance_review: false, added_by: "migration:076" });
    expect(by["3900"]).toMatchObject({ km: "18.50", distance_source: "manual", distance_review: true });
  });

  it("P3 / 079 P1–P2 — every answer, each with its reason: a courier is promised only where one can be sold", async () => {
    const COURIER_PLAN = "00000000-0000-0000-0000-0000000000c9";
    const settings = (sql: string) => pool.query(`UPDATE public.delivery_settings SET ${sql} WHERE id = 1`);
    const at = (postcode: string, now = new Date()) => coverageForPostcode(pool, postcode, now);

    expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed", groupId: Z_INNER, groupName: "Inner East" });
    expect((await at("3121")).distanceKm).toBeGreaterThan(3);
    expect(await at("9999")).toEqual({ kind: "none", reason: "unknown_postcode", distanceKm: null, groupId: null, groupName: null });
    expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_off" });
    // ⚠ The one-argument call every pre-079 reader makes (the address book's SQL) still resolves.
    expect((await pool.query(`SELECT kind FROM public.coverage_for_postcode('3121')`)).rows[0]).toEqual({ kind: "effy" });

    await settings(`courier_offered = true`);
    try {
      // On — with no price and no estimate. Nothing could sell it, so nobody is promised it.
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_not_ready" });
      // A courier cannot be booked to a place the data does not know, even with courier on.
      expect(await at("9999")).toMatchObject({ kind: "none", reason: "unknown_postcode" });

      await settings(`courier_estimate_text = '2–4 business days'`);
      expect(await at("7000"), "an estimate and no fee table").toMatchObject({ kind: "none", reason: "courier_not_ready" });
      await pool.query(`
        INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
          VALUES ('${COURIER_PLAN}', 'courier', 'Courier table', true, 9.00, 0.50, 0.00, 90.00, 'test');
        INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${COURIER_PLAN}', 100000, 0.00);`);
      await settings(`courier_estimate_text = NULL`);
      expect(await at("7000"), "a fee table and no estimate").toMatchObject({ kind: "none", reason: "courier_not_ready" });
      await settings(`courier_estimate_text = '2–4 business days'`);

      // ⚠ ON AND READY, AND STILL NOBODY IS PROMISED IT: the new delivery model is off, and the
      // checkout customers are using has no courier order to sell (079 FR-035).
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_pending" });
      expect(await serviceableForPostcode(pool, "7000")).toBe(false);

      // The switch set for a moment in the FUTURE: pending until that moment, a courier from it.
      const from = new Date("2027-01-10T00:00:00Z");
      await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = $1 WHERE id = 1`, [from]);
      expect(await at("7000", new Date(from.getTime() - 1))).toMatchObject({ kind: "none", reason: "courier_pending" });
      expect(await at("7000", from)).toMatchObject({ kind: "courier", reason: "courier_offered", distanceKm: null, groupId: null });

      await settings(`delivery_model_v2_from = now() - interval '1 minute'`);
      expect(await at("7000")).toMatchObject({ kind: "courier", reason: "courier_offered" });
      expect(await serviceableForPostcode(pool, "7000")).toBe(true);
      expect(await at("9999")).toMatchObject({ kind: "none", reason: "unknown_postcode" });
      // …and the same question asked of the function the checkout's no-window fallback uses.
      expect(await courierReachesPostcode(pool, "7000", new Date())).toBe(true);
      // Effy's own postcode: Effy delivers, AND a courier could be booked there — two different questions.
      expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed" });
      expect(await courierReachesPostcode(pool, "3121", new Date())).toBe(true);

      await pool.query(`INSERT INTO public.courier_excluded_postcode (postcode, reason, added_by) VALUES ('7000', 'No chilled courier service', 'test'), ('3121', 'irrelevant', 'test')`);
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_excluded" });
      // On Effy's list AND excluded from couriers: still Effy. The exclusion is about couriers only —
      expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed" });
      // — which is exactly why it gets no courier fallback when its windows run out.
      expect(await courierReachesPostcode(pool, "3121", new Date())).toBe(false);

      // Switched off again: every courier answer goes, whatever else is set.
      await settings(`courier_offered = false`);
      await pool.query(`DELETE FROM public.courier_excluded_postcode`);
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_off" });
    } finally {
      await pool.query(`DELETE FROM public.courier_excluded_postcode`);
      await pool.query(`DELETE FROM public.delivery_fee_plan WHERE id = '${COURIER_PLAN}'`);
      await settings(`courier_offered = false, courier_estimate_text = NULL, delivery_model_v2_from = NULL`);
    }
  });

  it("P8 — a postcode listed AFTER 076, with no group, is same-day eligible and quotes a fee from its distance", async () => {
    await pool.query(
      `INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
       VALUES (NULL, '3220', public.coverage_computed_distance_km('3220'), 'computed', 'test')`,
    );
    const zone = await zoneForPostcode(pool, "3220");
    expect(zone).toEqual({ id: null, sameDayEligible: true });
    const res = await quote(pool, null, "3220", [{ shopId, grams: 1500 }], new Date(), 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    expect(res.coverage).toBe("effy");
    expect(res.zoneId).toBeNull();
    expect(res.standardFee.totalCents).toBe(1500); // Geelong, ~65 km → the open-ended band
  });

  it("P8 — and so is one in a group created after 076", async () => {
    const group = (
      await pool.query<{ id: string }>(`INSERT INTO public.delivery_zone (code, name, updated_by) VALUES ('T-NEW', 'New group', 'test') RETURNING id::text AS id`)
    ).rows[0]!.id;
    await pool.query(`UPDATE public.delivery_zone_postcode SET zone_id = $1 WHERE postcode = '3220'`, [group]);
    expect(await zoneForPostcode(pool, "3220")).toEqual({ id: group, sameDayEligible: true });
    expect(await coverageForPostcode(pool, "3220")).toMatchObject({ kind: "effy", groupId: group, groupName: "New group" });
  });

  it("P5 — deleting a group's row does not delete its postcodes", async () => {
    const group = (await pool.query<{ id: string }>(`SELECT id::text AS id FROM public.delivery_zone WHERE code = 'T-NEW'`)).rows[0]!.id;
    await pool.query(`DELETE FROM public.delivery_zone WHERE id = $1`, [group]);
    expect(await coverageForPostcode(pool, "3220")).toMatchObject({ kind: "effy", reason: "listed", groupId: null });
  });

  it("P15 — nothing about a shop changes any answer", async () => {
    const answers = async () => Promise.all(allPostcodes.map(async (p) => `${p}:${(await coverageForPostcode(pool, p)).kind}`));
    const was = await answers();
    await pool.query(`INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode, updated_by) VALUES ($1, '${Z_INNER}', 'off', 'test')`, [shopId]);
    await pool.query(`UPDATE public.shop SET status = 'suspended' WHERE id = $1`, [shopId]).catch(() => undefined);
    expect(await answers()).toEqual(was);
  });

  it("P16 — the up-front answer, the coverage answer and the quote agree for every postcode", async () => {
    for (const postcode of [...allPostcodes, "9999"]) {
      const coverage = await coverageForPostcode(pool, postcode);
      const upFront = await serviceableForPostcode(pool, postcode);
      const res = await quote(pool, null, postcode, [{ shopId, grams: 1500 }], new Date(), 5000);
      expect(upFront, `${postcode}: up-front vs coverage`).toBe(coverage.kind !== "none");
      expect(res.serviced, `${postcode}: quote vs coverage`).toBe(coverage.kind !== "none");
      expect(res.coverage, `${postcode}: the quote's own coverage`).toBe(coverage.kind);
    }
  });

  it("a listed postcode cannot be stored without a distance, or with one out of range", async () => {
    await expect(pool.query(`INSERT INTO public.delivery_zone_postcode (postcode, added_by) VALUES ('7000', 'test')`)).rejects.toThrow(/distance_km|null value/);
    await expect(
      pool.query(`INSERT INTO public.delivery_zone_postcode (postcode, distance_km, distance_source, added_by) VALUES ('7000', 9000, 'manual', 'test')`),
    ).rejects.toThrow(/delivery_zone_postcode_distance_ck/);
  });
});

d("076 — the migration stops rather than guess a distance", () => {
  let c2: StartedPostgreSqlContainer;
  let p2: Pool;

  beforeAll(async () => {
    c2 = await new PostgreSqlContainer("postgres:16-alpine").start();
    p2 = new Pool({ connectionString: c2.getConnectionUri() });
    await p2.query(migrationSql({ before: M076 }));
    await seedBefore076(p2);
    // The zone whose only postcode has no located place loses the distance someone recorded for it.
    await p2.query(`UPDATE public.delivery_zone SET hub_distance_km = NULL WHERE id = '${Z_NOCOORD}'`);
  }, 240_000);

  afterAll(async () => {
    await p2?.end();
    await c2?.stop();
  });

  it("P2 — names the postcode it cannot place, and changes nothing", async () => {
    await expect(p2.query(`BEGIN; ${migrationSql({ from: M076 })}; COMMIT;`)).rejects.toThrow(/1 listed postcode\(s\) have no distance.*3900/s);
    await p2.query(`ROLLBACK`);
    // Still the old shape: the migration is one transaction under Goose, and nothing was half-applied.
    const cols = await p2.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_zone_postcode' AND column_name = 'distance_km'`);
    expect(cols.rowCount).toBe(0);
  });
});
