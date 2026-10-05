// The cart's one error mapping. Every cart route answers through this, so a refusal reads the same
// whichever operation raised it.
import {
  ConnectionLimitError, internal, json, notFound, problem, refused, validationFailed, type RequestScope,
} from "@effy/edge-shared";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { PromoRefusedError, refusalDetail } from "../promo/promo";
import {
  CartFullError, InsufficientStockError, OrderNotFoundError, ProductNotFoundError, ProductUnavailableError,
} from "./service";

export async function respond(
  scope: RequestScope,
  work: () => Promise<unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    return json(200, await work(), scope);
  } catch (err) {
    return cartError(scope, err);
  }
}

export function cartError(scope: RequestScope, err: unknown): APIGatewayProxyStructuredResultV2 {
  // Not ours to answer: the wrapper turns it into the retryable 503.
  if (err instanceof ConnectionLimitError) throw err;

  if (err instanceof ProductNotFoundError) return notFound(scope);
  // Never 403: whether an order exists is not disclosed to someone who does not own it.
  if (err instanceof OrderNotFoundError) return notFound(scope);
  if (err instanceof ProductUnavailableError) return validationFailed(scope, "that product is currently unavailable");
  if (err instanceof InsufficientStockError) {
    // ⚠ A DISTINGUISHABLE refusal carrying the NUMBER (054 FR-016, FR-015b). The client keys off
    // the problem `type` and writes its OWN copy; the count travels as a field error it can put in
    // that copy. "Unavailable" leaves a shopper with nothing to do; "only 2" lets them take the two.
    return problem(400, "https://effyshopping.com/problems/insufficient-stock", "Request validation failed",
      `only ${err.available} available`, scope, [{ field: "availableQuantity", message: String(err.available) }]);
  }
  if (err instanceof CartFullError) return validationFailed(scope, "your cart is full — remove an item to add another");
  // Each promo refusal is its own problem type, so the client can say WHICH (027 FR-043).
  if (err instanceof PromoRefusedError) return refused(scope, 400, err.reason, refusalDetail(err.reason, err.code));

  scope.log.error({ err }, "cart: operation failed");
  return internal(scope);
}
