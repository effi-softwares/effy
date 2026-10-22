// 096 — the customer's order documents (spec US7, US8): the delivery note, and the tax invoice.
//
// ⚠ OWNER ONLY, AND A REFUSAL NEVER SAYS WHY: an order that does not exist and one that is someone
// else's are the same 404 (as for the order itself, 070), so an order id is never confirmed.
import { emitMetric, metricNamespace, pooled, withTransaction } from "@effy/edge-shared";
import {
  BuyerIdentityRequired, InvoiceNotAvailableForOrder, InvoicesUnavailable,
  buildDeliveryNote, isValidAbn, NotDelivered, orderTaxDocuments, renderDeliveryNotePdf, renderTaxDocumentPdf,
} from "@effy/edge-shared/documents";
import type { DeliveryNoteDTO, OrderTaxDocumentsDTO, TaxDocumentDTO } from "@effy/shared-types";

export class DocumentNotFound extends Error {}
export class DocumentNotReady extends Error {
  constructor(readonly code: "not_delivered" | "invoices_unavailable" | "invoice_not_available_for_order" | "buyer_identity_required") {
    super(code);
  }
}
export class BusinessIdentityInvalid extends Error {
  constructor(readonly code: "abn_invalid" | "invalid", message: string) {
    super(message);
  }
}

async function owns(customerId: string, orderId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return false;
  const r = await pooled.query(`SELECT 1 FROM public."order" WHERE id = $1 AND customer_id = $2 AND status = 'paid'`, [orderId, customerId]);
  return (r.rowCount ?? 0) > 0;
}

export async function deliveryNote(customerId: string, orderId: string): Promise<DeliveryNoteDTO> {
  if (!(await owns(customerId, orderId))) throw new DocumentNotFound();
  try {
    const note = await buildDeliveryNote(pooled, orderId);
    if (!note) throw new DocumentNotFound();
    return note;
  } catch (err) {
    if (err instanceof NotDelivered) throw new DocumentNotReady("not_delivered");
    throw err;
  }
}

export async function deliveryNotePdf(customerId: string, orderId: string): Promise<Uint8Array> {
  return renderDeliveryNotePdf(await deliveryNote(customerId, orderId));
}

/**
 * 096 US8 — the order's tax invoice and adjustment notes, issued on this first request (FR-080).
 * ⚠ While Effy's tax details are unset, nothing is issued: the customer is told it is not available
 * yet, and the platform is alerted (`TaxInvoiceRequestedWhileDisabled` → an alarm).
 */
export async function taxDocuments(customerId: string, orderId: string): Promise<OrderTaxDocumentsDTO> {
  if (!(await owns(customerId, orderId))) throw new DocumentNotFound();
  try {
    return await withTransaction((tx) => orderTaxDocuments(tx, orderId));
  } catch (err) {
    if (err instanceof InvoicesUnavailable) {
      emitMetric(metricNamespace(), "TaxInvoiceRequestedWhileDisabled");
      throw new DocumentNotReady("invoices_unavailable");
    }
    if (err instanceof InvoiceNotAvailableForOrder) throw new DocumentNotReady("invoice_not_available_for_order");
    if (err instanceof BuyerIdentityRequired) throw new DocumentNotReady("buyer_identity_required");
    throw err;
  }
}

/** One of the order's documents as a PDF, by its number. */
export async function taxDocumentPdf(customerId: string, orderId: string, number: string): Promise<{ bytes: Uint8Array; doc: TaxDocumentDTO }> {
  const all = await taxDocuments(customerId, orderId);
  const doc = [all.invoice, ...all.adjustments].find((d) => d?.number === number);
  if (!doc) throw new DocumentNotFound();
  return { bytes: await renderTaxDocumentPdf(doc), doc };
}

/**
 * 096 FR-085 — the customer's own business name and ABN, printed on this order's invoice. Set before
 * the invoice is issued; an issued invoice never changes, so a later change is refused.
 */
export async function setBusinessIdentity(customerId: string, orderId: string, body: Record<string, unknown>): Promise<void> {
  if (!(await owns(customerId, orderId))) throw new DocumentNotFound();
  const businessName = typeof body.businessName === "string" && body.businessName.trim() !== "" ? body.businessName.trim() : null;
  const abn = typeof body.abn === "string" && body.abn.trim() !== "" ? body.abn.replace(/\s+/g, "") : null;
  if (businessName !== null && (businessName.length < 2 || businessName.length > 200)) throw new BusinessIdentityInvalid("invalid", "the business name must be 2–200 characters");
  if (abn !== null && !isValidAbn(abn)) throw new BusinessIdentityInvalid("abn_invalid", "that is not a valid ABN");
  await withTransaction(async (tx) => {
    const issued = await tx.query(`SELECT 1 FROM public.tax_document WHERE order_id = $1 AND kind = 'invoice'`, [orderId]);
    if ((issued.rowCount ?? 0) > 0) throw new BusinessIdentityInvalid("invalid", "the invoice for this order has already been issued");
    await tx.query(
      `INSERT INTO public.order_business_identity (order_id, business_name, abn) VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE SET business_name = EXCLUDED.business_name, abn = EXCLUDED.abn, updated_at = now()`,
      [orderId, businessName, abn],
    );
  });
}
