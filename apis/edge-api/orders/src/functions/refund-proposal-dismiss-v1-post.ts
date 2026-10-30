import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceMoves } from "@effy/edge-shared/live";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";

import { dismissProposal, fulfillmentForProposal } from "../orders/refunds";
import { requireWriter } from "../lib/guard";
import { NOT_FOUND, VALIDATION_FAILED } from "../lib/problems";

/** Moves no money but needs the same admin/manager gate as issuing, and a reason. */
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
      "say why this refund is not owed - a dismissal with no reason cannot be reviewed later",
      guard.scope,
    );
  }

  try {
    // Resolved from the order, never taken from the caller.
    const fulfillmentId = await fulfillmentForProposal(orderId, orderItemId);
    if (!fulfillmentId) {
      return problem(404, NOT_FOUND, "No such proposal", "there is no outstanding shortfall on that line", guard.scope);
    }

    // A replay is 200; the first dismissal stands.
    const result = await dismissProposal({
      shopFulfillmentId: fulfillmentId,
      orderItemId,
      dismissedBy: guard.sub,
      reason,
    });
    if (result.created) await announceMoves([{ fulfillmentId, from: null }]);
    return json(result.created ? 201 : 200, { dismissed: true }, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, orderId, orderItemId }, "orders: dismiss proposal failed");
    return unavailable(guard.scope);
  }
};
