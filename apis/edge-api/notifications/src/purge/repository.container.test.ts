import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";
import { migrationSql } from "@effy/edge-shared/testing";

import { purge } from "./repository";

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
    await pool.query("TRUNCATE public.notification_delivery, public.notification, public.customer_closure_request, public.customer CASCADE");
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
  });
});
