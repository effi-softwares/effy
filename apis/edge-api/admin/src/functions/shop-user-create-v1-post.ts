// POST /admin/v1/shops/{shopId}/users — add a user to a shop (US4/FR-007). Mutate access.
// Provisions a shop-pool account + platform record (Cognito-first, R4); enforces one-user-one-shop.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapShopError, toUserDTO } from "../shops/handler-support";
import { addShopUser } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(201, toUserDTO(await addShopUser(shopId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
