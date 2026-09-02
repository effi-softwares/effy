// POST /shop/v1/team/invite — provision a colleague on the shop pool (057 US7).
//
// ⚠ MANAGER-ONLY, decided in the service from the PLATFORM RECORD (role AND status), never from the
// token claim. ⚠ And an email already known to this shop is REFUSED rather than adopted — see
// `service.invite` for why 009's re-enable-on-conflict behaviour is unsafe for this caller.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapProductError } from "../products/handler-support";
import { invite } from "../team/service";

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
    await invite(g.shopId, g.sub, parsed.value);
    return { statusCode: 204, headers: { "x-request-id": scope.requestId }, body: "" };
  } catch (err) {
    return mapProductError(err, scope);
  }
};
