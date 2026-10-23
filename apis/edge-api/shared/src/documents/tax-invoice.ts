// Tax invoices and adjustment notes, issued once from a frozen `snapshot` of what the PDF prints and
// never altered (`tax_document` is append-only). Nothing is issued while the operator's legal name and
// ABN are unset: refused (`InvoicesUnavailable`) and alerted, never a placeholder.
import type { GstStatus, TaxDocumentDTO } from "@effy/shared-types";

import { adjustmentGst, invoiceTotals, money } from "./gst";
import { A4, MARGIN, ensureRoom, finish, newDocument, rule, text, wordmark, wrap } from "./pdf";

type Tx = { query: (text: string, values?: unknown[]) => Promise<any> };

export class InvoicesUnavailable extends Error {}
/** Its lines carry no GST status, so no true invoice can be made. */
export class InvoiceNotAvailableForOrder extends Error {}
/** $1,000 or more and no buyer name to print. */
export class BuyerIdentityRequired extends Error {}

export const BUYER_IDENTITY_FROM_CENTS = 100_000;

const cents = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);

export interface TaxSettings {
  legalName: string | null;
  abn: string | null;
  feeTreatment: GstStatus | null;
  invoicesEnabled: boolean;
}

export async function readTaxSettings(tx: Tx): Promise<TaxSettings> {
  const r = await tx.query(`SELECT legal_name, abn, fee_treatment, invoices_enabled FROM public.business_tax LIMIT 1`);
  const row = r.rows[0];
  return { legalName: row?.legal_name ?? null, abn: row?.abn ?? null, feeTreatment: row?.fee_treatment ?? null, invoicesEnabled: row?.invoices_enabled === true };
}

async function nextNumber(tx: Tx, prefix: "INV" | "ADJ"): Promise<string> {
  const r = await tx.query(`SELECT nextval('public.tax_document_number_seq') AS n`);
  return `EFY-${prefix}-${String(r.rows[0].n).padStart(6, "0")}`;
}

async function existing(tx: Tx, where: string, id: string): Promise<TaxDocumentDTO | null> {
  const r = await tx.query(`SELECT snapshot FROM public.tax_document WHERE ${where} = $1`, [id]);
  return (r.rows[0]?.snapshot as TaxDocumentDTO | undefined) ?? null;
}

/** The one already issued, or a new one now. */
export async function issueInvoice(tx: Tx, orderId: string): Promise<TaxDocumentDTO> {
  const had = await existing(tx, "kind = 'invoice' AND order_id", orderId);
  if (had) return had;
  const settings = await readTaxSettings(tx);
  if (!settings.invoicesEnabled || !settings.legalName || !settings.abn || !settings.feeTreatment) throw new InvoicesUnavailable();

  const head = (await tx.query(
    `SELECT o.order_number, o.grand_total_amount, o.delivery_fee_amount, o.delivery_discount_amount, o.points_value_amount,
            trim(concat_ws(' ', c.given_name, c.family_name)) AS buyer_name,
            obi.business_name, obi.abn AS buyer_abn,
            (SELECT p.amount FROM public.payment p WHERE p.order_id = o.id AND p.status = 'succeeded' ORDER BY p.created_at DESC LIMIT 1) AS card_amount
       FROM public."order" o
       JOIN public.customer c ON c.id = o.customer_id
  LEFT JOIN public.order_business_identity obi ON obi.order_id = o.id
      WHERE o.id = $1 AND o.status = 'paid'`,
    [orderId],
  )).rows[0];
  if (!head) throw new InvoiceNotAvailableForOrder();
  const lines = (await tx.query(
    // The line as sold, with its variant.
    `SELECT CASE WHEN variant_label IS NULL THEN product_name ELSE product_name || ' — ' || variant_label END AS product_name, quantity, unit_price_amount, discount_amount, gst_status
       FROM public.order_item WHERE order_id = $1 ORDER BY product_name, id`,
    [orderId],
  )).rows as Array<{ product_name: string; quantity: number; unit_price_amount: string; discount_amount: string; gst_status: GstStatus | null }>;
  if (lines.length === 0 || lines.some((l) => l.gst_status === null)) throw new InvoiceNotAvailableForOrder();

  const totals = invoiceTotals(
    lines.map((l) => ({
      name: l.product_name,
      quantity: Number(l.quantity),
      amountCents: cents(l.unit_price_amount) * Number(l.quantity) - cents(l.discount_amount),
      taxable: l.gst_status === "taxable",
    })),
    [{ label: "Delivery", cents: cents(head.delivery_fee_amount) - cents(head.delivery_discount_amount) }],
    settings.feeTreatment,
  );

  let buyer: TaxDocumentDTO["buyer"] = null;
  if (totals.totalCents >= BUYER_IDENTITY_FROM_CENTS) {
    const name = (head.buyer_name as string | null)?.trim();
    if (!name) throw new BuyerIdentityRequired();
    buyer = { name, ...(head.business_name ? { businessName: head.business_name } : {}), ...(head.buyer_abn ? { abn: head.buyer_abn } : {}) };
  }

  const pointsCents = cents(head.points_value_amount);
  const cardCents = head.card_amount !== null ? cents(head.card_amount) : totals.totalCents - pointsCents;
  const number = await nextNumber(tx, "INV");
  const snapshot: TaxDocumentDTO = {
    kind: "invoice",
    number,
    issuedAt: new Date().toISOString(),
    issuer: { legalName: settings.legalName, abn: settings.abn },
    buyer,
    orderNumber: head.order_number,
    lines: totals.lines.map((l) => ({ name: l.name, quantity: l.quantity, amount: money(l.amountCents), taxable: l.taxable })),
    fees: totals.fees.map((f) => ({ label: f.label, amount: money(f.cents), taxable: f.taxable })),
    totals: { total: money(totals.totalCents), gst: money(totals.gstCents), taxableTotal: money(totals.taxableCents), gstFreeTotal: money(totals.gstFreeCents) },
    payments: [
      ...(cardCents > 0 ? [{ label: "Card", amount: money(cardCents) }] : []),
      ...(pointsCents > 0 ? [{ label: "Effy points", amount: money(pointsCents) }] : []),
    ],
  };
  // Two first requests at once: the unique index keeps one; the loser answers with it.
  const ins = await tx.query(
    `INSERT INTO public.tax_document (kind, order_id, number, snapshot, issuer)
     VALUES ('invoice', $1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (order_id) WHERE kind = 'invoice' DO NOTHING
     RETURNING snapshot`,
    [orderId, number, JSON.stringify(snapshot), JSON.stringify(snapshot.issuer)],
  );
  return (ins.rows[0]?.snapshot as TaxDocumentDTO | undefined) ?? (await existing(tx, "kind = 'invoice' AND order_id", orderId))!;
}

/** The one already issued, or a new one (issuing the invoice first). */
export async function issueAdjustment(tx: Tx, refundId: string): Promise<TaxDocumentDTO | null> {
  const had = await existing(tx, "kind = 'adjustment' AND refund_id", refundId);
  if (had) return had;
  const refund = (await tx.query(`SELECT order_id, amount FROM public.refund WHERE id = $1 AND status = 'succeeded'`, [refundId])).rows[0];
  if (!refund) return null;
  const invoice = await issueInvoice(tx, refund.order_id);
  const settings = await readTaxSettings(tx);
  const feeTreatment = settings.feeTreatment ?? "taxable";
  const refundLines = (await tx.query(
    `SELECT CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS product_name, rl.quantity, rl.amount, oi.gst_status
       FROM public.refund_line rl JOIN public.order_item oi ON oi.id = rl.order_item_id
      WHERE rl.refund_id = $1 ORDER BY oi.product_name, rl.id`,
    [refundId],
  )).rows as Array<{ product_name: string; quantity: number; amount: string; gst_status: GstStatus | null }>;

  const amountCents = cents(refund.amount);
  const linesCents = refundLines.reduce((a, l) => a + cents(l.amount), 0);
  const gstCents = adjustmentGst(
    { amountCents, ...(refundLines.length ? { lines: refundLines.map((l) => ({ amountCents: cents(l.amount), taxable: l.gst_status === "taxable" })) } : {}) },
    { gstCents: cents(invoice.totals.gst), totalCents: cents(invoice.totals.total) },
    feeTreatment,
  );
  const lines: TaxDocumentDTO["lines"] = refundLines.length
    ? refundLines.map((l) => ({ name: l.product_name, quantity: Number(l.quantity), amount: money(cents(l.amount)), taxable: l.gst_status === "taxable" }))
    : [{ name: "Amount refunded", quantity: 1, amount: money(amountCents), taxable: gstCents > 0 }];
  const remainder = refundLines.length ? amountCents - linesCents : 0;
  const fees: TaxDocumentDTO["fees"] = remainder > 0 ? [{ label: "Delivery", amount: money(remainder), taxable: feeTreatment === "taxable" }] : [];
  const taxableCents = lines.filter((l) => l.taxable).reduce((a, l) => a + cents(l.amount), 0) + fees.filter((f) => f.taxable).reduce((a, f) => a + cents(f.amount), 0);

  const number = await nextNumber(tx, "ADJ");
  const snapshot: TaxDocumentDTO = {
    kind: "adjustment",
    number,
    issuedAt: new Date().toISOString(),
    issuer: invoice.issuer,
    buyer: invoice.buyer,
    orderNumber: invoice.orderNumber,
    lines,
    fees,
    totals: { total: money(amountCents), gst: money(gstCents), taxableTotal: money(taxableCents), gstFreeTotal: money(amountCents - taxableCents) },
    payments: [{ label: "Refunded", amount: money(amountCents) }],
    refersTo: invoice.number,
  };
  const ins = await tx.query(
    `INSERT INTO public.tax_document (kind, order_id, refund_id, number, snapshot, issuer)
     VALUES ('adjustment', $1, $2, $3, $4::jsonb, $5::jsonb)
     ON CONFLICT (refund_id) WHERE kind = 'adjustment' DO NOTHING
     RETURNING snapshot`,
    [refund.order_id, refundId, number, JSON.stringify(snapshot), JSON.stringify(snapshot.issuer)],
  );
  return (ins.rows[0]?.snapshot as TaxDocumentDTO | undefined) ?? (await existing(tx, "kind = 'adjustment' AND refund_id", refundId));
}

/** Oldest first. */
export async function orderTaxDocuments(tx: Tx, orderId: string): Promise<{ invoice: TaxDocumentDTO; adjustments: TaxDocumentDTO[] }> {
  const invoice = await issueInvoice(tx, orderId);
  const refunds = (await tx.query(
    `SELECT id FROM public.refund WHERE order_id = $1 AND status = 'succeeded' ORDER BY settled_at NULLS LAST, created_at, id`,
    [orderId],
  )).rows as Array<{ id: string }>;
  const adjustments: TaxDocumentDTO[] = [];
  for (const r of refunds) {
    const a = await issueAdjustment(tx, r.id);
    if (a) adjustments.push(a);
  }
  return { invoice, adjustments };
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" }).format(new Date(iso));
const abnWords = (abn: string) => `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`;

/** From its snapshot alone. */
export async function renderTaxDocumentPdf(doc: TaxDocumentDTO): Promise<Uint8Array> {
  const startedAt = Date.now();
  const title = doc.kind === "invoice" ? "Tax invoice" : "Adjustment note";
  const pdf = await newDocument(`${title} ${doc.number}`);
  const right = A4.w - MARGIN;
  const colQty = right - 150;
  const colAmount = right;
  const nameWidth = colQty - MARGIN - 60;

  wordmark(pdf, 24);
  pdf.y += 26;
  text(pdf, title, MARGIN, { size: 22, bold: true });
  text(pdf, doc.number, right, { size: 11, bold: true, align: "right" });
  pdf.y += 18;
  text(pdf, doc.issuer.legalName, MARGIN, { size: 10, bold: true });
  text(pdf, `Issued ${day(doc.issuedAt)}`, right, { size: 10, align: "right" });
  pdf.y += 14;
  text(pdf, `ABN ${abnWords(doc.issuer.abn)}`, MARGIN, { size: 10 });
  text(pdf, `Order ${doc.orderNumber}`, right, { size: 10, align: "right" });
  pdf.y += 14;
  if (doc.refersTo) {
    text(pdf, `Adjusts tax invoice ${doc.refersTo}`, MARGIN, { size: 10, muted: true });
    pdf.y += 14;
  }
  if (doc.buyer) {
    pdf.y += 6;
    text(pdf, "Bill to", MARGIN, { size: 9, bold: true, muted: true });
    pdf.y += 13;
    text(pdf, doc.buyer.name, MARGIN, { size: 10 });
    if (doc.buyer.businessName) {
      pdf.y += 13;
      text(pdf, doc.buyer.businessName, MARGIN, { size: 10 });
    }
    if (doc.buyer.abn) {
      pdf.y += 13;
      text(pdf, `ABN ${abnWords(doc.buyer.abn)}`, MARGIN, { size: 10 });
    }
    pdf.y += 6;
  }
  pdf.y += 18;

  const header = () => {
    text(pdf, "Item", MARGIN, { size: 9, bold: true });
    text(pdf, "Qty", colQty, { size: 9, bold: true, align: "right" });
    text(pdf, "Amount (incl. GST)", colAmount, { size: 9, bold: true, align: "right" });
    pdf.y += 6;
    rule(pdf, 0.8, "ink");
    pdf.y += 14;
  };
  header();
  const row = (name: string, qty: string, amount: string, taxable: boolean) => {
    const label = `${name}${taxable ? " *" : ""}`;
    const nameLines = wrap(pdf, label, nameWidth, 10);
    if (ensureRoom(pdf, nameLines.length * 13 + 10)) header();
    text(pdf, nameLines[0]!, MARGIN, { size: 10 });
    text(pdf, qty, colQty, { size: 10, align: "right" });
    text(pdf, `$${amount}`, colAmount, { size: 10, align: "right" });
    for (const more of nameLines.slice(1)) {
      pdf.y += 13;
      text(pdf, more, MARGIN, { size: 10 });
    }
    pdf.y += 8;
    rule(pdf);
    pdf.y += 14;
  };
  for (const l of doc.lines) row(l.name, String(l.quantity), l.amount, l.taxable);
  for (const f of doc.fees) row(f.label, "", f.amount, f.taxable);

  ensureRoom(pdf, 120);
  pdf.y += 4;
  const total = (label: string, value: string, bold = false) => {
    text(pdf, label, colQty, { size: 10, bold, align: "right" });
    text(pdf, value, colAmount, { size: 10, bold, align: "right" });
    pdf.y += 15;
  };
  total("Taxable items (incl. GST)", `$${doc.totals.taxableTotal}`);
  total("GST-free items", `$${doc.totals.gstFreeTotal}`);
  total(doc.kind === "invoice" ? "GST included" : "GST adjustment", `$${doc.totals.gst}`);
  total(doc.kind === "invoice" ? "Total" : "Total refunded", `$${doc.totals.total}`, true);
  pdf.y += 6;
  for (const p of doc.payments) total(p.label, `$${p.amount}`);
  pdf.y += 10;
  text(pdf, "* Taxable item: the price includes GST. Items without * are GST-free.", MARGIN, { size: 9, muted: true });
  pdf.y += 14;
  text(pdf, "Questions? hello@effyshopping.com", MARGIN, { size: 9, muted: true });
  return finish(pdf, doc.kind === "invoice" ? "tax_invoice" : "adjustment_note", startedAt);
}
