import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 076 — the coverage console against the REAL schema: the list, groups, distances, courier reach
 * and the checker, and the audit row every change leaves.
 *
 * Only the module pool and the live channel are replaced; the SQL, the migrations and the one
 * coverage function are real.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as unknown[] }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...(await importOriginal<typeof import("@effy/edge-shared")>()),
    query,
    pooled: { query },
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
vi.mock("@effy/edge-shared/live", () => ({
  announce: async (changes: unknown[]) => {
    holder.announced.push(...changes);
  },
}));

import { migrationSql } from "@effy/edge-shared";

import * as svc from "./coverage.service";
import { putSettings } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const SUB = "staff-sub-1";
const HUB = { lat: "-37.813600", lon: "144.963100" };

let container: StartedPostgreSqlContainer;
let pool: Pool;

const q = <R extends Record<string, unknown>>(sql: string, args: unknown[] = []) => pool.query<R>(sql, args).then((r) => r.rows);
const audits = (action: string) => q<{ detail: Record<string, unknown> }>(`SELECT detail FROM admin.audit_log WHERE action = $1 ORDER BY created_at`, [action]);
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof svc.CoverageError) return { status: e.status, code: e.code, extra: e.extra };
    throw e;
  }
  throw new Error("expected a refusal");
};

async function driver(name: string, zoneId: string | null): Promise<void> {
  const id = (await q<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email, status) VALUES ($1, $2, $3, 'active') RETURNING id::text AS id`,
    [`sub-${name}`, name, `${name}@drivers.test`],
  ))[0]!.id;
  await q(`INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id) VALUES ($1, 'delivery', 'same_day', $2)`, [id, zoneId]);
}

describe.skipIf(!RUN)("076 — the coverage console, against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    await pool.query(`DELETE FROM public.delivery_zone`);
    await pool.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, ${HUB.lat}, ${HUB.lon}, 'test')
        ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude;
      INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count) VALUES
        ('RICHMOND',    'VIC', '3121', -37.8230, 144.9980, 9000),
        ('BURNLEY',     'VIC', '3121', -37.8280, 145.0080, 400),
        ('RICHMOND',    'NSW', '2753', -33.5980, 150.7510, 3000),
        ('SOUTH YARRA', 'VIC', '3141', -37.8400, 144.9930, 8000),
        ('GEELONG',     'VIC', '3220', -38.1490, 144.3610, 7000),
        ('BOX ONLY',    'VIC', '3900', NULL, NULL, 0),
        ('HOBART',      'TAS', '7000', -42.8820, 147.3270, 6000)
        ON CONFLICT (name, state, postcode) DO UPDATE
          SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, address_count = EXCLUDED.address_count;
    `);
    // One driver cleared for everywhere, so the no-driver confirmation is not what these tests meet
    // until the test that is about it.
    await driver("everywhere", null);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    holder.announced.length = 0;
  });

  it("place search: one result per postcode, same-named places told apart, with what each brings", async () => {
    const { results } = await svc.searchPlaces("rich");
    expect(results.map((r) => `${r.matched} ${r.state} ${r.postcode}`)).toEqual(["RICHMOND NSW 2753", "RICHMOND VIC 3121"]);
    const vic = results.find((r) => r.postcode === "3121")!;
    expect(vic.places).toEqual(["RICHMOND", "BURNLEY"]);
    expect(vic.listed).toBe(false);
    expect(Number(vic.computedDistanceKm)).toBeGreaterThan(3);
    expect(Number(vic.computedDistanceKm)).toBeLessThan(3.5);
    // A raw postcode finds it too, and a place with no location says a distance will be needed.
    expect((await svc.searchPlaces("3900")).results[0]).toMatchObject({ postcode: "3900", computedDistanceKm: null });
    expect((await svc.searchPlaces("r")).results).toEqual([]);
  });

  it("add: lists a postcode with a worked-out distance, audits it, and announces", async () => {
    expect(await svc.addPostcodes({ postcodes: [{ postcode: "3121" }] }, SUB)).toEqual({ added: ["3121"], alreadyListed: [] });
    const row = (await q<{ distance_source: string; added_by: string; zone_id: string | null }>(
      `SELECT distance_source, added_by, zone_id FROM public.delivery_zone_postcode WHERE postcode = '3121'`,
    ))[0];
    expect(row).toEqual({ distance_source: "computed", added_by: SUB, zone_id: null });
    expect((await audits("coverage.postcode.add")).at(-1)?.detail).toMatchObject({ postcode: "3121", before: null, after: { distanceSource: "computed" } });
    expect(holder.announced).toEqual([{ scope: "ops", kind: "coverage" }]);
  });

  it("add again: already listed, nothing duplicated, nothing announced", async () => {
    expect(await svc.addPostcodes({ postcodes: [{ postcode: "3121" }] }, SUB)).toEqual({ added: [], alreadyListed: ["3121"] });
    expect((await q(`SELECT 1 FROM public.delivery_zone_postcode WHERE postcode = '3121'`)).length).toBe(1);
    expect(holder.announced).toEqual([]);
  });

  it("add: a place with no location needs a distance from a person — and takes it", async () => {
    expect(await refusal(svc.addPostcodes({ postcodes: [{ postcode: "3900" }] }, SUB))).toEqual({ status: 422, code: "distance_required", extra: { postcodes: ["3900"] } });
    expect(await refusal(svc.addPostcodes({ postcodes: [{ postcode: "3900", manualDistanceKm: "9000" }] }, SUB))).toMatchObject({ code: "distance_out_of_range" });
    expect(await svc.addPostcodes({ postcodes: [{ postcode: "3900", manualDistanceKm: "18.5" }] }, SUB)).toEqual({ added: ["3900"], alreadyListed: [] });
    expect((await q(`SELECT distance_km::text AS km, distance_source FROM public.delivery_zone_postcode WHERE postcode = '3900'`))[0]).toEqual({ km: "18.50", distance_source: "manual" });
  });

  it("add: a postcode the country's data does not know is refused, and a malformed one is the caller's error", async () => {
    expect(await refusal(svc.addPostcodes({ postcodes: [{ postcode: "9999" }] }, SUB))).toEqual({ status: 422, code: "unknown_postcode", extra: { postcodes: ["9999"] } });
    expect(await refusal(svc.addPostcodes({ postcodes: [{ postcode: "31" }] }, SUB))).toMatchObject({ status: 400, code: "invalid_postcode" });
  });

  it("the list: postcodes with their places, distance and how it was obtained; filters; counts", async () => {
    const all = await svc.list({});
    expect(all.postcodes.map((p) => p.postcode)).toEqual(["3121", "3900"]);
    expect(all.postcodes[0]).toMatchObject({ places: ["RICHMOND", "BURNLEY"], state: "VIC", groupId: null, distanceSource: "computed", needsReview: false });
    expect(all.counts).toEqual({ listed: 2, manualDistance: 1, needsReview: 0 });
    expect(all.ungrouped).toEqual({ postcodeCount: 2, driverCount: 1 });
    // 079 — nothing is set yet, and the screen is told BOTH things that must be done before courier can go on.
    expect(all.courier).toEqual({
      offered: false, estimateText: null, whenNoWindows: false, blockedBy: ["no_fee_table", "no_estimate"], pending: false, canBeOffered: false, exclusions: [],
    });
    expect((await svc.list({ source: "manual" })).postcodes.map((p) => p.postcode)).toEqual(["3900"]);
    expect((await svc.list({ q: "burn" })).postcodes.map((p) => p.postcode)).toEqual(["3121"]);
    expect((await svc.list({ q: "39" })).postcodes.map((p) => p.postcode)).toEqual(["3900"]);
  });

  it("the checker: each answer with a reason a person can repeat", async () => {
    expect((await svc.check("3121")).matches).toEqual([
      expect.objectContaining({ postcode: "3121", coverage: "effy", reason: "listed", groupName: null, distanceSource: "computed", places: ["RICHMOND", "BURNLEY"] }),
    ]);
    expect((await svc.check("7000")).matches[0]).toMatchObject({ coverage: "none", reason: "courier_off", distanceKm: null, distanceSource: null });
    expect((await svc.check("9999")).matches[0]).toMatchObject({ coverage: "none", reason: "unknown_postcode", places: [] });
    // A place name: one answer per postcode it is found in.
    expect((await svc.check("richmond")).matches.map((m) => `${m.postcode}:${m.coverage}`)).toEqual(["2753:none", "3121:effy"]);
    expect(await refusal(svc.check("3"))).toMatchObject({ status: 400, code: "invalid_query" });
  });

  it("groups: create, no duplicate name, assign, rename — a postcode is in one group at most", async () => {
    const a = (await svc.createGroup({ name: "  Inner   Melbourne " }, SUB)).id;
    const b = (await svc.createGroup({ name: "Bayside" }, SUB)).id;
    expect(await refusal(svc.createGroup({ name: "inner melbourne" }, SUB))).toMatchObject({ status: 409, code: "group_name_taken" });

    await svc.patchPostcodes({ postcodes: ["3121", "3900"], groupId: a }, SUB);
    await svc.patchPostcodes({ postcodes: ["3900"], groupId: b }, SUB);
    expect(await q(`SELECT postcode, zone_id::text AS g FROM public.delivery_zone_postcode ORDER BY postcode`)).toEqual([
      { postcode: "3121", g: a }, { postcode: "3900", g: b },
    ]);

    await svc.renameGroup(a, { name: "Inner East" }, SUB);
    const groups = (await svc.list({})).groups;
    expect(groups.map((g) => `${g.name}:${g.postcodeCount}:${g.driverCount}`)).toEqual(["Bayside:1:1", "Inner East:1:1"]);
    expect((await svc.list({ group: a })).postcodes.map((p) => p.postcode)).toEqual(["3121"]);
    expect((await svc.check("3121")).matches[0]).toMatchObject({ coverage: "effy", groupName: "Inner East" });
    expect((await audits("coverage.postcode.group")).length).toBe(2);
    expect((await audits("coverage.group.rename")).at(-1)?.detail).toEqual({ before: { name: "Inner Melbourne" }, after: { name: "Inner East" } });
    expect(await refusal(svc.patchPostcodes({ postcodes: ["3121"], groupId: "00000000-0000-0000-0000-000000000000" }, SUB))).toMatchObject({ status: 404, code: "group_not_found" });
  });

  it("P4 — removing a group leaves its postcodes listed and Delivered by Effy, and retires the group", async () => {
    const bayside = (await svc.list({})).groups.find((g) => g.name === "Bayside")!.id;
    expect(await svc.removeGroup(bayside, false, SUB)).toEqual({ ungrouped: 1 });
    expect((await svc.check("3900")).matches[0]).toMatchObject({ coverage: "effy", reason: "listed", groupName: null });
    expect((await q(`SELECT status FROM public.delivery_zone WHERE id = $1`, [bayside]))[0]).toEqual({ status: "disabled" });
    expect((await svc.list({})).groups.map((g) => g.name)).toEqual(["Inner East"]);
    expect((await audits("coverage.group.remove")).at(-1)?.detail).toEqual({ before: { name: "Bayside", postcodes: ["3900"] }, after: null });
    // The name is free again.
    await svc.createGroup({ name: "Bayside" }, SUB);
  });

  it("distance: override by hand, return to worked-out, and a place that cannot be worked out", async () => {
    await svc.patchPostcodes({ postcodes: ["3121"], distance: { source: "manual", km: "4" } }, SUB);
    expect((await q(`SELECT distance_km::text AS km, distance_source FROM public.delivery_zone_postcode WHERE postcode = '3121'`))[0]).toEqual({ km: "4.00", distance_source: "manual" });
    await svc.patchPostcodes({ postcodes: ["3121"], distance: { source: "computed" } }, SUB);
    expect((await q<{ distance_source: string }>(`SELECT distance_source FROM public.delivery_zone_postcode WHERE postcode = '3121'`))[0]!.distance_source).toBe("computed");
    expect(await refusal(svc.patchPostcodes({ postcodes: ["3900"], distance: { source: "computed" } }, SUB))).toMatchObject({ status: 409, code: "distance_not_computable" });
    expect(await refusal(svc.patchPostcodes({ postcodes: ["3121", "3900"], distance: { source: "manual", km: "1" } }, SUB))).toMatchObject({ status: 400 });
    const d = (await audits("coverage.postcode.distance")).map((a) => a.detail);
    expect(d[0]).toMatchObject({ postcode: "3121", before: { distanceSource: "computed" }, after: { distanceKm: "4.00", distanceSource: "manual" } });
  });

  it("P6 — a hub move recalculates worked-out distances, leaves hand-entered ones, flags them, and says how many", async () => {
    // ⚠ A hand-entered distance on a place the platform COULD work out — the case that matters. With
    // only an unlocatable place in the list (3900), a recalculation that wrongly included manual rows
    // would have nothing to overwrite and this test would pass regardless. (It did, until this row.)
    await svc.addPostcodes({ postcodes: [{ postcode: "3141" }] }, SUB);
    await svc.patchPostcodes({ postcodes: ["3141"], distance: { source: "manual", km: "9.99" } }, SUB);
    holder.announced.length = 0;

    const before = Object.fromEntries((await q<{ postcode: string; km: string }>(`SELECT postcode, distance_km::text AS km FROM public.delivery_zone_postcode`)).map((r) => [r.postcode, r.km]));

    // Saved without moving: nothing is recalculated, nothing is reported.
    const same = await putSettings({ hubLatitude: "-37.8136", hubLongitude: "144.9631", samedayPrepBufferMin: 60 }, SUB);
    expect(same.distances).toBeUndefined();
    expect(holder.announced).toEqual([]);

    const moved = await putSettings({ hubLatitude: "-37.900000", hubLongitude: "145.100000", samedayPrepBufferMin: 60 }, SUB);
    expect(moved.distances).toEqual({ recomputed: 1, unchanged: 0, manualFlagged: 2 });
    expect(holder.announced).toEqual([{ scope: "ops", kind: "coverage" }]);

    const after = Object.fromEntries((await q<{ postcode: string; km: string; distance_review: boolean }>(
      `SELECT postcode, distance_km::text AS km, distance_review FROM public.delivery_zone_postcode`,
    )).map((r) => [r.postcode, r]));
    expect(after["3121"]!.km).not.toBe(before["3121"]);
    expect(after["3121"]!.distance_review).toBe(false);
    expect(after["3900"]).toMatchObject({ km: before["3900"], distance_review: true });
    // A person's distance is a statement, not a calculation: it survives the move untouched.
    expect(after["3141"]).toMatchObject({ km: "9.99", distance_review: true });
    expect((await svc.list({})).counts.needsReview).toBe(2);
    expect((await audits("coverage.hub_recompute")).at(-1)?.detail).toMatchObject({ recomputed: 1, manualFlagged: 2 });
    await svc.removePostcode("3141", SUB);

    // A person saving the flagged distance clears the flag.
    await svc.patchPostcodes({ postcodes: ["3900"], distance: { source: "manual", km: "21" } }, SUB);
    expect((await svc.list({})).counts.needsReview).toBe(0);
    await putSettings({ hubLatitude: HUB.lat, hubLongitude: HUB.lon, samedayPrepBufferMin: 60 }, SUB);
  });

  it("P9 / 079 P20 — courier needs a fee table and an estimate; its settings; exclusions", async () => {
    // No courier fee table exists in this database: on is refused for that, first.
    expect(await refusal(svc.setCourier({ offered: true }, SUB))).toEqual({ status: 409, code: "courier_plan_missing", extra: undefined });
    expect((await q(`SELECT courier_offered FROM public.delivery_settings WHERE id = 1`))[0]).toEqual({ courier_offered: false });
    expect(await svc.setCourier({ offered: false }, SUB)).toEqual({ offered: false, estimateText: null, whenNoWindows: false });

    // The estimate: one trimmed line of 3–60 characters, or null to clear it.
    for (const bad of ["", "  ", "2d", "x".repeat(61), "2–4 days\nmaybe", 7]) {
      expect(await refusal(svc.setCourier({ estimateText: bad }, SUB)), String(bad)).toMatchObject({ status: 422, code: "invalid_estimate" });
    }
    expect(await svc.setCourier({ estimateText: "  2–4 business days " }, SUB)).toEqual({ offered: false, estimateText: "2–4 business days", whenNoWindows: false });
    expect(await svc.setCourier({ whenNoWindows: true }, SUB)).toEqual({ offered: false, estimateText: "2–4 business days", whenNoWindows: true });
    expect((await svc.list({})).courier).toMatchObject({ estimateText: "2–4 business days", whenNoWindows: true, blockedBy: ["no_fee_table"], pending: false, canBeOffered: false });
    expect(await refusal(svc.setCourier({}, SUB))).toMatchObject({ status: 400, code: "invalid_request" });
    expect(await refusal(svc.setCourier({ whenNoWindows: "yes" }, SUB))).toMatchObject({ status: 400, code: "invalid_request" });
    // Each change is its own audit row, with what it was.
    expect((await audits("coverage.courier.estimate")).at(-1)?.detail).toEqual({ before: null, after: "2–4 business days" });
    expect((await audits("coverage.courier.when_no_windows")).at(-1)?.detail).toEqual({ before: false, after: true });
    // Off: the estimate may be cleared.
    expect(await svc.setCourier({ estimateText: null, whenNoWindows: false }, SUB)).toEqual({ offered: false, estimateText: null, whenNoWindows: false });

    expect(await refusal(svc.addExclusion({ postcode: "7000", reason: "no" }, SUB))).toMatchObject({ code: "reason_required" });
    expect(await refusal(svc.addExclusion({ postcode: "9999", reason: "No such place" }, SUB))).toMatchObject({ code: "unknown_postcode" });
    await svc.addExclusion({ postcode: "7000", reason: "No chilled courier service" }, SUB);
    expect(await refusal(svc.addExclusion({ postcode: "7000", reason: "Again" }, SUB))).toMatchObject({ status: 409, code: "already_excluded" });
    expect((await svc.list({})).courier.exclusions).toEqual([{ postcode: "7000", places: ["HOBART"], reason: "No chilled courier service" }]);

    // With courier on (set in the database — this database has no fee table, so the service will not),
    // the checker gives the exclusion's own reason; and an unexcluded place is NOT promised a courier,
    // because nothing could sell one: no fee table, no estimate (079 — `pricing.container.test.ts`
    // P19 carries it through to "courier").
    await q(`UPDATE public.delivery_settings SET courier_offered = true WHERE id = 1`);
    expect((await svc.check("7000")).matches[0]).toMatchObject({ coverage: "none", reason: "courier_excluded", exclusionReason: "No chilled courier service" });
    expect((await svc.check("2753")).matches[0]).toMatchObject({ coverage: "none", reason: "courier_not_ready" });
    await q(`UPDATE public.delivery_settings SET courier_offered = false WHERE id = 1`);

    await svc.removeExclusion("7000", SUB);
    expect(await refusal(svc.removeExclusion("7000", SUB))).toMatchObject({ status: 404 });
    expect((await audits("coverage.courier.exclude")).length).toBe(1);
    expect((await audits("coverage.courier.include")).at(-1)?.detail).toEqual({ postcode: "7000", before: { reason: "No chilled courier service" }, after: null });
  });

  it("remove: leaves the list, is audited with what it was, and changes no order", async () => {
    const orders = (await q<{ n: string }>(`SELECT count(*)::text AS n FROM public."order"`))[0]!.n;
    await svc.removePostcode("3900", SUB);
    expect((await svc.check("3900")).matches[0]).toMatchObject({ coverage: "none" });
    expect((await audits("coverage.postcode.remove")).at(-1)?.detail).toMatchObject({ postcode: "3900", before: { distanceSource: "manual" }, after: null });
    expect((await q<{ n: string }>(`SELECT count(*)::text AS n FROM public."order"`))[0]!.n).toBe(orders);
    expect(await refusal(svc.removePostcode("3900", SUB))).toMatchObject({ status: 404, code: "not_listed" });
  });

  it("no driver can deliver there: adding ungrouped, moving, or removing a group asks first", async () => {
    await q(`DELETE FROM public.driver`); // nobody is cleared for anything
    const inner = (await svc.list({})).groups.find((g) => g.name === "Inner East")!.id;
    expect((await svc.list({})).ungrouped.driverCount).toBe(0);

    expect(await refusal(svc.addPostcodes({ postcodes: [{ postcode: "3141" }] }, SUB))).toEqual({ status: 409, code: "no_driver_covers", extra: { driverCount: 0 } });
    expect(await refusal(svc.removeGroup(inner, false, SUB))).toMatchObject({ code: "no_driver_covers" });
    expect(await refusal(svc.patchPostcodes({ postcodes: ["3121"], groupId: null }, SUB))).toMatchObject({ code: "no_driver_covers" });

    // Said out loud, it goes ahead.
    expect(await svc.addPostcodes({ postcodes: [{ postcode: "3141" }], confirmNoDrivers: true }, SUB)).toEqual({ added: ["3141"], alreadyListed: [] });

    // A driver cleared for one group covers that group and not the ungrouped postcodes.
    await driver("inner-only", inner);
    const list = await svc.list({});
    expect(list.groups.find((g) => g.id === inner)!.driverCount).toBe(1);
    expect(list.ungrouped.driverCount).toBe(0);
    expect(await svc.addPostcodes({ postcodes: [{ postcode: "3220" }], groupId: inner }, SUB)).toEqual({ added: ["3220"], alreadyListed: [] });
  });
});

/**
 * P13 — who may do what (FR-026). The decision is `guard()`'s, from the `admin.staff` record: "read"
 * admits any active staff member including a customer-service agent, "mutate" only an admin or a
 * manager. What can go wrong is a write route asking for "read". So this reads every coverage
 * handler and holds its level to its verb.
 */
describe("076 — P13: every coverage route asks for the right level", () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../functions");
  const handlers = readdirSync(dir).filter((f) => f.startsWith("delivery-coverage-") && f.endsWith(".ts"));

  it("found them", () => {
    expect(handlers.length).toBe(12);
  });

  it.each(handlers)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const level = /guard\(event, scope, "(read|mutate)"\)/.exec(src)?.[1];
    expect(level, `${file} does not call guard()`).toBeDefined();
    expect(level).toBe(file.endsWith("-get.ts") ? "read" : "mutate");
    // And refuses before it parses or touches anything.
    expect(src.indexOf("guard(event")).toBeLessThan(src.indexOf("try {"));
  });
});
