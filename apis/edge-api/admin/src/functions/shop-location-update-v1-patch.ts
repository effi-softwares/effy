// PATCH /admin/v1/shops/{id}/location — set (or clear) a shop's origin postcode (US4/FR-013).
// Mutate access. Clearing it makes the shop's packages undeliverable (FR-017), a safe explicit state.
// Never exposed to customers (FR-019). Audits shop.location_set.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toShopLocationDTO } from "../delivery/handler-support";
import { setShopLocation } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const shopId = event.pathParameters?.id ?? "";
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toShopLocationDTO(await setShopLocation(shopId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
