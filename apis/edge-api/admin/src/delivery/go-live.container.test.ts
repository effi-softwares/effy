import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 083 — the delivery-model switch against the REAL schema: refused while the platform is not ready
 * (P2), set / changed / cancelled / turned back off with its trail (P3), and the sweep that stops a
 * scheduled switch the platform is no longer ready for (P4).
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...(await importOriginal<typeof import("@effy/edge-shared")>()),
    query,
    pooled: { query },
    emitMetric: () => undefined,
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
vi.mock("@effy/edge-shared/live", () => ({ announce: async () => undefined }));

import { migrationSql } from "@effy/edge-shared";

import { readGoLive, setSwitch, sweep } from "./go-live.service";

const RUN = process.env.CONTAINER_TESTS === "1";
const ADMIN = "admin-sub";
const MANAGER = "manager-sub";
const PLAN = "00000000-0000-0000-0000-0000000083b1";
let container: StartedPostgreSqlContainer;
let pool: Pool;

const NOW = new Date("2026-11-02T01:00:00Z");
const later = (min: number) => new Date(NOW.getTime() + min * 60_000);
const stored = async () => (await pool.query(`SELECT delivery_model_v2_from AS at, public.delivery_model_v2_at($1) AS on FROM public.delivery_settings WHERE id = 1`, [NOW])).rows[0] as { at: Date | null; on: boolean };
const trail = async () => (await pool.query(`SELECT action, actor_sub, detail FROM admin.audit_log WHERE target_type = 'delivery_model' ORDER BY created_at, id`)).rows as { action: string; actor_sub: string; detail: Record<string, unknown> }[];
const refusal = (p: Promise<unknown>) =>
  p.then(() => null, (e: { status?: number; code?: string; extra?: { items?: { key: string }[] } }) => ({ status: e.status, code: e.code, items: e.extra?.items?.map((i) => i.key) }));

describe.skipIf(!RUN)("083 — the delivery-model switch", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    await pool.query(`
      DELETE FROM public.delivery_fee_plan; DELETE FROM public.delivery_zone_postcode; DELETE FROM public.delivery_slot;
      DELETE FROM public.delivery_collection_run; DELETE FROM public.courier_service;
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test')
        ON CONFLICT (id) DO UPDATE SET courier_offered = false;
      INSERT INTO admin.staff (cognito_sub, email, name) VALUES ('${ADMIN}', 'ada@example.test', 'Ada'), ('${MANAGER}', 'max@example.test', 'Max');
      INSERT INTO admin.staff_role (staff_id, role_key) SELECT id, CASE cognito_sub WHEN '${ADMIN}' THEN 'admin' ELSE 'manager' END FROM admin.staff;
      INSERT INTO public.delivery_zone_postcode (postcode, distance_km, distance_source, added_by) VALUES ('3121', 4, 'manual', 't');
      INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN}', 'effy', 'Launch plan', true, 5.00, 0.50, 4.00, 60.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN}', NULL, 0.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN}', 100000, 0.00);
      INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('16:00', '18:00', '14:00', 20, 'test');
      INSERT INTO public.delivery_collection_run (run_time, status, updated_by) VALUES ('14:00', 'active', 'test');`);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = NULL WHERE id = 1; DELETE FROM admin.audit_log WHERE target_type = 'delivery_model';
                      UPDATE public.delivery_slot SET status = 'active';`);
  });

  it("⚠ P2 — refused while a required item is not ready: nothing stored, nothing audited, the items named", async () => {
    await pool.query(`UPDATE public.delivery_slot SET status = 'disabled'`);
    expect(await refusal(setSwitch({ at: "now", expected: null }, ADMIN, NOW))).toEqual({ status: 409, code: "not_ready", items: ["windows"] });
    expect(await refusal(setSwitch({ at: later(600).toISOString(), expected: null }, ADMIN, NOW))).toMatchObject({ code: "not_ready" });
    expect((await stored()).at).toBeNull();
    expect(await trail()).toEqual([]);
  });

  it("⚠ P2 — only an administrator: a manager is refused even when everything is ready", async () => {
    expect(await refusal(setSwitch({ at: "now", expected: null }, MANAGER, NOW))).toMatchObject({ status: 403 });
    expect(await refusal(setSwitch({ at: "now", expected: null }, "nobody", NOW))).toMatchObject({ status: 403 });
    expect((await stored()).at).toBeNull();
  });

  it("P3 — schedule, change, cancel: each stored, each on the trail with who and from → to", async () => {
    const a = await setSwitch({ at: later(600).toISOString(), expected: null }, ADMIN, NOW);
    expect(a).toMatchObject({ state: "scheduled", at: later(600).toISOString(), setBy: "Ada", canTurnBack: false });
    expect((await stored()).on).toBe(false); // ⚠ scheduled is not on

    const b = await setSwitch({ at: later(900).toISOString(), expected: a.at }, ADMIN, NOW);
    expect(b).toMatchObject({ state: "scheduled", at: later(900).toISOString() });

    const c = await setSwitch({ at: null, expected: b.at }, ADMIN, NOW);
    expect(c).toMatchObject({ state: "off", at: null, setBy: null });

    const t = await trail();
    expect(t.map((r) => r.action)).toEqual(["delivery.model_switch_set", "delivery.model_switch_changed", "delivery.model_switch_cancelled"]);
    expect(t.every((r) => r.actor_sub === ADMIN)).toBe(true);
    expect(t[1]!.detail).toMatchObject({ from: later(600).toISOString(), to: later(900).toISOString() });
    const page = await readGoLive(NOW);
    expect(page.history.map((h) => [h.action, h.by])).toEqual([["cancelled", "Ada"], ["changed", "Ada"], ["set", "Ada"]]);
    expect(page.legacy).toBeNull(); // off: no old-order count to show
  });

  it("P3 — now means now; a moment already past is recorded as now; turning back off needs a reason", async () => {
    const on = await setSwitch({ at: new Date(NOW.getTime() - 3_600_000).toISOString(), expected: null }, ADMIN, NOW);
    expect(on).toMatchObject({ state: "on", at: NOW.toISOString(), canTurnBack: true });
    expect((await stored()).on).toBe(true);
    expect((await readGoLive(NOW)).legacy).toEqual({ open: 0, lastClosedAt: null, alertAfterDays: 7 });

    expect(await refusal(setSwitch({ at: null, expected: on.at }, ADMIN, NOW))).toMatchObject({ status: 400, code: "validation_failed" });
    expect((await stored()).on).toBe(true);
    const off = await setSwitch({ at: null, expected: on.at, reason: "  drivers not briefed  " }, ADMIN, NOW);
    expect(off.state).toBe("off");
    expect((await trail()).at(-1)).toMatchObject({ action: "delivery.model_switch_turned_off", detail: { reason: "drivers not briefed" } });
  });

  it("⚠ P3 — two admins at once: the second acts on a stale value and is told, nothing overwritten", async () => {
    const a = await setSwitch({ at: later(600).toISOString(), expected: null }, ADMIN, NOW);
    expect(await refusal(setSwitch({ at: later(60).toISOString(), expected: null }, ADMIN, NOW))).toMatchObject({ status: 409, code: "changed" });
    expect((await stored()).at?.toISOString()).toBe(a.at);
    expect(await trail()).toHaveLength(1);
  });

  it("⚠ P4 — the sweep clears a scheduled switch the platform is no longer ready for, only when the moment is near", async () => {
    const a = await setSwitch({ at: later(600).toISOString(), expected: null }, ADMIN, NOW);
    await pool.query(`UPDATE public.delivery_slot SET status = 'disabled'`);

    // Ten hours out: reported, not touched — there is time to fix it.
    expect(await sweep(NOW)).toMatchObject({ state: "scheduled", ready: false, blocked: false });
    expect((await stored()).at?.toISOString()).toBe(a.at);

    // Eight minutes out: cleared, and the trail says the platform did it and why.
    expect(await sweep(later(592))).toMatchObject({ state: "scheduled", ready: false, blocked: true });
    expect((await stored()).at).toBeNull();
    expect((await trail()).at(-1)).toMatchObject({ action: "delivery.model_switch_blocked", actor_sub: "system:delivery-model-sweep", detail: { items: ["windows"] } });
    expect((await readGoLive(NOW)).history[0]).toMatchObject({ action: "blocked", by: "The platform" });
    expect(await sweep(later(593))).toMatchObject({ state: "off" });
  });

  it("⚠ P4 — a moment that has PASSED is never undone by the sweep, ready or not; ready and near is left alone", async () => {
    const a = await setSwitch({ at: later(5).toISOString(), expected: null }, ADMIN, NOW);
    expect(await sweep(NOW)).toMatchObject({ state: "scheduled", ready: true, blocked: false });
    await pool.query(`UPDATE public.delivery_slot SET status = 'disabled'`);
    expect(await sweep(later(6))).toMatchObject({ state: "on", blocked: false, legacyOpen: 0, legacyPastDue: 0 });
    expect((await stored()).at?.toISOString()).toBe(a.at);
  });
});
