// The handler preamble and response/problem builders. No middleware framework: every handler calls
// preamble first. The problem vocabulary is docs/api/error-envelope.md.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { logger } from "./logger";

// Problem type URIs; clients switch on these.
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
  /** The problem `instance`. */
  instance: string;
}

// The first line of every handler: callbackWaitsForEmptyEventLoop = false (the pg socket's timers
// would hang every invocation), and a per-request child logger with both request ids.
export function preamble(event: APIGatewayProxyEventV2, context: Context): RequestScope {
  context.callbackWaitsForEmptyEventLoop = false;

  const requestId = event.requestContext.requestId;
  return {
    log: logger.child({ awsRequestId: context.awsRequestId, requestId }),
    requestId,
    instance: event.rawPath,
  };
}

// Echoes the gateway request id as x-request-id, so client, gateway and function logs join.
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

// Never explains itself to the caller; the cause is only in the log under this request id.
export function internal(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(500, ProblemType.Internal, "Internal error",
    "an unexpected error occurred; reference request_id when reporting", scope);
}

/** `retryAfterSeconds` sets `Retry-After` when the caller should simply retry (the shopper connection limit). */
export function unavailable(
  scope: RequestScope,
  retryAfterSeconds?: number,
): APIGatewayProxyStructuredResultV2 {
  const res = problem(503, ProblemType.Unavailable, "Service unavailable",
    "a required dependency is currently unreachable", scope);
  if (retryAfterSeconds === undefined) return res;
  return { ...res, headers: { ...res.headers, "retry-after": String(retryAfterSeconds) } };
}

/** Identical for every authentication failure, so nothing leaks about which check failed. */
export function unauthenticated(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return problem(401, ProblemType.Unauthenticated, "Authentication required",
    "a valid access token for this audience is required", scope);
}

/** For a missing resource and a missing route alike: "not yours" must look like "not there". */
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

/** A refusal the client tells apart: `reason` becomes the problem's own type URI (underscores as hyphens). */
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

/** A state clash the client resolves by re-reading. */
export function conflict(scope: RequestScope, detail: string): APIGatewayProxyStructuredResultV2 {
  return problem(409, ProblemType.Conflict, "Conflict", detail, scope);
}

export function noContent(scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 204, headers: { "x-request-id": scope.requestId } };
}
