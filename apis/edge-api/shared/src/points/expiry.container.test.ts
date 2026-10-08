import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../lib/load-migrations";
import { credit, debit, dueToExpire, expireLot, hold, usable } from "./ledger";
import { checkLedger } from "./reconcile";
import { updateSettings } from "./settings";
import { queueExpiryWarnings } from "./warnings";

/**
 * 074 US4 and SC-001 against the REAL schema (quickstart P15, P16): one warning per customer per expiry
 * date however often the job runs, and a ledger check that is clean on a good ledger and loud on a
 * forged one.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;
const staff = { kind: "staff" as const, sub: "s" };

async function customer() {
  const tag = `ex-${++seq}`;
  return (
    await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])
  ).rows[0]!.id;
}
const give = (customerId: string, points: number, now: Date) =>
  transact((tx) => credit(tx, { customerId, points, kind: "staff_credit", reason: "goodwill", author: staff, now }));
const warnings = async (customerId: string) =>
  (await pool.query(
    `SELECT n.points, r.channel, r.recipient_email FROM public.points_expiry_notice n
       JOIN public.notification_request r ON r.payload->>'entityId' = n.id::text AND r.type = 'points_expiring'
      WHERE n.customer_id = $1`,
    [customerId],
  )).rows;

d("074 — expiry warnings and the ledger check", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("P16 — warns once per customer per expiry date, for the points still there, by email only", async () => {
    const c = await customer();
    const now = new Date();
    await transact((tx) => updateSettings(tx, { expiryMonths: 1, warningDays: 60 }, "admin"));
    await give(c, 300, now);
    await give(c, 200, now); // a second lot expiring the same day
    await transact((tx) => debit(tx, { customerId: c, points: 100, reason: "correction", author: staff, now }));

    expect(await queueExpiryWarnings(pool, now)).toBeGreaterThanOrEqual(1);
    await queueExpiryWarnings(pool, now);
    await queueExpiryWarnings(pool, new Date(now.getTime() + 86_400_000));
    const sent = await warnings(c);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ points: 400, channel: "email" });
    expect(sent[0]!.recipient_email).toMatch(/@example\.test$/);
    await transact((tx) => updateSettings(tx, { expiryMonths: 12, warningDays: 30 }, "admin"));
  });

  it("does not warn about points that are not yet inside the warning period, nor about spent ones", async () => {
    const far = await customer();
    const spent = await customer();
    const now = new Date();
    await give(far, 500, now); // 12 months away, warning at 30 days
    await transact((tx) => updateSettings(tx, { expiryMonths: 1, warningDays: 60 }, "admin"));
    await give(spent, 50, now);
    await transact((tx) => updateSettings(tx, { expiryMonths: 12, warningDays: 60 }, "admin"));
    await transact((tx) => debit(tx, { customerId: spent, points: 50, reason: "correction", author: staff, now }));
    await queueExpiryWarnings(pool, now);
    expect(await warnings(far)).toHaveLength(0);
    expect(await warnings(spent)).toHaveLength(0);
    await transact((tx) => updateSettings(tx, { warningDays: 30 }, "admin"));
  });

  it("the daily pass expires what is due and leaves the balance where it already was", async () => {
    const c = await customer();
    const now = new Date();
    const { entryId, expiresAt } = await give(c, 120, now);
    const later = new Date(expiresAt.getTime() + 60_000);
    expect(await usable(pool, c, later)).toBe(0); // already not usable, before any pass
    for (const lot of (await dueToExpire(pool, later, 500)).filter((l) => l.lotId === entryId)) {
      await transact((tx) => expireLot(tx, lot.lotId, later));
    }
    expect(await usable(pool, c, later)).toBe(0);
    expect((await dueToExpire(pool, later, 500)).some((l) => l.lotId === entryId)).toBe(false);
  });

  it("P15 — the ledger check is clean on a real ledger and counts each kind of forgery", async () => {
    const c = await customer();
    const now = new Date();
    const lot = await give(c, 100, now);
    const { entryId: debitId } = await transact((tx) => debit(tx, { customerId: c, points: 40, reason: "correction", author: staff, now }));
    const clean = await checkLedger(pool, now);
    expect(clean.violations).toBe(0);

    // A write that did not go through the ledger: an allocation beyond the lot.
    const other = await give(c, 1, now);
    await pool.query(`INSERT INTO public.points_allocation (debit_entry_id, credit_entry_id, points) VALUES ($1, $2, 500)`, [debitId, other.entryId]);
    const forged = await checkLedger(pool, now);
    expect(forged.overAllocatedLots).toBe(1);
    expect(forged.unbalancedDebits).toBe(1);
    expect(forged.negativeBalances).toBe(1);
    expect(forged.violations).toBeGreaterThanOrEqual(3);
    expect(lot.created).toBe(true);
  });

  it("the ledger check notices a hold left on an order that is no longer pending", async () => {
    const c = await customer();
    const now = new Date();
    await give(c, 50, now);
    const orderId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
         VALUES ($1, $2, 'pending_payment', 'AUD', 10, 10, 0, '{}'::jsonb) RETURNING id::text AS id`,
        [c, `EFY-EX${++seq}`],
      )
    ).rows[0]!.id;
    await transact((tx) => hold(tx, { customerId: c, orderId, points: 50, now }));
    const before = (await checkLedger(pool, now)).strandedHolds;
    await pool.query(`UPDATE public."order" SET status = 'failed' WHERE id = $1`, [orderId]);
    expect((await checkLedger(pool, now)).strandedHolds).toBe(before + 1);
  });
});
