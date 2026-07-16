// POST /admin/v1/catalog/attributes/{id}/status — retire/activate; retiring an in-use attribute → 409 (FR-006). Mutate access.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapCatalogError, toAttributeDTO } from "../catalog/handler-support";
import { changeAttributeStatus } from "../catalog/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;
  const parsed = parseJsonBody<{ status?: unknown }>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed", "a JSON body is required", scope, parsed.errors);
  }
  try {
    return json(200, toAttributeDTO(await changeAttributeStatus(event.pathParameters?.id ?? "", parsed.value.status, g.sub)), scope);
  } catch (err) {
    return mapCatalogError(err, scope);
  }
};
