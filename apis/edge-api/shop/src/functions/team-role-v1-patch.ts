// PATCH /shop/v1/team/{staffId}/role — change a colleague's role (057 US7).
//
// ⚠ Demoting the LAST active manager is refused: a shop with no manager cannot invite, cannot change a
// role and cannot refund — it locks itself out permanently and only back-office can undo it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { changeRole } from "../team/service";

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
    await changeRole(g.shopId, g.sub, event.pathParameters?.staffId ?? "", parsed.value);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapProductError(err, scope);
  }
};
