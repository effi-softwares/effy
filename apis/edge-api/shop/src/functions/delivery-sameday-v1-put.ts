// PUT /shop/v1/delivery-sameday — submit this shop's same-day declaration (032 FR-014..FR-016).
// Write access: shop_manager at an active shop.
//
// ⚠ SUBMITTING CHANGES NOTHING FOR ANY SHOPPER (FR-017). This creates a PENDING version; any already
// approved declaration stays in force until an admin decides. That property is what makes US2 safe to
// ship on its own, and it is enforced in the repository's transaction, not by this handler.
//
// ⚠ A `status` in the body is ignored outright — FR-021, a shop cannot approve itself.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { submitDeclaration } from "../delivery/declarations";
import { guard, mapDeclarationError, toDeclarationViewDTO } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "submit");
  if ("deny" in g) return g.deny;

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  try {
    const view = await submitDeclaration(g.shopId, parsed.value, g.sub);
    return json(200, toDeclarationViewDTO(view), scope);
  } catch (err) {
    return mapDeclarationError(err, scope);
  }
};
