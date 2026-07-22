// PATCH /admin/v1/delivery-offerings/{id} — change price / window / cutoff / status (US4/FR-015,
// FR-016). Mutate access. Changes affect only new quotes. Audits delivery_offering.update.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toOfferingDTO } from "../delivery/handler-support";
import { updateOffering } from "../delivery/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  const offeringId = event.pathParameters?.id ?? "";
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    return json(200, toOfferingDTO(await updateOffering(offeringId, parsed.value, g.sub)), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
