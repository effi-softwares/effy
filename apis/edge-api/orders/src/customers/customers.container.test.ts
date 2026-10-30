import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Against the real schema; "is this person an admin or manager" is faked. */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
}));

import { transactorFor } from "@effy/edge-shared";
import { activityEntries, migrationSql } from "@effy/edge-shared/testing";
import { InsufficientPointsError, OverAgentLimitError, PointsNoteRequiredError, PointsOrderNotFoundError } from "@effy/edge-shared/points";

import { parseListQuery } from "@effy/edge-shared";

import { pointsActivitySource, pointsSettingsActivitySource } from "../activity/points";

import { CUSTOMER_LIST_SPEC } from "./list";
import { createCustomerService, CustomerNotFoundError } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

describe.skipIf(!RUN)("074 - back-office customers and points", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const writers = new Set(["manager-1", "admin-1"]);
  let svc: ReturnType<typeof createCustomerService>;
  let seq = 0;

  const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
  const log = (source: Parameters<typeof activityEntries>[1]) => activityEntries(pool, source);
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
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address, placed_at, delivery_type, delivery_type_reason)
         VALUES ($1, $2, 'paid', 'AUD', 40.00, 40.00, 0, '{}'::jsonb, now(), 'effy', 'in_coverage') RETURNING id::text AS id`,
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

  it("103: lists customers newest first, finds one by any part of the email (any case) or its order number, and counts their orders", async () => {
    const list = (qs: Record<string, string>) => svc.list(parseListQuery(qs, CUSTOMER_LIST_SPEC));
    const c = await customer("grace.hopper@example.test");
    await paidOrder(c, "EFY-GH1234");
    expect((await list({ q: "grace.h" })).items.map((r) => r.id)).toEqual([c]);
    expect((await list({ q: "HOPPER@EXAMPLE" })).items.map((r) => r.id)).toEqual([c]);
    expect((await list({ q: "efy-gh1234" })).items.map((r) => r.id)).toEqual([c]);
    // A typed wildcard is text, not a wildcard.
    expect((await list({ q: "%%%" })).items).toEqual([]);
    const row = (await list({ q: "grace.h" })).items[0]!;
    expect(row.orderCount).toBe(1);
    expect(row.lastOrderAt).not.toBeNull();
    expect((await list({ hasOrdered: "true" })).items.map((r) => r.id)).toContain(c);
    expect((await list({ hasOrdered: "false" })).items.map((r) => r.id)).not.toContain(c);
  });

  it("a manager credits any amount against the customer's order; history names them and the reason", async () => {
    const c = await customer();
    const o = await paidOrder(c, "EFY-CR0001");
    const out = await svc.credit("manager-1", c, { points: 5000, reason: "late_delivery", note: "phoned in", orderId: o });
    expect(out.usable).toBe(5000);
    const entries = await log(pointsActivitySource(c));
    expect(o).toBeTruthy();
    expect(entries[0]).toMatchObject({
      kind: "credit", title: "Points added: +5,000", detail: "Late delivery - phoned in", subject: "EFY-CR0001",
    });
    const detail = await svc.detail(c);
    expect(detail.points).toMatchObject({ usable: 5000, valueAmount: "50.00", held: 0 });
    expect(detail.recentOrders.map((r) => r.orderNumber)).toEqual(["EFY-CR0001"]);
  });

  it("P12 - a csa credits within the limit, is refused above it, and cannot credit someone else's order", async () => {
    const c = await customer();
    const elsewhere = await paidOrder(await customer(), "EFY-NOTYRS");
    await expect(svc.credit("csa-1", c, { points: 2000, reason: "goodwill" })).resolves.toMatchObject({ usable: 2000 });
    await expect(svc.credit("csa-1", c, { points: 2001, reason: "goodwill" })).rejects.toBeInstanceOf(OverAgentLimitError);
    await expect(svc.credit("manager-1", c, { points: 1, reason: "goodwill", orderId: elsewhere })).rejects.toBeInstanceOf(PointsOrderNotFoundError);
    await expect(svc.credit("manager-1", c, { points: 1, reason: "other" })).rejects.toBeInstanceOf(PointsNoteRequiredError);
    await expect(svc.credit("manager-1", "not-a-uuid", { points: 1, reason: "goodwill" })).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it("P12 - a debit above what is usable is refused; a debit and a credit both stay in the history", async () => {
    const c = await customer();
    await svc.credit("manager-1", c, { points: 500, reason: "goodwill" });
    await expect(svc.debit("manager-1", c, { points: 501, reason: "correction" })).rejects.toBeInstanceOf(InsufficientPointsError);
    await svc.debit("manager-1", c, { points: 500, reason: "credited_in_error" });
    const entries = await log(pointsActivitySource(c));
    expect(entries.map((e) => [e.kind, e.title])).toEqual([
      ["debit", "Points taken off: -500"],
      ["credit", "Points added: +500"],
    ]);
  });

  it("each changed setting writes one audit row; an unchanged one writes none", async () => {
    const before = await svc.settings();
    const after = await svc.updateSettings("admin-1", { csaCreditLimitPoints: 2500, expiryMonths: before.expiryMonths });
    expect(after.csaCreditLimitPoints).toBe(2500);
    const changes = await log(pointsSettingsActivitySource());
    expect(changes.filter((h) => h.title === "Customer-service credit limit changed")).toEqual([
      expect.objectContaining({ kind: "rules", detail: `${before.csaCreditLimitPoints} → 2500` }),
    ]);
    await svc.updateSettings("admin-1", { csaCreditLimitPoints: before.csaCreditLimitPoints });
  });
});
