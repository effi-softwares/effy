// The shared handler preamble + response/problem builders. There is deliberately NO
// middleware framework (ARCHITECTURE.md): every handler calls preamble() first and
// owns its own parsing, claims checks, and error mapping. The problem vocabulary
// mirrors docs/api/error-envelope.md — the cross-backend contract.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { logger } from "./logger";

// Problem type URIs — keep in lockstep with core-api's httpx package and
// docs/api/error-envelope.md.
export const ProblemType = {
  ValidationFailed: "https://effyshopping.com/problems/validation-failed",
  Unauthenticated: "https://effyshopping.com/problems/unauthenticated",
  Forbidden: "https://effyshopping.com/problems/forbidden",
  NoRoute: "https://effyshopping.com/problems/no-route",
  MethodNotAllowed: "https://effyshopping.com/problems/method-not-allowed",
  VersionRetired: "https://effyshopping.com/problems/version-retired",
  RateLimited: "https://effyshopping.com/problems/rate-limited",
  Conflict: "https://effyshopping.com/problems/conflict",
  Internal: "https://effyshopping.com/problems/internal",
  Unavailable: "https://effyshopping.com/problems/unavailable",
} as const;

export interface FieldError {
  field: string;
  message: string;
}

export interface RequestScope {
  log: ReturnType<typeof logger.child>;
  requestId: string;
  /** The request path, used as the problem `instance`. */
  instance: string;
}

// preamble MUST be the first line of every handler. It pins the two per-invocation
// disciplines the platform cannot survive without:
//  1. callbackWaitsForEmptyEventLoop = false — the cached pg connection's socket
//     timers would otherwise hang every invocation to timeout (research C4);
//  2. the per-request child logger carrying awsRequestId + the gateway request id.
export function preamble(event: APIGatewayProxyEventV2, context: Context): RequestScope {
  context.callbackWaitsForEmptyEventLoop = false;

  const requestId = event.requestContext.requestId;
  return {
    log: logger.child({ awsRequestId: context.awsRequestId, requestId }),
    requestId,
    instance: event.rawPath,
  };
}

// json builds a success response; the gateway request id is echoed as x-request-id so
// client logs, gateway access logs, and function logs join on one value.
export function json(
  status: number,
  body: unknown,
  scope: RequestScope,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "x-request-id": scope.requestId,
    },
    body: JSON.stringify(body),
  };
}

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  request_id: string;
  errors?: FieldError[];
}

export function problem(
  status: number,
  type: string,
  title: string,
  detail: string,
  scope: RequestScope,
  errors?: FieldError[],
): APIGatewayProxyStructuredResultV2 {
  const body: ProblemBody = {
    type,
    title,
    status,
    detail,
    instance: scope.instance,
    request_id: scope.requestId,
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
  return {
    statusCode: status,
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": scope.requestId,
    },
    body: JSON.stringify(body),
  };
}

export function forbidden(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(403, ProblemType.Forbidden, "Insufficient permissions",
    "the authenticated identity may not perform this action", scope);
}

// internal never explains itself to the caller — the cause lives only in the log
// record sharing this request id (error-envelope conformance 3).
export function internal(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(500, ProblemType.Internal, "Internal error",
    "an unexpected error occurred; reference request_id when reporting", scope);
}

export function unavailable(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(503, ProblemType.Unavailable, "Service unavailable",
    "a required dependency is currently unreachable", scope);
}
