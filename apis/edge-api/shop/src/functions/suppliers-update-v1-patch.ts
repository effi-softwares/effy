// PATCH /shop/v1/suppliers/{id} — edit a supplier (057 US6).
//
// ⚠ An ABSENT key means "leave alone"; an explicit null means "clear it". See the repository for why
// COALESCE was not used (056 shipped a field that could never be emptied again).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { updateSupplier } from "../suppliers/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(200, await updateSupplier(g.shopId, event.pathParameters?.id ?? "", parsed.value), scope);
  } catch (err) {
    return mapProductError(err, scope);
  }
};
