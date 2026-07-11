// PATCH /admin/v1/shops/{shopId}/users/{userId} — change role and/or status (US4/FR-008). Mutate
// access. Role change touches Cognito groups + DB; disable/enable touches the account + status
// (R5/Q1). No reassignment: a userId not assigned to {shopId} is refused (A8).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapShopError, toUserDTO } from "../shops/handler-support";
import { updateShopUser } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  const userId = event.pathParameters?.userId ?? "";
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toUserDTO(await updateShopUser(shopId, userId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
