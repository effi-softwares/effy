// DELETE /shop/v1/suppliers/{id} — ARCHIVE a supplier (057 US6).
//
// ⚠ IT ARCHIVES, IT DOES NOT DELETE, and the verb is a deliberate compromise. A purchase order names
// its supplier forever behind an ON DELETE RESTRICT, so a real delete would be refused for exactly the
// suppliers a shop has actually used. Archiving does what the operator wanted — take it out of the
// picker — without erasing the orders that reference it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { preamble } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { archiveSupplier } from "../suppliers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  try {
    await archiveSupplier(g.shopId, event.pathParameters?.id ?? "");
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapProductError(err, scope);
  }
};
