// Creates the shop and provisions its primary manager, idempotently.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType } from "@effy/edge-shared";
import { parseJsonBody } from "@effy/edge-shared";

import { guard, mapShopError, toDetailDTO } from "../shops/handler-support";
import { createShop } from "../shops/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    const detail = await createShop(parsed.value as never, g.sub);
    return json(201, toDetailDTO(detail), scope);
  } catch (err) {
    return mapShopError(err, scope);
  }
};
