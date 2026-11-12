import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { activityEntries, migrationSql } from "@effy/edge-shared/testing";

import { housekeepingActivitySource } from "./activity";
import { HousekeepingForbidden, HousekeepingSettingsChanged, readHousekeeping, updateHousekeepingSettings } from "./service";

/** 113 US5: the Clean-ups page reads the runs `recordRun` wrote, and only an administrator changes the abandon time. */
const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("113 - the clean-ups, for back-office", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let transact: Transactor;

  const run = (job: string, minutesAgo: number, outcome: string, counts: Record<string, number>, problem: string | null = null) =>
    pool.query(
      `INSERT INTO public.housekeeping_run (job, started_at, finished_at, outcome, counts, problem)
       VALUES ($1, now() - ($2 || ' minutes')::interval, now() - ($2 || ' minutes')::interval + interval '3 seconds', $3, $4::jsonb, $5)`,
      [job, String(minutesAgo), outcome, JSON.stringify(counts), problem],
    );

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    await pool.query(`INSERT INTO admin.staff (cognito_sub, email, name) VALUES ('adm-1', 'a@effyshopping.com', 'Ada Admin')`);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("before any run: every job late, the default abandon time", async () => {
    const h = await readHousekeeping(pool, new Date(), false);
    expect(h.abandonAfterMinutes).toBe(1440);
    expect(h.mayEdit).toBe(false);
    expect(h.jobs.map((j) => [j.job, j.lastRun, j.attention])).toEqual([
      ["unpaid_orders", null, "late"],
      ["account_erasure", null, "late"],
      ["phone_registrations", null, "late"],
    ]);
  });

  it("shows each job's latest run, and marks a failed or partial one", async () => {
    await run("unpaid_orders", 40, "ok", { closed: 2 });
    await run("unpaid_orders", 10, "ok", { closed: 14 });
    await run("account_erasure", 30, "partial", { erased: 1, retried: 1 }, "sign-in: TooManyRequestsException");
    await run("phone_registrations", 60, "failed", {}, "run: Error");

    const h = await readHousekeeping(pool, new Date(), true);
    const byJob = Object.fromEntries(h.jobs.map((j) => [j.job, j]));
    expect(byJob.unpaid_orders!.lastRun?.counts).toEqual({ closed: 14 });
    expect(byJob.unpaid_orders!.attention).toBeNull();
    expect(byJob.account_erasure!.attention).toBe("partial");
    expect(byJob.phone_registrations!.attention).toBe("failed");
  });

  it("only an administrator changes the abandon time, against the version read", async () => {
    const before = await readHousekeeping(pool, new Date(), true);
    await expect(
      transact((tx) => updateHousekeepingSettings(tx, "adm-1", { abandonAfterMinutes: 720, version: before.version }, false)),
    ).rejects.toBeInstanceOf(HousekeepingForbidden);
    await expect(
      transact((tx) => updateHousekeepingSettings(tx, "adm-1", { abandonAfterMinutes: 720, version: "2000-01-01T00:00:00.000Z" }, true)),
    ).rejects.toBeInstanceOf(HousekeepingSettingsChanged);

    expect(await transact((tx) => updateHousekeepingSettings(tx, "adm-1", { abandonAfterMinutes: 720, version: before.version }, true))).toBe(true);
    expect((await readHousekeeping(pool, new Date(), true)).abandonAfterMinutes).toBe(720);
  });

  it("the activity says each run, each late refund and each change, and names no customer", async () => {
    const tag = `hk-${Date.now()}`;
    const customer = (
      await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [
        tag,
        `${tag}@example.test`,
      ])
    ).rows[0]!.id;
    const order = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address)
         VALUES ($1, 'EFY-HKLATE', 'abandoned', 40, 40, '{}'::jsonb) RETURNING id::text AS id`,
        [customer],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind) VALUES ($1, 'unplaced', 40, 'order_abandoned', 'unplaced:pi_hk', 'system')`,
      [order],
    );

    const log = await activityEntries(pool, housekeepingActivitySource());
    const titles = log.map((e) => e.title);
    expect(titles).toContain("Unpaid orders worked");
    expect(titles).toContain("Account erasure partly worked");
    expect(titles).toContain("Phone registrations failed");
    expect(titles).toContain("Refunded $40.00 paid after order EFY-HKLATE was closed");
    expect(log.find((e) => e.title === "Abandon time changed")).toMatchObject({ detail: "24 hours → 12 hours", actor: "Ada Admin" });
    expect(log.find((e) => e.title === "Unpaid orders worked" && e.detail?.includes("14"))?.detail).toBe("Closed 14 unpaid orders");
    expect(JSON.stringify(log)).not.toContain(tag);
  });
});
