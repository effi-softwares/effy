import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { instantAtLocalTime } from "../lib/collection-deadline";
import { migrationSql } from "../lib/load-migrations";
import { searchLocalities } from "./locality";
import { loadActivePlan, loadPlan, METHOD_SAME_DAY, NoActivePlanError } from "./plan";
import { quote, SAME_DAY_NOT_ELIGIBLE } from "./quote";
import { loadSlots, loadSlotSettings, lockSlot, slotLoad } from "./slots";
import { serviceableForPostcode, zoneForPostcode } from "./zone";

/**
 * 070 — the delivery reads against the REAL schema.
 *
 * With raw SQL and no ORM, only a real database catches a wrong column, a missing cast or a value
 * that arrives as text when the code expects a number (`count(*)` is a bigint, which this driver
 * returns as a STRING — every count here is cast for that reason). The pure rules are covered by
 * the table tests beside this file; this proves the statements.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const ZONE = "00000000-0000-0000-0000-0000000000e1";
const ZONE_OFF = "00000000-0000-0000-0000-0000000000e2";
const PLAN = "00000000-0000-0000-0000-0000000000d1";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopA: string;
let shopB: string;

d("070 — delivery reads against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    await pool.query(`TRUNCATE public.delivery_slot, public.delivery_collection_run CASCADE`);
    await pool.query(`DELETE FROM public.delivery_fee_plan`);

    [shopA, shopB] = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.shop (code, name) VALUES ('DLVA', 'Delivery A'), ('DLVB', 'Delivery B') RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id) as [string, string];

    await pool.query(`
      INSERT INTO public.delivery_zone (id, code, name, sameday_eligible, status, updated_by) VALUES
        ('${ZONE}', 'T-Z1', 'Test zone', false, 'active', 'test'),
        ('${ZONE_OFF}', 'T-Z2', 'Disabled zone', false, 'disabled', 'test');
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES
        ('${ZONE}', '3121', 3.40, 'manual', 'test'), ('${ZONE_OFF}', '3550', 130.00, 'manual', 'test');
      INSERT INTO public.delivery_fee_plan (id, name, is_active, base_amount, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN}', 'Test plan', true, 1.00, 3.00, 0.50, 4.00, 40.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES
        ('${PLAN}', 10, 5.00), ('${PLAN}', NULL, 11.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
        ('${PLAN}', 2000, 0.00), ('${PLAN}', 5000, 2.00), ('${PLAN}', 10000, 5.50);
      INSERT INTO public.locality (name, state, postcode) VALUES
        ('MELBOURNE', 'VIC', '3000'), ('RICHMOND', 'VIC', '3121'), ('BALLARAT CENTRAL', 'VIC', '3350'), ('BENDIGO', 'VIC', '3550')
        ON CONFLICT DO NOTHING;
    `);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("loads the active plan into integer cents, bands in order, the open-ended band last", async () => {
    const plan = await loadActivePlan(pool);
    expect(plan).toMatchObject({ kind: "effy", name: "Test plan", isActive: true, baseCents: 100, todayPremiumCents: 300 });
    expect(plan.stepCents).toBe(50);
    expect(plan.floorCents).toBe(400);
    expect(plan.capCents).toBe(4000);
    expect(plan.distanceBands).toEqual([{ upperKm: 10, addCents: 500 }, { upperKm: null, addCents: 1100 }]);
    expect(plan.weightBands.map((b) => b.upperGrams)).toEqual([2000, 5000, 10000]); // ascending
    expect(plan.weightBands[0]?.addCents).toBe(0);
    // Unset rules arrive as "not set", never as zero.
    expect(plan.freeOverCents).toBeNull();
    expect(plan.smallOrderUnderCents).toBeNull();
    expect(plan.slotPremiumCents.size).toBe(0);
  });

  it("loads a plan by id, and null for one that does not exist", async () => {
    expect((await loadPlan(pool, PLAN))?.id).toBe(PLAN);
    expect(await loadPlan(pool, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("there is no courier plan until someone makes one", async () => {
    await expect(loadActivePlan(pool, "courier")).rejects.toBeInstanceOf(NoActivePlanError);
  });

  // ⚠ 076 — being LISTED is what serves a postcode. A group's status no longer decides: "disabled"
  // means a removed group, and removing a group never takes delivery away from its postcodes.
  it("serviceability: on the list yes — whatever its group's status — not on the list no", async () => {
    expect(await serviceableForPostcode(pool, "3121")).toBe(true);
    expect(await serviceableForPostcode(pool, "3550")).toBe(true);
    expect(await serviceableForPostcode(pool, "3999")).toBe(false);
  });

  it("the quote's zone lookup agrees with serviceability", async () => {
    expect(await zoneForPostcode(pool, "3121")).toEqual({ id: ZONE, sameDayEligible: false });
    // In a removed group: listed, treated as ungrouped, same-day eligible.
    expect(await zoneForPostcode(pool, "3550")).toEqual({ id: null, sameDayEligible: true });
    expect(await zoneForPostcode(pool, "3999")).toBeNull();
  });

  it("locality search: name prefix (case-insensitive), postcode prefix, alphabetical, bounded", async () => {
    expect(await searchLocalities(pool, "rich", 8)).toEqual([{ name: "RICHMOND", state: "VIC", postcode: "3121" }]);
    expect((await searchLocalities(pool, "300", 8)).map((l) => l.postcode)).toContain("3000");
    const b = (await searchLocalities(pool, "b", 50)).map((l) => l.name);
    expect(b.indexOf("BALLARAT CENTRAL")).toBeLessThan(b.indexOf("BENDIGO"));
    expect(await searchLocalities(pool, "b", 1)).toHaveLength(1);
  });

  it("slot settings come back as numbers, with the migration's defaults", async () => {
    const s = await loadSlotSettings(pool);
    expect(typeof s.holdMin).toBe("number");
    expect(typeof s.turnaroundMin).toBe("number");
    expect(Array.isArray(s.noWeekdays)).toBe(true);
    for (const w of s.noWeekdays) expect(typeof w).toBe("number");
  });

  it("standard-only quote: not same-day eligible, ONE fee for the order, days offered", async () => {
    const res = await quote(pool, null, "3121", [{ shopId: shopA, grams: 1500 }, { shopId: shopB, grams: 7000 }], new Date(), 5000);
    if (!res.serviced) throw new Error("expected serviced");
    // 3.4 km → the first band; 8.5 kg in all → the top weight band: 1.00 + 5.00 + 5.50.
    expect(res.standardFee.totalCents).toBe(1150);
    expect(res.standardFee.breakdown).toMatchObject({ km: 3.4, grams: 8500, distanceBandUpperKm: 10, weightBandUpperGrams: 10000 });
    expect(res.slotFees.size).toBe(0);
    expect(res.freeDeliveryRemainingCents).toBeNull();
    expect(res.sameDayUntil).toBeNull();
    expect(res.sameDayUnavailable).toBe(SAME_DAY_NOT_ELIGIBLE);
    for (const p of res.packages) expect(p.options).toHaveLength(1);
    expect(res.standardDays.length).toBeGreaterThan(0);
  });

  it("an unserved postcode quotes nothing", async () => {
    expect(await quote(pool, null, "3999", [{ shopId: shopA, grams: 1500 }], new Date(), 5000)).toEqual({ serviced: false, coverage: "none" });
  });

  it("same-day appears on exactly the package whose shop does it, while a slot is open", async () => {
    await pool.query(`UPDATE public.delivery_zone SET sameday_eligible = true WHERE id = '${ZONE}'`);
    await pool.query(`UPDATE public.delivery_settings SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0 WHERE id = 1`);
    await pool.query(`INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('12:00', 'active', 'test')`);
    await pool.query(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by)
       VALUES ('17:00', '19:00', '15:00', 2, 'active', 'test')`,
    );
    await pool.query(
      `INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode, updated_by) VALUES ($1, '${ZONE}', 'off', 'test')`,
      [shopB],
    );

    const now = instantAtLocalTime(2026, 8, 24, 10, 0); // before the 12:00 run and the 15:00 cutoff
    const res = await quote(pool, null, "3121", [{ shopId: shopA, grams: 1500 }, { shopId: shopB, grams: 1500 }], now, 5000);
    if (!res.serviced) throw new Error("expected serviced");

    // One fee for the order with that window: the plain fee plus the today premium — once, though
    // only one of the two packages can go today.
    const slotFee = res.slotFees.get(res.sameDaySlots[0]!.id)!;
    expect(res.standardFee.totalCents).toBe(800); // 1.00 + 5.00 + 2.00 (3 kg)
    expect(slotFee.totalCents).toBe(1100);
    expect(slotFee).toMatchObject({ windowIsToday: true, slotId: res.sameDaySlots[0]!.id });

    expect(res.sameDaySlots).toHaveLength(1);
    expect(res.sameDayUntil).not.toBeNull();
    const sameDay = res.packages.filter((p) => p.options.some((o) => o.method === METHOD_SAME_DAY));
    expect(sameDay.map((p) => p.shopId)).toEqual([shopA]); // shop B is excepted off

    const slots = await loadSlots(pool);
    expect(slots[0]).toMatchObject({ start: { hour: 17, minute: 0 }, cutoff: { hour: 15, minute: 0 }, capacity: 2 });
    expect((await slotLoad(pool, "2026-08-24")).get(slots[0]!.id) ?? 0).toBe(0);
  });

  it("lockSlot returns the slot inside a transaction and null for an unknown id", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const [first] = await loadSlots(client);
      expect((await lockSlot(client, first!.id))?.id).toBe(first!.id);
      expect(await lockSlot(client, "00000000-0000-0000-0000-000000000000")).toBeNull();
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("no active plan fails loud — never free delivery", async () => {
    await pool.query(`UPDATE public.delivery_fee_plan SET is_active = false`);
    await expect(loadActivePlan(pool)).rejects.toBeInstanceOf(NoActivePlanError);
    await expect(quote(pool, null, "3121", [{ shopId: shopA, grams: 1500 }], new Date(), 5000)).rejects.toBeInstanceOf(NoActivePlanError);
    await pool.query(`UPDATE public.delivery_fee_plan SET is_active = true WHERE id = '${PLAN}'`);
  });
});
