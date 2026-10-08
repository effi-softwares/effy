import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql, transactorFor, type Transactor } from "@effy/edge-shared";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";
import { effyDays, melbourneDate, slotLoad } from "@effy/edge-shared/delivery";
import {
  finalizeFailed, finalizeSucceeded, WebhookSignatureError,
  type IntentStatus, type PaymentGateway, type PaymentIntent, type WebhookEvent,
} from "@effy/edge-shared/payments";
import { credit, debit, usable } from "@effy/edge-shared/points";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createOrdersRepository } from "../orders/repository";
import { createOrdersService, OrderNotFoundError as ReceiptNotFoundError } from "../orders/service";
import { createWebhookHandler } from "../webhook/handler";
import { DeliveryChoiceError } from "./delivery-choice";
import { defaultQuoter, quoteForCheckout, type PromoSource } from "./quote";
import {
  createCheckoutService, DeliveryFeeChangedError, EmptyCartError, OrderNotFoundError, PointsExceedTotalError, type CheckoutService,
  type IntentInput,
} from "./service";
import { createCheckoutStore, SlotUnavailableError, type CheckoutStore } from "./store";

/**
 * 070 — checkout, payment finalisation and the provider webhook against the REAL schema.
 *
 * ⚠ THESE CANNOT BE UNIT TESTS. "Exactly once" is a row lock on the order; slot capacity is a row
 * lock on the slot; the stock floor is one statement; and "an event is recorded only if it was
 * handled" is a property of a transaction. A fake store proves none of them. The payment PROVIDER
 * is the one thing faked — it is behind a port for exactly this.
 *
 * ⚠ WHY THE REAL CLOCK. The slot load compares `held_until` with the DATABASE's now(), so a frozen
 * clock in the test would hold places the database already considers lapsed. The fixture is built
 * to be open at any time of day: one collection run at 23:57 with no buffer and no turnaround, and
 * a slot starting at 23:58.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const log = { warn: () => undefined, error: () => undefined, info: () => undefined } as never;
const scope = { log };

/** Unique across the whole run: the payment table outlives one test's gateway. */
let intentSeq = 0;

/** The provider, in memory. Intents are keyed on the idempotency key, as the real one keys them. */
function fakeGateway() {
  const byKey = new Map<string, PaymentIntent & { amount: number }>();
  const byId = new Map<string, PaymentIntent & { amount: number }>();
  const events = new Map<string, WebhookEvent>();
  const gw: PaymentGateway = {
    async createPaymentIntent(input) {
      const had = byKey.get(input.idempotencyKey);
      if (had) return had;
      const intent = { id: `pi_${++intentSeq}`, clientSecret: `pi_${intentSeq}_secret`, status: "requires_payment" as IntentStatus, availableMethods: ["card"], amount: input.amountMinor };
      byKey.set(input.idempotencyKey, intent);
      byId.set(intent.id, intent);
      return intent;
    },
    async retrievePaymentIntent(id) {
      const i = byId.get(id);
      if (!i) throw new Error("no such intent");
      return i;
    },
    // 074 — as the real provider: a paid or processing intent cannot be cancelled; it says what it is.
    async cancelPaymentIntent(id) {
      const i = byId.get(id);
      if (!i) throw new Error("no such intent");
      if (i.status === "requires_payment") i.status = "canceled";
      return i.status;
    },
    async constructWebhookEvent(_raw, signature) {
      const evt = events.get(signature);
      if (!evt) throw new WebhookSignatureError();
      return evt;
    },
    createRefund: async () => { throw new Error("not used"); },
    listRefunds: async () => [],
    describePaymentMethod: async () => ({ type: "card", brand: "visa", last4: "4242" }),
    ensureCustomer: async (i) => i.existing || `cus_${i.customerId.slice(0, 8)}`,
    createCustomerSession: async () => ({ clientSecret: "cuss_secret" }),
    listSavedCards: async () => [],
    detachPaymentMethod: async () => undefined,
  };
  return {
    gw,
    created: () => byId.size,
    amountOf: (id: string) => byId.get(id)!.amount,
    settle: (id: string, status: IntentStatus) => { byId.get(id)!.status = status; },
    /** Register an event; the returned string is the "signature" that verifies it. */
    sign: (evt: WebhookEvent) => { events.set(evt.id, evt); return evt.id; },
  };
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let store: CheckoutStore;
let gateway: ReturnType<typeof fakeGateway>;
let svc: CheckoutService;
let shopId: string;
let slotId: string;
const product: Record<string, string> = {};
const PLAN = "00000000-0000-0000-0000-0000000000d1";
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;
const count = async (sql: string, args: unknown[] = []) => Number((await one<{ n: string }>(`SELECT count(*) AS n FROM (${sql}) q`, args)).n);

/** A fresh shopper with an address in the served zone and a cart. */
async function shopper(cart: Record<string, number>) {
  const tag = `chk-${++seq}`;
  const { id: customerId } = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email, given_name, family_name) VALUES ($1, $2, 'Test', 'Shopper') RETURNING id::text AS id`,
    [tag, `${tag}@example.test`],
  );
  const { id: addressId } = await one<{ id: string }>(
    `INSERT INTO public.customer_address (customer_id, recipient_name, line1, city, region, postal_code)
     VALUES ($1, 'Recipient Name', '1 Test St', 'Richmond', 'VIC', '3121') RETURNING id::text AS id`,
    [customerId],
  );
  const { id: cartId } = await one<{ id: string }>(`INSERT INTO public.cart (customer_id) VALUES ($1) RETURNING id::text AS id`, [customerId]);
  for (const [name, qty] of Object.entries(cart)) {
    await pool.query(`INSERT INTO public.cart_item (cart_id, product_id, quantity) VALUES ($1, $2, $3)`, [cartId, product[name], qty]);
  }
  return { customerId, addressId, cartId, sub: tag };
}

const input = (addressId: string, over: Partial<IntentInput> = {}): IntentInput => ({
  addressId, billingAddressId: "", deliveryMethod: "standard", sameDaySlotId: "", standardDate: "",
  deliveryInstructions: { handover: null, note: null }, wantsProviderMethodList: false, pointsToUse: 0, shownDeliveryAmount: "", ...over,
});

/** 074 — give a shopper points, as back-office would. */
const givePoints = (customerId: string, points: number) =>
  transact((tx) => credit(tx, { customerId, points, kind: "staff_credit", reason: "goodwill", author: { kind: "staff", sub: "s" }, now: new Date() }));
const pointsNow = (customerId: string) => usable(pool, customerId, new Date());

const orderRow = (orderId: string) =>
  one<{ status: string; grand: string; items: string; fee: string; handover: string | null; note: string | null }>(
    `SELECT status, grand_total_amount::text AS grand, item_subtotal_amount::text AS items, delivery_fee_amount::text AS fee,
            delivery_handover AS handover, delivery_note AS note FROM public."order" WHERE id = $1`,
    [orderId],
  );
const stockOf = async (name: string) => (await one<{ n: number }>(`SELECT stock_on_hand AS n FROM public.product WHERE id = $1`, [product[name]])).n;
const pay = (orderId: string) => transact((tx) => finalizeSucceeded(tx, orderId));
const bookedToday = async () => (await slotLoad(pool, melbourneDate(new Date()))).get(slotId) ?? 0;

d("070 — checkout, finalisation and the webhook against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 12 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);

    await pool.query(`TRUNCATE public.delivery_slot, public.delivery_collection_run CASCADE`);
    await pool.query(`DELETE FROM public.delivery_fee_plan`);
    shopId = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('CHK', 'Checkout shop') RETURNING id::text AS id`)).id;
    await pool.query(`INSERT INTO public.shop_staff (shop_id, cognito_sub, email, role, status)
                      VALUES ($1, 'chk-staff', 'staff@example.test', 'shop_manager', 'active')`, [shopId]).catch(() => undefined);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('chk-type', 'Checkout type')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('chk-cat', 'Checkout category')`);
    for (const [name, price, shopPrice, tracked, onHand] of [
      ["Milk", "4.50", "4.00", false, null],
      ["Scarce", "2.00", "2.00", true, 2],
      ["Last", "3.00", "3.00", true, 1],
    ] as const) {
      product[name] = (
        await one<{ id: string }>(
          `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, shop_price_amount,
                                       short_description, created_by, status, approved_at, stock_tracked, stock_on_hand)
           SELECT $1, (SELECT id FROM public.product_type WHERE key='chk-type'), (SELECT id FROM public.category WHERE key='chk-cat'),
                  $2, $3::numeric, $4::numeric, 'd', 'seed', 'active', now(), $5, $6
           RETURNING id::text AS id`,
          [shopId, name, price, shopPrice, tracked, onHand],
        )
      ).id;
    }

    await pool.query(`
      INSERT INTO public.delivery_zone (id, code, name, status, sameday_eligible, updated_by) VALUES
        ('00000000-0000-0000-0000-0000000000e1', 'C-Z1', 'Checkout zone', 'active', true, 'test');
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by) VALUES ('00000000-0000-0000-0000-0000000000e1', '3121', 3.40, 'manual', 'test');
      -- $6.00 anywhere, any weight; a delivery today is $5.00 dearer.
      INSERT INTO public.delivery_fee_plan (id, name, is_active, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('${PLAN}', 'Checkout plan', true, 5.00, 0.50, 4.00, 40.00, 'test');
      INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${PLAN}', NULL, 6.00);
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('00000000-0000-0000-0000-0000000000d1', 100000, 0.00);
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, sameday_hub_turnaround_min, updated_by)
        VALUES (1, -37.81, 144.96, 0, 0, 'test')
        ON CONFLICT (id) DO UPDATE SET sameday_prep_buffer_min = 0, sameday_hub_turnaround_min = 0;
      INSERT INTO public.delivery_collection_run (run_time, label, status, updated_by) VALUES ('23:57', 'Late run', 'active', 'test');
    `);
    slotId = (
      await one<{ id: string }>(
        `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
         VALUES ('23:58', '23:59', '23:58', 3, 'test') RETURNING id::text AS id`,
      )
    ).id;

    store = createCheckoutStore(pool, transact);
  }, 180_000);

  beforeEach(async () => {
    gateway = fakeGateway();
    svc = createCheckoutService({
      store, gateway: gateway.gw, policy: () => loadCartPolicy(pool), promos: async () => ({ cents: 0, promo: null }),
      quoter: defaultQuoter(pool), publishableKey: "pk_test_x", transact,
    });
    await pool.query(`DELETE FROM public.delivery_slot_booking`);
    await pool.query(`UPDATE public.delivery_slot SET capacity = 3, status = 'active' WHERE id = $1`, [slotId]);
    await pool.query(`UPDATE public.product SET stock_on_hand = 2 WHERE id = $1`, [product.Scarce]);
    await pool.query(`UPDATE public.product SET stock_on_hand = 1 WHERE id = $1`, [product.Last]);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  // ── The intent ──────────────────────────────────────────────────────────────────────────────────

  it("charges items plus the delivery fee, computed by the platform, and records the pending order", async () => {
    const s = await shopper({ Milk: 2 });
    const r = await svc.createIntent(s.customerId, input(s.addressId), new Date());

    const o = await orderRow(r.orderId);
    expect(o.status).toBe("pending_payment");
    expect(o.items).toBe("9.00");
    expect(o.fee).toBe("6.00");
    expect(o.grand).toBe("15.00");
    expect(r.grandTotalAmount).toBe("15.00");
    expect(gateway.amountOf((await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [r.orderId])).i)).toBe(1500);
    expect(r.billingDetails).toEqual({
      name: "Recipient Name", email: `${s.sub}@example.test`,
      address: { line1: "1 Test St", line2: "", city: "Richmond", state: "VIC", postalCode: "3121", country: "AU" },
    });
    // Omitted, not null, for a web checkout with no same-day package.
    expect(r).not.toHaveProperty("customerSessionSecret");
    expect(r).not.toHaveProperty("customerId");
    expect(r).not.toHaveProperty("slotHeldUntil");
  });

  it("a repeated intent for the same basket resolves to the same order and the same payment intent", async () => {
    const s = await shopper({ Milk: 1 });
    const a = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const b = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    expect(b.orderId).toBe(a.orderId);
    expect(b.clientSecret).toBe(a.clientSecret);
    expect(gateway.created()).toBe(1);
    expect(await count(`SELECT 1 FROM public."order" WHERE customer_id = $1`, [s.customerId])).toBe(1);
  });

  it("a changed basket keeps the order and gets a NEW intent for the new amount", async () => {
    const s = await shopper({ Milk: 1 });
    const a = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    await pool.query(`UPDATE public.cart_item SET quantity = 3 WHERE cart_id = $1`, [s.cartId]);
    const b = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    expect(b.orderId).toBe(a.orderId);
    expect(b.clientSecret).not.toBe(a.clientSecret);
    expect(b.grandTotalAmount).toBe("19.50");
    expect(await count(`SELECT 1 FROM public.order_item WHERE order_id = $1`, [a.orderId])).toBe(1);
  });

  it("an empty cart is refused before anything is written or the provider is called", async () => {
    const s = await shopper({});
    await expect(svc.createIntent(s.customerId, input(s.addressId), new Date())).rejects.toBeInstanceOf(EmptyCartError);
    expect(gateway.created()).toBe(0);
    expect(await count(`SELECT 1 FROM public."order" WHERE customer_id = $1`, [s.customerId])).toBe(0);
  });

  it("charges only what the shop can supply, and keeps both the customer's price and the shop's", async () => {
    const s = await shopper({ Scarce: 5, Milk: 1 });
    const r = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    expect((await orderRow(r.orderId)).items).toBe("8.50"); // 2 × 2.00 + 4.50, not 5 × 2.00
    const milk = await one<{ unit: string; shop: string; cls: string }>(
      `SELECT unit_price_amount::text AS unit, shop_unit_price_amount::text AS shop, storage_class AS cls
         FROM public.order_item WHERE order_id = $1 AND product_id = $2`,
      [r.orderId, product.Milk],
    );
    expect(milk).toEqual({ unit: "4.50", shop: "4.00", cls: "ambient" });
  });

  it("an order whose earlier payment settled is NOT recycled: the next checkout gets its own order", async () => {
    const s = await shopper({ Milk: 1 });
    const first = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const intentId = (await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [first.orderId])).i;
    gateway.settle(intentId, "succeeded"); // paid, and nothing told the platform

    await pool.query(`INSERT INTO public.cart_item (cart_id, product_id, quantity) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING`, [s.cartId, product.Milk]);
    const second = await svc.createIntent(s.customerId, input(s.addressId), new Date());

    expect(second.orderId).not.toBe(first.orderId);
    expect((await orderRow(first.orderId)).status).toBe("paid"); // settled on the way past
    expect((await orderRow(second.orderId)).status).toBe("pending_payment");
  });

  it("delivery instructions are written on every intent — including with nothing — and never on a paid order", async () => {
    const s = await shopper({ Milk: 1 });
    const a = await svc.createIntent(s.customerId, input(s.addressId, { deliveryInstructions: { handover: "leave_at_door", note: "Gate 4" } }), new Date());
    expect(await orderRow(a.orderId)).toMatchObject({ handover: "leave_at_door", note: "Gate 4" });

    await svc.createIntent(s.customerId, input(s.addressId), new Date());
    expect(await orderRow(a.orderId)).toMatchObject({ handover: null, note: null });

    await pay(a.orderId);
    await store.setOrderDeliveryInstructions(a.orderId, "leave_at_door", "too late");
    expect(await orderRow(a.orderId)).toMatchObject({ handover: null, note: null });
  });

  // ── Recording a payment ─────────────────────────────────────────────────────────────────────────

  it("a payment is recorded once: fan-out, stock, receipt, notifications, cart — and a second delivery does nothing", async () => {
    const s = await shopper({ Scarce: 1, Milk: 2 });
    const { orderId } = await svc.createIntent(s.customerId, input(s.addressId), new Date());

    const first = await pay(orderId);
    expect(first).toMatchObject({ applied: true, stockShortfall: false, slotConfirmed: false });
    // 071 — who is told: the fulfilling shop(s) and the customer's token subject, read from the
    // rows this transaction wrote. A redelivery names nobody.
    expect(first.shopIds).toHaveLength(1);
    expect(first.shopIds[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.customerSub).toEqual(expect.any(String));
    // Both products here are tracked, so the fulfilling shop's stock screen is told too.
    expect(first.stockShopIds).toEqual(first.shopIds);
    const second = await pay(orderId);
    expect(second.applied).toBe(false);
    expect(second.shopIds).toEqual([]);
    expect(second.customerSub).toBeNull();

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(await stockOf("Scarce")).toBe(1); // 2 − 1, once
    expect(await count(`SELECT 1 FROM public.stock_movement WHERE order_id = $1`, [orderId])).toBe(1); // untracked Milk writes none
    expect(await count(`SELECT 1 FROM public.receipt_dispatch WHERE order_id = $1`, [orderId])).toBe(1);
    expect(await count(`SELECT 1 FROM public.event_outbox WHERE aggregate_id = $1`, [orderId])).toBe(1);
    expect(await count(`SELECT 1 FROM public.cart_item WHERE cart_id = $1`, [s.cartId])).toBe(0);
    expect((await one<{ s: string }>(`SELECT status AS s FROM public.payment WHERE order_id = $1`, [orderId])).s).toBe("succeeded");

    const sf = await one<{ items: number; cust: string; shop: string; method: string; fee: string | null }>(
      `SELECT item_count AS items, subtotal_amount::text AS cust, shop_subtotal_amount::text AS shop,
              delivery_method AS method, delivery_fee_amount::text AS fee FROM public.shop_fulfillment WHERE order_id = $1`,
      [orderId],
    );
    // ⚠ No fee on a shop's portion (077): delivery is priced once, on the order.
    expect(sf).toEqual({ items: 3, cust: "11.00", shop: "10.00", method: "standard", fee: null });
    expect((await orderRow(orderId)).fee).toBe("6.00");
  });

  it("two deliveries of one payment racing on separate connections apply once", async () => {
    const s = await shopper({ Scarce: 1 });
    const { orderId } = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const outs = await Promise.all([pay(orderId), pay(orderId), pay(orderId), pay(orderId)]);
    expect(outs.filter((o) => o.applied)).toHaveLength(1);
    expect(await stockOf("Scarce")).toBe(1);
    expect(await count(`SELECT 1 FROM public.shop_fulfillment WHERE order_id = $1`, [orderId])).toBe(1);
  });

  it("two shoppers paying at once for the last unit never drive the count negative, and the oversell is flagged", async () => {
    const a = await shopper({ Last: 1 });
    const b = await shopper({ Last: 1 });
    // Both intents are created while the unit is still on the shelf.
    const oa = await svc.createIntent(a.customerId, input(a.addressId), new Date());
    const ob = await svc.createIntent(b.customerId, input(b.addressId), new Date());

    const outs = await Promise.all([pay(oa.orderId), pay(ob.orderId)]);
    expect(outs.every((o) => o.applied)).toBe(true);
    expect(await stockOf("Last")).toBe(0);
    expect(outs.filter((o) => o.stockShortfall)).toHaveLength(1);
    // The pick line is pre-flagged with exactly the missing unit.
    expect(
      (await pool.query<{ u: number }>(
        `SELECT fi.unavailable_quantity AS u FROM public.fulfillment_item fi
           JOIN public.shop_fulfillment sf ON sf.id = fi.shop_fulfillment_id WHERE sf.order_id = ANY($1::uuid[])`,
        [[oa.orderId, ob.orderId]],
      )).rows.map((r) => r.u),
    ).toEqual([1]);
  });

  // ── Same-day places ─────────────────────────────────────────────────────────────────────────────

  const sameDay = (addressId: string, over: Partial<IntentInput> = {}) =>
    input(addressId, { deliveryMethod: "same_day", sameDaySlotId: slotId, ...over });

  it("a same-day intent holds a place before any payment intent exists, and payment confirms it", async () => {
    const s = await shopper({ Milk: 1 });
    const r = await svc.createIntent(s.customerId, sameDay(s.addressId), new Date());
    expect(r.slotHeldUntil).toMatch(/[+-]\d\d:\d\d$/); // Melbourne offset, not Z
    expect(await bookedToday()).toBe(1);

    // Refreshing the payment step moves the order's own place; it never takes a second.
    await svc.createIntent(s.customerId, sameDay(s.addressId), new Date());
    expect(await bookedToday()).toBe(1);

    const out = await pay(r.orderId);
    expect(out).toMatchObject({ slotConfirmed: true, slotOverCapacity: false });
    expect(await one(`SELECT state, over_capacity FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId]))
      .toEqual({ state: "confirmed", over_capacity: false });
  });

  it("twenty shoppers at once never exceed a slot's capacity, and the refused are refused before the provider is called", async () => {
    const shoppers = await Promise.all(Array.from({ length: 20 }, () => shopper({ Milk: 1 })));
    const results = await Promise.allSettled(shoppers.map((s) => svc.createIntent(s.customerId, sameDay(s.addressId), new Date())));

    const held = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(held).toHaveLength(3);
    expect(refused).toHaveLength(17);
    for (const r of refused) {
      expect(r.reason).toBeInstanceOf(DeliveryChoiceError);
      expect((r.reason as DeliveryChoiceError).code).toBe("slot_unavailable");
    }
    expect(await bookedToday()).toBe(3);
    expect(gateway.created()).toBe(3); // nothing to pay for a place that was not held
  });

  it("⚠ a slot with NO limit holds a place for everyone, and a late payer into it is never over capacity", async () => {
    await pool.query(`UPDATE public.delivery_slot SET capacity = NULL WHERE id = $1`, [slotId]);
    const shoppers = await Promise.all(Array.from({ length: 20 }, () => shopper({ Milk: 1 })));
    const results = await Promise.allSettled(shoppers.map((s) => svc.createIntent(s.customerId, sameDay(s.addressId), new Date())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(await bookedToday()).toBe(20);

    const late = await shopper({ Milk: 1 });
    const r = await svc.createIntent(late.customerId, sameDay(late.addressId), new Date());
    await pool.query(`UPDATE public.delivery_slot_booking SET held_until = now() - interval '1 minute' WHERE order_id = $1`, [r.orderId]);
    expect(await pay(r.orderId)).toMatchObject({ slotConfirmed: true, slotOverCapacity: false });
  });

  it("a refused hold writes nothing and leaves the order's previous capture intact", async () => {
    const s = await shopper({ Milk: 1 });
    const r = await svc.createIntent(s.customerId, input(s.addressId), new Date()); // standard
    await pool.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [slotId]);

    const now = new Date();
    await expect(
      store.captureDelivery(r.orderId, {}, now, [{
        shopId, method: "same_day", promisedDay: melbourneDate(now), slotId,
        windowStart: now, windowEnd: new Date(now.getTime() + 60_000),
      }], { slotId, date: melbourneDate(now), now }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);

    expect(await one(`SELECT method FROM public.order_package_delivery WHERE order_id = $1`, [r.orderId])).toEqual({ method: "standard" });
    expect(await bookedToday()).toBe(0);
  });

  it("a late payer into a slot that has since filled is honoured and flagged, never refused after paying", async () => {
    await pool.query(`UPDATE public.delivery_slot SET capacity = 1 WHERE id = $1`, [slotId]);
    const late = await shopper({ Milk: 1 });
    const r = await svc.createIntent(late.customerId, sameDay(late.addressId), new Date());
    await pool.query(`UPDATE public.delivery_slot_booking SET held_until = now() - interval '1 minute' WHERE order_id = $1`, [r.orderId]);
    expect(await bookedToday()).toBe(0); // a lapsed hold stops counting

    const other = await shopper({ Milk: 1 });
    await svc.createIntent(other.customerId, sameDay(other.addressId), new Date()); // takes the place

    const out = await pay(r.orderId);
    expect(out).toMatchObject({ slotConfirmed: true, slotOverCapacity: true });
    expect(await one(`SELECT state, over_capacity FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId]))
      .toEqual({ state: "confirmed", over_capacity: true });
  });

  // ── The shopper's return ────────────────────────────────────────────────────────────────────────

  it("confirm settles a succeeded payment, is safe to repeat, and records how it was paid", async () => {
    const s = await shopper({ Milk: 1 });
    const { orderId } = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const intentId = (await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [orderId])).i;

    expect(await svc.confirm(scope, s.customerId, orderId)).toEqual({ orderId, paid: false });
    expect((await orderRow(orderId)).status).toBe("pending_payment");

    gateway.settle(intentId, "succeeded");
    expect(await svc.confirm(scope, s.customerId, orderId)).toEqual({ orderId, paid: true });
    expect(await svc.confirm(scope, s.customerId, orderId)).toEqual({ orderId, paid: true });
    expect(await count(`SELECT 1 FROM public.receipt_dispatch WHERE order_id = $1`, [orderId])).toBe(1);
    expect(await one(`SELECT method_type, method_brand, method_last4 FROM public.payment WHERE order_id = $1`, [orderId]))
      .toEqual({ method_type: "card", method_brand: "visa", method_last4: "4242" });
  });

  it("confirm answers not-found for another shopper's order and for a malformed id", async () => {
    const s = await shopper({ Milk: 1 });
    const other = await shopper({});
    const { orderId } = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    await expect(svc.confirm(scope, other.customerId, orderId)).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(svc.confirm(scope, s.customerId, "not-a-uuid")).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  // ── The shopper's history and receipt ───────────────────────────────────────────────────────────

  it("the receipt reads back what was sold: every statement runs, nothing names a shop, and it is the owner's only", async () => {
    const orders = createOrdersService({ repo: createOrdersRepository(pool), presign: async (k) => (k ? `https://img/${k}` : null) });
    const s = await shopper({ Milk: 2 });
    const stranger = await shopper({});
    await pool.query(`INSERT INTO public.product_media (product_id, storage_key, is_primary) VALUES ($1, 'milk.jpg', true) ON CONFLICT DO NOTHING`, [product.Milk]);
    const r = await svc.createIntent(s.customerId, sameDay(s.addressId, { deliveryInstructions: { handover: null, note: "Gate 4" } }), new Date());
    gateway.settle((await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [r.orderId])).i, "succeeded");
    await svc.confirm(scope, s.customerId, r.orderId);

    const o = await orders.get(scope, s.customerId, r.orderId);
    expect(o).toMatchObject({
      id: r.orderId, orderNumber: r.orderNumber, status: "paid", itemSubtotalAmount: "9.00", discountAmount: "0.00", promoCode: null,
      grandTotalAmount: r.grandTotalAmount, currency: "AUD", paymentStatus: "succeeded", stage: "confirmed", cancellable: true,
      deliveryInstructions: { handover: null, note: "Gate 4" }, paymentMethod: { type: "card", brand: "visa", last4: "4242" },
      fulfillments: [{ status: "pending", itemCount: 2, subtotalAmount: "9.00" }],
    });
    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({ productName: "Milk", unitPriceAmount: "4.50", quantity: 2, lineSubtotalAmount: "9.00", imageUrl: "https://img/milk.jpg" });
    expect(o.items[0]!.orderItemId).toMatch(/^[0-9a-f-]{36}$/);
    expect((o.deliveryAddress as { postalCode: string }).postalCode).toBe("3121");
    expect(o.arrivalEstimates).toHaveLength(1);
    expect(o.arrivalEstimates[0]).toMatchObject({ method: "same_day", promisedFrom: melbourneDate(new Date()) });
    expect(o.arrivalEstimates[0]!.windowStart).toMatch(/T23:58:00[+-]\d\d:\d\d$/);
    expect(o).not.toHaveProperty("refunds");
    expect(o).not.toHaveProperty("billingAddress");
    expect(JSON.stringify(o)).not.toContain(shopId);

    expect((await orders.list(s.customerId)).map((x) => [x.id, x.itemCount, x.grandTotalAmount])).toEqual([[r.orderId, 2, r.grandTotalAmount]]);
    expect(await orders.list(stranger.customerId)).toEqual([]);
    await expect(orders.get(scope, stranger.customerId, r.orderId)).rejects.toBeInstanceOf(ReceiptNotFoundError);
  });

  // ── The provider's notifications ────────────────────────────────────────────────────────────────

  async function pendingWithIntent() {
    const s = await shopper({ Scarce: 1 });
    const { orderId } = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const intentId = (await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [orderId])).i;
    return { ...s, orderId, intentId };
  }
  const recorded = (eventId: string) => count(`SELECT 1 FROM public.stripe_event WHERE event_id = $1`, [eventId]);
  const handlerWith = (t: Transactor, refunds = async () => undefined) =>
    createWebhookHandler({ gateway: gateway.gw, refunds, afterPaid: (sc, o, i) => svc.capturePaymentMethod(sc, o, i), transact: t });

  it("a succeeded notification pays the order, and its redelivery is a duplicate that changes nothing", async () => {
    const p = await pendingWithIntent();
    const sig = gateway.sign({ id: "evt_ok", type: "payment_intent.succeeded", paymentIntentId: p.intentId, intentStatus: "succeeded" });
    const handle = handlerWith(transact);

    expect(await handle(scope, "{}", sig)).toBe("handled");
    expect(await handle(scope, "{}", sig)).toBe("duplicate");
    expect((await orderRow(p.orderId)).status).toBe("paid");
    expect(await stockOf("Scarce")).toBe(1);
    expect(await recorded("evt_ok")).toBe(1);
  });

  it("⚠ a notification whose handling fails records NOTHING, so the provider's retry is processed", async () => {
    const p = await pendingWithIntent();
    const sig = gateway.sign({ id: "evt_flaky", type: "payment_intent.succeeded", paymentIntentId: p.intentId, intentStatus: "succeeded" });

    // The first delivery fails AFTER the work is done and before it commits — a dropped connection.
    let fail = true;
    const flaky: Transactor = (fn) =>
      transact(async (tx) => {
        const out = await fn(tx);
        if (fail) { fail = false; throw new Error("connection lost"); }
        return out;
      });
    const handle = handlerWith(flaky);

    await expect(handle(scope, "{}", sig)).rejects.toThrow("connection lost");
    expect(await recorded("evt_flaky")).toBe(0); // the defect this replaces left a row here
    expect((await orderRow(p.orderId)).status).toBe("pending_payment");
    expect(await stockOf("Scarce")).toBe(2);

    expect(await handle(scope, "{}", sig)).toBe("handled"); // the retry is NOT discarded
    expect((await orderRow(p.orderId)).status).toBe("paid");
    expect(await stockOf("Scarce")).toBe(1);
    expect(await recorded("evt_flaky")).toBe(1);
  });

  it("the same notification delivered concurrently is applied once", async () => {
    const p = await pendingWithIntent();
    const sig = gateway.sign({ id: "evt_race", type: "payment_intent.succeeded", paymentIntentId: p.intentId, intentStatus: "succeeded" });
    const handle = handlerWith(transact);
    const outs = await Promise.all(Array.from({ length: 6 }, () => handle(scope, "{}", sig)));
    expect(outs.filter((o) => o === "handled")).toHaveLength(1);
    expect(outs.filter((o) => o === "duplicate")).toHaveLength(5);
    expect(await stockOf("Scarce")).toBe(1);
  });

  it("a failed-payment notification fails the order and keeps the cart", async () => {
    const p = await pendingWithIntent();
    const sig = gateway.sign({ id: "evt_fail", type: "payment_intent.payment_failed", paymentIntentId: p.intentId, intentStatus: "failed" });
    expect(await handlerWith(transact)(scope, "{}", sig)).toBe("handled");
    expect((await orderRow(p.orderId)).status).toBe("failed");
    expect(await count(`SELECT 1 FROM public.cart_item WHERE cart_id = $1`, [p.cartId])).toBe(1);
    expect(await stockOf("Scarce")).toBe(2);
  });

  it("an invalid signature is refused, and an event type the platform does not act on is acknowledged unrecorded", async () => {
    const handle = handlerWith(transact);
    await expect(handle(scope, "{}", "forged")).rejects.toBeInstanceOf(WebhookSignatureError);

    const sig = gateway.sign({ id: "evt_other", type: "charge.updated", paymentIntentId: "" });
    expect(await handle(scope, "{}", sig)).toBe("ignored");
    expect(await recorded("evt_other")).toBe(0);
  });

  it("a refund notification reaches the refund handler inside the transaction, and its failure is retried too", async () => {
    const seen: string[] = [];
    let fail = true;
    const refunds = async (_tx: unknown, evt: WebhookEvent) => {
      if (fail) { fail = false; throw new Error("refund store down"); }
      seen.push(evt.refundId!);
    };
    const handle = createWebhookHandler({ gateway: gateway.gw, refunds, afterPaid: async () => undefined, transact });
    const sig = gateway.sign({ id: "evt_refund", type: "refund.failed", paymentIntentId: "", refundId: "re_1", refundStatus: "failed" });

    await expect(handle(scope, "{}", sig)).rejects.toThrow("refund store down");
    expect(await recorded("evt_refund")).toBe(0);
    expect(await handle(scope, "{}", sig)).toBe("handled");
    expect(await handle(scope, "{}", sig)).toBe("duplicate");
    expect(seen).toEqual(["re_1"]);
  });

  // ── 074 points ──────────────────────────────────────────────────────────────────────────────────

  it("074 — part-paid with points: the total is unchanged, the card intent is total − points, and paying spends them once (P6)", async () => {
    const s = await shopper({ Milk: 2 }); // 9.00 + 6.00 delivery = 15.00
    await givePoints(s.customerId, 1000);
    const r = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1000 }), new Date());
    expect(r).toMatchObject({ grandTotalAmount: "15.00", pointsUsed: 1000, pointsAmount: "10.00", cardAmount: "5.00", paidWithPoints: false });
    const intent = (await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [r.orderId])).i;
    expect(gateway.amountOf(intent)).toBe(500);
    expect(await pointsNow(s.customerId)).toBe(0); // held

    gateway.settle(intent, "succeeded");
    await svc.confirm({ log: console as never }, s.customerId, r.orderId);
    await svc.confirm({ log: console as never }, s.customerId, r.orderId); // a second settlement changes nothing
    expect(await count(`SELECT 1 FROM public.points_entry WHERE order_id = $1 AND kind = 'spent'`, [r.orderId])).toBe(1);
    expect(await pointsNow(s.customerId)).toBe(0);
    expect((await one<{ a: string }>(`SELECT amount::text AS a FROM public.payment WHERE order_id = $1`, [r.orderId])).a).toBe("5.00");
  });

  it("074 — points-only: no provider call, a `points` payment, a paid order, an empty cart and a queued receipt (P8)", async () => {
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 2000);
    const r = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1500 }), new Date());
    expect(r).toMatchObject({ paidWithPoints: true, clientSecret: "", cardAmount: "0.00", pointsAmount: "15.00" });
    expect(gateway.created()).toBe(0);
    expect((await orderRow(r.orderId)).status).toBe("paid");
    expect(await one(`SELECT provider, amount::text AS amount, status FROM public.payment WHERE order_id = $1`, [r.orderId])).toEqual({
      provider: "points", amount: "0.00", status: "succeeded",
    });
    expect(await count(`SELECT 1 FROM public.cart_item WHERE cart_id = $1`, [s.cartId])).toBe(0);
    expect(await count(`SELECT 1 FROM public.receipt_dispatch WHERE order_id = $1`, [r.orderId])).toBe(1);
    expect(await pointsNow(s.customerId)).toBe(500);
  });

  it("074 — switching an attempt to points-only cancels the card intent it had made", async () => {
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 2000);
    const first = await svc.createIntent(s.customerId, input(s.addressId), new Date());
    const intent = (await one<{ i: string }>(`SELECT stripe_payment_intent_id AS i FROM public.payment WHERE order_id = $1`, [first.orderId])).i;
    const r = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1500 }), new Date());
    expect(r.orderId).toBe(first.orderId);
    expect(r.paidWithPoints).toBe(true);
    expect((await gateway.gw.retrievePaymentIntent(intent)).status).toBe("canceled");
  });

  it("074 — refuses rather than clamps: too many points, more than the total, a card remainder under 50¢ (P9)", async () => {
    const s = await shopper({ Milk: 2 }); // 15.00
    await givePoints(s.customerId, 1400);
    await expect(svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1500 }), new Date())).rejects.toMatchObject({ usable: 1400 });
    await givePoints(s.customerId, 1000);
    await expect(svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1600 }), new Date())).rejects.toBeInstanceOf(PointsExceedTotalError);
    await expect(svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1470 }), new Date())).rejects.toMatchObject({ maxPoints: 1450 });
    expect(await count(`SELECT 1 FROM public.points_hold WHERE customer_id = $1 AND state = 'held'`, [s.customerId])).toBe(0);
  });

  it("074 — refreshing the same checkout is not refused by its own hold; a second checkout cannot take the same points (P4)", async () => {
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 1000);
    const a = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1000 }), new Date());
    const again = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1000 }), new Date());
    expect(again.orderId).toBe(a.orderId);
    // Another order for the same customer (as a second device would hold).
    const other = (
      await one<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address)
         VALUES ($1, 'EFY-OTHER1', 'pending_payment', 'AUD', 10, 10, 0, '{}'::jsonb) RETURNING id::text AS id`,
        [s.customerId],
      )
    ).id;
    await expect(store.holdPoints(other, s.customerId, 1, new Date())).rejects.toMatchObject({ usable: 0 });
  });

  it("074 — the late payer: the hold lapsed and the points went elsewhere; the order is paid, the gap recorded, the balance never negative (P7)", async () => {
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 1000);
    const r = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 1000 }), new Date());
    // The hold lapses, and meanwhile 600 points are debited.
    await pool.query(`UPDATE public.points_hold SET held_until = now() - interval '1 minute' WHERE order_id = $1`, [r.orderId]);
    await transact((tx) => debit(tx, { customerId: s.customerId, points: 600, reason: "correction", author: { kind: "staff", sub: "s" }, now: new Date() }));
    const out = await pay(r.orderId);
    expect(out).toMatchObject({ applied: true, pointsSpent: 400, pointsShortfall: 600 });
    expect((await orderRow(r.orderId)).status).toBe("paid");
    expect((await one<{ a: string }>(`SELECT points_shortfall_amount::text AS a FROM public."order" WHERE id = $1`, [r.orderId])).a).toBe("6.00");
    expect(await pointsNow(s.customerId)).toBe(0);
  });

  it("074 — a failed payment gives the held points back at once", async () => {
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 1000);
    const r = await svc.createIntent(s.customerId, input(s.addressId, { pointsToUse: 500 }), new Date());
    expect(await pointsNow(s.customerId)).toBe(500);
    await transact((tx) => finalizeFailed(tx, r.orderId));
    expect(await pointsNow(s.customerId)).toBe(1000);
  });
  // ── 077 — one delivery fee per order ────────────────────────────────────────────────────────────

  /** A product at any price, in any shop — the basket rules are tested to the cent. */
  async function priced(name: string, price: string, inShop = shopId): Promise<string> {
    product[name] = (
      await one<{ id: string }>(
        `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, shop_price_amount,
                                     short_description, created_by, status, approved_at, stock_tracked, stock_on_hand)
         SELECT $1, (SELECT id FROM public.product_type WHERE key='chk-type'), (SELECT id FROM public.category WHERE key='chk-cat'),
                $2, $3::numeric, $3::numeric, 'd', 'seed', 'active', now(), false, NULL
         RETURNING id::text AS id`,
        [inShop, name, price],
      )
    ).id;
    return product[name]!;
  }
  const otherShop = async (code: string) =>
    (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, $1) RETURNING id::text AS id`, [code])).id;

  const feeOf = (orderId: string) =>
    one<{ fee: string; lines: { kind: string; amount: string }[]; breakdown: Record<string, unknown> }>(
      `SELECT delivery_fee_amount::text AS fee, delivery_fee_breakdown -> 'lines' AS lines, delivery_fee_breakdown AS breakdown
         FROM public."order" WHERE id = $1`,
      [orderId],
    );
  const noPromo: PromoSource = async () => ({ cents: 0, promo: null });
  const quoteFor = (s: { customerId: string; addressId: string }, promos: PromoSource = noPromo) =>
    quoteForCheckout({ store, quoter: defaultQuoter(pool), promos }, s.customerId, s.addressId, new Date());

  /** Change the plan's prices for one test. The seeded plan was never activated, so it can be edited. */
  async function withPlan<T>(set: string, run: () => Promise<T>): Promise<T> {
    await pool.query(`UPDATE public.delivery_fee_plan SET ${set} WHERE id = '${PLAN}'`);
    try {
      return await run();
    } finally {
      await pool.query(
        `UPDATE public.delivery_fee_plan SET free_over_amount = NULL, small_order_under_amount = NULL, small_order_fee_amount = NULL,
                today_premium_amount = 5.00, base_amount = 0 WHERE id = '${PLAN}'`,
      );
    }
  }

  it("077 — the order keeps how its fee was built, and the intent hands back the lines", async () => {
    const s = await shopper({ Milk: 2 });
    const r = await svc.createIntent(s.customerId, sameDay(s.addressId), new Date());
    expect(r.deliveryFee).toEqual({
      lines: [{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "5.00" }], totalAmount: "11.00",
    });
    expect(r.grandTotalAmount).toBe("20.00");

    const o = await feeOf(r.orderId);
    expect(o.fee).toBe("11.00");
    expect(o.lines).toEqual(r.deliveryFee!.lines);
    expect(o.breakdown).toMatchObject({
      v: 1, kind: "effy", plan: { id: PLAN, name: "Checkout plan" },
      inputs: { km: 3.4, grams: 1000, basketCents: 900, slotId, windowIsToday: true },
      parts: { baseCents: 0, distanceCents: 600, distanceBandUpperKm: null, premiumCents: 500, rawCents: 1100, deliveryCents: 1100, totalCents: 1100, freeApplied: false },
    });
    // A package says WHEN it arrives, never what it costs.
    expect(await one(`SELECT method, delivery_fee_amount AS fee FROM public.order_package_delivery WHERE order_id = $1`, [r.orderId])).toEqual({
      method: "same_day", fee: null,
    });
  });

  it("077 — a basket from three shops pays ONE fee, the same as from one (P3)", async () => {
    const [b, c] = [await otherShop("CHK-B"), await otherShop("CHK-C")];
    await priced("FromA", "5.00");
    await priced("FromB", "5.00", b);
    await priced("FromC", "5.00", c);
    const three = await shopper({ FromA: 1, FromB: 1, FromC: 1 });
    const one_ = await shopper({ FromA: 3 });
    const r3 = await svc.createIntent(three.customerId, input(three.addressId), new Date());
    const r1 = await svc.createIntent(one_.customerId, input(one_.addressId), new Date());
    expect((await feeOf(r3.orderId)).fee).toBe("6.00");
    expect((await feeOf(r1.orderId)).fee).toBe("6.00");
    expect(r3.grandTotalAmount).toBe(r1.grandTotalAmount);
    expect(await count(`SELECT 1 FROM public.order_package_delivery WHERE order_id = $1`, [r3.orderId])).toBe(3);
  });

  it("077 — a client built before 077, summing per-package fees, is never shown LESS than it is charged (P26)", async () => {
    const [b, c] = [await otherShop("CHK-D"), await otherShop("CHK-E")];
    await priced("OldA", "5.00");
    await priced("OldB", "5.00", b);
    await priced("OldC", "5.00", c);
    // A second window, dearer by its own premium: the old client cannot know which it is showing.
    const dear = (
      await one<{ id: string }>(
        `INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
         VALUES ('23:58:10', '23:59:10', '23:58', 3, 'test') RETURNING id::text AS id`,
      )
    ).id;
    await pool.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ('${PLAN}', $1, 2.00)`, [dear]);

    /** What a pre-077 client displays: the chosen method's option per package, standard where it has no same-day. */
    const oldClientSum = (q: Awaited<ReturnType<typeof quoteFor>>, method: "standard" | "same_day") =>
      q.packages.reduce((sum, p) => {
        const opt = p.options.find((o) => o.method === method) ?? p.options.find((o) => o.method === "standard")!;
        return sum + Math.round(Number(opt.feeAmount) * 100);
      }, 0);
    const charged = async (s: { customerId: string; addressId: string }, over: Partial<IntentInput>) =>
      Math.round(Number((await feeOf((await svc.createIntent(s.customerId, input(s.addressId, over), new Date())).orderId)).fee) * 100);

    try {
      const s = await shopper({ OldA: 1, OldB: 1, OldC: 1 });
      const all = await quoteFor(s);
      expect(all.packages).toHaveLength(3);
      // Every package standard: exactly the charge.
      expect(oldClientSum(all, "standard")).toBe(await charged(s, {}));
      // Every package today, the dearest window: exactly the charge.
      expect(oldClientSum(all, "same_day")).toBe(1300);
      expect(await charged(s, { deliveryMethod: "same_day", sameDaySlotId: dear })).toBe(1300);
      // …and the cheaper window charges less than was shown — never more.
      expect(await charged(s, { deliveryMethod: "same_day", sameDaySlotId: slotId })).toBe(1100);

      // Mixed: the FIRST package cannot go today (its shop is excepted), the others can.
      const first = (await store.cartLines(s.customerId))[0]!.shopId;
      await pool.query(
        `INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode, updated_by) VALUES ($1, '00000000-0000-0000-0000-0000000000e1', 'off', 'test')`,
        [first],
      );
      const mixed = await quoteFor(s);
      expect(mixed.packages[0]!.options.map((o) => o.method)).toEqual(["standard"]);
      expect(oldClientSum(mixed, "same_day")).toBe(1300);
      expect(await charged(s, { deliveryMethod: "same_day", sameDaySlotId: dear })).toBe(1300);
      expect(oldClientSum(mixed, "standard")).toBe(600);
    } finally {
      await pool.query(`DELETE FROM public.shop_sameday_exception`);
      // A window that has carried an order is switched off, not deleted (its bookings keep it).
      await pool.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [dear]);
      await pool.query(`DELETE FROM public.delivery_slot_premium WHERE slot_id = $1`, [dear]);
    }
  });

  it("077 — basket value: free delivery at the amount, a small-order fee under the other, to the cent", async () => {
    await priced("P1999", "19.99");
    await priced("P2000", "20.00");
    await priced("P7999", "79.99");
    await priced("P8000", "80.00");
    await priced("P8500", "85.00");

    await withPlan(`free_over_amount = 80.00, small_order_under_amount = 20.00, small_order_fee_amount = 3.00`, async () => {
      const place = async (name: string, over: Partial<IntentInput> = {}, service: CheckoutService = svc) => {
        const s = await shopper({ [name]: 1 });
        const r = await service.createIntent(s.customerId, input(s.addressId, over), new Date());
        return { s, r, o: await feeOf(r.orderId) };
      };

      // One cent under the small-order amount: delivery plus the fee, each its own line.
      const small = await place("P1999");
      expect(small.o.fee).toBe("9.00");
      expect(small.o.lines).toEqual([{ kind: "delivery", amount: "6.00" }, { kind: "small_order", amount: "3.00" }]);
      expect(small.r.grandTotalAmount).toBe("28.99");
      // Exactly at it: no small-order fee.
      expect((await place("P2000")).o.lines).toEqual([{ kind: "delivery", amount: "6.00" }]);

      // One cent under the free amount: charged, and the quote says how little is missing.
      const near = await place("P7999");
      expect(near.o.fee).toBe("6.00");
      expect((await quoteFor(await shopper({ P7999: 1 }))).freeDeliveryRemainingAmount).toBe("0.01");
      // Exactly at it: free — window surcharge and all — and the customer is told what was waived.
      const free = await place("P8000", { deliveryMethod: "same_day", sameDaySlotId: slotId });
      expect(free.o.fee).toBe("0.00");
      expect(free.o.lines).toEqual([
        { kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "5.00" }, { kind: "free_delivery", amount: "-11.00" },
      ]);
      expect(free.r.grandTotalAmount).toBe("80.00");
      expect((await quoteFor(await shopper({ P8000: 1 }))).freeDeliveryRemainingAmount).toBeNull();

      // A promotion counts: $85 less $10 is a $75 basket, which is not free — in the quote and the charge alike.
      const tenOff: PromoSource = async () => ({ cents: 1000, promo: { id: "00000000-0000-0000-0000-0000000000aa", code: "TEN" } });
      const discounted = await shopper({ P8500: 1 });
      const q = await quoteFor(discounted, tenOff);
      expect(q.standardFee).toEqual({ lines: [{ kind: "delivery", amount: "6.00" }], totalAmount: "6.00" });
      expect(q.freeDeliveryRemainingAmount).toBe("5.00");

      // Points do NOT count: an $80 basket half-paid with points is still an $80 basket.
      const withPoints = await shopper({ P8000: 1 });
      await givePoints(withPoints.customerId, 4000);
      const paid = await svc.createIntent(withPoints.customerId, input(withPoints.addressId, { pointsToUse: 4000 }), new Date());
      expect((await feeOf(paid.orderId)).fee).toBe("0.00");
      expect(paid).toMatchObject({ grandTotalAmount: "80.00", pointsAmount: "40.00", cardAmount: "40.00" });
    });
  });

  it("077 — a delivery total the client is not showing is refused, and nothing at all is written (P13)", async () => {
    // A shopper with nothing yet: a stale amount creates no order.
    const fresh = await shopper({ Milk: 2 });
    await expect(svc.createIntent(fresh.customerId, input(fresh.addressId, { shownDeliveryAmount: "7.00" }), new Date()))
      .rejects.toBeInstanceOf(DeliveryFeeChangedError);
    expect(await count(`SELECT 1 FROM public."order" WHERE customer_id = $1`, [fresh.customerId])).toBe(0);
    expect(gateway.created()).toBe(0);

    // A shopper mid-checkout, with a place and points held at the price they were shown.
    const s = await shopper({ Milk: 2 });
    await givePoints(s.customerId, 300);
    const shown = sameDay(s.addressId, { pointsToUse: 300, shownDeliveryAmount: "11.00" });
    const r = await svc.createIntent(s.customerId, shown, new Date());
    expect(r.deliveryFee!.totalAmount).toBe("11.00");

    const snapshot = async () => ({
      order: await one(`SELECT row_to_json(o)::text AS j FROM public."order" o WHERE id = $1`, [r.orderId]),
      packages: (await pool.query(`SELECT row_to_json(p)::text AS j FROM public.order_package_delivery p WHERE order_id = $1`, [r.orderId])).rows,
      booking: await one(`SELECT row_to_json(b)::text AS j FROM public.delivery_slot_booking b WHERE order_id = $1`, [r.orderId]),
      hold: await one(`SELECT row_to_json(h)::text AS j FROM public.points_hold h WHERE order_id = $1`, [r.orderId]),
      payment: await one(`SELECT row_to_json(p)::text AS j FROM public.payment p WHERE order_id = $1`, [r.orderId]),
    });
    const was = await snapshot();
    const intents = gateway.created();

    // The business makes today dearer while the pay button is on screen.
    await withPlan(`today_premium_amount = 7.00`, async () => {
      const err = await svc.createIntent(s.customerId, shown, new Date()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeliveryFeeChangedError);
      expect(err).toMatchObject({ shownCents: 1100, nowCents: 1300 });
      expect(await snapshot()).toEqual(was);
      expect(gateway.created()).toBe(intents);

      // Shown the new total, the shopper pays it.
      const again = await svc.createIntent(s.customerId, { ...shown, shownDeliveryAmount: "13.00" }, new Date());
      expect(again.orderId).toBe(r.orderId);
      expect(again.deliveryFee!.totalAmount).toBe("13.00");
    });

    // A client built before 077 says nothing about what it shows, and is priced without the check.
    const old = await shopper({ Milk: 1 });
    await expect(svc.createIntent(old.customerId, input(old.addressId), new Date())).resolves.toMatchObject({ grandTotalAmount: "10.50" });
  });

  it("077 — a placed order's fee never moves: a new plan, a corrected distance, a postcode removed (P14)", async () => {
    const orders = createOrdersService({ repo: createOrdersRepository(pool), presign: async () => null });
    const s = await shopper({ Milk: 2 });
    const r = await svc.createIntent(s.customerId, sameDay(s.addressId), new Date());
    await pay(r.orderId);

    const view = async () => {
      const o = await orders.get(scope, s.customerId, r.orderId);
      return {
        row: await one(`SELECT delivery_fee_amount::text AS fee, grand_total_amount::text AS grand, delivery_fee_breakdown::text AS b FROM public."order" WHERE id = $1`, [r.orderId]),
        customer: { deliveryFeeAmount: o.deliveryFeeAmount, deliveryFee: o.deliveryFee, grandTotalAmount: o.grandTotalAmount },
      };
    };
    const was = await view();
    expect(was.customer).toEqual({
      deliveryFeeAmount: "11.00", grandTotalAmount: "20.00",
      deliveryFee: { lines: [{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "5.00" }], totalAmount: "11.00" },
    });
    // ⚠ What the customer is sent is the lines and nothing else of how the fee was built.
    expect(JSON.stringify(await orders.get(scope, s.customerId, r.orderId))).not.toMatch(/"km"|"plan"|"grams"|"basketCents"|"parts"|"inputs"/);

    const DEAR = "00000000-0000-0000-0000-0000000000d7";
    try {
      // A dearer plan goes live, through the one function that makes a plan live.
      await pool.query(`
        INSERT INTO public.delivery_fee_plan (id, name, base_amount, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
          VALUES ('${DEAR}', 'Dearer plan', 20.00, 9.00, 0.50, 4.00, 90.00, 'test');
        INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES ('${DEAR}', NULL, 10.00);
        INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('${DEAR}', 100000, 0.00);
        SELECT public.delivery_plan_activate('${DEAR}', 'test', false);`);
      expect(await view()).toEqual(was);
      // The next shopper pays the new price — the plan really did change.
      const next = await shopper({ Milk: 2 });
      expect((await svc.createIntent(next.customerId, input(next.addressId), new Date())).deliveryFee!.totalAmount).toBe("30.00");

      await pool.query(`UPDATE public.delivery_zone_postcode SET distance_km = 77 WHERE postcode = '3121'`);
      expect(await view()).toEqual(was);

      await pool.query(`DELETE FROM public.delivery_zone_postcode WHERE postcode = '3121'`);
      expect(await view()).toEqual(was);
    } finally {
      await pool.query(`
        INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
          VALUES ('00000000-0000-0000-0000-0000000000e1', '3121', 3.40, 'manual', 'test')
          ON CONFLICT (postcode) DO UPDATE SET distance_km = 3.40;
        UPDATE public.delivery_fee_plan SET is_active = false WHERE id = '${DEAR}';
        UPDATE public.delivery_fee_plan SET is_active = true WHERE id = '${PLAN}';`);
    }
  });
  // ── 078 — Effy delivery windows: today and the next delivery days ────────────────────────────────
  //
  // ⚠ The switch is turned on INSIDE each test and always put back: every test above this line is
  // the proof that nothing changes while it is NULL.

  const quoteOf = (s: { customerId: string; addressId: string }) =>
    quoteForCheckout({ store, quoter: defaultQuoter(pool), promos: noPromo }, s.customerId, s.addressId, new Date());
  /** Today, then the next three days — the fixture has no non-delivery days. */
  const offered = () => effyDays(new Date(), 3).map((d) => d.date);
  const windowOn = (addressId: string, date: string, over: Partial<IntentInput> = {}) =>
    input(addressId, { deliveryWindow: { slotId, date }, ...over });
  const bookedOn = async (date: string) => (await slotLoad(pool, date)).get(slotId) ?? 0;
  const packagesOf = (orderId: string) =>
    pool.query<{ method: string; day: string; slot: string | null; start: Date | null }>(
      `SELECT method, promised_to::text AS day, slot_id::text AS slot, window_start AS start
         FROM public.order_package_delivery WHERE order_id = $1 ORDER BY shop_id`, [orderId],
    ).then((r) => r.rows);
  async function modelOn<T>(fn: () => Promise<T>): Promise<T> {
    await pool.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = now() - interval '1 minute' WHERE id = 1`);
    try {
      return await fn();
    } finally {
      await pool.query(`UPDATE public.delivery_settings
                           SET delivery_model_v2_from = NULL, effy_lookahead_days = 3, standard_no_delivery_weekdays = '{}' WHERE id = 1`);
      await pool.query(`DELETE FROM public.delivery_non_delivery_date`);
      await pool.query(`DELETE FROM public.delivery_slot_premium`);
      await pool.query(`UPDATE public.delivery_fee_plan SET free_over_amount = NULL WHERE id = $1`, [PLAN]);
    }
  }
  const refusal = async (p: Promise<unknown>) => {
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(DeliveryChoiceError);
    return (err as DeliveryChoiceError).code;
  };

  it("078 — with the switch off the quote is the 069/077 quote, and a window sent anyway is ignored (P9)", async () => {
    const s = await shopper({ Milk: 2 });
    const q = await quoteOf(s);
    expect(Object.keys(q).sort()).toEqual([
      "coverage", "expiresAt", "freeDeliveryRemainingAmount", "packages", "postcode", "sameDayAvailableUntil",
      "sameDaySlots", "sameDayUnavailableReason", "serviced", "standardDays", "standardFee",
    ]);
    expect(q).not.toHaveProperty("effyWindows"); // absent, not null: byte for byte the old quote
    expect(q.sameDaySlots).toHaveLength(1);
    expect(q.standardDays).toHaveLength(7); // 069's look-ahead, not 078's

    // The 069 fields decide; `deliveryWindow` is not read. Standard, no window, no place held.
    const r = await svc.createIntent(s.customerId, windowOn(s.addressId, offered()[2]!), new Date());
    expect(await packagesOf(r.orderId)).toEqual([{ method: "standard", day: q.standardDays[0]!.date, slot: null, start: null }]);
    expect(await count(`SELECT 1 FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId])).toBe(0);
    expect(r.slotHeldUntil ?? null).toBeNull();
  });

  it("078 — with the switch on the customer is offered today and the next three delivery days (P10)", async () => {
    await modelOn(async () => {
      const s = await shopper({ Milk: 2 });
      const q = await quoteOf(s);
      const days = offered();
      expect(q.effyWindows!.unavailable).toBeNull();
      expect(q.effyWindows!.days.map((d) => [d.date, d.section, d.windows.length, d.closedReason])).toEqual([
        [days[0], "same_day", 1, null], [days[1], "standard", 1, null], [days[2], "standard", 1, null], [days[3], "standard", 1, null],
      ]);
      const w = q.effyWindows!.days[2]!.windows[0]!;
      // ⚠ Exactly these fields: no capacity, no count, nothing per package.
      expect(Object.keys(w).sort()).toEqual(["cutoffAt", "date", "endAt", "fee", "slotId", "startAt", "surchargeAmount"]);
      expect(w.startAt.slice(0, 16)).toBe(`${days[2]}T23:58`);
      expect(w.cutoffAt.slice(0, 16)).toBe(`${days[2]}T23:58`);
      // A client built before 078 still draws something true.
      expect(q.sameDaySlots.map((x) => x.date)).toEqual([days[0]]);
      expect(q.standardDays.map((x) => x.date)).toEqual(days.slice(1));
    });
  });

  it("078 — a later-day window: every package is 'standard' WITH the window, and the place is held on that day (P10)", async () => {
    await modelOn(async () => {
      const days = offered();
      const s = await shopper({ Milk: 2 });
      const r = await svc.createIntent(s.customerId, windowOn(s.addressId, days[2]!), new Date());
      expect(r.slotHeldUntil).toMatch(/[+-]\d\d:\d\d$/);
      const pk = await packagesOf(r.orderId);
      expect(pk).toHaveLength(1);
      expect(pk[0]).toMatchObject({ method: "standard", day: days[2], slot: slotId });
      expect(melbourneDate(pk[0]!.start!)).toBe(days[2]);
      expect(await one(`SELECT state, delivery_date::text AS day FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId]))
        .toEqual({ state: "held", day: days[2] });
      expect([await bookedOn(days[0]!), await bookedOn(days[2]!), await bookedOn(days[3]!)]).toEqual([0, 1, 0]);
      // No "today" premium on a later day: the plain $6.00.
      expect((await feeOf(r.orderId)).fee).toBe("6.00");
      expect(await pay(r.orderId)).toMatchObject({ slotConfirmed: true, slotOverCapacity: false });

      // Today's window is "same_day", and dearer by the plan's today premium.
      const t = await shopper({ Milk: 2 });
      const rt = await svc.createIntent(t.customerId, windowOn(t.addressId, days[0]!), new Date());
      expect((await packagesOf(rt.orderId))[0]).toMatchObject({ method: "same_day", day: days[0], slot: slotId });
      expect((await feeOf(rt.orderId)).fee).toBe("11.00");
    });
  });

  it("078 — ONE window for the order: a basket from three shops never splits, and holds one place (P10)", async () => {
    const [b, c] = [await otherShop("CHK-W1"), await otherShop("CHK-W2")];
    await priced("WinA", "5.00");
    await priced("WinB", "5.00", b);
    await priced("WinC", "5.00", c);
    // ⚠ The 076 same-day bridge says these two shops do NOT do same-day here. The new model does not ask it.
    await pool.query(
      `INSERT INTO public.shop_sameday_exception (shop_id, zone_id, mode, updated_by) VALUES ($1, $3, 'off', 'test'), ($2, $3, 'off', 'test')`,
      [b, c, "00000000-0000-0000-0000-0000000000e1"],
    );
    await modelOn(async () => {
      const days = offered();
      const s = await shopper({ WinA: 1, WinB: 1, WinC: 1 });
      const q = await quoteOf(s);
      expect(q.effyWindows!.days[0]!.windows).toHaveLength(1);
      const r = await svc.createIntent(s.customerId, windowOn(s.addressId, days[0]!), new Date());
      const pk = await packagesOf(r.orderId);
      expect(pk.map((p) => [p.method, p.day, p.slot])).toEqual(Array(3).fill(["same_day", days[0], slotId]));
      expect(await bookedOn(days[0]!)).toBe(1);
      expect((await feeOf(r.orderId)).fee).toBe("11.00");
    });
  });

  it("078 — no window, a day not on offer, a window that is gone: each refused, nothing substituted (P11)", async () => {
    await modelOn(async () => {
      const days = offered();
      const s = await shopper({ Milk: 1 });
      // A client built before 078 sends the 069 fields and no window.
      expect(await refusal(svc.createIntent(s.customerId, sameDay(s.addressId), new Date()))).toBe("slot_required");
      expect(await refusal(svc.createIntent(s.customerId, input(s.addressId), new Date()))).toBe("slot_required");
      // Beyond the look-ahead, and a day that has gone.
      const beyond = effyDays(new Date(), 4)[4]!.date;
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, beyond), new Date()))).toBe("date_unavailable");
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, "2026-01-01"), new Date()))).toBe("date_unavailable");
      // A window id that is not on offer that day.
      expect(await refusal(svc.createIntent(s.customerId, input(s.addressId, { deliveryWindow: { slotId: PLAN, date: days[1]! } }), new Date())))
        .toBe("slot_unavailable");
      expect(gateway.created()).toBe(0);
      expect(await count(`SELECT 1 FROM public.delivery_slot_booking`)).toBe(0);
    });
  });

  it("078 — a full window on one day says nothing about the next, and the last place has one winner (P6, P7)", async () => {
    await modelOn(async () => {
      const days = offered();
      const shoppers = await Promise.all(Array.from({ length: 12 }, () => shopper({ Milk: 1 })));
      const results = await Promise.allSettled(shoppers.map((s) => svc.createIntent(s.customerId, windowOn(s.addressId, days[2]!), new Date())));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3); // capacity 3
      for (const r of results.filter((x) => x.status === "rejected") as PromiseRejectedResult[]) {
        expect((r.reason as DeliveryChoiceError).code).toBe("slot_unavailable");
      }
      expect(gateway.created()).toBe(3);
      expect([await bookedOn(days[1]!), await bookedOn(days[2]!), await bookedOn(days[3]!)]).toEqual([0, 3, 0]);

      const next = await shopper({ Milk: 1 });
      const q = await quoteOf(next);
      expect(q.effyWindows!.days.map((d) => [d.windows.length, d.closedReason])).toEqual([[1, null], [1, null], [0, "full"], [1, null]]);
      expect(q.standardDays.map((x) => x.date)).toEqual([days[1], days[3]]);
      // …and one of the three, looking again, is not told their own day is full by their own hold.
      const holder = shoppers[results.findIndex((r) => r.status === "fulfilled")]!;
      expect((await quoteOf(holder)).effyWindows!.days[2]!.windows).toHaveLength(1);
    });
  });

  it("078 — a window that fills between the quote and the pay button is refused before anything is charged", async () => {
    await modelOn(async () => {
      const days = offered();
      await pool.query(`UPDATE public.delivery_slot SET capacity = 1 WHERE id = $1`, [slotId]);
      const s = await shopper({ Milk: 1 });
      expect((await quoteOf(s)).effyWindows!.days[1]!.windows).toHaveLength(1);
      const other = await shopper({ Milk: 1 });
      await svc.createIntent(other.customerId, windowOn(other.addressId, days[1]!), new Date());
      const before = gateway.created();
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, days[1]!), new Date()))).toBe("slot_unavailable");
      expect(gateway.created()).toBe(before);
      expect(await bookedOn(days[1]!)).toBe(1);
    });
  });

  it("078 — a late payer into a later-day window that has since filled keeps it and is flagged (P8)", async () => {
    await modelOn(async () => {
      const days = offered();
      await pool.query(`UPDATE public.delivery_slot SET capacity = 1 WHERE id = $1`, [slotId]);
      const late = await shopper({ Milk: 1 });
      const r = await svc.createIntent(late.customerId, windowOn(late.addressId, days[3]!), new Date());
      await pool.query(`UPDATE public.delivery_slot_booking SET held_until = now() - interval '1 minute' WHERE order_id = $1`, [r.orderId]);
      expect(await bookedOn(days[3]!)).toBe(0);
      const other = await shopper({ Milk: 1 });
      await svc.createIntent(other.customerId, windowOn(other.addressId, days[3]!), new Date());

      expect(await pay(r.orderId)).toMatchObject({ slotConfirmed: true, slotOverCapacity: true });
      expect(await one(`SELECT state, over_capacity, delivery_date::text AS day FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId]))
        .toEqual({ state: "confirmed", over_capacity: true, day: days[3] });
      expect((await packagesOf(r.orderId))[0]).toMatchObject({ method: "standard", day: days[3], slot: slotId });
    });
  });

  it("078 — non-delivery days are skipped and do not count; a today Effy does not deliver says so", async () => {
    await modelOn(async () => {
      const plain = offered();
      // Tomorrow is a public holiday: it vanishes and a fourth day takes its place.
      await pool.query(`INSERT INTO public.delivery_non_delivery_date (day, label, created_by) VALUES ($1::date, 'Holiday', 'test')`, [plain[1]]);
      const s = await shopper({ Milk: 1 });
      let q = await quoteOf(s);
      const want = effyDays(new Date(), 3, [], new Set([plain[1]!])).map((d) => d.date);
      expect(q.effyWindows!.days.map((d) => d.date)).toEqual(want);
      expect(want).not.toContain(plain[1]);
      expect(want).toHaveLength(4);
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, plain[1]!), new Date()))).toBe("date_unavailable");

      // Today's weekday is excluded: today is still listed, with the reason and nothing to choose.
      const iso = ((new Date(`${plain[0]}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
      await pool.query(`UPDATE public.delivery_settings SET standard_no_delivery_weekdays = ARRAY[$1]::smallint[] WHERE id = 1`, [iso]);
      q = await quoteOf(s);
      expect(q.effyWindows!.days[0]).toMatchObject({ date: plain[0], section: "same_day", windows: [], closedReason: "not_delivery_day" });
      expect(q.effyWindows!.days.slice(1).every((d) => d.windows.length === 1)).toBe(true);
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, plain[0]!), new Date()))).toBe("date_unavailable");

      // The look-ahead is the business's to set.
      await pool.query(`UPDATE public.delivery_settings SET standard_no_delivery_weekdays = '{}', effy_lookahead_days = 1 WHERE id = 1`);
      expect((await quoteOf(s)).effyWindows!.days).toHaveLength(2);
    });
  });

  it("078 — each window shows what it adds: the today premium only today, free delivery nothing, and the charge is the one shown (P12)", async () => {
    await modelOn(async () => {
      const days = offered();
      await pool.query(`INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES ($1, $2, 2.00)`, [PLAN, slotId]);
      const s = await shopper({ Milk: 2 });
      let q = await quoteOf(s);
      const shown = q.effyWindows!.days.map((d) => [d.windows[0]!.surchargeAmount, d.windows[0]!.fee.totalAmount]);
      expect(q.standardFee!.totalAmount).toBe("6.00");
      expect(shown).toEqual([["7.00", "13.00"], ["2.00", "8.00"], ["2.00", "8.00"], ["2.00", "8.00"]]);

      // The charge is the window's on ITS day — and a client showing another amount is stopped first.
      await expect(svc.createIntent(s.customerId, windowOn(s.addressId, days[1]!, { shownDeliveryAmount: "13.00" }), new Date()))
        .rejects.toBeInstanceOf(DeliveryFeeChangedError);
      const r = await svc.createIntent(s.customerId, windowOn(s.addressId, days[1]!, { shownDeliveryAmount: "8.00" }), new Date());
      expect((await feeOf(r.orderId)).fee).toBe("8.00");
      expect(r.deliveryFee!.lines).toEqual([{ kind: "delivery", amount: "6.00" }, { kind: "window_surcharge", amount: "2.00" }]);

      // Over the free-delivery amount, no window costs anything — today's included.
      await pool.query(`UPDATE public.delivery_fee_plan SET free_over_amount = 5.00 WHERE id = $1`, [PLAN]);
      q = await quoteOf(s);
      expect(q.effyWindows!.days.map((d) => [d.windows[0]!.surchargeAmount, d.windows[0]!.fee.totalAmount])).toEqual(Array(4).fill(["0.00", "0.00"]));
    });
  });

  it("078 — nothing to choose: 'no_windows' when every day is taken, 'none_defined' when none is switched on (P11)", async () => {
    await modelOn(async () => {
      const days = offered();
      const s = await shopper({ Milk: 1 });
      // One place a day, and somebody has each of them. Today's is simply filled the same way.
      await pool.query(`UPDATE public.delivery_slot SET capacity = 1 WHERE id = $1`, [slotId]);
      for (const day of days) {
        const o = await shopper({ Milk: 1 });
        await svc.createIntent(o.customerId, windowOn(o.addressId, day), new Date());
      }
      let q = await quoteOf(s);
      expect(q.effyWindows!.unavailable).toBe("no_windows");
      expect(q.effyWindows!.days.every((d) => d.windows.length === 0 && d.closedReason === "full")).toBe(true);
      expect(q).not.toHaveProperty("courier");
      const before = gateway.created();
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, days[1]!), new Date()))).toBe("no_windows_available");
      expect(gateway.created()).toBe(before);

      await pool.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [slotId]);
      q = await quoteOf(s);
      expect(q.effyWindows!.unavailable).toBe("none_defined");
      expect(await refusal(svc.createIntent(s.customerId, windowOn(s.addressId, days[1]!), new Date()))).toBe("no_windows_available");
    });
  });

  it("078 — the window a customer bought is the window they keep, whatever is changed afterwards (P13)", async () => {
    const orders = createOrdersService({ repo: createOrdersRepository(pool), presign: async () => null });
    await modelOn(async () => {
      const days = offered();
      const s = await shopper({ Milk: 2 });
      const r = await svc.createIntent(s.customerId, windowOn(s.addressId, days[2]!), new Date());
      await pay(r.orderId);
      const sold = (await orders.get(scope, s.customerId, r.orderId)).arrivalEstimates;
      expect(sold).toHaveLength(1);
      expect(sold[0]).toMatchObject({ method: "standard", promisedFrom: days[2], promisedTo: days[2] });
      expect(sold[0]!.windowStart!.slice(0, 16)).toBe(`${days[2]}T23:58`);

      try {
        await pool.query(`UPDATE public.delivery_slot SET start_time = '20:00', end_time = '21:00', cutoff_time = '19:00', capacity = 1, status = 'disabled' WHERE id = $1`, [slotId]);
        await pool.query(`INSERT INTO public.delivery_non_delivery_date (day, label, created_by) VALUES ($1::date, 'Closed', 'test')`, [days[2]]);
        expect((await orders.get(scope, s.customerId, r.orderId)).arrivalEstimates).toEqual(sold);
        expect(await one(`SELECT state FROM public.delivery_slot_booking WHERE order_id = $1`, [r.orderId])).toEqual({ state: "confirmed" });
      } finally {
        await pool.query(`UPDATE public.delivery_slot SET start_time = '23:58', end_time = '23:59', cutoff_time = '23:58' WHERE id = $1`, [slotId]);
      }
    });
  });
});
