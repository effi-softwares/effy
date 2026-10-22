// 096 US7 — the delivery note (FR-070–FR-073): what the customer was supplied, line by line, once the
// order has arrived. Digital only — on the order page and in the app, as data and as a PDF.
//
// ⚠ HIDDEN FULFILMENT. Lines are MERGED BY PRODUCT across the order's packages, so neither the note nor
// its PDF says how many suppliers (or bags) filled the order. No price, no shop name, ever.
import { DELIVERY_NOTE_LINE_WORDS, DOCUMENT_CONTACT, type DeliveryNoteDTO, type DeliveryNoteLineStatus } from "@effy/shared-types";

import { A4, MARGIN, ensureRoom, finish, newDocument, rule, text, wordmark, wrap } from "./pdf";

type Db = { query: (text: string, values?: unknown[]) => Promise<any> };

export class NotDelivered extends Error {
  constructor() {
    super("the order has not been delivered yet");
  }
}

/**
 * The note for an order, or `NotDelivered` while any package that is coming is still on its way. A
 * package the shop could not supply (or one withdrawn) is not waited for — its lines say unavailable.
 * Returns null when the order does not exist.
 */
export async function buildDeliveryNote(db: Db, orderId: string): Promise<DeliveryNoteDTO | null> {
  const head = await db.query(
    `SELECT o.order_number, o.placed_at, o.created_at,
            (SELECT max(pa.arrived_at) FROM public.package_arrival pa
               JOIN public.shop_fulfillment sf ON sf.id = pa.shop_fulfillment_id
              WHERE sf.order_id = o.id) AS delivered_at,
            EXISTS (SELECT 1 FROM public.shop_fulfillment sf
                     WHERE sf.order_id = o.id AND sf.status NOT IN ('withdrawn', 'unfulfillable')
                       AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = sf.id)) AS still_coming
       FROM public."order" o
      WHERE o.id = $1 AND o.status = 'paid'`,
    [orderId],
  );
  const h = head.rows[0];
  if (!h) return null;
  if (h.still_coming || !h.delivered_at) throw new NotDelivered();

  // One row per order line: ordered, and what its package could not supply. A withdrawn or
  // unfulfillable package supplied nothing.
  const lines = await db.query(
    // 098 — named with its variant, so two sizes of one product stay two lines.
    `SELECT oi.product_id, CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS product_name, oi.quantity AS ordered,
            CASE WHEN sf.status IN ('withdrawn', 'unfulfillable') THEN oi.quantity
                 ELSE COALESCE(fi.unavailable_quantity, 0) END AS unavailable
       FROM public.order_item oi
  LEFT JOIN public.shop_fulfillment sf ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
  LEFT JOIN public.fulfillment_item fi ON fi.order_item_id = oi.id AND fi.shop_fulfillment_id = sf.id
      WHERE oi.order_id = $1
      ORDER BY oi.product_name, oi.id`,
    [orderId],
  );
  const merged = new Map<string, { name: string; ordered: number; supplied: number }>();
  for (const r of lines.rows as Array<{ product_id: string; product_name: string; ordered: number; unavailable: number }>) {
    // ⚠ By the NAME the customer bought, not the product row: two shops' listings of the same thing are
    // two rows, and keeping them apart would say two suppliers filled the order.
    const key = r.product_name.trim().toLowerCase();
    const m = merged.get(key) ?? { name: r.product_name, ordered: 0, supplied: 0 };
    m.ordered += Number(r.ordered);
    m.supplied += Math.max(0, Number(r.ordered) - Number(r.unavailable));
    merged.set(key, m);
  }

  return {
    orderNumber: h.order_number,
    placedAt: new Date(h.placed_at ?? h.created_at).toISOString(),
    deliveredAt: new Date(h.delivered_at).toISOString(),
    contact: DOCUMENT_CONTACT,
    lines: [...merged.values()].map((m) => ({ ...m, status: statusOf(m.ordered, m.supplied) })),
  };
}

function statusOf(ordered: number, supplied: number): DeliveryNoteLineStatus {
  if (supplied >= ordered) return "supplied";
  return supplied === 0 ? "unavailable" : "part";
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" }).format(new Date(iso));

/** The note as an A4 PDF: the wordmark, the order, a table of lines, the contact. */
export async function renderDeliveryNotePdf(note: DeliveryNoteDTO): Promise<Uint8Array> {
  const startedAt = Date.now();
  const doc = await newDocument(`Delivery note ${note.orderNumber}`);
  const right = A4.w - MARGIN;
  const colOrdered = right - 150;
  const colSupplied = right - 90;
  const nameWidth = colOrdered - MARGIN - 70;

  wordmark(doc, 24);
  doc.y += 26;
  text(doc, "Delivery note", MARGIN, { size: 20, bold: true });
  doc.y += 22;
  text(doc, `Order ${note.orderNumber}`, MARGIN, { size: 11, bold: true });
  text(doc, `Delivered ${day(note.deliveredAt)}`, right, { size: 10, align: "right" });
  doc.y += 15;
  text(doc, `Ordered ${day(note.placedAt)}`, MARGIN, { size: 10, muted: true });
  doc.y += 26;

  const header = () => {
    text(doc, "Item", MARGIN, { size: 9, bold: true });
    text(doc, "Ordered", colOrdered, { size: 9, bold: true, align: "right" });
    text(doc, "Supplied", colSupplied, { size: 9, bold: true, align: "right" });
    text(doc, "", right);
    doc.y += 6;
    rule(doc, 0.8, "ink");
    doc.y += 14;
  };
  header();
  for (const line of note.lines) {
    const nameLines = wrap(doc, line.name, nameWidth, 10);
    if (ensureRoom(doc, nameLines.length * 13 + 10)) header();
    text(doc, nameLines[0]!, MARGIN, { size: 10 });
    text(doc, String(line.ordered), colOrdered, { size: 10, align: "right" });
    text(doc, String(line.supplied), colSupplied, { size: 10, align: "right" });
    if (line.status !== "supplied") text(doc, DELIVERY_NOTE_LINE_WORDS[line.status], right, { size: 9, bold: true, align: "right" });
    for (const more of nameLines.slice(1)) {
      doc.y += 13;
      text(doc, more, MARGIN, { size: 10 });
    }
    doc.y += 8;
    rule(doc);
    doc.y += 14;
  }

  ensureRoom(doc, 60);
  doc.y += 10;
  const short = note.lines.filter((l) => l.status !== "supplied").length;
  if (short > 0) {
    text(doc, `${short} item${short === 1 ? " was" : "s were"} not supplied in full. Anything you weren't sent is refunded to you.`, MARGIN, { size: 9, muted: true });
    doc.y += 14;
  }
  text(doc, `Questions? ${note.contact}`, MARGIN, { size: 9, muted: true });
  return finish(doc, "delivery_note", startedAt);
}
