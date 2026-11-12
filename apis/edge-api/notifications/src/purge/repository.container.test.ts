import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import { pruneRegistrations, purge, purgeRuns } from "./repository";

/** 109 US7 - retention cut-offs and an erased customer, against real PostgreSQL. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;
const NOW = new Date("2026-11-07T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** A notification for `sub`, created `age` days ago, with a push delivery created `deliveryAge` days ago. */
async function notification(sub: string, type: "order_paid" | "run_assigned" | "shop_new_order", age: number, deliveryAge = age) {
  await transact((tx) => notify(tx, { type, recipients: [{ sub }], subject: { entityId: `e-${++seq}` }, dedupeScope: `s-${seq}`, channels: ["push"] }));
  const id = (await pool.query<{ id: string }>(`SELECT id FROM public.notification WHERE recipient_sub = $1 ORDER BY created_at DESC LIMIT 1`, [sub])).rows[0]!.id;
  await pool.query(`UPDATE public.notification SET created_at = $2 WHERE id = $1`, [id, daysAgo(age)]);
  await pool.query(`UPDATE public.notification_delivery SET created_at = $2 WHERE notification_id = $1`, [id, daysAgo(deliveryAge)]);
  return id;
}
const exists = async (id: string) => (await pool.query(`SELECT 1 FROM public.notification WHERE id = $1`, [id])).rowCount === 1;
const deliveriesOf = async (id: string) => (await pool.query(`SELECT 1 FROM public.notification_delivery WHERE notification_id = $1`, [id])).rowCount;
const run = () => purge(pool, NOW, Number.POSITIVE_INFINITY);

d("notification purge (109)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE public.notification_delivery, public.notification, public.customer_closure_request, public.customer, public.message CASCADE");
  });

  it("113: a phone registration not confirmed for 270 days goes; a fresher one stays", async () => {
    await pool.query(`DELETE FROM public.device_token`);
    await pool.query(
      `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token, last_seen_at) VALUES
         ('old', 'customer', 'android', 'tok-old', $1), ('fresh', 'driver', 'ios', 'tok-fresh', $2), ('web', 'shop', 'web', 'tok-web', $3)`,
      [daysAgo(271), daysAgo(269), daysAgo(400)],
    );
    expect(await pruneRegistrations(pool, NOW, Number.POSITIVE_INFINITY)).toBe(2);
    const left = await pool.query<{ fcm_token: string }>(`SELECT fcm_token FROM public.device_token`);
    expect(left.rows.map((r) => r.fcm_token)).toEqual(["tok-fresh"]);
  });

  it("113: clean-up runs older than 400 days go, newer ones stay", async () => {
    await pool.query(`DELETE FROM public.housekeeping_run`);
    await pool.query(
      `INSERT INTO public.housekeeping_run (job, started_at, finished_at, outcome, counts) VALUES
         ('unpaid_orders', $1, $1, 'ok', '{}'), ('unpaid_orders', $2, $2, 'ok', '{}')`,
      [daysAgo(401), daysAgo(90)],
    );
    expect(await purgeRuns(pool, NOW)).toBe(1);
    expect((await pool.query(`SELECT 1 FROM public.housekeeping_run`)).rowCount).toBe(1);
  });

  it("a customer's notification goes after 180 days, not before (FR-023)", async () => {
    const old = await notification("c-old", "order_paid", 181);
    const young = await notification("c-young", "order_paid", 179, 10);
    await run();
    expect(await exists(old)).toBe(false);
    expect(await deliveriesOf(old)).toBe(0);
    expect(await exists(young)).toBe(true);
  });

  it("a driver's or shop's notification goes after 90 days", async () => {
    const driver = await notification("d-1", "run_assigned", 91);
    const shop = await notification("s-1", "shop_new_order", 91);
    const keep = await notification("d-2", "run_assigned", 89, 10);
    await run();
    expect(await exists(driver)).toBe(false);
    expect(await exists(shop)).toBe(false);
    expect(await exists(keep)).toBe(true);
  });

  it("a delivery record goes after 30 days on its own; its notification stays (FR-024)", async () => {
    const id = await notification("c-1", "order_paid", 31, 31);
    const summary = await run();
    expect(await exists(id)).toBe(true);
    expect(await deliveriesOf(id)).toBe(0);
    expect(summary.deliveries).toBe(1);
  });

  it("an erased customer leaves no notification; a cancelled closure keeps them (FR-025)", async () => {
    const make = async (sub: string) =>
      (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [sub, `${sub}@example.test`])).rows[0]!.id;
    const gone = await make("c-erased");
    const back = await make("c-restored");
    const goneNote = await notification("c-erased", "order_paid", 5, 5);
    const backNote = await notification("c-restored", "order_paid", 5, 5);
    for (const id of [gone, back]) {
      await pool.query(`INSERT INTO public.customer_notification_choice (customer_id, category, channel, enabled, surface) VALUES ($1, 'orders', 'push', false, 'app')`, [id]);
      await pool.query(
        `INSERT INTO public.customer_marketing_consent (customer_id, category, granted, surface, via, wording_version) VALUES ($1, 'offers', true, 'web', 'prompt', 'v')`,
        [id],
      );
    }
    await pool.query(
      `INSERT INTO public.customer_closure_request (customer_id, erase_after, verification_method) VALUES ($1, $2, 'email_code')`,
      [gone, daysAgo(1)],
    );
    await pool.query(
      `INSERT INTO public.customer_closure_request (customer_id, erase_after, verification_method, cancelled_at, cancelled_reason)
       VALUES ($1, $2, 'email_code', $2, 'restored_by_customer')`,
      [back, daysAgo(1)],
    );
    const summary = await run();
    expect(await exists(goneNote)).toBe(false);
    expect(await exists(backNote)).toBe(true);
    expect(summary.erased).toBe(1);
    // 111: their choices and consent answers go with them; a cancelled closure keeps both.
    expect(summary.preferencesErased).toBe(2);
    const left = async (table: string, id: string) => (await pool.query(`SELECT 1 FROM public.${table} WHERE customer_id = $1`, [id])).rowCount;
    expect(await left("customer_notification_choice", gone)).toBe(0);
    expect(await left("customer_marketing_consent", gone)).toBe(0);
    expect(await left("customer_notification_choice", back)).toBe(1);
    expect(await left("customer_marketing_consent", back)).toBe(1);
  });

  it("a message's report is frozen before its rows go, and keeps reading the same (112 R15)", async () => {
    const id = (await pool.query<{ id: string }>(
      `INSERT INTO public.message (kind, title, body, status, send_at, sent_at, created_by) VALUES ('announcement', 'Hub', 'From Effy', 'sent', $1, $1, 's') RETURNING id::text AS id`,
      [daysAgo(40)],
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.message_audience (message_id, audience, destination, matched_count) VALUES ($1, 'driver', '{"kind":"today"}', 2)`, [id]);
    for (const sub of ["d-1", "d-2"]) {
      await transact((tx) =>
        notify(tx, {
          type: "driver_message", recipients: [{ sub }], subject: { entityId: id }, dedupeScope: id, channels: ["push"],
          message: { messageId: id, source: "campaign", category: "announcements", importance: "normal", title: "Hub", body: "From Effy", destination: { kind: "today" }, imageUrl: null },
        }),
      );
    }
    await pool.query(`UPDATE public.notification SET created_at = $2, read_at = now(), seen_at = now() WHERE message_id = $1 AND recipient_sub = 'd-1'`, [id, daysAgo(40)]);
    await pool.query(`UPDATE public.notification_delivery d SET created_at = $2, status = 'sent' FROM public.notification n WHERE n.id = d.notification_id AND n.message_id = $1`, [id, daysAgo(40)]);
    const summary = await run();
    expect(summary.reportsFrozen).toBe(1);
    const row = (await pool.query(`SELECT report, report_frozen_at FROM public.message_audience WHERE message_id = $1`, [id])).rows[0];
    expect(row.report).toMatchObject({ matched: 2, reached: 2, opened: 1, push: { sent: 2 } });
    expect(row.report_frozen_at).not.toBeNull();
    // The deliveries went (30 days); the frozen numbers stand.
    expect((await pool.query(`SELECT 1 FROM public.notification_delivery d JOIN public.notification n ON n.id = d.notification_id WHERE n.message_id = $1`, [id])).rowCount).toBe(0);
    expect((await run()).reportsFrozen).toBe(0);
  });

  it("an erased customer is taken out of every message they were chosen for (112)", async () => {
    const c = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c-chosen', 'c@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    const keep = "44444444-4444-4444-8444-444444444444";
    const m = (await pool.query<{ id: string }>(`INSERT INTO public.message (kind, title, body, created_by) VALUES ('important', 'T', 'B', 's') RETURNING id::text AS id`)).rows[0]!.id;
    await pool.query(`INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, 'customer', $2::jsonb, '{"kind":"home"}')`, [m, JSON.stringify({ people: [c, keep] })]);
    await pool.query(`INSERT INTO public.customer_closure_request (customer_id, erase_after, verification_method) VALUES ($1, $2, 'email_code')`, [c, daysAgo(1)]);
    await run();
    const f = (await pool.query(`SELECT filter FROM public.message_audience WHERE message_id = $1`, [m])).rows[0].filter;
    expect(f).toEqual({ people: [keep] });
  });
});
