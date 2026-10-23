/**
 * The wrapper every shopper-facing function exports through. Shopper services connect as a
 * connection-limited role; this turns the database's refusal into a retryable 503, and anything else a
 * handler failed to catch into a logged, opaque 500. Not a middleware framework: the handler still owns
 * parsing, authorization and error mapping. `functions.guard.test.ts` requires it.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { ConnectionLimitError } from "./db";
import { internal, preamble, unavailable, type RequestScope } from "./http";
import { emitMetric, metricNamespace } from "./metrics";

/** How long a refused shopper should wait before trying again. */
export const OVERLOAD_RETRY_AFTER_SECONDS = 2;

export function overloaded(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  emitMetric(metricNamespace(), "ShopperConnectionsRefused");
  scope.log.warn("shopper connection limit reached");
  return unavailable(scope, OVERLOAD_RETRY_AFTER_SECONDS);
}

export function shopperHandler<E extends APIGatewayProxyEventV2>(
  fn: (event: E, context: Context) => Promise<APIGatewayProxyStructuredResultV2>,
): (event: E, context: Context) => Promise<APIGatewayProxyStructuredResultV2> {
  return async (event, context) => {
    try {
      return await fn(event, context);
    } catch (err) {
      const scope = preamble(event, context);
      if (err instanceof ConnectionLimitError) return overloaded(scope);
      scope.log.error({ err }, "unhandled error in shopper handler");
      return internal(scope);
    }
  };
}
