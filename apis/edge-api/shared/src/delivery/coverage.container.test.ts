import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import { courierReachesPostcode, coverageForPostcode } from "./coverage";
import { quote } from "./quote";

/** The one deciding function against real data: every answer with its reason, and the quote agreeing with it. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const Z_INNER = "00000000-0000-0000-0000-0000000000e1";
const PLAN = "00000000-0000-0000-0000-0000000000d1";

async function seed(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM public.delivery_fee_plan`);
  await pool.query(`
    INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by)
      VALUES (1, -37.8136, 144.9631, 'test')
      ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude;
    INSERT INTO public.delivery_zone (id, code, name, updated_by) VALUES ('${Z_INNER}', 'T-IN', 'Inner East', 'test');
    INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES
      ('RICHMOND',   'VIC', '3121', -37.8230, 144.9980, 9000),
      ('BURNLEY',    'VIC', '3121', -37.8280, 145.0080, 400),
      ('SOUTH YARRA','VIC', '3141', -37.8400, 144.9930, 8000),
      ('BENDIGO',    'VIC', '3550', -36.7570, 144.2790, 5000),
      ('GEELONG',    'VIC', '3220', -38.1490, 144.3610, 7000),
      ('BOX ONLY',   'VIC', '3900', NULL, NULL, 0),
      ('HOBART',     'TAS', '7000', -42.8820, 147.3270, 6000);
    INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES
      ('${Z_INNER}', '3121', public.coverage_computed_distance_km('3121'), 'computed', 'test'),
      (NULL, '3141', public.coverage_computed_distance_km('3141'), 'computed', 'test'),
      (NULL, '3900', 18.50, 'manual', 'test');
    INSERT INTO public.delivery_fee_plan (id, name, rounding_step, floor_amount, cap_amount, created_by)
      VALUES ('${PLAN}', 'Test plan', 0.50, 4.00, 60.00, 'test');
    INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES
      ('${PLAN}', 10, 6.00), ('${PLAN}', 25, 9.00), ('${PLAN}', NULL, 15.00);
    INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN}', 2000, 0.00), ('${PLAN}', 10000, 2.00);
  `);
  await pool.query(`SELECT public.delivery_plan_activate('${PLAN}', 'test', false)`);
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let allPostcodes: string[];
let shopId: string;

d("076 — who delivers to a postcode", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    await seed(pool);
    allPostcodes = (await pool.query<{ postcode: string }>(`SELECT DISTINCT postcode FROM public.locality ORDER BY 1`)).rows.map((r) => r.postcode);
    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('COV', 'Coverage shop') RETURNING id::text AS id`)).rows[0]!.id;
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("a listed postcode is priced from its own distance", async () => {
    const fee = async (postcode: string) => {
      const res = await quote(pool, null, postcode, [{ shopId, grams: 1500 }], new Date(), 5000);
      if (!res.serviced || res.coverage !== "effy") throw new Error(`${postcode} not serviced`);
      return res.baseFee.totalCents;
    };
    expect(await fee("3121")).toBe(600);
    expect(await fee("3900")).toBe(900);
    expect(await fee("3141")).toBe(600);
  });

  it("the place with the most addresses stands for the postcode", async () => {
    const km = Number((await pool.query<{ km: string }>(`SELECT distance_km::text AS km FROM public.delivery_zone_postcode WHERE postcode = '3121'`)).rows[0]!.km);
    expect(km).toBeGreaterThan(3); // Richmond, not Burnley
    expect(km).toBeLessThan(3.5);
  });

  it("every answer, each with its reason: a courier is promised only where one can be sold", async () => {
    const COURIER_PLAN = "00000000-0000-0000-0000-0000000000c9";
    const settings = (sql: string) => pool.query(`UPDATE public.delivery_settings SET ${sql} WHERE id = 1`);
    const at = (postcode: string) => coverageForPostcode(pool, postcode);

    expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed", groupId: Z_INNER, groupName: "Inner East" });
    expect((await at("3121")).distanceKm).toBeGreaterThan(3);
    expect(await at("9999")).toEqual({ kind: "none", reason: "unknown_postcode", distanceKm: null, groupId: null, groupName: null, todayOffered: true });
    expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_off" });

    await settings(`courier_offered = true`);
    try {
      // On, with no price and no estimate: nothing could sell it.
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_not_ready" });
      // A courier cannot be booked to a place the data does not know.
      expect(await at("9999")).toMatchObject({ kind: "none", reason: "unknown_postcode" });

      // A default courier service, but no fee table yet.
      await pool.query(`
        INSERT INTO public.courier_service (id, courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, is_default, updated_by)
          VALUES ('00000000-0000-0000-0000-0000000000ca', 'Test Courier', 'Parcel', '2–4 business days', 4, '{1,2,3,4,5}', '14:00', true, 'test')`);
      expect(await at("7000"), "a service and no fee table").toMatchObject({ kind: "none", reason: "courier_not_ready" });
      await pool.query(`
        INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
          VALUES ('${COURIER_PLAN}', 'courier', 'Courier table', true, 9.00, 0.50, 0.00, 90.00, 'test');
        INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${COURIER_PLAN}', 100000, 0.00);`);
      // A fee table and no default service: not ready.
      await pool.query(`UPDATE public.courier_service SET is_default = false`);
      expect(await at("7000"), "a fee table and no default service").toMatchObject({ kind: "none", reason: "courier_not_ready" });
      await pool.query(`UPDATE public.courier_service SET is_default = true`);

      // On and ready is offered.
      expect(await at("7000")).toMatchObject({ kind: "courier", reason: "courier_offered", distanceKm: null, groupId: null });
      expect(await at("9999")).toMatchObject({ kind: "none", reason: "unknown_postcode" });
      // The same question of the function the no-window fallback uses.
      expect(await courierReachesPostcode(pool, "7000")).toBe(true);
      // Effy's own postcode: Effy delivers, and a courier could be booked: two questions.
      expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed" });
      expect(await courierReachesPostcode(pool, "3121")).toBe(true);

      await pool.query(`INSERT INTO public.courier_excluded_postcode (postcode, reason, added_by) VALUES ('7000', 'No chilled courier service', 'test'), ('3121', 'irrelevant', 'test')`);
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_excluded" });
      // Listed and excluded from couriers: still Effy; the exclusion only removes the courier fallback.
      expect(await at("3121")).toMatchObject({ kind: "effy", reason: "listed" });
      expect(await courierReachesPostcode(pool, "3121")).toBe(false);

      // Switched off: every courier answer goes.
      await settings(`courier_offered = false`);
      await pool.query(`DELETE FROM public.courier_excluded_postcode`);
      expect(await at("7000")).toMatchObject({ kind: "none", reason: "courier_off" });
    } finally {
      await pool.query(`DELETE FROM public.courier_excluded_postcode`);
      await pool.query(`DELETE FROM public.delivery_fee_plan WHERE id = '${COURIER_PLAN}'`);
      await pool.query(`DELETE FROM public.courier_service`);
      await settings(`courier_offered = false`);
    }
  });

  it("the answer says whether today is offered: the listed row's own setting, true where not listed", async () => {
    expect((await coverageForPostcode(pool, "3121")).todayOffered).toBe(true);
    await pool.query(`UPDATE public.delivery_zone_postcode SET today_offered = false WHERE postcode = '3121'`);
    try {
      expect(await coverageForPostcode(pool, "3121")).toMatchObject({ kind: "effy", reason: "listed", todayOffered: false });
      expect((await coverageForPostcode(pool, "9999")).todayOffered).toBe(true);
    } finally {
      await pool.query(`UPDATE public.delivery_zone_postcode SET today_offered = true WHERE postcode = '3121'`);
    }
  });

  it("a postcode listed with no group quotes a fee from its distance", async () => {
    await pool.query(
      `INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
       VALUES (NULL, '3220', public.coverage_computed_distance_km('3220'), 'computed', 'test')`,
    );
    const res = await quote(pool, null, "3220", [{ shopId, grams: 1500 }], new Date(), 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    expect(res.coverage).toBe("effy");
    expect(res.zoneId).toBeNull();
    expect(res.baseFee.totalCents).toBe(1500);
  });

  it("a group names its postcodes", async () => {
    const group = (
      await pool.query<{ id: string }>(`INSERT INTO public.delivery_zone (code, name, updated_by) VALUES ('T-NEW', 'New group', 'test') RETURNING id::text AS id`)
    ).rows[0]!.id;
    await pool.query(`UPDATE public.delivery_zone_postcode SET zone_id = $1 WHERE postcode = '3220'`, [group]);
    expect(await coverageForPostcode(pool, "3220")).toMatchObject({ kind: "effy", groupId: group, groupName: "New group" });
  });

  it("deleting a group's row does not delete its postcodes", async () => {
    const group = (await pool.query<{ id: string }>(`SELECT id::text AS id FROM public.delivery_zone WHERE code = 'T-NEW'`)).rows[0]!.id;
    await pool.query(`DELETE FROM public.delivery_zone WHERE id = $1`, [group]);
    expect(await coverageForPostcode(pool, "3220")).toMatchObject({ kind: "effy", reason: "listed", groupId: null });
  });

  it("nothing about a shop changes any answer", async () => {
    const answers = async () => Promise.all(allPostcodes.map(async (p) => `${p}:${(await coverageForPostcode(pool, p)).kind}`));
    const was = await answers();
    await pool.query(`UPDATE public.shop SET status = 'suspended' WHERE id = $1`, [shopId]).catch(() => undefined);
    expect(await answers()).toEqual(was);
  });

  it("the coverage answer and the quote agree for every postcode", async () => {
    for (const postcode of [...allPostcodes, "9999"]) {
      const coverage = await coverageForPostcode(pool, postcode);
      const res = await quote(pool, null, postcode, [{ shopId, grams: 1500 }], new Date(), 5000);
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
