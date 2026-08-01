// POST /admin/v1/delivery-declarations/{id}/approve — 032 FR-024/FR-025/FR-026.
// Mutate access: admin/manager. Audited inside the writing transaction.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble } from "@effy/edge-shared";

import { approve } from "../delivery/approvals";
import { guard, mapDeliveryError, toDeclarationReviewDTO } from "../delivery/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if ("deny" in g) return g.deny;

  // A body is optional for approve and required-in-substance for decline/revoke; the SERVICE decides
  // which, so an absent body reaches it as {} and is refused there with a reason the admin can read.
  const parsed = parseJsonBody<Record<string, unknown>>(event.body);

  try {
    const review = await approve(event.pathParameters?.id ?? "", parsed.value ?? {}, g.sub);
    return json(200, toDeclarationReviewDTO(review), scope);
  } catch (err) {
    return mapDeliveryError(err, scope);
  }
};
