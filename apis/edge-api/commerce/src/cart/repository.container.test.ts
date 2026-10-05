import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql, transactorFor } from "@effy/edge-shared";
import { loadCartPolicy } from "@effy/edge-shared/cart-policy";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCartRepository, type CartRepository } from "./repository";
import { createCartService, type CartService } from "./service";

/**
 * 070 — the cart's SQL against the REAL schema.
 *
 * The service tests use an in-memory repository, so they prove the rules and never run a statement.
 * This proves the statements — and the three properties that only a real database can show: the
 * change-id guard and the mutation commit or roll back together; merge takes the maximum; and two
 * deliveries of one add, racing on separate connections, add once.
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
/** A change id is a uuid on the wire and in the table. */
const chg = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

d("070 — cart repository against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());

    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('CRT', 'Cart test shop')`);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('crt-type', 'Cart test type')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('crt-cat', 'Cart test category')`);
    for (const [name, price, status, tracked, onHand] of [
      ["Milk", "4.50", "active", false, null],
      ["Bread", "9.00", "active", false, null],
      ["Scarce", "2.00", "active", true, 2],
      ["Gone", "1.00", "archived", false, null],
    ] as const) {
      p[name] = (
        await pool.query<{ id: string }>(
          `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, shop_price_amount,
                                       short_description, created_by, status, approved_at, stock_tracked, stock_on_hand)
           SELECT (SELECT id FROM public.shop WHERE code='CRT'), (SELECT id FROM public.product_type WHERE key='crt-type'),
                  (SELECT id FROM public.category WHERE key='crt-cat'), $1, $2::numeric, $2::numeric, 'd', 'seed', $3, now(), $4, $5
           RETURNING id::text AS id`,
          [name, price, status, tracked, onHand],
        )
      ).rows[0]!.id;
    }
    [customerId, otherCustomerId] = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ('crt-sub-1', 'crt1@example.test'), ('crt-sub-2', 'crt2@example.test')
         RETURNING id::text AS id`,
      )
    ).rows.map((r) => r.id) as [string, string];

    repo = createCartRepository(pool, transactorFor(pool));
    svc = createCartService({ repo, policy: () => loadCartPolicy(pool), presign: async () => null });
    cartId = await repo.getOrCreateCartId(customerId);
  }, 180_000);

  beforeEach(async () => {
    await pool.query(`DELETE FROM public.cart_item WHERE cart_id = $1`, [cartId]);
    await pool.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1`, [cartId]);
    await pool.query(`UPDATE public.cart SET promo_code_id = NULL WHERE id = $1`, [cartId]);
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
    expect((await repo.lines(cartId)).find((l) => l.product_id === p.Bread)?.quantity).toBe(1);
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

    await pool.query(`UPDATE public.product SET price_amount = 5.00 WHERE id = $1`, [p.Milk]);
    await repo.restoreSaved(cartId, p.Milk!, "", 99);
    all = await repo.allLines(cartId);
    expect(all.saved).toEqual([]);
    expect(all.lines[0]).toMatchObject({ unit_price_amount: "5.00", unit_price_at_add: "5.00" });
    await pool.query(`UPDATE public.product SET price_amount = 4.50 WHERE id = $1`, [p.Milk]);
  });

  it("the combined read returns payable lines, saved lines and the revision; an empty cart still has one", async () => {
    const empty = await repo.allLines(cartId);
    expect(empty.lines).toEqual([]);
    expect(empty.revision).toBe((await repo.meta(cartId)).revision);
  });

  it("the service end to end: stock cap, archived sweep, totals to the cent", async () => {
    await pool.query(
      `INSERT INTO public.cart_item (cart_id, product_id, quantity) VALUES ($1, $2, 5), ($1, $3, 1), ($1, $4, 1)`,
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
        `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address)
         VALUES ($1, 'CRT-0001', 'paid', 4.50, 4.50, '{}'::jsonb) RETURNING id::text AS id`,
        [customerId],
      )
    ).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
       SELECT $1, $2, shop_id, 'Milk', 4.50, 2, 9.00 FROM public.product WHERE id = $2`,
      [orderId, p.Milk],
    );
    expect(await repo.orderItemsForReorder(otherCustomerId, orderId)).toBeNull();
    expect((await repo.orderItemsForReorder(customerId, orderId))?.[0]).toMatchObject({ product_id: p.Milk, quantity: 2, status: "active" });
  });

  it("a change id that is not a uuid is refused by the column — which is why the handlers check first", async () => {
    await expect(repo.addItem(cartId, p.Milk!, "not-a-uuid", 1, 99)).rejects.toThrow(/uuid/);
  });

  it("promo: lookup is case-insensitive, usage is counted from redemptions, applying it discounts", async () => {
    await pool.query(
      `INSERT INTO public.promo_code (code, kind, percent_off, minimum_subtotal_amount, status, created_by)
       VALUES ('CRT10', 'percentage', 10, 0, 'active', 'seed')`,
    );
    const code = await repo.promoByCode("crt10");
    expect(code).toMatchObject({ code: "CRT10", kind: "percentage", percentOff: 10, minimumSubtotalCents: 0, maxRedemptions: null });
    expect(await repo.promoUsageFor(code!.id, customerId)).toEqual({ total: 0, byThisShopper: 0 });

    await repo.addItem(cartId, p.Bread!, chg(9), 1, 99);
    const cart = await svc.applyPromo(customerId, "crt10");
    expect(cart).toMatchObject({ itemSubtotalAmount: "9.00", discountAmount: "0.90", grandTotalAmount: "8.10" });
    expect((await svc.removePromo(customerId)).discount).toBeNull();
    await expect(svc.applyPromo(customerId, "NOPE")).rejects.toMatchObject({ reason: "promo_unknown" });
  });
});
