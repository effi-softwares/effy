import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { instantAtLocalTime } from "../lib/collection-deadline";
import { migrationSql } from "../lib/load-migrations";
import { searchLocalities } from "./locality";
import { loadActivePlan, loadPlan, NoActivePlanError } from "./plan";
import { quote } from "./quote";
import { loadSlots, loadSlotSettings, lockSlot, slotLoad } from "./slots";
import { coverageForPostcode } from "./coverage";
import { windowKey } from "./windows";
import { serviceableForPostcode } from "./zone";

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
      INSERT INTO public.delivery_zone (id, code, name, status, updated_by) VALUES
        ('${ZONE}', 'T-Z1', 'Test zone', 'active', 'test'),
        ('${ZONE_OFF}', 'T-Z2', 'Disabled zone', 'disabled', 'test');
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

  it("the coverage answer the quote reads agrees with serviceability, and names the group", async () => {
    expect(await coverageForPostcode(pool, "3121")).toMatchObject({ kind: "effy", groupId: ZONE, distanceKm: 3.4 });
    // In a removed group: listed, and treated as ungrouped.
    expect(await coverageForPostcode(pool, "3550")).toMatchObject({ kind: "effy", groupId: null });
    expect((await coverageForPostcode(pool, "3999")).kind).toBe("none");
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

  it("no window switched on: still priced ONCE for the order, and says there is nothing to choose", async () => {
    const res = await quote(pool, null, "3121", [{ shopId: shopA, grams: 1500 }, { shopId: shopB, grams: 7000 }], new Date(), 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");
    // 3.4 km → the first band; 8.5 kg in all → the top weight band: 1.00 + 5.00 + 5.50.
    expect(res.baseFee.totalCents).toBe(1150);
    expect(res.baseFee.breakdown).toMatchObject({ km: 3.4, grams: 8500, distanceBandUpperKm: 10, weightBandUpperGrams: 10000 });
    expect(res.zoneId).toBe(ZONE);
    expect(res.shopIds).toEqual([shopA, shopB]);
    expect(res.freeDeliveryRemainingCents).toBeNull();
    expect(res.effyWindows.unavailable).toBe("none_defined");
    expect(res.effyWindows.fees.size).toBe(0);
    expect(res.effyWindows.days[0]).toMatchObject({ isToday: true, windows: [] });
  });

  it("an unserved postcode quotes nothing", async () => {
    expect(await quote(pool, null, "3999", [{ shopId: shopA, grams: 1500 }], new Date(), 5000)).toEqual({ serviced: false, coverage: "none" });
  });

  it("a window is open for the WHOLE order: one fee with it, dearer today by the plan's premium", async () => {
    await pool.query(`UPDATE public.delivery_settings SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0 WHERE id = 1`);
    await pool.query(`INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('12:00', 'active', 'test')`);
    await pool.query(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by)
       VALUES ('17:00', '19:00', '15:00', 2, 'active', 'test')`,
    );

    const now = instantAtLocalTime(2026, 8, 24, 10, 0); // before the 12:00 run and the 15:00 cutoff
    const res = await quote(pool, null, "3121", [{ shopId: shopA, grams: 1500 }, { shopId: shopB, grams: 1500 }], now, 5000);
    if (!res.serviced || res.coverage !== "effy") throw new Error("expected serviced");

    expect(res.effyWindows.unavailable).toBeNull();
    const [today, tomorrow] = res.effyWindows.days;
    expect(today).toMatchObject({ date: "2026-08-24", isToday: true, closedReason: null });
    expect(today!.windows).toHaveLength(1);
    const slotId = today!.windows[0]!.id;
    // The plain fee, then the same window today (plus the today premium) and tomorrow (nothing added).
    expect(res.baseFee.totalCents).toBe(800); // 1.00 + 5.00 + 2.00 (3 kg)
    expect(res.effyWindows.fees.get(windowKey(slotId, today!.date))).toMatchObject({ totalCents: 1100, windowIsToday: true, slotId });
    expect(res.effyWindows.fees.get(windowKey(slotId, tomorrow!.date))).toMatchObject({ totalCents: 800, windowIsToday: false, slotId });

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
