// The shared handler preamble + response/problem builders. There is deliberately NO
// middleware framework (ARCHITECTURE.md): every handler calls preamble() first and
// owns its own parsing, claims checks, and error mapping. The problem vocabulary
// mirrors docs/api/error-envelope.md.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { logger } from "./logger";

// Problem type URIs — the vocabulary of docs/api/error-envelope.md. Clients switch on these.
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

/**
 * 503. `retryAfterSeconds` sets `Retry-After` when the caller should simply try again — the
 * shopper connection limit (070) is the case that does.
 */
export function unavailable(
  scope: RequestScope,
  retryAfterSeconds?: number,
): APIGatewayProxyStructuredResultV2 {
  const res = problem(503, ProblemType.Unavailable, "Service unavailable",
    "a required dependency is currently unreachable", scope);
  if (retryAfterSeconds === undefined) return res;
  return { ...res, headers: { ...res.headers, "retry-after": String(retryAfterSeconds) } };
}

/**
 * Deliberately identical for every authentication failure — missing, malformed, expired, tampered,
 * wrong-pool, or no platform record — so a response leaks nothing about which check failed.
 */
export function unauthenticated(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(401, ProblemType.Unauthenticated, "Authentication required",
    "a valid access token for this audience is required", scope);
}

/**
 * 404 for a missing RESOURCE as well as a missing route — one type, on purpose: a shopper asking
 * for another shopper's order must not be able to tell "not yours" from "not there".
 */
export function notFound(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(404, ProblemType.NoRoute, "No such route",
    "the requested path (or API version) does not exist", scope);
}

export function validationFailed(
  scope: RequestScope,
  detail: string,
  errors?: FieldError[],
): APIGatewayProxyStructuredResultV2 {
  return problem(400, ProblemType.ValidationFailed, "Request validation failed", detail, scope, errors);
}

/**
 * A refusal the CLIENT must tell apart from other refusals (a promo code that is expired vs
 * exhausted; a list at its limit). `reason` becomes the problem's own type URI — which is what
 * RFC 9457's `type` is for — with underscores written as hyphens.
 */
export function refused(
  scope: RequestScope,
  status: number,
  reason: string,
  detail: string,
  extra?: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  const res = problem(status, `https://effyshopping.com/problems/${reason.replaceAll("_", "-")}`,
    status === 409 ? "Conflict" : status === 404 ? "Not Found" : "Request validation failed", detail, scope);
  if (!extra) return res;
  return { ...res, body: JSON.stringify({ ...(JSON.parse(res.body ?? "{}") as object), ...extra }) };
}

/** A state clash the client resolves by re-reading (a stale delivery quote). */
export function conflict(scope: RequestScope, detail: string): APIGatewayProxyStructuredResultV2 {
  return problem(409, ProblemType.Conflict, "Conflict", detail, scope);
}

export function noContent(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
}
