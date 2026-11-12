import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import { readAbandonAfterMinutes, recordRun } from "./housekeeping";

/** 113: every clean-up leaves exactly one run row, and a failure never stores an error's message. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const quiet = { announce: async () => undefined, emit: () => undefined };
const last = async () =>
  (
    await pool.query<{ job: string; outcome: string; counts: Record<string, number>; problem: string | null }>(
      `SELECT job, outcome, counts, problem FROM public.housekeeping_run ORDER BY started_at DESC, finished_at DESC LIMIT 1`,
    )
  ).rows[0];

d("113 - recordRun", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("records an ok run with its counts", async () => {
    await recordRun("unpaid_orders", async () => ({ counts: { closed: 3 }, problems: [] }), { q: pool, ...quiet });
    expect(await last()).toEqual({ job: "unpaid_orders", outcome: "ok", counts: { closed: 3 }, problem: null });
  });

  it("a run with problems is partial, and says them", async () => {
    await recordRun("account_erasure", async () => ({ counts: { erased: 1, retried: 1 }, problems: ["cognito: TooManyRequests"] }), {
      q: pool,
      ...quiet,
    });
    expect(await last()).toMatchObject({ outcome: "partial", problem: "cognito: TooManyRequests" });
  });

  it("a throw is recorded as failed with the error's class only, then rethrown", async () => {
    class SecretLeak extends Error {}
    await expect(
      recordRun("phone_registrations", async () => {
        throw new SecretLeak("jane@example.test lives at 1 Main St");
      }, { q: pool, ...quiet }),
    ).rejects.toBeInstanceOf(SecretLeak);
    const row = await last();
    expect(row).toMatchObject({ job: "phone_registrations", outcome: "failed", problem: "run: Error" });
    expect(JSON.stringify(row)).not.toContain("jane");
  });

  it("tells back-office after each run", async () => {
    const told: unknown[] = [];
    await recordRun("unpaid_orders", async () => ({ counts: {}, problems: [] }), {
      q: pool,
      emit: () => undefined,
      announce: async (c) => void told.push(...c),
    });
    expect(told).toEqual([{ scope: "ops", kind: "housekeeping" }]);
  });

  it("reads the seeded abandon time", async () => {
    expect(await readAbandonAfterMinutes(pool)).toBe(1440);
  });
});
