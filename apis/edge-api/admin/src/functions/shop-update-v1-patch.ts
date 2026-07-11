// PATCH /admin/v1/shops/{shopId} — edit mutable details (name/contactPhone/notes; code immutable).
// Mutate access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapShopError, toDetailDTO } from "../shops/handler-support";
import { editShop } from "../shops/service";

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
    return json(200, toDetailDTO(await editShop(shopId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
