import { execFileSync, spawnSync } from "node:child_process";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationsDir } from "../lib/load-migrations";

/**
 * 077 P15 — the fee engine's migration, applied by GOOSE ITSELF.
 *
 * ⚠ WHY THIS EXISTS BESIDE `fee.container.test.ts`. Every other container test reads a migration as
 * text and runs its Up half; none of them runs goose. This migration is the first to ask the
 * operator for a value (`-- +goose ENVSUB ON`), and with substitution on, goose rewrites `$` — the
 * character every function body is quoted with. The text loader cannot see either thing: it
 * substitutes nothing and rewrites nothing. So the only proof that the operator's command works —
 * that the variable arrives, that an unset one stops the migration, and that the `$$` bodies beside
 * the substituted statement survive — is to run the real binary against a real database.
 *
 * Skipped, loudly, where goose is not installed.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const HAS_GOOSE = spawnSync("goose", ["-version"]).status === 0;
const d = RUN && HAS_GOOSE ? describe : describe.skip;

const BEFORE_077 = "20261008114600"; // 076 — the last migration before the fee engine
const PLAN = "00000000-0000-0000-0000-0000000000d1";
const RING = "00000000-0000-0000-0000-0000000000f1";

if (RUN && !HAS_GOOSE) {
  // eslint-disable-next-line no-console
  console.warn("077 P15 (goose) SKIPPED: `goose` is not on PATH — brew install goose. The ENVSUB path is unproven on this machine.");
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let dsn: string;

function goose(args: string[], env: Record<string, string | undefined> = {}): { ok: boolean; output: string } {
  const res = spawnSync("goose", ["-dir", migrationsDir(), "postgres", dsn, ...args], {
    env: { ...process.env, EFFY_TODAY_PREMIUM: undefined, ...env } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { ok: res.status === 0, output: `${res.stdout}\n${res.stderr}` };
}

d("077 — the migration as the operator runs it (goose, with the variable)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    dsn = `${container.getConnectionUri()}?sslmode=disable`;
    pool = new Pool({ connectionString: container.getConnectionUri() });

    execFileSync("goose", ["-dir", migrationsDir(), "postgres", dsn, "up-to", BEFORE_077], { stdio: "pipe" });

    await pool.query(`DELETE FROM public.delivery_fee_plan`);
    await pool.query(`
      INSERT INTO public.delivery_ring (id, code, name, ordinal, suggest_upper_km, updated_by)
        VALUES ('${RING}', 'G-ALL', 'Everywhere', 9001, NULL, 'test')
        ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_fee_plan (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by)
        VALUES ('${PLAN}', 'Live plan', true, 0.50, 4.00, 60.00, 1.800, 1.000, 'test');
      INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount)
        SELECT '${PLAN}', id, 6.00 FROM public.delivery_ring WHERE status = 'active';
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${PLAN}', 2000, 0.00);
    `);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const hasKind = async () =>
    ((await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_fee_plan' AND column_name = 'kind'`)).rowCount ?? 0) > 0;

  it("without EFFY_TODAY_PREMIUM it stops, says what to run, and applies nothing", async () => {
    const res = goose(["up-by-one"]);
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/EFFY_TODAY_PREMIUM is not set/);
    expect(await hasKind()).toBe(false);
  });

  it("an amount off the plan's rounding step is refused too", async () => {
    const res = goose(["up-by-one"], { EFFY_TODAY_PREMIUM: "0.30" });
    expect(res.ok).toBe(false);
    expect(res.output).toMatch(/multiple of the active plan's rounding step/);
    expect(await hasKind()).toBe(false);
  });

  it("with it, the migration applies and the amount lands on the active plan", async () => {
    const res = goose(["up-by-one"], { EFFY_TODAY_PREMIUM: "3.00" });
    expect(res.output, res.output).not.toMatch(/ERROR|error:/);
    expect(res.ok).toBe(true);
    const plan = await pool.query<{ premium: string }>(`SELECT today_premium_amount::text AS premium FROM public.delivery_fee_plan WHERE id = '${PLAN}'`);
    expect(plan.rows[0]!.premium).toBe("3.00");
  });

  it("the dollar-quoted function bodies beside the substituted statement survived", async () => {
    // Created before and after the ENVSUB statement respectively; each has a `$$` body.
    expect((await pool.query<{ ok: boolean }>(`SELECT public.delivery_plan_is_complete('${PLAN}') AS ok`)).rows[0]!.ok).toBe(true);
    await expect(pool.query(`UPDATE public.delivery_fee_plan SET base_amount = 1 WHERE id = '${PLAN}'`)).resolves.toBeDefined();
    // The helper the migration used to read the variable is gone again.
    expect((await pool.query(`SELECT 1 FROM pg_proc WHERE proname = '_077_today_premium'`)).rowCount).toBe(0);
  });
});
