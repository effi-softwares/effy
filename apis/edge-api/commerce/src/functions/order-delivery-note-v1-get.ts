import { ConnectionLimitError, internal, json, notFound } from "@effy/edge-shared";

import { customerRoute, pathParam } from "../lib/route";
import { DocumentNotFound, DocumentNotReady, deliveryNote, deliveryNotePdf } from "../documents/service";
import { documentConflict, pdfResponse } from "../documents/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const orderId = pathParam(event, "id");
  try {
    if (event.queryStringParameters?.format === "pdf") {
      const bytes = await deliveryNotePdf(customer.id, orderId);
      return pdfResponse(bytes, `effy-delivery-note-${orderId.slice(0, 8)}.pdf`);
    }
    return json(200, await deliveryNote(customer.id, orderId), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof DocumentNotFound) return notFound(scope);
    if (err instanceof DocumentNotReady) return documentConflict(scope, err.code, "The delivery note is ready once your order has arrived.");
    scope.log.error({ err }, "documents: delivery note failed");
    return internal(scope);
  }
});
