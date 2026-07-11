// POST /admin/v1/shops/{shopId}/status — lifecycle transition (US3/FR-005). Mutate access.
// Touches public.shop.status only — no Cognito (R5/Q1). Suspend/disable refuses operators via the
// 007 gate on their next attempt.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapShopError, toDetailDTO } from "../shops/handler-support";
import { changeShopStatus } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.shopId ?? "";
  const parsed = parseJsonBody<{ status?: unknown }>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toDetailDTO(await changeShopStatus(shopId, parsed.value.status, g.sub)), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
