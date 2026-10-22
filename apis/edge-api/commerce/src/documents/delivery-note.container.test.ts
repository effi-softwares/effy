import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, pooled: { query: (t: string, p?: unknown[]) => holder.pool!.query(t, p as never[]) } };
});

import { migrationSql } from "@effy/edge-shared";

import { DocumentNotFound, DocumentNotReady, deliveryNote, deliveryNotePdf } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

d("096 US7 — the customer's delivery note", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("is the owner's only, waits for delivery, and comes as a PDF", async () => {
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('CDN', 'Shop') RETURNING id`);
    const product = await one<{ id: string }>(
      `WITH p AS (INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by, status, approved_at) VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1), 'Milk', 'A thing', 'test', 'active', now()) RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(4.50, 4.50)::numeric, (4.50)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shop.id]);
    const me = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('me', 'me@effyshopping.com') RETURNING id`);
    const other = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('them', 'them@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, placed_at)
       VALUES ($1, 'EFY-CDN001', 9, 11, '{}'::jsonb, 'paid', now()) RETURNING id`, [me.id]);
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount)
       VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Milk', 4.50, 2, 9.00)`, [order.id, product.id, shop.id]);
    const pkg = await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status) VALUES ($1, $2, 1, 9, 'collected') RETURNING id`,
      [order.id, shop.id]);

    await expect(deliveryNote(other.id, order.id)).rejects.toBeInstanceOf(DocumentNotFound);
    await expect(deliveryNote(me.id, "not-a-uuid")).rejects.toBeInstanceOf(DocumentNotFound);
    await expect(deliveryNote(me.id, order.id)).rejects.toBeInstanceOf(DocumentNotReady);

    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source) VALUES ($1, 'driver_proof')`, [pkg.id]);
    expect((await deliveryNote(me.id, order.id)).lines).toEqual([{ name: "Milk", ordered: 2, supplied: 2, status: "supplied" }]);
    const pdf = await deliveryNotePdf(me.id, order.id);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    await expect(deliveryNotePdf(other.id, order.id)).rejects.toBeInstanceOf(DocumentNotFound);
  });
});
