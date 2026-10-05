import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, notFound, unavailable } from "@effy/edge-shared";
import { RequestNotFoundError } from "@effy/edge-shared/payments";

import { requireWriter } from "../lib/guard";
import { refundService } from "../lib/money";

/**
 * POST /orders/v1/refund-requests/{requestId}/decline — close a customer's refund request without
 * money moving (055 FR-005r2).
 *
 * ⚠ THE SAME GATE AS ISSUING A REFUND. Declining looks like the harmless half of the pair and is
 * not: telling a customer they are not owed money they believe they are owed is exactly as
 * consequential as paying them, and it is the decision nobody comes back to check.
 *
 * ⚠ 404 covers both "no such request" and "already decided": a second decision must not overwrite
 * the first. ⚠ It is not emailed — the order screen is where the shopper is already looking.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  // The note is optional, and so is the body.
  let note = "";
  try {
    const parsed = JSON.parse(event.body ?? "{}") as { note?: unknown } | null;
    if (typeof parsed?.note === "string") note = parsed.note;
  } catch {
    /* no note */
  }

  try {
    await refundService.declineRequest(event.pathParameters?.requestId ?? "", note, guard.sub);
    return json(200, { status: "declined" }, guard.scope);
  } catch (err) {
    if (err instanceof RequestNotFoundError) return notFound(guard.scope);
    guard.scope.log.error({ err }, "refunds: decline failed");
    return unavailable(guard.scope);
  }
};
