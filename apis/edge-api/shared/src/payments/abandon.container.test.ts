import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import { abandonOrder } from "./abandon";
import type { IntentStatus } from "./gateway";

/** 113: an order nobody paid for is closed only once its payment can't be taken, and everything it held is freed. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

interface Seeded {
  customerId: string;
  orderId: string;
}

/** An unpaid checkout: an intent, 200 points and a promotion use held, a delivery place held, a cart line. */
async function checkout(opts: { intent?: boolean } = {}): Promise<Seeded> {
  const tag = `ab-${++seq}`;
  const customerId = (
    await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [
      tag,
      `${tag}@example.test`,
    ])
  ).id;
  const orderId = (
    await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
       VALUES ($1, $2, 'pending_payment', 'AUD', 40, 40, 0, '{}'::jsonb) RETURNING id::text AS id`,
      [customerId, `EFY-AB${seq}`],
    )
  ).id;
  if (opts.intent !== false) {
    await pool.query(
      `INSERT INTO public.payment (order_id, stripe_payment_intent_id, amount, status) VALUES ($1, $2, 40, 'requires_payment')`,
      [orderId, `pi_${tag}`],
    );
  }
  await pool.query(
    `INSERT INTO public.points_hold (order_id, customer_id, points, state, held_until) VALUES ($1, $2, 200, 'held', now() + interval '10 minutes')`,
    [orderId, customerId],
  );
  const promotionId = (
    await one<{ id: string }>(
      `INSERT INTO public.promotion (name, kind, trigger, value_type, amount_off, applies_to, published_at, created_by)
       VALUES ($1, 'cart', 'automatic', 'amount', 5, 'cart', now() - interval '1 minute', 'staff-1') RETURNING id::text AS id`,
      [`P${seq}`],
    )
  ).id;
  await pool.query(
    `INSERT INTO public.promotion_use (promotion_id, customer_id, order_id, goods_amount, status, hold_expires_at)
     VALUES ($1, $2, $3, 5, 'held', now() + interval '10 minutes')`,
    [promotionId, customerId, orderId],
  );
  const slot = (
    await one<{ id: string }>(
      `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by) VALUES ('10:00', '12:00', '09:00', 5, 'test')
       ON CONFLICT (start_time, end_time) DO UPDATE SET capacity = 5 RETURNING id::text AS id`,
    )
  ).id;
  await pool.query(
    `INSERT INTO public.delivery_slot_booking (slot_id, delivery_date, order_id, state, held_until, window_start, window_end)
     VALUES ($1, current_date + 1, $2, 'held', now() + interval '10 minutes', now() + interval '1 day', now() + interval '1 day 2 hours')`,
    [slot, orderId],
  );
  return { customerId, orderId };
}

function gateway(answer: IntentStatus | Error) {
  const calls: string[] = [];
  return {
    calls,
    gw: {
      async cancelPaymentIntent(id: string): Promise<IntentStatus> {
        calls.push(id);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

const state = async (orderId: string) =>
  one<{ order: string; payment: string | null; points: string; use: string; reason: string | null; booking: string }>(
    `SELECT o.status AS order,
            (SELECT status FROM public.payment WHERE order_id = o.id) AS payment,
            (SELECT state FROM public.points_hold WHERE order_id = o.id) AS points,
            (SELECT status FROM public.promotion_use WHERE order_id = o.id) AS use,
            (SELECT release_reason FROM public.promotion_use WHERE order_id = o.id) AS reason,
            (SELECT state FROM public.delivery_slot_booking WHERE order_id = o.id) AS booking
       FROM public."order" o WHERE o.id = $1`,
    [orderId],
  );

d("113 - abandoning an unpaid order", () => {
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

  it("cancels the payment first, then frees the points, the code and the delivery place", async () => {
    const s = await checkout();
    const { gw, calls } = gateway("canceled");
    const r = await abandonOrder({ gateway: gw, transact, q: pool }, s.orderId);
    expect(r.result).toBe("abandoned");
    expect(r.outcome).toMatchObject({ applied: true, customerSub: expect.stringMatching(/^ab-/), pointsReleased: true });
    expect(calls).toEqual([expect.stringMatching(/^pi_ab-/)]);
    expect(await state(s.orderId)).toEqual({
      order: "abandoned", payment: "canceled", points: "released", use: "released", reason: "expired", booking: "released",
    });
  });

  it("a second call finds nothing to do and asks the provider nothing", async () => {
    const s = await checkout();
    await abandonOrder({ gateway: gateway("canceled").gw, transact, q: pool }, s.orderId);
    const again = gateway("canceled");
    expect((await abandonOrder({ gateway: again.gw, transact, q: pool }, s.orderId)).result).toBe("gone");
    expect(again.calls).toEqual([]);
  });

  it("a checkout that never reached the provider is closed without asking it", async () => {
    const s = await checkout({ intent: false });
    const g = gateway(new Error("must not be called"));
    expect((await abandonOrder({ gateway: g.gw, transact, q: pool }, s.orderId)).result).toBe("abandoned");
    expect(g.calls).toEqual([]);
  });

  it("a payment the customer is still making leaves everything held", async () => {
    for (const answer of ["requires_action", "requires_payment"] as const) {
      const s = await checkout();
      expect((await abandonOrder({ gateway: gateway(answer).gw, transact, q: pool }, s.orderId)).result).toBe("in_progress");
      expect(await state(s.orderId)).toMatchObject({ order: "pending_payment", points: "held", use: "held", booking: "held" });
    }
  });

  it("a provider that can't be asked leaves everything held", async () => {
    const s = await checkout();
    const r = await abandonOrder({ gateway: gateway(new Error("timeout")).gw, transact, q: pool }, s.orderId);
    expect(r.result).toBe("unreachable");
    expect((await state(s.orderId)).order).toBe("pending_payment");
  });

  it("a payment that went through is settled by commerce, or left for the webhook when there is no settle", async () => {
    const s = await checkout();
    const settled: string[] = [];
    const r = await abandonOrder(
      { gateway: gateway("succeeded").gw, transact, q: pool, settlePaid: async (id) => settled.push(id) },
      s.orderId,
    );
    expect(r.result).toBe("paid");
    expect(settled).toEqual([s.orderId]);

    const t = await checkout();
    expect((await abandonOrder({ gateway: gateway("succeeded").gw, transact, q: pool }, t.orderId)).result).toBe("paid");
    expect((await state(t.orderId)).order).toBe("pending_payment");
  });

  it("leaves the cart alone, so the customer can check out again", async () => {
    const s = await checkout();
    await pool.query(`INSERT INTO public.cart (customer_id) VALUES ($1) ON CONFLICT DO NOTHING`, [s.customerId]);
    await abandonOrder({ gateway: gateway("canceled").gw, transact, q: pool }, s.orderId);
    expect(await one(`SELECT count(*)::int AS n FROM public.cart WHERE customer_id = $1`, [s.customerId])).toEqual({ n: 1 });
  });
});
