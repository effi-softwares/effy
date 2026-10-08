import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../lib/load-migrations";
import { InsufficientPointsError, PointsNoteRequiredError, PointsOrderNotFoundError, PointsReasonInvalidError } from "./errors";
import { credit, debit, dueToExpire, expireLot, forfeit, hold, release, spendHeld, usable } from "./ledger";
import { updateSettings } from "./settings";

/**
 * 074 — the points ledger against the REAL schema (quickstart P2, P3, P5).
 *
 * ⚠ THESE CANNOT BE UNIT TESTS. "Never negative" is a row lock on points_account; FIFO is an ORDER BY
 * over lots; "expired points stop counting with no sweep" is a WHERE clause in points_usable; the sign,
 * note and author rules are CHECKs.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

const staff = { kind: "staff" as const, sub: "staff-1" };
const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

async function customer() {
  const tag = `pt-${++seq}`;
  return (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
}

async function order(customerId: string) {
  return (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, 'pending_payment', 'AUD', 40.00, 40.00, 0, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-PT${++seq}`],
    )
  ).id;
}

const give = (customerId: string, points: number, now: Date) =>
  transact((tx) => credit(tx, { customerId, points, kind: "staff_credit", reason: "goodwill", author: staff, now }));

d("074 — the points ledger against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 12 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("a credit is a lot with a full expiry, a message on both channels, and counts at once", async () => {
    const c = await customer();
    const now = new Date();
    const { entryId, created } = await give(c, 500, now);
    expect(created).toBe(true);
    expect(await usable(pool, c, now)).toBe(500);
    const n = await one<{ n: string }>(`SELECT count(*) AS n FROM public.notification_request WHERE type = 'points_credited' AND payload->>'entityId' = $1`, [entryId]);
    expect(Number(n.n)).toBe(2);
  });

  it("refuses a bad reason, a note-less Other, and someone else's order", async () => {
    const c = await customer();
    const other = await order(await customer());
    const now = new Date();
    await expect(transact((tx) => credit(tx, { customerId: c, points: 1, kind: "staff_credit", reason: "credited_in_error", author: staff, now }))).rejects.toBeInstanceOf(PointsReasonInvalidError);
    await expect(transact((tx) => credit(tx, { customerId: c, points: 1, kind: "staff_credit", reason: "other", note: "  ", author: staff, now }))).rejects.toBeInstanceOf(PointsNoteRequiredError);
    await expect(transact((tx) => credit(tx, { customerId: c, points: 1, kind: "staff_credit", reason: "goodwill", orderId: other, author: staff, now }))).rejects.toBeInstanceOf(PointsOrderNotFoundError);
  });

  it("an automatic credit with a dedupe key is one credit however often it is asked for", async () => {
    const c = await customer();
    const now = new Date();
    const ask = () => transact((tx) => credit(tx, { customerId: c, points: 300, kind: "auto_credit", reason: "courier_override_compensation", author: { kind: "system", flow: "courier_override" }, dedupeKey: `test:${c}`, now }));
    const first = await ask();
    const second = await ask();
    expect(second).toMatchObject({ entryId: first.entryId, created: false });
    expect(await usable(pool, c, now)).toBe(300);
  });

  it("P2 — spends the soonest-expiring lot first", async () => {
    const c = await customer();
    const now = new Date();
    await transact((tx) => updateSettings(tx, { expiryMonths: 12 }, "admin"));
    const late = await give(c, 100, now);
    await transact((tx) => updateSettings(tx, { expiryMonths: 1 }, "admin"));
    const soon = await give(c, 100, now);
    await transact((tx) => updateSettings(tx, { expiryMonths: 12 }, "admin"));

    const { entryId } = await transact((tx) => debit(tx, { customerId: c, points: 150, reason: "correction", author: staff, now }));
    const alloc = (await pool.query<{ credit_entry_id: string; points: number }>(`SELECT credit_entry_id::text, points FROM public.points_allocation WHERE debit_entry_id = $1`, [entryId])).rows;
    expect(Object.fromEntries(alloc.map((a) => [a.credit_entry_id, a.points]))).toEqual({ [soon.entryId]: 100, [late.entryId]: 50 });
    expect(await usable(pool, c, now)).toBe(50);
  });

  it("P3 — an expired lot stops counting the instant it expires, with no sweep run", async () => {
    const c = await customer();
    const now = new Date();
    const { expiresAt } = await give(c, 400, now);
    expect(await usable(pool, c, new Date(expiresAt.getTime() - 1))).toBe(400);
    expect(await usable(pool, c, expiresAt)).toBe(0);
  });

  it("the sweep writes one `expired` line per lot, however many times it runs", async () => {
    const c = await customer();
    const now = new Date();
    const { entryId, expiresAt } = await give(c, 250, now);
    await transact((tx) => debit(tx, { customerId: c, points: 50, reason: "correction", author: staff, now }));
    const later = new Date(expiresAt.getTime() + 1000);
    const due = (await dueToExpire(pool, later, 1000)).filter((x) => x.customerId === c);
    expect(due.map((x) => x.lotId)).toEqual([entryId]);
    expect(await transact((tx) => expireLot(tx, entryId, later))).toMatchObject({ points: 200 });
    expect(await transact((tx) => expireLot(tx, entryId, later))).toMatchObject({ points: 0 });
    const n = await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1 AND kind = 'expired'`, [c]);
    expect(Number(n.n)).toBe(1);
  });

  it("P5 — concurrent debits never take a balance below zero", async () => {
    const c = await customer();
    const now = new Date();
    await give(c, 100, now);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => transact((tx) => debit(tx, { customerId: c, points: 40, reason: "correction", author: staff, now }))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof InsufficientPointsError)).toBe(true);
    expect(await usable(pool, c, now)).toBe(20);
  });

  it("a hold sets points aside from debits, does not count against its own order, and lapses without a sweep", async () => {
    const c = await customer();
    const o = await order(c);
    const now = new Date();
    await give(c, 100, now);
    const { heldUntil } = await transact((tx) => hold(tx, { customerId: c, orderId: o, points: 80, now }));
    expect(await usable(pool, c, now)).toBe(20);
    expect(await usable(pool, c, now, o)).toBe(100);
    await expect(transact((tx) => debit(tx, { customerId: c, points: 30, reason: "correction", author: staff, now }))).rejects.toBeInstanceOf(InsufficientPointsError);
    // Refreshing the same checkout is not refused by its own hold.
    await transact((tx) => hold(tx, { customerId: c, orderId: o, points: 100, now }));
    expect(await usable(pool, c, heldUntil!)).toBe(100);
    await transact((tx) => release(tx, o));
    expect(await usable(pool, c, now)).toBe(100);
  });

  it("spending a hold writes one `spent` line; the late payer spends what is left and reports the gap", async () => {
    const c = await customer();
    const o = await order(c);
    const now = new Date();
    await give(c, 100, now);
    await transact((tx) => hold(tx, { customerId: c, orderId: o, points: 90, now }));
    // The hold lapses, and meanwhile 60 points are debited.
    const later = new Date(now.getTime() + 2 * 60 * 60_000);
    await transact((tx) => debit(tx, { customerId: c, points: 60, reason: "correction", author: staff, now: later }));
    const out = await transact((tx) => spendHeld(tx, o, later));
    expect(out).toMatchObject({ spent: 40, shortfallPoints: 50 });
    expect(await usable(pool, c, later)).toBe(0);
    // A second paid transition (it cannot happen — the order guard — but the ledger holds anyway).
    expect(await transact((tx) => spendHeld(tx, o, later))).toMatchObject({ spent: 0, shortfallPoints: 0 });
  });

  it("forfeits every unexpired point on final closure", async () => {
    const c = await customer();
    const now = new Date();
    await give(c, 70, now);
    expect(await transact((tx) => forfeit(tx, c, now))).toBe(70);
    expect(await usable(pool, c, now)).toBe(0);
  });

  it("the shopper role cannot rewrite history", async () => {
    const c = await customer();
    const { entryId } = await give(c, 10, new Date());
    const client = await pool.connect();
    try {
      await client.query("SET ROLE effy_shopper");
      await expect(client.query(`UPDATE public.points_entry SET points = 999 WHERE id = $1`, [entryId])).rejects.toThrow(/permission denied/);
      await expect(client.query(`DELETE FROM public.points_allocation`)).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
  });
});
