// The team routes' shared edge (119): who is asking (an active Administrator, from the record - never the token),
// a refusal as a problem response with the spec's sentence, and the request body. Each route file is a few lines.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import {
  forbidden,
  hasStaffRole,
  json,
  listProblem,
  notFound,
  preamble,
  problem,
  ProblemType,
  refused,
  subject,
  unavailable,
  validationFailed,
} from "@effy/edge-shared";
import { SignInError, TEAM_REFUSAL_STATUS, TeamNotFoundError, TeamRefusalError, TeamValidationError } from "@effy/edge-shared/team";
import { TEAM_REFUSAL_WORDS } from "@effy/shared-types";

/** Who is asking. */
export interface TeamCaller {
  sub: string;
}

/** 401 without a token; 403 for anyone the record does not make an active Administrator (FR-001); 503 on infra error. */
export async function guardAdmin(event: AuthedEvent, scope: RequestScope): Promise<TeamCaller | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return { deny: problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid access token for this audience is required", scope) };
  }
  try {
    if (!(await hasStaffRole(sub, ["admin"]))) {
      scope.log.warn({ sub }, "team: not an active administrator (platform record)");
      return { deny: forbidden(scope) };
    }
    return { sub };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "team: authorization check failed");
    return { deny: unavailable(scope) };
  }
}

/** Any signed-in caller (the route checks the record itself: PATCH /admin/v1/me). */
export function guardSignedIn(event: AuthedEvent, scope: RequestScope): TeamCaller | { deny: APIGatewayProxyStructuredResultV2 } {
  const sub = subject(event);
  if (!sub) {
    return { deny: problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid access token for this audience is required", scope) };
  }
  return { sub };
}

/** Typed refusals → their status with the spec's sentence (contracts/team-api.md); anything else is 503. */
export function mapTeamError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  const list = listProblem(err, scope);
  if (list) return list;
  if (err instanceof TeamRefusalError) {
    scope.log.info({ refusal: err.type }, "team: refused");
    const res = refused(scope, TEAM_REFUSAL_STATUS[err.type], err.type, err.message, err.extra);
    if (!err.extra) return res;
    // The facts also ride as field entries - what the API client keeps (the person to open, for `disabled_on_team`).
    const facts = Object.entries(err.extra).map(([field, value]) => ({ field, message: String(value) }));
    return { ...res, body: JSON.stringify({ ...(JSON.parse(res.body ?? "{}") as object), errors: facts }) };
  }
  if (err instanceof TeamValidationError) return validationFailed(scope, err.message, [{ field: err.field, message: err.message }]);
  if (err instanceof TeamNotFoundError) return notFound(scope);
  if (err instanceof SignInError) {
    scope.log.error({ step: err.step, code: err.code }, "team: the sign-in pool refused");
    return refused(scope, 502, "sign_in_unavailable", TEAM_REFUSAL_WORDS.signInUnavailable);
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "team: operation failed");
  return unavailable(scope);
}

type Run = (event: AuthedEvent, caller: TeamCaller, scope: RequestScope) => Promise<unknown>;

/** A route for an Administrator: guard, run, answer `status` with the result, or the mapped refusal. */
export function adminRoute(run: Run, status = 200) {
  return async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    const scope = preamble(event, context);
    const g = await guardAdmin(event, scope);
    if ("deny" in g) return g.deny;
    try {
      return json(status, await run(event, g, scope), scope);
    } catch (err) {
      return mapTeamError(err, scope);
    }
  };
}

/** The request body as JSON; anything else is an empty object (the service then refuses what is missing). */
export function bodyOf(event: AuthedEvent): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(event.body ?? "{}");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** `expectedRevision` from a body or a query value: a positive integer, or undefined. */
export function revisionOf(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

/** The `{staffId}` path value. */
export function staffIdOf(event: AuthedEvent): string {
  return event.pathParameters?.staffId ?? "";
}
