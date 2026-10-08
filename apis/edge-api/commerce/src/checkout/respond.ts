// The checkout error mapping.
import {
  ConnectionLimitError, formatCents, internal, notFound, ProblemType, refused, validationFailed, type RequestScope,
} from "@effy/edge-shared";
import { InsufficientPointsError } from "@effy/edge-shared/points";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { DeliveryChoiceError } from "./delivery-choice";
import {
  AddressNotFoundError, BelowMinimumError, EmptyCartError, NotServiceableError, OrderNotFoundError, PaymentInProgressError,
  PaymentMethodNotFoundError, PointsCardRemainderTooSmallError, PointsExceedTotalError,
} from "./service";

const CHOICE_DETAIL = {
  slot_required: "choose a delivery time",
  slot_unavailable: "that delivery time is no longer available — choose another",
  date_unavailable: "that delivery day is no longer available — choose another",
} as const;

/**
 * 409 for a slot or a day that is no longer on offer. It carries the machine `code` the client
 * switches on and, when it could be computed, a FRESH quote — so the shopper is shown what they
 * can choose now instead of being sent to ask again.
 */
export function deliveryChoiceRefused(scope: RequestScope, err: DeliveryChoiceError, quote: unknown | null): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 409,
    headers: { "content-type": "application/problem+json", "x-request-id": scope.requestId },
    body: JSON.stringify({
      type: ProblemType.Conflict, title: "Conflict", status: 409, detail: CHOICE_DETAIL[err.code],
      instance: scope.instance, request_id: scope.requestId, code: err.code,
      ...(quote ? { quote } : {}),
    }),
  };
}

export function checkoutError(scope: RequestScope, err: unknown, what: string): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ConnectionLimitError) throw err;

  if (err instanceof EmptyCartError) return validationFailed(scope, "your cart has no items available to purchase");
  if (err instanceof AddressNotFoundError) return validationFailed(scope, "choose a valid delivery address");
  // 047 FR-002: the single "we don't deliver there yet" outcome.
  if (err instanceof NotServiceableError) return validationFailed(scope, "we don't deliver to this address yet");
  if (err instanceof BelowMinimumError) {
    // Carries how much more is needed — never a shop.
    return validationFailed(scope, `add ${formatCents(err.remainingCents)} more to reach the ${formatCents(err.minimumCents)} minimum order`);
  }
  if (err instanceof OrderNotFoundError || err instanceof PaymentMethodNotFoundError) return notFound(scope);

  // 074 — each points refusal says what IS possible, so the client can offer it.
  if (err instanceof InsufficientPointsError) {
    return refused(scope, 409, "points_balance_changed", "your points balance has changed", { code: "points_balance_changed", usable: err.usable });
  }
  if (err instanceof PointsExceedTotalError) {
    return refused(scope, 422, "points_exceed_total", "that's more points than the order total", { code: "points_exceed_total", maxPoints: err.maxPoints });
  }
  if (err instanceof PointsCardRemainderTooSmallError) {
    return refused(scope, 422, "points_card_remainder_too_small", "use fewer points so the card amount can be charged", {
      code: "points_card_remainder_too_small", maxPoints: err.maxPoints,
    });
  }
  if (err instanceof PaymentInProgressError) {
    return refused(scope, 409, "payment_in_progress", "a payment for this order is already in progress", { code: "payment_in_progress" });
  }

  scope.log.error({ err }, `checkout: ${what} failed`);
  return internal(scope);
}
