import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../../lib/db";
import { migrationSql } from "../../lib/load-migrations";
import { finalizeSucceeded } from "../finalize";
import { RefusedError, type CreateRefundInput, type PaymentGateway, type Refund, type WebhookEvent } from "../gateway";
import {
  CeilingExceededError, LineOverRefundedError, LinesNotYoursError, NotCancellableError, ProviderRefusedError,
  RefundOrderNotFoundError, RequestAlreadyOpenError, RequestNotFoundError,
} from "./errors";
import { createRefundRepository } from "./repository";
import { createRefundService, type IssueInput, type RefundService } from "./service";

/**
 * 070 — refunds, cancellation and refund requests against the REAL schema.
 *
 * ⚠ THESE CANNOT BE UNIT TESTS. "Never more than was paid" is a row lock on the payment; "two
 * cancels refund once" is a row lock on the order plus a unique key; "a terminal refund is never
 * reopened" is a WHERE clause; "one open request per order" is a partial unique index. Only the
 * payment PROVIDER is faked.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

/** The provider's refund side, in memory, keyed on the idempotency key as the real one is. */
function fakeProvider() {
  const byKey = new Map<string, Refund & { intent: string }>();
  let n = 0;
  let mode: "ok" | "timeout" | "timeout-after-accepting" | "refuse" = "ok";
  const calls: CreateRefundInput[] = [];
  const gw = {
    async createRefund(input: CreateRefundInput) {
      calls.push(input);
      if (mode === "refuse") throw new RefusedError("charge_already_refunded");
      if (mode === "timeout") throw new Error("socket hang up");
      let r = byKey.get(input.idempotencyKey);
      if (!r) {
        r = { id: `re_${++n}_${Math.random().toString(36).slice(2, 8)}`, status: "pending", failureReason: "", amountCents: input.amountCents, metadata: input.metadata ?? {}, intent: input.paymentIntentId };
        byKey.set(input.idempotencyKey, r);
      }
      if (mode === "timeout-after-accepting") throw new Error("socket hang up");
      return r;
    },
    async listRefunds(intent: string) {
      return [...byKey.values()].filter((r) => r.intent === intent);
    },
  } as unknown as PaymentGateway;
  return { gw, calls, created: () => byKey.size, set: (m: typeof mode) => { mode = m; } };
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let provider: ReturnType<typeof fakeProvider>;
let svc: RefundService;
let shopA: string;
let shopB: string;
const product: Record<string, string> = {};
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
const count = async (sql: string, args: unknown[] = []) => Number((await one<{ n: string }>(`SELECT count(*) AS n FROM (${sql}) q`, args)).n);
const refunds = (orderId: string) =>
  pool.query<{ kind: string; amount: string; status: string; actor_kind: string; actor_sub: string | null; provider_refund_id: string | null }>(
    `SELECT kind, amount::text, status, actor_kind, actor_sub, provider_refund_id FROM public.refund WHERE order_id = $1 ORDER BY created_at, id`,
    [orderId],
  ).then((r) => r.rows);
const stockOf = async (name: string) => (await one<{ n: number }>(`SELECT stock_on_hand AS n FROM public.product WHERE id = $1`, [product[name]])).n;

/** A PAID order: 2 × Tracked (5.00) from shop A and 1 × Plain (10.00) from shop B, plus 6.00 delivery = 26.00. */
async function paidOrder() {
  const tag = `rf-${++seq}`;
  const customerId = (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
  const orderId = (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, 'pending_payment', 'AUD', 20.00, 26.00, 6.00, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-${tag}`],
    )
  ).id;
  const item: Record<string, string> = {};
  for (const [name, shop, price, qty] of [["Tracked", shopA, "5.00", 2], ["Plain", shopB, "10.00", 1]] as const) {
    item[name] = (
      await one<{ id: string }>(
        `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::int, $5::numeric * $6::int) RETURNING id::text AS id`,
        [orderId, product[name], shop, name, price, qty],
      )
    ).id;
  }
  const intent = `pi_${tag}`;
  await pool.query(
    `INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status) VALUES ($1, 'stripe', $2, 26.00, 'AUD', 'requires_payment')`,
    [orderId, intent],
  );
  await transact((tx) => finalizeSucceeded(tx, orderId));
  return { orderId, customerId, item, intent };
}

const goodwill = (orderId: string, amount: string, over: Partial<IssueInput> = {}): IssueInput => ({
  orderId, kind: "goodwill", reason: "goodwill", note: "Sorry about the delay", lines: [], amount, actorSub: "staff-1", actorKind: "back_office", ...over,
});
const items = (orderId: string, lines: IssueInput["lines"], over: Partial<IssueInput> = {}): IssueInput => ({
  orderId, kind: "item", reason: "item_not_supplied", note: "", lines, amount: "", actorSub: "staff-1", actorKind: "back_office", ...over,
});
const setPortions = (orderId: string, status: string, shop?: string) =>
  pool.query(`UPDATE public.shop_fulfillment SET status = $2 WHERE order_id = $1 AND ($3::uuid IS NULL OR shop_id = $3::uuid)`, [orderId, status, shop ?? null]);

d("070 — refunds and cancellation against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 12 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);

    [shopA, shopB] = (
      await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('RFA', 'Refund A'), ('RFB', 'Refund B') RETURNING id::text AS id`)
    ).rows.map((r) => r.id) as [string, string];
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('rf-type', 'Refund type')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('rf-cat', 'Refund category')`);
    for (const [name, shop, price, tracked] of [["Tracked", shopA, "5.00", true], ["Plain", shopB, "10.00", false]] as const) {
      product[name] = (
        await one<{ id: string }>(
          `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, shop_price_amount,
                                       short_description, created_by, status, approved_at, stock_tracked, stock_on_hand)
           SELECT $1, (SELECT id FROM public.product_type WHERE key='rf-type'), (SELECT id FROM public.category WHERE key='rf-cat'),
                  $2, $3::numeric, $3::numeric, 'd', 'seed', 'active', now(), $4, $5
           RETURNING id::text AS id`,
          [shop, name, price, tracked, tracked ? 1000 : null],
        )
      ).id;
    }
  }, 180_000);

  beforeEach(() => {
    provider = fakeProvider();
    svc = createRefundService({ repo: createRefundRepository(pool, transact), gateway: provider.gw, namespace: () => "Test" });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  // ── Issuing ─────────────────────────────────────────────────────────────────────────────────────

  it("an item refund is priced from the receipt, submitted under its stored key, and puts tracked stock back", async () => {
    const o = await paidOrder();
    const before = await stockOf("Tracked");
    const r = await svc.issue(items(o.orderId, [{ orderItemId: o.item.Tracked!, quantity: 1 }]));

    expect(r).toMatchObject({ amount: "5.00", status: "submitted", remainingAmount: "21.00" });
    expect(r).not.toHaveProperty("stalled");
    const [row] = await refunds(o.orderId);
    expect(row).toMatchObject({ kind: "item", amount: "5.00", status: "submitted", actor_kind: "back_office", actor_sub: "staff-1" });
    expect(row!.provider_refund_id).toMatch(/^re_/);
    expect(provider.calls[0]).toMatchObject({ paymentIntentId: o.intent, amountCents: 500, reason: "requested_by_customer", metadata: { effy_refund_id: r.refundId } });
    expect(await stockOf("Tracked")).toBe(before + 1);
    expect(await count(`SELECT 1 FROM public.stock_movement WHERE order_id = $1 AND reason = 'refund'`, [o.orderId])).toBe(1);
  });

  it("stock is not returned once the goods have left the shop, nor when a shop declines to restock", async () => {
    const o = await paidOrder();
    const before = await stockOf("Tracked");
    await svc.issue(items(o.orderId, [{ orderItemId: o.item.Tracked!, quantity: 1 }], { actorKind: "shop", actorSub: "mgr-1", skipStockReturn: true }));
    expect(await stockOf("Tracked")).toBe(before);

    await setPortions(o.orderId, "collected", shopA);
    await svc.issue(items(o.orderId, [{ orderItemId: o.item.Tracked!, quantity: 1 }], { reason: "item_unusable" }));
    expect(await stockOf("Tracked")).toBe(before);
    expect((await refunds(o.orderId)).map((r) => r.actor_kind)).toEqual(["shop", "back_office"]);
  });

  it("the same unit cannot be refunded twice, and the same action twice is one refund", async () => {
    const o = await paidOrder();
    const once = goodwill(o.orderId, "3.00");
    const a = await svc.issue(once);
    const b = await svc.issue(once); // a double-click
    expect(b.refundId).toBe(a.refundId);
    expect(b).toMatchObject({ status: "submitted", amount: "3.00" });
    expect(await refunds(o.orderId)).toHaveLength(1);
    expect(provider.created()).toBe(1);

    await svc.issue(items(o.orderId, [{ orderItemId: o.item.Plain!, quantity: 1 }]));
    // Whatever the reason given the second time, the unit is already refunded.
    await expect(svc.issue(items(o.orderId, [{ orderItemId: o.item.Plain!, quantity: 1 }]))).rejects.toBeInstanceOf(LineOverRefundedError);
    await expect(svc.issue(items(o.orderId, [{ orderItemId: o.item.Plain!, quantity: 1 }], { reason: "item_unusable" }))).rejects.toBeInstanceOf(LineOverRefundedError);
    expect(await refunds(o.orderId)).toHaveLength(2);
  });

  it("a refund larger than what remains is refused, saying what remains", async () => {
    const o = await paidOrder();
    await svc.issue(goodwill(o.orderId, "20.00"));
    const err = await svc.issue(goodwill(o.orderId, "6.01", { note: "second" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CeilingExceededError);
    expect((err as CeilingExceededError).remainingCents).toBe(600);
    expect(await refunds(o.orderId)).toHaveLength(1);
  });

  it("⚠ two staff refunding at the same instant cannot together exceed what was paid", async () => {
    const o = await paidOrder();
    // Both are released immediately before the lock, so they genuinely contend for it.
    let waiting = 0;
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const racing = createRefundService({
      repo: createRefundRepository(pool, transact, async () => { if (++waiting === 2) release(); await gate; }),
      gateway: provider.gw, namespace: () => "Test",
    });

    const results = await Promise.allSettled([
      racing.issue(goodwill(o.orderId, "20.00", { note: "first", actorSub: "staff-1" })),
      racing.issue(goodwill(o.orderId, "15.00", { note: "second", actorSub: "staff-2" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(CeilingExceededError);

    const total = (await refunds(o.orderId)).reduce((sum, r) => sum + Number(r.amount), 0);
    expect(total).toBeLessThanOrEqual(26);
    expect(provider.created()).toBe(1);
  });

  it("⚠ a refund still on its way to the provider already holds the ceiling — the window the old backend left open", async () => {
    const o = await paidOrder();
    // The first refund is recorded and COMMITTED, and its provider call is held open.
    let letProviderAnswer!: () => void;
    const held = new Promise<void>((res) => { letProviderAnswer = res; });
    const slow = { ...provider.gw, createRefund: async (input: CreateRefundInput) => { await held; return provider.gw.createRefund(input); } } as PaymentGateway;
    const first = createRefundService({ repo: createRefundRepository(pool, transact), gateway: slow, namespace: () => "Test" })
      .issue(goodwill(o.orderId, "20.00", { note: "first" }));
    // Wait until its row exists.
    for (let i = 0; i < 100 && (await refunds(o.orderId)).length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(await refunds(o.orderId)).toMatchObject([{ status: "submitting" }]);

    // A second refund arrives in that window. It must be judged against 26 − 20, not against 26.
    const second = await svc.issue(goodwill(o.orderId, "15.00", { note: "second" })).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(CeilingExceededError);
    expect((second as CeilingExceededError).remainingCents).toBe(600);

    letProviderAnswer();
    expect(await first).toMatchObject({ status: "submitted", remainingAmount: "6.00" });
    expect(await refunds(o.orderId)).toHaveLength(1);
  });

  it("cancelling while a refund is still on its way returns only what that refund leaves", async () => {
    const o = await paidOrder();
    let letProviderAnswer!: () => void;
    const held = new Promise<void>((res) => { letProviderAnswer = res; });
    const slow = { ...provider.gw, createRefund: async (input: CreateRefundInput) => { await held; return provider.gw.createRefund(input); } } as PaymentGateway;
    const first = createRefundService({ repo: createRefundRepository(pool, transact), gateway: slow, namespace: () => "Test" })
      .issue(goodwill(o.orderId, "6.00"));
    for (let i = 0; i < 100 && (await refunds(o.orderId)).length === 0; i++) await new Promise((r) => setTimeout(r, 10));

    expect(await svc.cancel({ orderId: o.orderId, customerId: null, actorKind: "back_office", actorSub: "staff-1" })).toMatchObject({ amount: "20.00" });
    letProviderAnswer();
    await first;
    expect((await refunds(o.orderId)).reduce((sum, r) => sum + Number(r.amount), 0)).toBe(26);
  });

  it("a provider refusal is terminal and is reported as one", async () => {
    const o = await paidOrder();
    provider.set("refuse");
    await expect(svc.issue(goodwill(o.orderId, "5.00"))).rejects.toBeInstanceOf(ProviderRefusedError);
    expect((await refunds(o.orderId))[0]).toMatchObject({ status: "refused" });
    expect(provider.calls).toHaveLength(1); // a decision is never retried
  });

  it("a refund for an order that does not exist, or was never paid, is not found", async () => {
    await expect(svc.issue(goodwill("00000000-0000-4000-8000-000000000000", "1.00"))).rejects.toBeInstanceOf(RefundOrderNotFoundError);
    await expect(svc.issue(goodwill("nope", "1.00"))).rejects.toBeInstanceOf(RefundOrderNotFoundError);
  });

  it("a shop may name only its own lines, and one foreign line refuses the whole request", async () => {
    const o = await paidOrder();
    const repo = createRefundRepository(pool, transact);
    await repo.assertLinesBelongToShop(o.orderId, shopA, [{ orderItemId: o.item.Tracked!, quantity: 1 }]);
    await expect(
      repo.assertLinesBelongToShop(o.orderId, shopA, [{ orderItemId: o.item.Tracked!, quantity: 1 }, { orderItemId: o.item.Plain!, quantity: 1 }]),
    ).rejects.toBeInstanceOf(LinesNotYoursError);
  });

  // ── Uncertain refunds (FR-024) ──────────────────────────────────────────────────────────────────

  it("a submission that gets no answer is left `submitting`, said to be stalled — counted while in flight, and not once it has stalled", async () => {
    const o = await paidOrder();
    provider.set("timeout");
    const r = await svc.issue(goodwill(o.orderId, "20.00"));
    expect(r).toMatchObject({ status: "submitting", stalled: true });
    expect(provider.calls).toHaveLength(2); // retried once, under the same key
    expect(provider.calls[0]!.idempotencyKey).toBe(provider.calls[1]!.idempotencyKey);

    provider.set("ok");
    // ⚠ Seconds old, it may still be on its way: it holds the ceiling, exactly as a refund whose
    // request is still running must.
    const tooSoon = await svc.issue(goodwill(o.orderId, "26.00", { note: "the whole thing" })).catch((e: unknown) => e);
    expect(tooSoon).toBeInstanceOf(CeilingExceededError);
    expect((tooSoon as CeilingExceededError).remainingCents).toBe(600);

    // Past the in-flight window no request can still be running. It went nowhere, and an attempt
    // that went nowhere must not make the platform refuse to return money it still holds.
    await pool.query(`UPDATE public.refund SET created_at = now() - interval '2 minutes' WHERE order_id = $1`, [o.orderId]);
    await svc.issue(goodwill(o.orderId, "26.00", { note: "the whole thing" }));
    expect((await refunds(o.orderId)).map((x) => x.status).sort()).toEqual(["submitted", "submitting"]);

    // ⚠ The stalled one must NOT now be sent: the order has nothing left, and sending it would
    // return more than was paid. The reconciler closes it instead.
    const sent = provider.calls.length;
    expect(await svc.reconcile({ olderThanSeconds: 0, stuckAfterSeconds: 0 })).toMatchObject({ refused: 1, resubmitted: 0, stuck: 0 });
    expect(provider.calls.length).toBe(sent);
    expect((await refunds(o.orderId)).map((x) => x.status).sort()).toEqual(["refused", "submitted"]);
  });

  it("⚠ the reconciler resolves it: recorded when the provider has it, submitted under the stored key when it does not — never twice", async () => {
    // (a) the provider ACCEPTED it and the answer was lost.
    const a = await paidOrder();
    provider.set("timeout-after-accepting");
    const first = await svc.issue(goodwill(a.orderId, "5.00"));
    expect(first.status).toBe("submitting");
    // (b) the request never arrived at all.
    const b = await paidOrder();
    provider.set("timeout");
    await svc.issue(goodwill(b.orderId, "7.00"));

    provider.set("ok");
    const callsBefore = provider.calls.length;
    expect(await svc.reconcile({ olderThanSeconds: 0, stuckAfterSeconds: 0 })).toMatchObject({ found: 1, resubmitted: 1, unresolved: 0, stuck: 0 });

    expect((await refunds(a.orderId))[0]).toMatchObject({ status: "submitted" });
    expect((await refunds(b.orderId))[0]).toMatchObject({ status: "submitted" });
    // (a) asked and was told; only (b) was sent again, with the key stored on its row.
    expect(provider.calls.length - callsBefore).toBe(1);
    const stored = (await one<{ k: string }>(`SELECT idempotency_key AS k FROM public.refund WHERE order_id = $1`, [b.orderId])).k;
    expect(provider.calls.at(-1)!.idempotencyKey).toBe(stored);
    expect(provider.created()).toBe(2); // one refund each at the provider

    // A second run finds nothing to do.
    expect(await svc.reconcile({ olderThanSeconds: 0, stuckAfterSeconds: 0 })).toMatchObject({ found: 0, resubmitted: 0, stuck: 0 });
    expect(provider.created()).toBe(2);
  });

  it("the reconciler leaves a refund it still cannot resolve, and counts it as stuck", async () => {
    const o = await paidOrder();
    provider.set("timeout");
    await svc.issue(goodwill(o.orderId, "5.00"));
    const out = await svc.reconcile({ olderThanSeconds: 0, stuckAfterSeconds: 0 });
    expect(out.unresolved).toBeGreaterThanOrEqual(1);
    expect(out.stuck).toBeGreaterThanOrEqual(1);
    expect((await refunds(o.orderId))[0]).toMatchObject({ status: "submitting" });
    provider.set("ok");
    await svc.reconcile({ olderThanSeconds: 0 }); // leave nothing behind for the other tests
  });

  // ── The provider's reports ──────────────────────────────────────────────────────────────────────

  const refundEvent = (refundId: string, status: WebhookEvent["refundStatus"], over: Partial<WebhookEvent> = {}): WebhookEvent => ({
    id: `evt_${refundId}_${status}`, type: `refund.${status === "failed" ? "failed" : "updated"}`, paymentIntentId: "", refundId, refundStatus: status, ...over,
  });

  it("a refund the bank later rejects becomes `failed`, and nothing reopens a settled refund", async () => {
    const o = await paidOrder();
    await svc.issue(goodwill(o.orderId, "5.00"));
    const providerId = (await refunds(o.orderId))[0]!.provider_refund_id!;

    expect(await svc.handleRefundEvent(pool, refundEvent(providerId, "pending"))).toEqual({ recognised: true, changed: false });
    expect(await svc.handleRefundEvent(pool, refundEvent(providerId, "failed", { failureReason: "insufficient_funds" }))).toEqual({ recognised: true, changed: true });
    // A late `succeeded` for the same refund must not turn a failure into a success.
    expect(await svc.handleRefundEvent(pool, refundEvent(providerId, "succeeded"))).toEqual({ recognised: true, changed: false });
    expect(await one(`SELECT status, failure_reason FROM public.refund WHERE provider_refund_id = $1`, [providerId]))
      .toEqual({ status: "failed", failure_reason: "insufficient_funds" });
    // ⚠ It still counts against the ceiling: staff must resolve it, not re-issue around it.
    await expect(svc.issue(goodwill(o.orderId, "22.00", { note: "again" }))).rejects.toBeInstanceOf(CeilingExceededError);
  });

  it("a refund made by hand at the provider is recorded as external and unattributed — once — and one on someone else's payment is not", async () => {
    const o = await paidOrder();
    const evt = refundEvent("re_by_hand", "succeeded", { refundAmountCents: 400, refundPaymentIntentId: o.intent });
    expect(await svc.handleRefundEvent(pool, evt)).toEqual({ recognised: false, changed: true });
    await svc.handleRefundEvent(pool, { ...evt, id: "evt_other_id" });
    expect(await refunds(o.orderId)).toEqual([
      { kind: "external", amount: "4.00", status: "succeeded", actor_kind: "system", actor_sub: null, provider_refund_id: "re_by_hand" },
    ]);

    await svc.handleRefundEvent(pool, refundEvent("re_not_ours", "succeeded", { refundAmountCents: 400, refundPaymentIntentId: "pi_somebody_else" }));
    expect(await count(`SELECT 1 FROM public.refund WHERE provider_refund_id = 're_not_ours'`)).toBe(0);
  });

  // ── Cancellation ────────────────────────────────────────────────────────────────────────────────

  const asCustomer = (o: { orderId: string; customerId: string }) => ({ orderId: o.orderId, customerId: o.customerId, actorKind: "customer", actorSub: o.customerId });
  const asStaff = (orderId: string) => ({ orderId, customerId: null, actorKind: "back_office", actorSub: "staff-1" });

  it("a customer cancelling before anyone starts gets everything back, including delivery, and the shops are stood down", async () => {
    const o = await paidOrder();
    const r = await svc.cancel(asCustomer(o));
    expect(r).toMatchObject({ amount: "26.00", status: "submitted" });

    expect((await one<{ status: string }>(`SELECT status FROM public."order" WHERE id = $1`, [o.orderId])).status).toBe("canceled");
    expect((await pool.query(`SELECT DISTINCT status FROM public.shop_fulfillment WHERE order_id = $1`, [o.orderId])).rows).toEqual([{ status: "withdrawn" }]);
    expect(
      (await pool.query(
        `SELECT fe.from_status, fe.to_status FROM public.fulfillment_event fe JOIN public.shop_fulfillment sf ON sf.id = fe.shop_fulfillment_id
          WHERE sf.order_id = $1 AND fe.to_status = 'withdrawn'`, [o.orderId],
      )).rows,
    ).toEqual([{ from_status: "pending", to_status: "withdrawn" }, { from_status: "pending", to_status: "withdrawn" }]);
    expect(await refunds(o.orderId)).toMatchObject([{ kind: "cancellation", amount: "26.00", status: "submitted", actor_kind: "customer", actor_sub: o.customerId }]);
  });

  it("cancelling twice — or by a customer and staff at the same moment — refunds once", async () => {
    const o = await paidOrder();
    const [a, b] = await Promise.all([svc.cancel(asCustomer(o)), svc.cancel(asStaff(o.orderId))]);
    expect([a.status, b.status].sort()).toEqual(["submitted", "succeeded"]); // one did it; the other found it done
    expect(await svc.cancel(asCustomer(o))).toEqual({ status: "succeeded" });
    expect(await refunds(o.orderId)).toHaveLength(1);
    expect(provider.created()).toBe(1);
  });

  it("a customer's window closes when any shop starts; staff may still cancel; nobody may once it has left", async () => {
    const o = await paidOrder();
    await setPortions(o.orderId, "picking", shopA);
    await expect(svc.cancel(asCustomer(o))).rejects.toBeInstanceOf(NotCancellableError);
    expect((await one<{ status: string }>(`SELECT status FROM public."order" WHERE id = $1`, [o.orderId])).status).toBe("paid");

    const p = await paidOrder();
    await setPortions(p.orderId, "collected", shopB);
    await expect(svc.cancel(asStaff(p.orderId))).rejects.toBeInstanceOf(NotCancellableError);

    expect(await svc.cancel(asStaff(o.orderId))).toMatchObject({ status: "submitted", amount: "26.00" });
  });

  it("another shopper's order is not found — the same answer as one that does not exist", async () => {
    const o = await paidOrder();
    const stranger = await paidOrder();
    await expect(svc.cancel({ ...asCustomer(o), customerId: stranger.customerId })).rejects.toBeInstanceOf(RefundOrderNotFoundError);
    await expect(svc.cancel(asStaff("00000000-0000-4000-8000-000000000000"))).rejects.toBeInstanceOf(RefundOrderNotFoundError);
    expect(await refunds(o.orderId)).toHaveLength(0);
  });

  it("cancelling a partly refunded order returns only what remains", async () => {
    const o = await paidOrder();
    await svc.issue(goodwill(o.orderId, "6.00"));
    expect(await svc.cancel(asStaff(o.orderId))).toMatchObject({ amount: "20.00", status: "submitted" });
    expect((await refunds(o.orderId)).reduce((s, r) => s + Number(r.amount), 0)).toBe(26);
  });

  it("cancelling gives the same-day place back", async () => {
    const o = await paidOrder();
    const slot = (
      await one<{ id: string }>(
        `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('10:00', '12:00', '09:00', 5, 'test')
         ON CONFLICT (start_time, end_time) DO UPDATE SET capacity = 5 RETURNING id::text AS id`,
      )
    ).id;
    await pool.query(
      `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, window_start, window_end)
       VALUES ($1, current_date, $2, 'confirmed', now(), now() + interval '2 hours')`,
      [slot, o.orderId],
    );
    await svc.cancel(asCustomer(o));
    expect(await one(`SELECT state FROM public.delivery_slot_booking WHERE order_id = $1`, [o.orderId])).toEqual({ state: "released" });
  });

  // ── Asking for a refund ─────────────────────────────────────────────────────────────────────────

  it("a shopper can ask once per order; it moves no money; a refund answers it", async () => {
    const o = await paidOrder();
    const stranger = await paidOrder();
    const ask = { orderId: o.orderId, customerId: o.customerId, message: "  Two cartons were missing  ", items: [{ orderItemId: o.item.Tracked!, quantity: 1 }, { orderItemId: stranger.item.Plain!, quantity: 1 }] };

    const id = await svc.raiseRequest(ask);
    expect(await one(`SELECT message, status FROM public.refund_request WHERE id = $1`, [id])).toEqual({ message: "Two cartons were missing", status: "open" });
    // The line from someone else's order was not recorded against this request.
    expect(await count(`SELECT 1 FROM public.refund_request_item WHERE request_id = $1`, [id])).toBe(1);
    expect(await refunds(o.orderId)).toHaveLength(0);

    await expect(svc.raiseRequest(ask)).rejects.toBeInstanceOf(RequestAlreadyOpenError);
    await expect(svc.raiseRequest({ ...ask, customerId: stranger.customerId })).rejects.toBeInstanceOf(RefundOrderNotFoundError);

    await svc.issue(items(o.orderId, [{ orderItemId: o.item.Tracked!, quantity: 1 }]));
    expect(await one(`SELECT status, decided_by FROM public.refund_request WHERE id = $1`, [id])).toEqual({ status: "refunded", decided_by: "staff-1" });
  });

  it("a decline closes the request, and a second decision cannot overwrite the first", async () => {
    const o = await paidOrder();
    const id = await svc.raiseRequest({ orderId: o.orderId, customerId: o.customerId, message: "Arrived warm", items: [] });
    await svc.declineRequest(id, "Delivered within the window", "staff-2");
    expect(await one(`SELECT status, outcome_note, decided_by FROM public.refund_request WHERE id = $1`, [id]))
      .toEqual({ status: "declined", outcome_note: "Delivered within the window", decided_by: "staff-2" });
    await expect(svc.declineRequest(id, "changed my mind", "staff-3")).rejects.toBeInstanceOf(RequestNotFoundError);
    await expect(svc.declineRequest("not-a-uuid", "", "staff-3")).rejects.toBeInstanceOf(RequestNotFoundError);
  });
});
