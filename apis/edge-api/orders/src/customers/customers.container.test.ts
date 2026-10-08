import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 074 — back-office customers and points, against the REAL migrations (quickstart P12, US1, US5, US6).
 *
 * ⚠ The repository's `query` is pointed at the test pool; the service is handed the same pool as its
 * connection and transactor, and a fake for "is this person an admin or manager" — the one input that
 * would otherwise need the admin schema seeded with Cognito-linked staff.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
}));

import { migrationSql, transactorFor } from "@effy/edge-shared";
import { InsufficientPointsError, OverAgentLimitError, PointsNoteRequiredError, PointsOrderNotFoundError } from "@effy/edge-shared/points";

import { createCustomerService, CustomerNotFoundError } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("074 — back-office customers and points", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const writers = new Set(["manager-1", "admin-1"]);
  let svc: ReturnType<typeof createCustomerService>;
  let seq = 0;

  const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
  async function customer(email?: string) {
    const tag = `cs-${++seq}`;
    return (
      await one<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email, given_name, family_name) VALUES ($1, $2, 'Ada', 'Lovelace') RETURNING id::text AS id`,
        [tag, email ?? `${tag}@example.test`],
      )
    ).id;
  }
  async function paidOrder(customerId: string, number: string) {
    return (
      await one<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address, placed_at)
         VALUES ($1, $2, 'paid', 'AUD', 40.00, 40.00, 0, '{}'::jsonb, now()) RETURNING id::text AS id`,
        [customerId, number],
      )
    ).id;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    holder.pool = pool;
    await pool.query(migrationSql());
    svc = createCustomerService({ db: pool, transact: transactorFor(pool), isWriter: async (sub) => writers.has(sub) });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("finds a customer by email prefix, exact email (any case) and order number — and nothing by two letters", async () => {
    const c = await customer("grace.hopper@example.test");
    await paidOrder(c, "EFY-GH1234");
    expect((await svc.search("grace.h")).map((r) => r.id)).toEqual([c]);
    expect((await svc.search("GRACE.HOPPER@EXAMPLE.TEST")).map((r) => r.id)).toEqual([c]);
    expect((await svc.search("efy-gh1234")).map((r) => r.id)).toEqual([c]);
    expect(await svc.search("gr")).toEqual([]);
    // A typed wildcard is text, not a wildcard.
    expect(await svc.search("%%%")).toEqual([]);
  });

  it("a manager credits any amount against the customer's order; history names them and the reason", async () => {
    const c = await customer();
    const o = await paidOrder(c, "EFY-CR0001");
    const out = await svc.credit("manager-1", c, { points: 5000, reason: "late_delivery", note: "phoned in", orderId: o });
    expect(out.usable).toBe(5000);
    const page = await svc.history(c, undefined, 10);
    expect(page.entries[0]).toMatchObject({
      kind: "staff_credit", points: 5000, valueAmount: "50.00", words: "Sorry your order was late", orderNumber: "EFY-CR0001",
      reason: "late_delivery", note: "phoned in", authorKind: "staff", orderId: o,
    });
    const detail = await svc.detail(c);
    expect(detail.points).toMatchObject({ usable: 5000, valueAmount: "50.00", held: 0 });
    expect(detail.recentOrders.map((r) => r.orderNumber)).toEqual(["EFY-CR0001"]);
  });

  it("P12 — a csa credits within the limit, is refused above it, and cannot credit someone else's order", async () => {
    const c = await customer();
    const elsewhere = await paidOrder(await customer(), "EFY-NOTYRS");
    await expect(svc.credit("csa-1", c, { points: 2000, reason: "goodwill" })).resolves.toMatchObject({ usable: 2000 });
    await expect(svc.credit("csa-1", c, { points: 2001, reason: "goodwill" })).rejects.toBeInstanceOf(OverAgentLimitError);
    await expect(svc.credit("manager-1", c, { points: 1, reason: "goodwill", orderId: elsewhere })).rejects.toBeInstanceOf(PointsOrderNotFoundError);
    await expect(svc.credit("manager-1", c, { points: 1, reason: "other" })).rejects.toBeInstanceOf(PointsNoteRequiredError);
    await expect(svc.credit("manager-1", "not-a-uuid", { points: 1, reason: "goodwill" })).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it("P12 — a debit above what is usable is refused; a debit and a credit both stay in the history", async () => {
    const c = await customer();
    await svc.credit("manager-1", c, { points: 500, reason: "goodwill" });
    await expect(svc.debit("manager-1", c, { points: 501, reason: "correction" })).rejects.toBeInstanceOf(InsufficientPointsError);
    await svc.debit("manager-1", c, { points: 500, reason: "credited_in_error" });
    const page = await svc.history(c, undefined, 10);
    expect(page.entries.map((e) => [e.kind, e.points, e.words])).toEqual([
      ["staff_debit", -500, "Balance correction"],
      ["staff_credit", 500, "A thank-you from Effy"],
    ]);
  });

  it("pages the history newest first without repeating a line", async () => {
    const c = await customer();
    for (let i = 0; i < 5; i++) await svc.credit("manager-1", c, { points: 10 + i, reason: "goodwill" });
    const first = await svc.history(c, undefined, 3);
    const second = await svc.history(c, first.nextCursor, 3);
    expect(first.entries).toHaveLength(3);
    expect(second.entries).toHaveLength(2);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.entries, ...second.entries].map((e) => e.id)).size).toBe(5);
  });

  it("each changed setting writes one audit row; an unchanged one writes none", async () => {
    const before = await svc.settings();
    const after = await svc.updateSettings("admin-1", { csaCreditLimitPoints: 2500, expiryMonths: before.expiryMonths });
    expect(after.csaCreditLimitPoints).toBe(2500);
    expect(after.history?.filter((h) => h.changedBy === "admin-1")).toEqual([
      expect.objectContaining({ field: "csaCreditLimitPoints", oldValue: String(before.csaCreditLimitPoints), newValue: "2500" }),
    ]);
    await svc.updateSettings("admin-1", { csaCreditLimitPoints: before.csaCreditLimitPoints });
  });
});
