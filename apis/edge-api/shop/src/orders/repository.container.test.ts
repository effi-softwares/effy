import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shop order console's SQL, against real PostgreSQL 16 and THE REAL MIGRATIONS (057 A3).
 *
 * ⚠ WHY THIS FILE EXISTS. Every query in `repository.ts` is raw SQL across eleven tables that seven
 * slices own (019 order/payment, 020 fulfilment, 047 method, 049 collection, 053 arrival, 055 refunds,
 * this slice's tags and notes). A wrong column name TYPECHECKS PERFECTLY and passes every mocked test —
 * 056 caught two that way, and only here. The schema is applied from `db/migrations`, not transcribed,
 * so a fixture cannot agree with the code instead of with the platform (027 R13's failure mode).
 */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    presignRead: async (key: string) => `https://signed.example/${key}`,
  };
});

import { addNote, listOrders, readActivity, readOrder, replaceTags } from "./repository";
import { parseListQuery, toEntry } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this harness would pass vacuously");
  return files
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const start = body.indexOf("-- +goose Up");
      const rest = start < 0 ? body : body.slice(start);
      const end = rest.indexOf("-- +goose Down");
      return end < 0 ? rest : rest.slice(0, end);
    })
    .join("\n");
}

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "33333333-3333-4333-8333-000000000000";
const STAFF = "77777777-7777-4777-8777-777777777777";

describe.skipIf(!RUN)("shop order console — against real PostgreSQL and the real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(applyMigrations());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.customer, public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP],
    );
    await pool.query(
      `INSERT INTO public.shop_staff (id, cognito_sub, name, shop_id) VALUES ($1,'sub-staff','Maya',$2)`,
      [STAFF, SHOP],
    );
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
  });

  /** One paid order with a portion at `shop`. Returns the portion id and the order id. */
  async function order(opts: {
    number: string;
    recipient: string;
    shop?: string;
    total?: number;
    status?: string;
    placedMinutesAgo?: number;
    method?: "same_day" | "standard";
    lines?: { name: string; price: number; qty: number }[];
  }): Promise<{ fulfillmentId: string; orderId: string; itemIds: string[] }> {
    const shop = opts.shop ?? SHOP;
    const lines = opts.lines ?? [{ name: "Milk", price: 10, qty: 3 }];
    const subtotal = lines.reduce((c, l) => c + l.price * l.qty, 0);
    const total = opts.total ?? subtotal;
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at)
       VALUES ($1,$2,'paid',$3,$4,$5,$6::jsonb, now() - make_interval(mins => $7))
       RETURNING id`,
      [CUST, opts.number, subtotal, total - subtotal, total,
       JSON.stringify({ recipientName: opts.recipient, line1: "1 St", city: "Melbourne", postalCode: "3000", country: "AU" }),
       opts.placedMinutesAgo ?? 0],
    );
    const orderId = o.rows[0]!.id;
    await pool.query(
      `INSERT INTO public.payment (order_id, stripe_payment_intent_id, amount, status, method_type, method_brand, method_last4)
       VALUES ($1, $2, $3, 'succeeded', 'card', 'visa', '4242')`,
      [orderId, `pi_${opts.number}`, total],
    );
    const itemIds: string[] = [];
    for (const l of lines) {
      const p = await pool.query<{ id: string }>(
        `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, short_description, created_by)
         SELECT $1, pt.id, c.id, $2, $3, 'x', 'seed' FROM public.product_type pt, public.category c
         RETURNING id`,
        [shop, l.name, l.price],
      );
      const oi = await pool.query<{ id: string }>(
        `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [orderId, p.rows[0]!.id, shop, l.name, l.price, l.qty, l.price * l.qty],
      );
      itemIds.push(oi.rows[0]!.id);
    }
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount, delivery_method)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orderId, shop, opts.status ?? "received", lines.reduce((c, l) => c + l.qty, 0), subtotal, opts.method ?? "standard"],
    );
    return { fulfillmentId: f.rows[0]!.id, orderId, itemIds };
  }

  async function refund(orderId: string, amount: number, status: string, actorKind = "shop") {
    await pool.query(
      // ⚠ The real schema requires a goodwill refund to explain itself (refund_goodwill_needs_note_ck).
      `INSERT INTO public.refund (order_id, kind, amount, reason, note, status, idempotency_key, actor_kind, actor_sub, failure_reason)
       VALUES ($1, 'goodwill', $2, 'goodwill', 'seed', $3, gen_random_uuid()::text, $4, $5,
               CASE WHEN $3 = 'failed' THEN 'bank said no' END)`,
      [orderId, amount, status, actorKind, actorKind === "system" ? null : "sub-staff"],
    );
  }

  it("lists only this shop's orders, with counts over every state", async () => {
    await order({ number: "EFY-A", recipient: "Ann", status: "received" });
    await order({ number: "EFY-B", recipient: "Bo", status: "picking" });
    await order({ number: "EFY-C", recipient: "Cy", status: "delivered" });
    await order({ number: "EFY-X", recipient: "Other", shop: OTHER_SHOP });

    const out = await listOrders(SHOP, parseListQuery({ tab: "picking" }));
    expect(out.items.map((r) => r.orderNumber)).toEqual(["EFY-B"]);
    expect(out.total).toBe(1);
    expect(out.counts).toMatchObject({ all: 3, new: 1, picking: 1, delivered: 1, collected: 0 });
  });

  it("composes search and filters, and the counts reflect the combination", async () => {
    await order({ number: "EFY-A1", recipient: "Ann Lee", method: "same_day" });
    await order({ number: "EFY-A2", recipient: "Ann Park", method: "standard" });
    await order({ number: "EFY-B1", recipient: "Bo", method: "same_day" });

    const out = await listOrders(SHOP, parseListQuery({ q: "ann", method: "same_day" }));
    expect(out.items.map((r) => r.orderNumber)).toEqual(["EFY-A1"]);
    expect(out.counts.all).toBe(1);
  });

  it("summarises this shop's lines for the Items column, and searches item names", async () => {
    await order({
      number: "EFY-I",
      recipient: "I",
      lines: [{ name: "Oat milk, 1L", price: 3, qty: 2 }, { name: "Bread", price: 5, qty: 1 }],
    });
    const out = await listOrders(SHOP, parseListQuery({}));
    // The design's "name ×qty" — the part before the first comma, as it does.
    expect(out.items[0]!.itemsSummary).toBe("Bread ×1, Oat milk ×2");
    expect((await listOrders(SHOP, parseListQuery({ q: "oat" }))).items).toHaveLength(1);
    expect((await listOrders(SHOP, parseListQuery({ q: "cheese" }))).items).toHaveLength(0);
  });

  it("derives payment state from refunds — submitted is pending, not refunded", async () => {
    const full = await order({ number: "EFY-F", recipient: "F", total: 30 });
    const part = await order({ number: "EFY-P", recipient: "P", total: 30 });
    const pend = await order({ number: "EFY-Q", recipient: "Q", total: 30 });
    const fail = await order({ number: "EFY-Z", recipient: "Z", total: 30 });
    await refund(full.orderId, 30, "succeeded");
    await refund(part.orderId, 10, "succeeded");
    await refund(pend.orderId, 10, "submitted");
    await refund(fail.orderId, 10, "failed");

    const out = await listOrders(SHOP, parseListQuery({ sort: "number" }));
    const by = Object.fromEntries(out.items.map((r) => [r.orderNumber, r.payment]));
    expect(by).toEqual({ "EFY-F": "refunded", "EFY-P": "partially_refunded", "EFY-Q": "refund_pending", "EFY-Z": "paid" });

    const filtered = await listOrders(SHOP, parseListQuery({ payment: "partially_refunded" }));
    expect(filtered.items.map((r) => r.orderNumber)).toEqual(["EFY-P"]);
  });

  it("flags at-risk only while the shop still has work to do", async () => {
    await order({ number: "EFY-LATE", recipient: "L", status: "picking", placedMinutesAgo: 70 });
    await order({ number: "EFY-DONE", recipient: "D", status: "delivered", placedMinutesAgo: 70 });
    await order({ number: "EFY-NEW", recipient: "N", status: "received", placedMinutesAgo: 1 });

    const out = await listOrders(SHOP, parseListQuery({ attention: "at_risk" }));
    expect(out.items.map((r) => r.orderNumber)).toEqual(["EFY-LATE"]);
  });

  it("pages with a total order and a stable total", async () => {
    for (let i = 0; i < 27; i++) {
      await order({ number: `EFY-${String(i).padStart(2, "0")}`, recipient: "R" });
    }
    const p1 = await listOrders(SHOP, parseListQuery({ sort: "number" }));
    const p2 = await listOrders(SHOP, parseListQuery({ sort: "number", page: "2" }));
    expect(p1.items).toHaveLength(25);
    expect(p2.items.map((r) => r.orderNumber)).toEqual(["EFY-25", "EFY-26"]);
    expect(p1.total).toBe(27);
    expect(p2.total).toBe(27);
  });

  it("reads the order's money, this shop's priced lines and per-line refunded units", async () => {
    const o = await order({
      number: "EFY-M",
      recipient: "M",
      lines: [{ name: "Milk", price: 10, qty: 3 }, { name: "Bread", price: 4.5, qty: 2 }],
      total: 44,
    });
    await pool.query(
      `INSERT INTO public.refund (id, order_id, kind, amount, reason, status, idempotency_key, actor_kind, actor_sub)
       VALUES ('99999999-9999-4999-8999-999999999999', $1, 'item', 10, 'item_unusable', 'succeeded', 'k1', 'shop', 'sub-staff')`,
      [o.orderId],
    );
    await pool.query(
      `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
       VALUES ('99999999-9999-4999-8999-999999999999', $1, 1, 10)`,
      [o.itemIds[0]],
    );

    const d = await readOrder(o.fulfillmentId, SHOP);
    expect(d.money).toMatchObject({ shopSubtotal: "39.00", itemSubtotal: "39.00", deliveryFee: "5.00", total: "44.00", refunded: "10.00", net: "34.00" });
    expect(d.payment).toMatchObject({ state: "partially_refunded", methodBrand: "visa", methodLast4: "4242", amount: "44.00" });
    const milk = d.lines.find((l) => l.name === "Milk")!;
    expect(milk).toMatchObject({ unitPrice: "10.00", lineTotal: "30.00", refundedQuantity: 1 });
    expect(d.refunds[0]).toMatchObject({ amount: "10.00", actorKind: "shop", actorLabel: "Maya" });
  });

  it("refuses another shop's order (indistinguishable from a missing one)", async () => {
    const o = await order({ number: "EFY-X", recipient: "X", shop: OTHER_SHOP });
    await expect(readOrder(o.fulfillmentId, SHOP)).rejects.toMatchObject({ kind: "not_found" });
    expect(await readActivity(o.fulfillmentId, SHOP)).toBeNull();
    expect(await replaceTags(o.fulfillmentId, SHOP, ["x"], STAFF)).toBeNull();
    expect(await addNote(o.fulfillmentId, SHOP, "hi", STAFF)).toBeNull();
  });

  it("writes tags and notes with their log entries, against the widened CHECK", async () => {
    const o = await order({ number: "EFY-T", recipient: "T" });
    expect(await replaceTags(o.fulfillmentId, SHOP, ["vip", "fragile"], STAFF)).toBe(true);
    expect(await replaceTags(o.fulfillmentId, SHOP, ["fragile", "vip"], STAFF)).toBe(false);
    expect(await addNote(o.fulfillmentId, SHOP, "Call on arrival", STAFF)).not.toBeNull();

    const d = await readOrder(o.fulfillmentId, SHOP);
    expect(d.tags).toEqual(["fragile", "vip"]);
    expect(d.notes[0]).toMatchObject({ body: "Call on arrival", authorLabel: "Maya" });

    const log = (await readActivity(o.fulfillmentId, SHOP))!.map(toEntry);
    // ⚠ The idempotent second save wrote NOTHING — one tags entry, not two.
    expect(log.filter((e) => e.title.startsWith("Tags")).map((e) => e.title)).toEqual(["Tags set to fragile, vip"]);
    expect(log.some((e) => e.title === "Internal note added" && e.actorLabel === "Maya")).toBe(true);

    const listed = await listOrders(SHOP, parseListQuery({}));
    expect(listed.items[0]!.tags).toEqual(["fragile", "vip"]);
  });

  it("the log unions events, refunds, collection and arrival without duplicating a fact", async () => {
    const o = await order({ number: "EFY-L", recipient: "L", status: "delivered" });
    await pool.query(
      `INSERT INTO public.fulfillment_event (shop_fulfillment_id, actor_staff_id, event_type, from_status, to_status)
       VALUES ($1,$2,'state_changed','received','picking'),
              ($1,NULL,'state_changed','collected','delivered')`,
      [o.fulfillmentId, STAFF],
    );
    await pool.query(
      `INSERT INTO public.package_arrival (shop_fulfillment_id, source, recorded_by_sub)
       VALUES ($1, 'staff_recorded', 'sub-admin')`,
      [o.fulfillmentId],
    );
    await refund(o.orderId, 5, "succeeded", "back_office");

    const log = (await readActivity(o.fulfillmentId, SHOP))!.map(toEntry);
    const titles = log.map((e) => e.title);
    expect(titles).toContain("Marked picking");
    expect(titles).toContain("Delivered to the customer");
    // ⚠ The staff-recorded arrival wrote BOTH rows; it appears once.
    expect(titles.filter((t) => /deliver/i.test(t))).toHaveLength(1);
    expect(log.find((e) => e.title.startsWith("Refund"))?.actorLabel).toBe("Effy");
  });
});
