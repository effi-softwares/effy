import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    pooled: { query: (t: string, p?: unknown[]) => holder.pool!.query(t, p as never[]) },
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
  };
});

import { migrationSql } from "@effy/edge-shared/testing";

import { BusinessIdentityInvalid, DocumentNotFound, DocumentNotReady, setBusinessIdentity, taxDocumentPdf, taxDocuments } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

d("096 US8 — the customer's tax documents", () => {
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

  it("owner only; not available while disabled; the business identity is set before issue; a PDF by number", async () => {
    const shop = await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('CTX', 'Shop') RETURNING id`);
    const product = await one<{ id: string }>(
      `WITH p AS (INSERT INTO public.product (shop_id, primary_category_id, storage, age_restricted, name, short_description, created_by, status, approved_at, gst_status) VALUES ($1, (SELECT id FROM public.category LIMIT 1), 'ambient', false, 'Soap', 'A thing', 'test', 'active', now(), 'taxable') RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(1100, 1100)::numeric, (1100)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shop.id]);
    const me = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email, given_name) VALUES ('me', 'me@effyshopping.com', 'Ada') RETURNING id`);
    const them = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('them', 'them@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, delivery_fee_amount, grand_total_amount, delivery_address, status, placed_at, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-CTX001', 1100, 0, 1100, '{}'::jsonb, 'paid', now(), 'effy', 'in_coverage') RETURNING id`, [me.id]);
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, gst_status, shop_unit_price_amount, shop_line_subtotal_amount)
       VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Soap', 1100, 1, 1100, 'taxable', 1100, 1100)`, [order.id, product.id, shop.id]);

    await expect(taxDocuments(them.id, order.id)).rejects.toBeInstanceOf(DocumentNotFound);
    await expect(taxDocuments(me.id, order.id)).rejects.toMatchObject({ code: "invoices_unavailable" });
    expect((await pool.query(`SELECT 1 FROM public.tax_document`)).rowCount).toBe(0);

    await expect(setBusinessIdentity(me.id, order.id, { abn: "12345678901" })).rejects.toBeInstanceOf(BusinessIdentityInvalid);
    await setBusinessIdentity(me.id, order.id, { businessName: "Lovelace Analytics", abn: "51 824 753 556" });
    await expect(setBusinessIdentity(them.id, order.id, { businessName: "Mine now" })).rejects.toBeInstanceOf(DocumentNotFound);

    await pool.query(`INSERT INTO public.business_tax (legal_name, abn, fee_treatment, invoices_enabled) VALUES ('Effy Test Pty Ltd', '51824753556', 'taxable', true)`);
    const docs = await taxDocuments(me.id, order.id);
    expect(docs.invoice).toMatchObject({ kind: "invoice", totals: { total: "1100.00", gst: "100.00" }, buyer: { name: "Ada", businessName: "Lovelace Analytics", abn: "51824753556" } });
    expect(docs.adjustments).toEqual([]);

    // Issued: the identity can no longer change what the invoice says.
    await expect(setBusinessIdentity(me.id, order.id, { businessName: "Other" })).rejects.toBeInstanceOf(BusinessIdentityInvalid);

    const { bytes } = await taxDocumentPdf(me.id, order.id, docs.invoice!.number);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    await expect(taxDocumentPdf(me.id, order.id, "EFY-INV-999999")).rejects.toBeInstanceOf(DocumentNotFound);
    expect(DocumentNotReady).toBeDefined();
  });
});
