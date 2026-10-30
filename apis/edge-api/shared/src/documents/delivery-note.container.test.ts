import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inflateSync } from "node:zlib";

import { migrationSql } from "../testing/migrations";
import { buildDeliveryNote, NotDelivered, renderDeliveryNotePdf } from "./delivery-note";

/** Every PDF stream, inflated where compressed, as one latin1 string. */
function pdfText(pdf: Uint8Array): string {
  const buf = Buffer.from(pdf);
  const out: string[] = [buf.toString("latin1")];
  let at = 0;
  for (; ;) {
    const start = buf.indexOf("stream", at, "latin1");
    if (start < 0) break;
    const body = start + (buf[start + 6] === 0x0d ? 8 : 7);
    const end = buf.indexOf("endstream", body, "latin1");
    if (end < 0) break;
    try {
      out.push(inflateSync(buf.subarray(body, end)).toString("latin1"));
    } catch {
      // not compressed
    }
    at = end + 9;
  }
  return out.join("\n");
}

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const one = async <T,>(sql: string, p: unknown[] = []) => (await pool.query(sql, p as never[])).rows[0] as T;

async function shop(code: string) {
  return (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' Grocer') RETURNING id`, [code])).id;
}
async function product(shopId: string, name: string) {
  return (await one<{ id: string }>(
    `WITH p AS (INSERT INTO public.product (shop_id, primary_category_id, storage, gst_status, age_restricted, name, short_description, created_by, status, approved_at) VALUES ($1, (SELECT id FROM public.category LIMIT 1), 'ambient', 'gst_free', false, $2, 'A thing', 'test', 'active', now()) RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(4.50, 4.50)::numeric, (4.50)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shopId, name])).id;
}

d("096 US7 - the delivery note", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("merges a product across packages, marks part and unavailable lines, never names a shop or a price", async () => {
    const a = await shop("DNA");
    const b = await shop("DNB");
    const c = await shop("DNC");
    const milkA = await product(a, "Full cream milk 2L");
    const milkB = await product(b, "Full cream milk 2L");
    const bread = await product(a, "Sourdough loaf");
    const eggs = await product(c, "Free-range eggs 12 pack");
    const cust = await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('c1', 'c1@effyshopping.com') RETURNING id`);
    const order = await one<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, placed_at, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-DN0001', 30, 32, '{}'::jsonb, 'paid', now() - interval '1 day', 'effy', 'in_coverage') RETURNING id`, [cust.id]);
    const line = async (productId: string, shopId: string, name: string, qty: number) => (await one<{ id: string }>(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, shop_unit_price_amount, shop_line_subtotal_amount)
       VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, $4, 4.50, $5::int, 4.50 * $6::numeric, 4.50, 4.50 * $6::numeric) RETURNING id`, [order.id, productId, shopId, name, qty, qty])).id;
    const pkg = async (shopId: string, status: string) => (await one<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, unfulfillable_reason)
       VALUES ($1, $2, 1, 10, $3, CASE WHEN $3 = 'unfulfillable' THEN 'Out of stock' END) RETURNING id`,
      [order.id, shopId, status])).id;
    const pa = await pkg(a, "collected");
    const pb = await pkg(b, "collected");
    await pkg(c, "unfulfillable");
    const milkLineA = await line(milkA, a, "Full cream milk 2L", 2);
    await line(milkB, b, "Full cream milk 2L", 1);
    const breadLine = await line(bread, a, "Sourdough loaf", 3);
    await line(eggs, c, "Free-range eggs 12 pack", 1);
    await pool.query(
      `INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity, gathered_quantity, unavailable_quantity)
       VALUES ($1, $2, 2, 2, 0), ($1, $3, 3, 1, 2)`, [pa, milkLineA, breadLine]);

    // Package B has not arrived: no note yet.
    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source) VALUES ($1, 'driver_proof')`, [pa]);
    await expect(buildDeliveryNote(pool, order.id)).rejects.toBeInstanceOf(NotDelivered);

    await pool.query(`INSERT INTO public.package_arrival (shop_fulfillment_id, source) VALUES ($1, 'driver_proof')`, [pb]);
    const note = (await buildDeliveryNote(pool, order.id))!;
    expect(note.orderNumber).toBe("EFY-DN0001");
    expect(note.contact).toBe("hello@effyshopping.com");
    expect(note.lines).toEqual([
      { name: "Free-range eggs 12 pack", ordered: 1, supplied: 0, status: "unavailable" },
      { name: "Full cream milk 2L", ordered: 3, supplied: 3, status: "supplied" },
      { name: "Sourdough loaf", ordered: 3, supplied: 1, status: "part" },
    ].sort((x, y) => x.name.localeCompare(y.name)));
    const json = JSON.stringify(note);
    expect(json.replace(note.contact, "")).not.toMatch(/Grocer|DNA|DNB|4\.5|price|shop/i);

    const pdf = await renderDeliveryNotePdf(note);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    // pdf-lib compresses content and writes text as hex: inflate, then search both forms.
    const raw = pdfText(pdf);
    const hex = (t: string) => Buffer.from(t, "latin1").toString("hex").toUpperCase();
    expect(raw).toContain(hex("Sourdough loaf"));
    expect(raw).not.toContain("Grocer");
    expect(raw).not.toContain(hex("Grocer"));

    expect(await buildDeliveryNote(pool, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("a product name the PDF fonts cannot draw does not lose the document", async () => {
    const pdf = await renderDeliveryNotePdf({
      orderNumber: "EFY-DN0002", placedAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), contact: "hello@effyshopping.com",
      lines: Array.from({ length: 80 }, (_, i) => ({ name: `🍎 Apples “Pink Lady” ${i} - 1 kg bag with a rather long name that wraps onto a second line`, ordered: 2, supplied: i % 3 === 0 ? 1 : 2, status: (i % 3 === 0 ? "part" : "supplied") as "part" | "supplied" })),
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(Buffer.from(pdf).toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
});
