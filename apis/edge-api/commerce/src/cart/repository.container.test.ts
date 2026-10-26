import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { transactorFor } from "@effy/edge-shared";
import { insertTestProduct, insertTestVariant, migrationSql } from "@effy/edge-shared/testing";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCartRepository, type CartRepository } from "./repository";
import { promotionPort } from "../promotions/pricing";
import { createCartService, type CartService } from "./service";

/**
 * Against a real database: the change-id guard commits or rolls back with the mutation, merge takes
 * the maximum, and two racing deliveries of one add add once.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let repo: CartRepository;
let svc: CartService;
let customerId: string;
let otherCustomerId: string;
let cartId: string;
const p: Record<string, string> = {};
const prod: Record<string, string> = {};
const chg = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

d("070 — cart repository against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());

    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('CRT', 'Cart test shop')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('crt-cat', 'Cart test category')`);
    const one = async (sql: string) => (await pool.query<{ id: string }>(sql)).rows[0]!.id;
    const ids = {
      shopId: await one(`SELECT id::text FROM public.shop WHERE code='CRT'`),
      primaryCategoryId: await one(`SELECT id::text FROM public.category WHERE key='crt-cat'`),
    };
    for (const [name, price, status, tracked, onHand] of [
      ["Milk", "4.50", "active", false, null],
      ["Bread", "9.00", "active", false, null],
      ["Scarce", "2.00", "active", true, 2],
      ["Gone", "1.00", "archived", false, null],
    ] as const) {
      const t = await insertTestProduct(pool, { ...ids, name, price, status, approved: true, tracked, onHand });
      p[name] = t.variantId;
      prod[name] = t.productId;
    }
    // A second size of Milk: same product, its own line.
    const size = await one(`INSERT INTO public.product_option (product_id, position, kind) VALUES ('${prod.Milk}', 1, 'pack_size') RETURNING id::text`);
    const [oneL, twoL] = (await pool.query<{ id: string }>(
      `INSERT INTO public.product_option_value (option_id, value, position) VALUES ($1, '1 L', 0), ($1, '2 L', 1) RETURNING id::text`, [size],
    )).rows.map((r) => r.id);
    await pool.query(`UPDATE public.product_variant SET option1_value_id = $2 WHERE id = $1`, [p.Milk, oneL]);
    p["Milk 2L"] = await insertTestVariant(pool, prod.Milk!, { shopId: ids.shopId, price: "7.90", position: 1, optionValueIds: [twoL!, null] });
    [customerId, otherCustomerId] = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ('crt-sub-1', 'crt1@example.test'), ('crt-sub-2', 'crt2@example.test')
         RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id) as [string, string];

    repo = createCartRepository(pool, transactorFor(pool));
    svc = createCartService({ repo, policy: () => loadCartPolicy(pool), imageAddress: async () => null, promotions: promotionPort(pool) });
    cartId = await repo.getOrCreateCartId(customerId);
  }, 180_000);

  beforeEach(async () => {
    await pool.query(`DELETE FROM public.cart_item WHERE cart_id = $1`, [cartId]);
    await pool.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1`, [cartId]);
    await pool.query(`UPDATE public.cart SET promotion_code_id = NULL WHERE id = $1`, [cartId]);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("one cart per customer — asking again returns the same cart", async () => {
    expect(await repo.getOrCreateCartId(customerId)).toBe(cartId);
    expect(await repo.getOrCreateCartId(otherCustomerId)).not.toBe(cartId);
  });

  it("the revision is a number and every applied mutation advances it by one", async () => {
    const before = (await repo.meta(cartId)).revision;
    expect(typeof before).toBe("number");
    expect(await repo.addItem(cartId, p.Milk!, chg(1), 2, 99)).toBe(true);
    expect((await repo.meta(cartId)).revision).toBe(before + 1);
  });

  it("a change id already applied does nothing and does NOT advance the revision", async () => {
    await repo.addItem(cartId, p.Milk!, chg(2), 2, 99);
    const rev = (await repo.meta(cartId)).revision;
    expect(await repo.addItem(cartId, p.Milk!, chg(2), 2, 99)).toBe(false);
    expect((await repo.lines(cartId))[0]?.quantity).toBe(2);
    expect((await repo.meta(cartId)).revision).toBe(rev);
  });

  it("⚠ two deliveries of ONE add racing on separate connections add once", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => repo.addItem(cartId, p.Bread!, chg(10), 1, 99)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.lines(cartId)).find((l) => l.variant_id === p.Bread)?.quantity).toBe(1);
  });

  it("add captures the price at add, and increments are capped at the ceiling", async () => {
    await repo.addItem(cartId, p.Milk!, chg(3), 3, 5);
    await repo.addItem(cartId, p.Milk!, chg(4), 4, 5);
    const [line] = await repo.lines(cartId);
    expect(line).toMatchObject({ quantity: 5, unit_price_amount: "4.50", unit_price_at_add: "4.50", stock_tracked: false, stock_on_hand: null });
    expect(typeof line!.quantity).toBe("number");
  });

  it("merge takes the MAXIMUM, leaves other lines alone, and drops a product that does not exist", async () => {
    await repo.addItem(cartId, p.Milk!, chg(5), 3, 99);
    await repo.addItem(cartId, p.Scarce!, chg(6), 1, 99);
    await repo.mergeItems(cartId, chg(7), [p.Milk!, p.Bread!, "00000000-0000-0000-0000-000000000000"], [2, 4, 7], 99);
    const lines = Object.fromEntries((await repo.lines(cartId)).map((l) => [l.name, l.quantity]));
    expect(lines).toEqual({ Milk: 3, Scarce: 1, Bread: 4 });
  });

  it("set aside moves the line with its add-time price; restore brings it back at today's", async () => {
    await repo.addItem(cartId, p.Milk!, chg(8), 2, 99);
    await repo.setAside(cartId, p.Milk!, "");
    let all = await repo.allLines(cartId);
    expect(all.lines).toEqual([]);
    expect(all.saved.map((l) => [l.name, l.quantity, l.unit_price_at_add])).toEqual([["Milk", 2, "4.50"]]);

    await pool.query(`UPDATE public.product_variant SET price_amount = 5.00 WHERE id = $1`, [p.Milk]);
    await repo.restoreSaved(cartId, p.Milk!, "", 99);
    all = await repo.allLines(cartId);
    expect(all.saved).toEqual([]);
    expect(all.lines[0]).toMatchObject({ unit_price_amount: "5.00", unit_price_at_add: "5.00" });
    await pool.query(`UPDATE public.product_variant SET price_amount = 4.50 WHERE id = $1`, [p.Milk]);
  });

  it("the combined read returns payable lines, saved lines and the revision; an empty cart still has one", async () => {
    const empty = await repo.allLines(cartId);
    expect(empty.lines).toEqual([]);
    expect(empty.revision).toBe((await repo.meta(cartId)).revision);
  });

  it("the service end to end: stock cap, archived sweep, totals to the cent", async () => {
    await pool.query(
      `INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity)
       SELECT $1, v.product_id, v.id, q.n FROM (VALUES ($2::uuid, 5), ($3::uuid, 1), ($4::uuid, 1)) q (vid, n)
       JOIN public.product_variant v ON v.id = q.vid`,
      [cartId, p.Scarce, p.Gone, p.Milk],
    );
    const cart = await svc.get(customerId);
    expect(cart.lines.map((l) => [l.name, l.quantity, l.lineSubtotalAmount]).sort()).toEqual([["Milk", 1, "4.50"], ["Scarce", 2, "4.00"]]);
    expect(cart.itemSubtotalAmount).toBe("8.50");
    expect(cart.notices.map((n) => n.kind).sort()).toEqual(["quantity_clamped", "removed"]);
    expect((await repo.lines(cartId)).map((l) => l.name)).not.toContain("Gone"); // swept
  });

  it("reorder is scoped to the owner in the WHERE clause", async () => {
    const orderId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address, delivery_type, delivery_type_reason)
         VALUES ($1, 'CRT-0001', 'paid', 4.50, 4.50, '{}'::jsonb, 'effy', 'in_coverage') RETURNING id::text AS id`,
        [customerId],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount,
                                     shop_unit_price_amount, shop_line_subtotal_amount)
       SELECT $1, product_id, id, shop_id, 'Milk', 4.50, 2, 9.00, 4.50, 9.00 FROM public.product_variant WHERE id = $2`,
      [orderId, p.Milk],
    );
    expect(await repo.orderItemsForReorder(otherCustomerId, orderId)).toBeNull();
    expect((await repo.orderItemsForReorder(customerId, orderId))?.[0]).toMatchObject({ product_id: prod.Milk, variant_id: p.Milk, quantity: 2, status: "active", variant_state: "active" });
  });

  it("098 — two sizes of one product are two lines, each at its own price", async () => {
    await svc.add(customerId, p.Milk!, chg(20), 2);
    await svc.add(customerId, p["Milk 2L"]!, chg(21), 1);
    const cart = await svc.get(customerId);
    expect(cart.lines.map((l) => [l.productId, l.variantId, l.quantity, l.lineSubtotalAmount])).toEqual([
      [prod.Milk, p.Milk, 2, "9.00"],
      [prod.Milk, p["Milk 2L"], 1, "7.90"],
    ]);
    // An inactive size stays on the cart, flagged, and is charged nothing.
    await pool.query(`UPDATE public.product_variant SET state = 'inactive' WHERE id = $1`, [p["Milk 2L"]]);
    const after = await svc.get(customerId);
    expect(after.itemSubtotalAmount).toBe("9.00");
    expect(after.notices.find((n) => n.variantId === p["Milk 2L"])?.kind).toBe("unavailable");
    await pool.query(`UPDATE public.product_variant SET state = 'active' WHERE id = $1`, [p["Milk 2L"]]);
  });

  it("098 — a sold-out or off-sale SIZE is refused on add; the other size of the same product is not", async () => {
    await pool.query(`UPDATE public.product_variant SET stock_tracked = true, stock_on_hand = 0 WHERE id = $1`, [p["Milk 2L"]]);
    await expect(svc.add(customerId, p["Milk 2L"]!, chg(30), 1)).rejects.toThrow();
    await pool.query(`UPDATE public.product_variant SET stock_tracked = false, stock_on_hand = NULL, state = 'inactive' WHERE id = $1`, [p["Milk 2L"]]);
    await expect(svc.add(customerId, p["Milk 2L"]!, chg(31), 1)).rejects.toThrow();
    await pool.query(`UPDATE public.product_variant SET state = 'active' WHERE id = $1`, [p["Milk 2L"]]);
    expect((await svc.add(customerId, p.Milk!, chg(32), 1)).lines.map((l) => l.variantId)).toEqual([p.Milk]);
  });

  it("098 — a promotion targets the PRODUCT: its minimum quantity counts every size together", async () => {
    const promo = (await pool.query<{ id: string }>(
      `INSERT INTO public.promotion (name, kind, trigger, value_type, percent_off, applies_to, min_quantity, published_at, created_by)
       VALUES ('Milk run', 'item', 'automatic', 'percent', 10, 'products', 3, now() - interval '1 minute', 'seed') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.promotion_target (promotion_id, target_type, product_id) VALUES ($1, 'product', $2)`, [promo, prod.Milk]);
    try {
      await svc.add(customerId, p.Milk!, chg(40), 2);
      expect((await svc.get(customerId)).discountAmount).toBe("0.00"); // two units: not yet
      await svc.add(customerId, p["Milk 2L"]!, chg(41), 1);
      const cart = await svc.get(customerId);
      // Three units across two sizes qualify; both lines are discounted (10% of 9.00 + 7.90).
      expect(cart.itemSubtotalAmount).toBe("16.90");
      expect(Number(cart.discountAmount)).toBeCloseTo(1.69, 2);
    } finally {
      await pool.query(`DELETE FROM public.promotion WHERE id = $1`, [promo]);
    }
  });

  it("a change id that is not a uuid is refused by the column — which is why the handlers check first", async () => {
    await expect(repo.addItem(cartId, p.Milk!, "not-a-uuid", 1, 99)).rejects.toThrow(/uuid/);
  });

  it("094 — a code is matched without regard to case or spaces, and applying it discounts through the engine", async () => {
    const promo = await pool.query<{ id: string }>(
      `INSERT INTO public.promotion (name, kind, trigger, value_type, percent_off, applies_to, published_at, created_by)
       VALUES ('Ten off', 'cart', 'code', 'percent', 10, 'cart', now() - interval '1 minute', 'seed') RETURNING id::text AS id`,
    );
    await pool.query(`INSERT INTO public.promotion_code (promotion_id, code) VALUES ($1, 'CRT10')`, [promo.rows[0]!.id]);

    await repo.addItem(cartId, p.Bread!, chg(9), 1, 99);
    const cart = await svc.applyPromo(customerId, " crt 10 ");
    expect(cart).toMatchObject({ itemSubtotalAmount: "9.00", discountAmount: "0.90", grandTotalAmount: "8.10" });
    expect(cart.discount).toMatchObject({ code: "CRT10", amount: "0.90", label: "10% off" });
    expect((await svc.removePromo(customerId)).discount).toBeNull();
    await expect(svc.applyPromo(customerId, "NOPE")).rejects.toMatchObject({ reason: "promo_unknown" });
  });
});
