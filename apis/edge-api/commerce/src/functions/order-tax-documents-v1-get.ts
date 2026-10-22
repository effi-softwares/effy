// GET /commerce/v1/orders/{id}/tax-documents[?doc={number}&format=pdf] — the order's tax invoice and
// adjustment notes (096 US8). Owner only (404 for not-yours). 409 `invoices_unavailable` while Effy's
// tax details are unset; 409 `buyer_identity_required` at $1,000 or more with no name; 409
// `invoice_not_available_for_order` for an order from before GST status.
import { ConnectionLimitError, internal, json, notFound } from "@effy/edge-shared";

import { customerRoute, pathParam } from "../lib/route";
import { DocumentNotFound, DocumentNotReady, taxDocumentPdf, taxDocuments } from "../documents/service";
import { documentConflict, pdfResponse } from "../documents/respond";

const SENTENCE: Record<DocumentNotReady["code"], string> = {
  not_delivered: "Not available yet.",
  invoices_unavailable: "Tax invoices aren't available yet. Please try again later.",
  invoice_not_available_for_order: "A tax invoice isn't available for this order.",
  buyer_identity_required: "Orders of $1,000 or more need the buyer's name on the invoice.",
};

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const orderId = pathParam(event, "id");
  const q = event.queryStringParameters ?? {};
  try {
    if (q.format === "pdf") {
      if (!q.doc) return notFound(scope);
      const { bytes, doc } = await taxDocumentPdf(customer.id, orderId, q.doc);
      return pdfResponse(bytes, `effy-${doc.number.toLowerCase()}.pdf`);
    }
    return json(200, await taxDocuments(customer.id, orderId), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof DocumentNotFound) return notFound(scope);
    if (err instanceof DocumentNotReady) return documentConflict(scope, err.code, SENTENCE[err.code]);
    scope.log.error({ err }, "documents: tax documents failed");
    return internal(scope);
  }
});
