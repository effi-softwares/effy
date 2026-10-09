import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 077 — the pricing console against the REAL schema: drafts, gaps, the one way a plan goes live,
 * the record an active plan becomes, the simulator, and the audit row every change leaves.
 *
 * Only the module pool and the live channel are replaced; the SQL, the migrations and the gap and
 * activation functions are real.
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
import { quote } from "@effy/edge-shared/delivery";

import * as coverage from "./coverage.service";
import * as services from "./courier-services.service";
import * as svc from "./pricing.service";

const RUN = process.env.CONTAINER_TESTS === "1";
const SUB = "manager-sub";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let slotEvening: string;
let slotOff: string;

const q = <R extends Record<string, unknown>>(sql: string, args: unknown[] = []) => pool.query<R>(sql, args).then((r) => r.rows);
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    const err = e as { status?: number; code?: string; extra?: Record<string, unknown> };
    if (err.code && err.status) return { status: err.status, code: err.code, extra: err.extra };
    throw e;
  }
  throw new Error("expected a refusal");
};

const effy = (over: Record<string, unknown> = {}) => ({
  kind: "effy",
  name: `Plan ${Math.random().toString(36).slice(2, 8)}`,
  baseAmount: "3.00",
  distanceBands: [{ upperKm: "10", addAmount: "0.00" }, { upperKm: "25", addAmount: "2.00" }, { upperKm: null, addAmount: "5.00" }],
  weightBands: [{ upperGrams: 5000, addAmount: "0.00" }, { upperGrams: 20000, addAmount: "2.00" }],
  freeOverAmount: null,
  smallOrderUnderAmount: null,
  smallOrderFeeAmount: null,
  todayPremiumAmount: "3.00",
  slotPremiums: [] as { slotId: string; addAmount: string }[],
  roundingStepAmount: "0.50",
  floorAmount: "4.00",
  capAmount: "30.00",
  ...over,
});
const courier = (over: Record<string, unknown> = {}) =>
  effy({ kind: "courier", baseAmount: "9.00", distanceBands: [], todayPremiumAmount: "0.00", floorAmount: "9.00", ...over });

describe.skipIf(!RUN)("077 — the pricing console, against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    holder.pool = pool;
    await pool.query(migrationSql());
    await pool.query(`DELETE FROM public.delivery_fee_plan`);
    await pool.query(`TRUNCATE public.delivery_slot CASCADE`);
    await pool.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.8136, 144.9631, 'test')
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.locality (name, state, postcode) VALUES ('RICHMOND', 'VIC', '3121'), ('GEELONG', 'VIC', '3220'), ('HOBART', 'TAS', '7000')
        ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES
        (NULL, '3121', 3.40, 'manual', 'test'), (NULL, '3220', 65.00, 'manual', 'test');
    `);
    [slotEvening, slotOff] = (
      await q<{ id: string }>(
        `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES
           ('17:00', '19:00', '15:00', 5, 'active', 'test'), ('20:00', '21:00', '18:00', 5, 'disabled', 'test')
         RETURNING id::text AS id`,
      )
    ).map((r) => r.id) as [string, string];
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    holder.announced.length = 0;
  });

  it("a draft is saved, complete or not, its gaps named — and an open screen is told", async () => {
    const half = await svc.createPlan(effy({ distanceBands: [], weightBands: [], floorAmount: "0.00" }), SUB);
    expect(half.state).toBe("draft");
    expect(half.gaps.map((g) => [g.code, g.blocking]).sort()).toEqual([
      ["distance_bands_missing", true], ["floor_is_zero", false], ["weight_bands_missing", true],
    ]);
    expect(holder.announced).toEqual([{ scope: "ops", kind: "pricing" }]);
  });

  it("P7 — each gap is found, with the facts to fix it, and activation refuses every blocking one", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ distanceBands: [] }, "distance_bands_missing"],
      [{ distanceBands: [{ upperKm: "10", addAmount: "0.00" }] }, "distance_open_band_missing"],
      [{ weightBands: [] }, "weight_bands_missing"],
      [{ distanceBands: [{ upperKm: "10", addAmount: "3.00" }, { upperKm: null, addAmount: "1.00" }] }, "distance_not_monotonic"],
      [{ weightBands: [{ upperGrams: 5000, addAmount: "2.00" }, { upperGrams: 9000, addAmount: "1.00" }] }, "weight_not_monotonic"],
    ];
    for (const [over, code] of cases) {
      const plan = await svc.createPlan(effy(over), SUB);
      const gap = plan.gaps.find((g) => g.code === code);
      expect(gap, code).toMatchObject({ blocking: true });
      const refused = await refusal(svc.activatePlan(plan.id, {}, SUB));
      expect(refused).toMatchObject({ status: 409, code: "plan_incomplete" });
      expect((refused.extra?.gaps as { code: string }[]).map((g) => g.code)).toContain(code);
    }
    const distance = (await svc.createPlan(effy({ distanceBands: [{ upperKm: "10", addAmount: "3.00" }, { upperKm: null, addAmount: "1.00" }] }), SUB)).gaps[0]!;
    expect(distance.detail).toEqual({ lowerKm: 10, lowerAmount: 3, upperKm: null, upperAmount: 1 });
  });

  it("P7 — a value error is refused at save, naming the field, and nothing is written", async () => {
    const before = (await q(`SELECT count(*)::int AS n FROM public.delivery_fee_plan`))[0];
    expect(await refusal(svc.createPlan(effy({ smallOrderUnderAmount: "90.00", smallOrderFeeAmount: "3.00", freeOverAmount: "80.00" }), SUB))).toMatchObject({
      status: 422, code: "invalid_plan", extra: { fields: [{ field: "smallOrderUnderAmount" }] },
    });
    expect(await refusal(svc.createPlan(courier({ distanceBands: [{ upperKm: null, addAmount: "1.00" }] }), SUB))).toMatchObject({
      status: 422, code: "invalid_plan", extra: { fields: [{ field: "distanceBands" }] },
    });
    expect((await q(`SELECT count(*)::int AS n FROM public.delivery_fee_plan`))[0]).toEqual(before);
  });

  it("a non-blocking gap: a surcharge on a switched-off window is shown, and does not stop activation", async () => {
    const plan = await svc.createPlan(effy({ slotPremiums: [{ slotId: slotOff, addAmount: "2.00" }] }), SUB);
    expect(plan.gaps).toEqual([{ code: "premium_on_disabled_slot", blocking: false, detail: { slotId: slotOff, start: "20:00", end: "21:00" } }]);
    expect(plan.slotPremiums).toEqual([{ slotId: slotOff, label: "20:00–21:00", slotActive: false, addAmount: "2.00" }]);
  });

  it("a $0 minimum needs saying out loud", async () => {
    const plan = await svc.createPlan(effy({ floorAmount: "0.00" }), SUB);
    expect(await refusal(svc.activatePlan(plan.id, {}, SUB))).toMatchObject({ status: 409, code: "zero_floor_unconfirmed" });
    expect((await svc.activatePlan(plan.id, { confirmZeroFloor: true }, SUB)).state).toBe("active");
  });

  it("P8 — two managers activating at once leave exactly one plan in force, and never none", async () => {
    const [a, b, c] = await Promise.all([svc.createPlan(effy(), SUB), svc.createPlan(effy(), SUB), svc.createPlan(effy(), SUB)]);
    await svc.activatePlan(a.id, {}, SUB);

    let watching = true;
    const seen: number[] = [];
    const watcher = (async () => {
      while (watching) seen.push((await q<{ n: number }>(`SELECT count(*)::int AS n FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy'`))[0]!.n);
    })();
    const results = await Promise.allSettled([svc.activatePlan(b.id, {}, SUB), svc.activatePlan(c.id, {}, SUB)]);
    watching = false;
    await watcher;

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([1]));
    const active = await q<{ id: string }>(`SELECT id::text AS id FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy'`);
    expect(active).toHaveLength(1);
    expect([b.id, c.id]).toContain(active[0]!.id);
    // Each activation recorded which plan it retired.
    const log = await q<{ detail: { retired: string } }>(`SELECT detail FROM admin.audit_log WHERE action = 'pricing.plan.activate' AND target_id = ANY($1::uuid[])`, [[b.id, c.id]]);
    expect(log.map((l) => l.detail.retired).sort()).toEqual([a.id, b.id === active[0]!.id ? c.id : b.id].sort());
  });

  it("P9 — a plan that has been active is a record: no edit, no delete, no return — copy it instead", async () => {
    const plan = await svc.createPlan(effy(), SUB);
    await svc.activatePlan(plan.id, {}, SUB);

    const was = await q(`SELECT row_to_json(f)::text AS j FROM public.delivery_fee_plan f WHERE id = $1`, [plan.id]);
    const bands = await q(`SELECT upper_km, add_amount FROM public.delivery_distance_band WHERE plan_id = $1 ORDER BY upper_km`, [plan.id]);
    expect(await refusal(svc.replaceDraft(plan.id, effy({ baseAmount: "0.00" }), SUB))).toMatchObject({ status: 409, code: "plan_not_draft" });
    // The refused write changed nothing — not the plan, not its bands.
    expect(await q(`SELECT row_to_json(f)::text AS j FROM public.delivery_fee_plan f WHERE id = $1`, [plan.id])).toEqual(was);
    expect(await q(`SELECT upper_km, add_amount FROM public.delivery_distance_band WHERE plan_id = $1 ORDER BY upper_km`, [plan.id])).toEqual(bands);

    // Replaced, it is retired — and is not brought back.
    const next = await svc.createPlan(effy(), SUB);
    await svc.activatePlan(next.id, {}, SUB);
    expect((await svc.listPlans("effy")).items.find((p) => p.id === plan.id)?.state).toBe("retired");
    expect(await refusal(svc.activatePlan(plan.id, {}, SUB))).toMatchObject({ status: 409, code: "plan_retired" });
    expect(await refusal(svc.activatePlan(next.id, {}, SUB))).toMatchObject({ status: 409, code: "plan_already_active" });

    // A draft, by contrast, is replaced whole.
    const draft = await svc.createPlan(effy({ baseAmount: "1.00" }), SUB);
    expect((await svc.replaceDraft(draft.id, effy({ name: draft.name, baseAmount: "2.00", weightBands: [] }), SUB))).toMatchObject({
      baseAmount: "2.00", weightBands: [],
    });
  });

  it("P24 — every write leaves one audit row with what it was and what it became", async () => {
    const draft = await svc.createPlan(effy({ baseAmount: "1.00" }), SUB);
    await svc.replaceDraft(draft.id, effy({ name: draft.name, baseAmount: "2.50" }), SUB);
    const rows = await q<{ action: string; actor_sub: string; detail: { before: { baseAmount: string } | null; after: { baseAmount: string } } }>(
      `SELECT action, actor_sub, detail FROM admin.audit_log WHERE target_id = $1 ORDER BY created_at`,
      [draft.id],
    );
    expect(rows.map((r) => [r.action, r.actor_sub, r.detail.before?.baseAmount ?? null, r.detail.after.baseAmount])).toEqual([
      ["pricing.plan.create", SUB, null, "1.00"],
      ["pricing.plan.update", SUB, "1.00", "2.50"],
    ]);
  });

  it("duplicate names are refused by name", async () => {
    await svc.createPlan(effy({ name: "Taken" }), SUB);
    expect(await refusal(svc.createPlan(effy({ name: "Taken" }), SUB))).toMatchObject({ status: 409, code: "duplicate_name" });
  });

  it("P11 — the simulator's fee for the active plan is the fee a real basket is quoted, over a table", async () => {
    const plan = await svc.createPlan(
      effy({ freeOverAmount: "80.00", smallOrderUnderAmount: "20.00", smallOrderFeeAmount: "3.00", slotPremiums: [{ slotId: slotEvening, addAmount: "2.00" }] }),
      SUB,
    );
    await svc.activatePlan(plan.id, {}, SUB);
    const shop = (await q<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('SIM', 'Sim') RETURNING id::text AS id`))[0]!.id;

    for (const postcode of ["3121", "3220"])
      for (const grams of [500, 6000, 50000])
        for (const basket of [1500, 5000, 8000]) {
          const sim = await svc.simulate({ planId: null, postcode, grams, basketAmount: (basket / 100).toFixed(2), slotId: null, windowIsToday: false });
          const real = await quote(pool, null, postcode, [{ shopId: shop, grams }], new Date(), basket);
          if (!real.serviced || real.coverage !== "effy") throw new Error("expected serviced");
          expect(sim.fee!.totalAmount, `${postcode} ${grams}g $${basket / 100}`).toBe((real.baseFee.totalCents / 100).toFixed(2));
          expect(sim.plan).toMatchObject({ id: plan.id, state: "active" });
        }

    // With the evening window today: the today premium and the window's own.
    const today = await svc.simulate({ planId: null, postcode: "3121", grams: 500, basketAmount: "50.00", slotId: slotEvening, windowIsToday: true });
    // ⚠ $3 base is held up to the $4 minimum; with $5 of surcharges it is $8. The window ADDED $4,
    // and that is the line — never a nominal $5 that would make the lines sum to more than is charged.
    expect(today.fee).toEqual({ lines: [{ kind: "delivery", amount: "4.00" }, { kind: "window_surcharge", amount: "4.00" }], totalAmount: "8.00" });
    expect(today.steps.map((s) => s.label)).toEqual(["Base", "Distance", "Weight", "Window surcharge", "Total"]);
  });

  it("P12 — simulating writes nothing anywhere, and announces nothing", async () => {
    const counts = async () =>
      q(`SELECT relname, n_tup_ins + n_tup_upd + n_tup_del AS writes FROM pg_stat_user_tables ORDER BY relname`).then((r) => JSON.stringify(r));
    const draft = await svc.createPlan(effy({ baseAmount: "9.00" }), SUB);
    holder.announced.length = 0;
    await pool.query(`SELECT pg_stat_clear_snapshot()`);
    const before = await counts();
    const sim = await svc.simulate({ planId: draft.id, postcode: "3121", grams: 500, basketAmount: "50.00", slotId: null, windowIsToday: false });
    expect(sim.plan).toMatchObject({ id: draft.id, state: "draft" });
    expect(sim.fee!.totalAmount).toBe("9.00");
    await pool.query(`SELECT pg_stat_clear_snapshot()`);
    expect(await counts()).toBe(before);
    expect(holder.announced).toEqual([]);
  });

  it("the simulator says plainly where Effy does not deliver, and refuses a plan of the wrong kind", async () => {
    expect(await svc.simulate({ planId: null, postcode: "7000", grams: 500, basketAmount: "50.00", slotId: null, windowIsToday: false })).toMatchObject({
      coverage: "none", fee: null, note: "Effy does not deliver to 7000, and no courier does either.",
    });
    expect(await refusal(svc.simulate({ planId: null, postcode: "9999", grams: 1, basketAmount: "1.00", slotId: null, windowIsToday: false }))).toMatchObject({ code: "unknown_postcode" });
    const c = await svc.createPlan(courier(), SUB);
    expect(await refusal(svc.simulate({ planId: c.id, postcode: "3121", grams: 1, basketAmount: "1.00", slotId: null, windowIsToday: false }))).toMatchObject({ code: "plan_kind_mismatch" });
  });

  it("courier: its own table, priced by weight alone, never free on Effy's amount — and one active per kind", async () => {
    const effyActive = (await q<{ id: string }>(`SELECT id::text AS id FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy'`))[0]!.id;
    const c = await svc.createPlan(courier({ weightBands: [{ upperGrams: 5000, addAmount: "0.00" }, { upperGrams: 30000, addAmount: "4.25" }] }), SUB);
    expect(c.gaps).toEqual([]);
    await svc.activatePlan(c.id, {}, SUB);
    // The Effy plan is untouched by a courier activation.
    expect((await q(`SELECT id::text AS id FROM public.delivery_fee_plan WHERE is_active ORDER BY kind`)).map((r) => r.id).sort()).toEqual([c.id, effyActive].sort());

    const sim = (grams: number, basket: string) =>
      svc.simulate({ planId: null, postcode: "3121", grams, basketAmount: basket, slotId: null, windowIsToday: false, forceKind: "courier" });
    expect((await sim(1000, "50.00")).fee!.totalAmount).toBe("9.00");
    expect((await sim(9000, "50.00")).fee!.totalAmount).toBe("13.50");
    // Effy's plan has free delivery over $80; a courier order of $500 is still charged.
    expect((await sim(9000, "500.00")).fee!.totalAmount).toBe("13.50");
    expect((await sim(9000, "50.00")).note).toBe("3121 is delivered by Effy; this is what a courier would cost.");
  });

  it("P19 / 080 — courier goes on only with a fee table AND a default courier service, and is offered from then", async () => {
    await pool.query(`UPDATE public.delivery_fee_plan SET is_active = false WHERE kind = 'courier'`);
    expect(await refusal(coverage.setCourier({ offered: true }, SUB))).toMatchObject({ status: 409, code: "courier_plan_missing" });
    expect((await q(`SELECT courier_offered FROM public.delivery_settings WHERE id = 1`))[0]).toEqual({ courier_offered: false });

    const c = await svc.createPlan(courier(), SUB);
    await svc.activatePlan(c.id, {}, SUB);
    // A price, and no courier service to tell the customer a timeframe from.
    expect(await refusal(coverage.setCourier({ offered: true }, SUB))).toMatchObject({ status: 409, code: "courier_service_missing" });
    expect((await coverage.list({})).courier).toMatchObject({ blockedBy: ["no_service"], canBeOffered: false, defaultService: null });

    const service = await services.create({
      courierName: "Test Courier", serviceName: "Parcel", estimateText: "2–4 business days", maxBusinessDays: 4,
      pickupWeekdays: [1, 2, 3, 4, 5], pickupCutoff: "14:00", collectsFromSupplier: true, isDefault: true,
    }, SUB);
    expect(await coverage.setCourier({ offered: true }, SUB)).toMatchObject({ offered: true });
    // ⚠ ON AND READY IS OFFERED (083): there is one delivery model, so nothing is "pending" on a switch.
    expect((await coverage.list({})).courier).toMatchObject({
      offered: true, blockedBy: [], canBeOffered: true, pending: false,
      defaultService: { id: service.id, label: "Test Courier · Parcel", estimateText: "2–4 business days" },
    });
    expect((await coverage.check("7000")).matches[0]).toMatchObject({ coverage: "courier", reason: "courier_offered" });
    await coverage.setCourier({ offered: false }, SUB);
    await pool.query(`DELETE FROM public.courier_service`);
  });
});

/**
 * P23 — who may do what (FR-022). `guard()` decides from the `admin.staff` record: "read" admits a
 * customer-service agent, "mutate" only an admin or a manager. What can go wrong is a write route
 * asking for "read" — so every plan handler's level is held to its verb. ⚠ The simulator is a POST
 * that changes nothing, and is the one POST a csa may use.
 */
/** P9 — nothing in the admin service can delete a fee plan, or change one but through `savePlan`. */
describe("077 — P9: an activated plan is changed or deleted by nothing", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = ["pricing.repository.ts", "pricing.service.ts", "repository.ts", "service.ts", "coverage.repository.ts"]
    .map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");

  it("no statement deletes a plan or its bands except the draft replace", () => {
    expect(src).not.toMatch(/DELETE FROM public\.delivery_fee_plan/);
    const bandDeletes = src.match(/DELETE FROM public\.delivery_(distance|weight)_band/g) ?? [];
    expect(bandDeletes).toHaveLength(2); // savePlan's replace of a DRAFT, after its activated_at check
  });

  it("the one UPDATE of a plan's prices sits behind the activated check", () => {
    const repo = readFileSync(resolve(dir, "pricing.repository.ts"), "utf8");
    const check = repo.indexOf("if (row.activated_at) throw");
    const update = repo.indexOf("UPDATE public.delivery_fee_plan");
    expect(check).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(check);
    expect(repo.match(/UPDATE public\.delivery_fee_plan/g)).toHaveLength(1);
  });
});

describe("077 — P23: every plan route asks for the right level", () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../functions");
  const handlers = readdirSync(dir).filter((f) => f.startsWith("delivery-plan") && f.endsWith(".ts"));

  it("found them", () => {
    expect(handlers.sort()).toEqual([
      "delivery-plan-activate-v1-post.ts", "delivery-plan-update-v1-put.ts", "delivery-plans-create-v1-post.ts",
      "delivery-plans-list-v1-get.ts", "delivery-plans-simulate-v1-post.ts",
    ]);
  });

  it.each(handlers)("%s", (file) => {
    const src = readFileSync(resolve(dir, file), "utf8");
    const level = /guard\(event, scope, "(read|mutate)"\)/.exec(src)?.[1];
    const reads = file.endsWith("-get.ts") || file.includes("-simulate-");
    expect(level).toBe(reads ? "read" : "mutate");
    expect(src.indexOf("guard(event")).toBeLessThan(src.indexOf("try {"));
  });
});
