// The wire side of refunds, shared by the three services that expose them (`commerce`, `orders`,
// `shop`) so one refusal reads the same wherever it is issued.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { ConnectionLimitError } from "../../lib/db";
import { internal, notFound, validationFailed, type RequestScope } from "../../lib/http";
import { formatCents } from "../../lib/money";
import {
  AmountInvalidError, AmountRejectedError, CeilingExceededError, InvalidReasonError, LineOverRefundedError,
  NoLinesError, NoteRequiredError, RefundOrderNotFoundError,
} from "./errors";
import type { LineInput } from "./repository";

/**
 * `[{ orderItemId, quantity }]` from a request body. Absent is an empty list; anything that is not
 * a list of that shape is null — a malformed request, not a selection to be guessed at.
 */
export function parseRefundLines(v: unknown): LineInput[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: LineInput[] = [];
  for (const raw of v) {
    if (typeof raw !== "object" || raw === null) return null;
    const { orderItemId, quantity } = raw as Record<string, unknown>;
    if (typeof orderItemId !== "string" || typeof quantity !== "number" || !Number.isInteger(quantity)) return null;
    out.push({ orderItemId, quantity });
  }
  return out;
}

/** An optional string field: absent is "", present-but-not-a-string is null. */
export function optionalText(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : null;
}

/** Map a refund refusal to its response. Anything unrecognised is logged and answered 500. */
export function refundProblem(scope: RequestScope, err: unknown, what: string): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ConnectionLimitError) throw err;
  // ⚠ The refusal STATES what remains — "too much" alone leaves an operator guessing.
  if (err instanceof CeilingExceededError) return validationFailed(scope, `only ${formatCents(err.remainingCents)} remains refundable`);
  if (err instanceof RefundOrderNotFoundError) return notFound(scope);
  if (err instanceof AmountRejectedError) return validationFailed(scope, "an item-derived refund computes its own amount; remove it");
  if (err instanceof NoteRequiredError) return validationFailed(scope, "a goodwill refund must say what it is for");
  if (err instanceof InvalidReasonError || err instanceof NoLinesError || err instanceof AmountInvalidError) {
    return validationFailed(scope, "that refund is not valid");
  }
  if (err instanceof LineOverRefundedError) return validationFailed(scope, "those units have already been refunded");
  scope.log.error({ err }, `refunds: ${what} failed`);
  return internal(scope);
}
