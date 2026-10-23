import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, notFound, unavailable } from "@effy/edge-shared";
import { RequestNotFoundError } from "@effy/edge-shared/payments";

import { requireWriter } from "../lib/guard";
import { refundService } from "../lib/money";

/** Same gate as issuing a refund. 404 covers "no such request" and "already decided". Not emailed. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  let note = "";
  try {
    const parsed = JSON.parse(event.body ?? "{}") as { note?: unknown } | null;
    if (typeof parsed?.note === "string") note = parsed.note;
  } catch {
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
