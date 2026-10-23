import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, notFound, refused } from "@effy/edge-shared";
import { NotCancellableError, RefundOrderNotFoundError, refundProblem } from "@effy/edge-shared/payments";

import { requireWriter } from "../lib/guard";
import { refundService } from "../lib/money";

/** Admin/manager. No "BEFORE PICKING" limit for staff, but never after collection. Already cancelled is 200. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  try {
    return json(200, await refundService.cancel({
      orderId: event.pathParameters?.orderId ?? "", customerId: null, actorKind: "back_office", actorSub: guard.sub,
    }), guard.scope);
  } catch (err) {
    if (err instanceof RefundOrderNotFoundError) return notFound(guard.scope);
    if (err instanceof NotCancellableError) {
      return refused(guard.scope, 400, "not_cancellable", "someone has already started preparing this order. Contact us and we'll see what we can do.");
    }
    return refundProblem(guard.scope, err, "back-office cancel");
  }
};
