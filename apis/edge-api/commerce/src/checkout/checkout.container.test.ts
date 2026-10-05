import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql, transactorFor, type Transactor } from "@effy/edge-shared";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";
import { melbourneDate, slotLoad } from "@effy/edge-shared/delivery";
import {
  finalizeSucceeded, WebhookSignatureError,
  type IntentStatus, type PaymentGateway, type PaymentIntent, type WebhookEvent,
} from "@effy/edge-shared/payments";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createOrdersRepository } from "../orders/repository";
import { createOrdersService, OrderNotFoundError as ReceiptNotFoundError } from "../orders/service";
import { createWebhookHandler } from "../webhook/handler";
import { DeliveryChoiceError } from "./delivery-choice";
import { defaultQuoter } from "./quote";
import {
  createCheckoutService, EmptyCartError, OrderNotFoundError, type CheckoutService, type IntentInput,
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
  deliveryInstructions: { handover: null, note: null }, wantsProviderMethodList: false, ...over,
});

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
      INSERT INTO public.delivery_ring (id, code, name, ordinal, suggest_upper_km, updated_by) VALUES
        ('00000000-0000-0000-0000-0000000000f1', 'C-INNER', 'Checkout inner', 9101, 9101, 'test');
      INSERT INTO public.delivery_zone (id, code, name, ring_id, status, sameday_eligible, updated_by) VALUES
        ('00000000-0000-0000-0000-0000000000e1', 'C-Z1', 'Checkout zone', '00000000-0000-0000-0000-0000000000f1', 'active', true, 'test');
      INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ('00000000-0000-0000-0000-0000000000e1', '3121');
      INSERT INTO public.delivery_fee_plan (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by)
        VALUES ('00000000-0000-0000-0000-0000000000d1', 'Checkout plan', true, 0.50, 4.00, 40.00, 1.800, 1.000, 'test');
      INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES
        ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', 6.00);
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
    const second = await pay(orderId);
    expect(second.applied).toBe(false);

    expect((await orderRow(orderId)).status).toBe("paid");
    expect(await stockOf("Scarce")).toBe(1); // 2 − 1, once
    expect(await count(`SELECT 1 FROM public.stock_movement WHERE order_id = $1`, [orderId])).toBe(1); // untracked Milk writes none
    expect(await count(`SELECT 1 FROM public.receipt_dispatch WHERE order_id = $1`, [orderId])).toBe(1);
    expect(await count(`SELECT 1 FROM public.event_outbox WHERE aggregate_id = $1`, [orderId])).toBe(1);
    expect(await count(`SELECT 1 FROM public.cart_item WHERE cart_id = $1`, [s.cartId])).toBe(0);
    expect((await one<{ s: string }>(`SELECT status AS s FROM public.payment WHERE order_id = $1`, [orderId])).s).toBe("succeeded");

    const sf = await one<{ items: number; cust: string; shop: string; method: string; fee: string }>(
      `SELECT item_count AS items, subtotal_amount::text AS cust, shop_subtotal_amount::text AS shop,
              delivery_method AS method, delivery_fee_amount::text AS fee FROM public.shop_fulfillment WHERE order_id = $1`,
      [orderId],
    );
    expect(sf).toEqual({ items: 3, cust: "11.00", shop: "10.00", method: "standard", fee: "6.00" });
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

  it("a refused hold writes nothing and leaves the order's previous capture intact", async () => {
    const s = await shopper({ Milk: 1 });
    const r = await svc.createIntent(s.customerId, input(s.addressId), new Date()); // standard
    await pool.query(`UPDATE public.delivery_slot SET status = 'disabled' WHERE id = $1`, [slotId]);

    const now = new Date();
    await expect(
      store.captureDelivery(r.orderId, {}, now, [{
        shopId, method: "same_day", feeCents: 1100, promisedDay: melbourneDate(now), slotId,
        windowStart: now, windowEnd: new Date(now.getTime() + 60_000),
      }], { slotId, now }),
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
});
