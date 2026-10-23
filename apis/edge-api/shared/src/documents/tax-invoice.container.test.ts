import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import {
  BuyerIdentityRequired, InvoiceNotAvailableForOrder, InvoicesUnavailable,
  issueAdjustment, issueInvoice, orderTaxDocuments, renderTaxDocumentPdf,
} from "./tax-invoice";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
let customerId: string;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

async function product(name: string, gst: string) {
  return (await one<{ id: string }>(
    `WITH p AS (INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by, status, approved_at, gst_status) VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1), $2, 'A thing', 'test', 'active', now(), $3) RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(5.50, 5.50)::numeric, (5.50)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shopId, name, gst])).id;
}

/** Milk 2 × $4.50 (GST-free), Soap 1 × $5.50 less 50c (taxable), delivery $9.90; total $23.90. */
async function paidOrder(opts: { lineGst?: (string | null)[]; unit?: string; number?: string } = {}) {
  const [milkGst, soapGst] = opts.lineGst ?? ["gst_free", "taxable"];
  const milk = await product("Milk", "gst_free");
  const soap = await product("Soap", "taxable");
  const unit = opts.unit ?? "5.50";
  const soapLine = Number(unit) - 0.5;
  const total = (9 + soapLine + 9.9).toFixed(2);
  const order = await one<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, discount_amount, delivery_fee_amount, grand_total_amount, delivery_address, status, placed_at, delivery_type, delivery_type_reason)
     VALUES ($1, $2, $3, 0.50, 9.90, $4, '{}'::jsonb, 'paid', now(), 'effy', 'in_coverage') RETURNING id`,
    [customerId, opts.number ?? `EFY-T${Math.random().toString(36).slice(2, 7).toUpperCase()}`, (9 + Number(unit)).toFixed(2), total]);
  const milkLine = await one<{ id: string }>(
    `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, gst_status, shop_unit_price_amount, shop_line_subtotal_amount)
     VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Milk', 4.50, 2, 9.00, $4, 4.50, 9.00) RETURNING id`, [order.id, milk, shopId, milkGst]);
  const soapRow = await one<{ id: string }>(
    `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, discount_amount, gst_status, shop_unit_price_amount, shop_line_subtotal_amount)
     VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Soap', $5::numeric, 1, $5::numeric, 0.50, $4, $5::numeric, $5::numeric) RETURNING id`, [order.id, soap, shopId, soapGst, unit]);
  await pool.query(`INSERT INTO public.payment (order_id, amount, status) VALUES ($1, $2, 'succeeded')`, [order.id, total]);
  return { order: order.id, milk, soap, milkLine: milkLine.id, soapLine: soapRow.id };
}

const enable = () => pool.query(
  `INSERT INTO public.business_tax (legal_name, abn, fee_treatment, invoices_enabled) VALUES ('Effy Test Pty Ltd', '51824753556', 'taxable', true)
   ON CONFLICT (id) DO UPDATE SET invoices_enabled = true`);

d("096 US8 — tax invoices and adjustment notes", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    shopId = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('TAX', 'Shop') RETURNING id`)).id;
    customerId = (await one<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email, given_name, family_name) VALUES ('t1', 't1@effyshopping.com', 'Ada', 'Lovelace') RETURNING id`)).id;
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM public.business_tax`);
  });

  it("refuses while the operator's details are unset — nothing is issued", async () => {
    const o = await paidOrder();
    await expect(issueInvoice(pool, o.order)).rejects.toBeInstanceOf(InvoicesUnavailable);
    expect((await pool.query(`SELECT 1 FROM public.tax_document`)).rowCount).toBe(0);
  });

  it("issues once, with every element, GST to the cent, and never changes it", async () => {
    await enable();
    const o = await paidOrder({ number: "EFY-TAX001" });
    const inv = await issueInvoice(pool, o.order);
    expect(inv).toMatchObject({
      kind: "invoice",
      issuer: { legalName: "Effy Test Pty Ltd", abn: "51824753556" },
      buyer: null,
      orderNumber: "EFY-TAX001",
      lines: [
        { name: "Milk", quantity: 2, amount: "9.00", taxable: false },
        { name: "Soap", quantity: 1, amount: "5.00", taxable: true },
      ],
      fees: [{ label: "Delivery", amount: "9.90", taxable: true }],
      totals: { total: "23.90", gst: "1.35", taxableTotal: "14.90", gstFreeTotal: "9.00" },
      payments: [{ label: "Card", amount: "23.90" }],
    });
    expect(inv.number).toMatch(/^EFY-INV-\d{6}$/);

    // Later changes to the product or the business leave the issued invoice alone.
    await pool.query(`UPDATE public.product SET gst_status = 'taxable' WHERE id = $1`, [o.milk]);
    await pool.query(`UPDATE public.business_tax SET legal_name = 'Someone Else Pty Ltd'`);
    expect(await issueInvoice(pool, o.order)).toEqual(inv);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.tax_document WHERE order_id = $1`, [o.order])).rows[0].n).toBe(1);

    const pdf = await renderTaxDocumentPdf(inv);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("an order from before GST status has no invoice", async () => {
    await enable();
    const o = await paidOrder({ lineGst: [null, null] });
    await expect(issueInvoice(pool, o.order)).rejects.toBeInstanceOf(InvoiceNotAvailableForOrder);
  });

  it("at $1,000 or more it prints the buyer, and needs a name to do so", async () => {
    await enable();
    const o = await paidOrder({ unit: "1000.00" });
    await pool.query(`INSERT INTO public.order_business_identity (order_id, business_name, abn) VALUES ($1, 'Lovelace Analytics', '51824753556')`, [o.order]);
    const inv = await issueInvoice(pool, o.order);
    expect(inv.buyer).toEqual({ name: "Ada Lovelace", businessName: "Lovelace Analytics", abn: "51824753556" });

    const nameless = (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('t2', 't2@effyshopping.com') RETURNING id`)).id;
    const big = await paidOrder({ unit: "1000.00" });
    await pool.query(`UPDATE public."order" SET customer_id = $2 WHERE id = $1`, [big.order, nameless]);
    await expect(issueInvoice(pool, big.order)).rejects.toBeInstanceOf(BuyerIdentityRequired);
  });

  it("one adjustment note per settled refund, itemised or by amount, each referring to the invoice", async () => {
    await enable();
    const o = await paidOrder();
    const refund = async (kind: string, amount: string, reason: string, status = "succeeded") => (await one<{ id: string }>(
      `INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key, actor_kind, actor_sub, settled_at, note)
       VALUES ($1, $2, $3, $4, $5, gen_random_uuid()::text, 'back_office', 'staff', now(), 'test') RETURNING id`, [o.order, kind, amount, reason, status])).id;
    const itemised = await refund("item", "5.00", "item_unusable");
    await pool.query(`INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount) VALUES ($1, $2, 1, 5.00)`, [itemised, o.soapLine]);
    await refund("goodwill", "10.00", "goodwill");
    await refund("item", "4.50", "item_not_supplied", "submitted");

    // No invoice yet: the first adjustment issues it first.
    const adj = await issueAdjustment(pool, itemised);
    expect(adj).toMatchObject({ kind: "adjustment", lines: [{ name: "Soap", quantity: 1, amount: "5.00", taxable: true }], totals: { total: "5.00", gst: "0.45" } });

    const all = await orderTaxDocuments(pool, o.order);
    expect(adj!.refersTo).toBe(all.invoice.number);
    expect(all.adjustments).toHaveLength(2);
    expect(all.adjustments[1]).toMatchObject({ lines: [{ name: "Amount refunded", amount: "10.00" }], totals: { total: "10.00", gst: "0.56" } });
    expect(all.adjustments.map((a) => a.number)).toEqual([...new Set(all.adjustments.map((a) => a.number))]);
    // Asked again: the same documents.
    expect((await orderTaxDocuments(pool, o.order)).adjustments).toEqual(all.adjustments);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.tax_document WHERE order_id = $1`, [o.order])).rows[0].n).toBe(3);
  });
});
