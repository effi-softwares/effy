import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql, transactorFor } from "@effy/edge-shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCheckoutStore } from "./store";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

d("096 US9 — GST status at checkout", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("knows which lines are unclassified, whether invoices are on, and freezes the status onto each order line", async () => {
    const store = createCheckoutStore(pool, transactorFor(pool));
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('GST', 'Shop') RETURNING id`);
    const product = async (name: string, gst: string | null) => (await one<{ id: string }>(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount, short_description, created_by, status, approved_at, gst_status)
       VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1), $2, 4.50, 'A thing', 'test', 'active', now(), $3)
       RETURNING id`, [shop.id, name, gst])).id;
    const milk = await product("Milk", "gst_free");
    const soap = await product("Soap", "taxable");
    const mystery = await product("Mystery", null);
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('g1', 'g1@effyshopping.com') RETURNING id`);
    const cart = await one<{ id: string }>(`INSERT INTO public.cart (customer_id) VALUES ($1) RETURNING id`, [cust.id]);
    for (const p of [milk, soap, mystery]) await pool.query(`INSERT INTO public.cart_item (cart_id, product_id, quantity) VALUES ($1, $2, 1)`, [cart.id, p]);

    const lines = await store.cartLines(cust.id);
    expect(Object.fromEntries(lines.map((l) => [l.name, l.gstClassified]))).toEqual({ Milk: true, Soap: true, Mystery: false });

    // No business_tax row yet (it is never seeded): invoices are off.
    expect(await store.invoicesEnabled()).toBe(false);
    await pool.query(`INSERT INTO public.business_tax (legal_name, abn, fee_treatment, invoices_enabled) VALUES ('Effy Test Pty Ltd', '51824753556', 'taxable', true)`);
    expect(await store.invoicesEnabled()).toBe(true);

    const { orderId } = await store.upsertPendingOrder(
      cust.id,
      { itemSubtotalCents: 1350, deliveryFeeCents: 0, deliveryFeeBreakdown: null, discountCents: 0, promoCode: null, grandTotalCents: 1350, currency: "AUD", pointsUsed: 0, pointsCentsPerPoint: null, pointsValueCents: 0 },
      { city: "Fitzroy", postalCode: "3065" },
      lines,
      false,
    );
    // A later change to the product never alters what the order says.
    await pool.query(`UPDATE public.product SET gst_status = 'taxable' WHERE id = $1`, [milk]);
    const rows = await pool.query(`SELECT product_name, gst_status FROM public.order_item WHERE order_id = $1 ORDER BY product_name`, [orderId]);
    expect(rows.rows).toEqual([
      { product_name: "Milk", gst_status: "gst_free" },
      { product_name: "Mystery", gst_status: null },
      { product_name: "Soap", gst_status: "taxable" },
    ]);
  });
});
