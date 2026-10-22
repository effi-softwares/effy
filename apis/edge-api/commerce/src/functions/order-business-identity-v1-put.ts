// PUT /commerce/v1/orders/{id}/business-identity — the buyer's own business name and ABN for this
// order's tax invoice (096 FR-085). Owner only. 422 `abn_invalid`; refused once the invoice is issued.
import { ConnectionLimitError, internal, notFound, problem } from "@effy/edge-shared";

import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { BusinessIdentityInvalid, DocumentNotFound, setBusinessIdentity } from "../documents/service";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  if (!body) return problem(400, "https://effyshopping.com/problems/validation-failed", "Validation failed", "a JSON body is required", scope);
  try {
    await setBusinessIdentity(customer.id, pathParam(event, "id"), body);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof DocumentNotFound) return notFound(scope);
    if (err instanceof BusinessIdentityInvalid) return problem(422, `https://effyshopping.com/problems/${err.code}`, "Not accepted", err.message, scope);
    scope.log.error({ err }, "documents: business identity failed");
    return internal(scope);
  }
});
