import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";

import { dismissProposal, fulfillmentForProposal } from "../orders/refunds";
import { requireWriter } from "../lib/guard";
import { NOT_FOUND, VALIDATION_FAILED } from "../lib/problems";

/**
 * POST /orders/v1/orders/{orderId}/proposals/{orderItemId}/dismiss — a human says this refund is not
 * owed (055 FR-004b).
 *
 * ⚠ NO MONEY MOVES, which is why it is here and not in `core-api`. Issuing needs the payment secret;
 * dismissing needs only a record of the judgement.
 *
 * ⚠ WRITE GATE: admin|manager, the SAME gate as issuing (FR-019). Dismissing looks like the harmless
 * half of the pair and is not: deciding a customer is NOT owed money they paid for is exactly as
 * consequential as deciding they are, and it is the decision nobody will ever come back to check.
 *
 * ⚠ A REASON IS REQUIRED and the schema enforces it too. A dismissal with no reason is a shortfall
 * that silently stops being owed with nobody accountable.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  const orderId = event.pathParameters?.orderId;
  const orderItemId = event.pathParameters?.orderItemId;
  if (!orderId || !orderItemId) {
    return problem(400, VALIDATION_FAILED, "Missing proposal", "an order and a line are required", guard.scope);
  }

  let body: { reason?: string };
  try {
    body = JSON.parse(event.body ?? "{}") as { reason?: string };
  } catch {
    return problem(400, VALIDATION_FAILED, "Malformed body", "the request body is not valid JSON", guard.scope);
  }
  const reason = (body.reason ?? "").trim();
  if (!reason) {
    return problem(
      400,
      VALIDATION_FAILED,
      "Missing reason",
      "say why this refund is not owed — a dismissal with no reason cannot be reviewed later",
      guard.scope,
    );
  }

  try {
    // ⚠ Resolved from the ORDER, never taken from the caller. A package id in the request body would
    // let one order's dismissal be written against another order's package.
    const fulfillmentId = await fulfillmentForProposal(orderId, orderItemId);
    if (!fulfillmentId) {
      return problem(404, NOT_FOUND, "No such proposal", "there is no outstanding shortfall on that line", guard.scope);
    }

    // ⚠ A replay is 200, not 409. The first dismissal stands — it is the one that was actually made,
    // and its reason and author are the honest record.
    const result = await dismissProposal({
      shopFulfillmentId: fulfillmentId,
      orderItemId,
      dismissedBy: guard.sub,
      reason,
    });
    return json(result.created ? 201 : 200, { dismissed: true }, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, orderId, orderItemId }, "orders: dismiss proposal failed");
    return unavailable(guard.scope);
  }
};
