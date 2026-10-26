import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { transactorFor } from "@effy/edge-shared";
import { insertTestProduct, migrationSql, testLeafId } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCheckoutStore } from "./store";

/** The product facts an order line freezes (096 GST, 101 storage): what was sold, never what the product says later. */

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

d("101 US4 — storage and GST on every order line", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("carries each product's storage and GST status onto its order line, and keeps them when the product changes", async () => {
    const store = createCheckoutStore(pool, transactorFor(pool));
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('GST', 'Shop') RETURNING id`);
    const leaf = await testLeafId(pool);
    const product = async (name: string, gstStatus: "gst_free" | "taxable", storage: "frozen" | "chilled" | "ambient") =>
      (await insertTestProduct(pool, { shopId: shop.id, primaryCategoryId: leaf, name, price: "4.50", gstStatus, storage })).productId;
    const peas = await product("Frozen peas", "gst_free", "frozen");
    const milk = await product("Milk", "gst_free", "chilled");
    const soap = await product("Soap", "taxable", "ambient");
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('g1', 'g1@effyshopping.com') RETURNING id`);
    const cart = await one<{ id: string }>(`INSERT INTO public.cart (customer_id) VALUES ($1) RETURNING id`, [cust.id]);
    for (const p of [peas, milk, soap]) {
      await pool.query(
        `INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity)
         VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), 1)`,
        [cart.id, p],
      );
    }

    const lines = await store.cartLines(cust.id);
    expect(Object.fromEntries(lines.map((l) => [l.name, l.storageClass]))).toEqual({ "Frozen peas": "frozen", Milk: "chilled", Soap: "ambient" });

    const { orderId } = await store.upsertPendingOrder(
      cust.id,
      { itemSubtotalCents: 1350, deliveryFeeCents: 0, deliveryFeeBreakdown: null, discountCents: 0, promoCode: null, grandTotalCents: 1350, currency: "AUD", pointsUsed: 0, pointsCentsPerPoint: null, pointsValueCents: 0 },
      { city: "Fitzroy", postalCode: "3065" },
      lines,
      false,
    );
    // A later change to the product never alters what the order says.
    await pool.query(`UPDATE public.product SET gst_status = 'taxable', storage = 'ambient' WHERE id = $1`, [peas]);
    const rows = await pool.query(`SELECT product_name, gst_status, storage_class FROM public.order_item WHERE order_id = $1 ORDER BY product_name`, [orderId]);
    expect(rows.rows).toEqual([
      { product_name: "Frozen peas", gst_status: "gst_free", storage_class: "frozen" },
      { product_name: "Milk", gst_status: "gst_free", storage_class: "chilled" },
      { product_name: "Soap", gst_status: "taxable", storage_class: "ambient" },
    ]);
  });
});
