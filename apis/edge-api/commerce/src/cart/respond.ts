import {
  ConnectionLimitError, internal, json, notFound, problem, refused, validationFailed, type RequestScope,
} from "@effy/edge-shared";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { PromotionCodeRefusedError } from "../promotions/pricing";
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
  // Rethrown: the wrapper answers it as a retryable 503.
  if (err instanceof ConnectionLimitError) throw err;

  if (err instanceof ProductNotFoundError) return notFound(scope);
  if (err instanceof OrderNotFoundError) return notFound(scope);
  if (err instanceof ProductUnavailableError) return validationFailed(scope, "that product is currently unavailable");
  if (err instanceof InsufficientStockError) {
    // A distinct problem type carrying the available count, so the client can offer "only 2".
    return problem(400, "https://effyshopping.com/problems/insufficient-stock", "Request validation failed",
      `only ${err.available} available`, scope, [{ field: "availableQuantity", message: String(err.available) }]);
  }
  if (err instanceof CartFullError) return validationFailed(scope, "your cart is full — remove an item to add another");
  if (err instanceof PromotionCodeRefusedError) return refused(scope, 400, err.reason, err.detail);

  scope.log.error({ err }, "cart: operation failed");
  return internal(scope);
}
