import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, validationFailed } from "@effy/edge-shared";
import { optionalText, parseRefundLines, refundProblem } from "@effy/edge-shared/payments";

import { requireWriter } from "../lib/guard";
import { refundService } from "../lib/money";

/**
 * POST /orders/v1/orders/{orderId}/refunds — back-office issues a refund (055 US1).
 *
 * ⚠ WRITE GATE: an ACTIVE staff record holding admin|manager, read from `admin.staff` — never from
 * the token's claim. "Could not check" is 503; "checked, and no" is 403.
 *
 * ⚠ THE REFUND IS RECORDED FIRST, under the ceiling lock, and only then sent to the provider. The
 * response never says "refunded": the provider has it, and the bank may still refuse.
 *
 * ⚠ `amount` is read ONLY so an item-derived request that sends one can be REFUSED rather than
 * silently ignored.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(event.body ?? "");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return validationFailed(guard.scope, "a valid refund request is required");
  }
  const [kind, reason, note, amount] = [body.kind, body.reason, body.note, body.amount].map(optionalText);
  const lines = parseRefundLines(body.lines);
  if (kind == null || reason == null || note == null || amount == null || lines === null) {
    return validationFailed(guard.scope, "a valid refund request is required");
  }

  try {
    return json(200, await refundService.issue({
      orderId: event.pathParameters?.orderId ?? "", kind, reason, note, amount, lines,
      actorSub: guard.sub,
      // ⚠ Said explicitly at every call site: which organisation is spending the money.
      actorKind: "back_office",
    }), guard.scope);
  } catch (err) {
    return refundProblem(guard.scope, err, "back-office issue");
  }
};
