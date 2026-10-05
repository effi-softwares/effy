/**
 * The wrapper every function in a SHOPPER-FACING service exports through (070 FR-030).
 *
 * Shopper services connect as a database role with a connection limit. When a burst exhausts it,
 * the database refuses the next connection immediately and this wrapper turns that refusal into a
 * retryable 503 — so shoppers are told to try again in a moment while staff, shop and driver
 * services, which connect as a different role, carry on untouched.
 *
 * It is also the last line for anything a handler failed to catch: the cause is logged under the
 * request id and the caller gets the standard opaque 500.
 *
 * ⚠ This is not a middleware framework (ARCHITECTURE.md). A handler still calls `preamble()` and
 * owns its parsing, authorization and error mapping; this catches only what escapes it.
 * `functions.guard.test.ts` fails the build if a shopper-facing function is exported without it.
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
