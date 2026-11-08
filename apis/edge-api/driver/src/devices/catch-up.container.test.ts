import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import { catchUpNotice } from "./catch-up";

/** 110 R11 / FR-031 - the catch-up notice, against real PostgreSQL. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const TZ = "Australia/Melbourne";
const SUB = "sub-catch-up";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let driverId: string;
let waveId: string;
let seq = 0;

/** A run for the driver, its deadline `hoursFromNow` away (still today on Effy's clock for small numbers). */
async function run(status = "planned", deadline = "now() + interval '1 minute'") {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO public.driver_round (wave_id, driver_id, kind, status, deadline_at) VALUES ($1, $2, 'delivery', $3, ${deadline}) RETURNING id`,
    [waveId, driverId, status],
  );
  return r.rows[0]!.id;
}

/** A run_assigned for the driver, its push ending `status`, created `when`. */
async function assigned(status: "no_device" | "sent", when = "now()") {
  const scope = `r-${++seq}`;
  await transact((tx) => notify(tx, { type: "run_assigned", recipients: [{ sub: SUB }], subject: { entityId: scope }, dedupeScope: scope, channels: ["push"] }));
  await pool.query(
    `UPDATE public.notification_delivery d SET status = $2
       FROM public.notification n WHERE n.id = d.notification_id AND n.dedupe_key LIKE $1`,
    [`%:${scope}`, status],
  );
  await pool.query(`UPDATE public.notification SET created_at = ${when} WHERE dedupe_key LIKE $1`, [`%:${scope}`]);
}

const notices = async () =>
  (await pool.query(`SELECT title, importance, pinned_until, destination FROM public.notification WHERE recipient_sub = $1 AND type = 'driver_runs_today'`, [SUB])).rows;

d("driver catch-up notice (110)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE public.notification_delivery, public.notification, public.round_stop, public.driver_round, public.dispatch_wave, public.driver CASCADE");
    driverId = (await pool.query<{ id: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'Catch Up', 'catch-up@effyshopping.com') RETURNING id`,
      [SUB],
    )).rows[0]!.id;
    waveId = (await pool.query<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ('delivery', now(), 'schedule') RETURNING id`)).rows[0]!.id;
  });

  it("an assignment that found no phone, and two runs left today: one pinned notice saying 2", async () => {
    await assigned("no_device");
    await run();
    await run("in_progress");
    expect(await transact((tx) => catchUpNotice(tx, SUB, TZ))).toEqual({ created: 1, runs: 2 });
    const [n] = await notices();
    expect(n).toMatchObject({ title: "You have 2 runs today", importance: "important", destination: { kind: "today" } });
    const endOfDay = (await pool.query(`SELECT (((now() AT TIME ZONE $1)::date + 1)::timestamp AT TIME ZONE $1) AS e`, [TZ])).rows[0].e;
    expect(new Date(n.pinned_until).getTime()).toBe(new Date(endOfDay).getTime());
  });

  it("only once a day, however many times they sign in", async () => {
    await assigned("no_device");
    await run();
    await transact((tx) => catchUpNotice(tx, SUB, TZ));
    expect((await transact((tx) => catchUpNotice(tx, SUB, TZ))).created).toBe(0);
    expect(await notices()).toHaveLength(1);
  });

  it("nothing when their phone was told", async () => {
    await assigned("sent");
    await run();
    expect((await transact((tx) => catchUpNotice(tx, SUB, TZ))).created).toBe(0);
  });

  it("nothing when no run is left, and the count leaves out runs done or taken away", async () => {
    await assigned("no_device");
    await run("completed");
    await run("cancelled");
    expect(await transact((tx) => catchUpNotice(tx, SUB, TZ))).toEqual({ created: 0, runs: 0 });
  });

  it("nothing for yesterday's missed push", async () => {
    await assigned("no_device", "now() - interval '2 days'");
    await run();
    expect((await transact((tx) => catchUpNotice(tx, SUB, TZ))).created).toBe(0);
  });

  it("a run on another day is not counted", async () => {
    await assigned("no_device");
    await run();
    await run("planned", "now() + interval '3 days'");
    expect((await transact((tx) => catchUpNotice(tx, SUB, TZ))).runs).toBe(1);
  });
});
