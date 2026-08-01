// PUT /admin/v1/delivery-pricing/{method} — replace one method's rule AND its whole band set (032).
// Mutate access: admin/manager. Audited inside the writing transaction (FR-013/SC-014).
//
// ⚠ PUT, and whole-set replacement, deliberately. Bands are only meaningful as an ordered set:
// inserting one in the middle changes what its neighbours mean, and a per-band POST would let a quote
// in flight observe a half-edited table — pricing a real order against three distance bands where the
// operator intended four.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { guard, mapDeliveryError, toPricingRuleDTO } from "../delivery/handler-support";
import { replaceRule } from "../delivery/pricing";

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
    const rule = await replaceRule(event.pathParameters?.method ?? "", parsed.value, g.sub);
    return json(200, toPricingRuleDTO(rule), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
