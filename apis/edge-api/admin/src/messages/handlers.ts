// The messages routes' shared edge (112): who is asking, and a refusal as a problem response. Each route file is one
// line over these and the service.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent, RequestScope } from "@effy/edge-shared";
import { forbidden, json, listProblem, preamble, problem, ProblemType, subject, unavailable } from "@effy/edge-shared";

import { canManageMessages, isActiveStaff } from "./authz";
import { isMessageError } from "./errors";
import type { Actor } from "./service";

/** 401 without a token, 403 for anyone who isn't active staff, 503 on infra error. */
export async function guard(event: AuthedEvent, scope: RequestScope): Promise<Actor | { deny: APIGatewayProxyStructuredResultV2 }> {
  const sub = subject(event);
  if (!sub) {
    return {
      deny: problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid access token for this audience is required", scope),
    };
  }
  try {
    if (!(await isActiveStaff(sub))) return { deny: forbidden(scope) };
    return { sub, manage: await canManageMessages(sub) };
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "messages authz check failed");
    return { deny: unavailable(scope) };
  }
}

/** The refusal's code becomes the problem type; its extra facts (a count, a limit) ride beside it. Unknown errors: 503. */
export function mapMessageError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  const list = listProblem(err, scope);
  if (list) return list;
  if (isMessageError(err)) {
    const title = err.status === 409 ? "Conflict" : err.status === 404 ? "Not found" : err.status === 403 ? "Insufficient permissions" : "Validation failed";
    // A count or a limit rides as a field entry (what the API client keeps), as well as beside the problem.
    const facts = Object.entries(err.extra).map(([field, value]) => ({ field, message: String(value) }));
    const res = problem(err.status, `https://effyshopping.com/problems/${err.code.replace(/_/g, "-")}`, title, err.message, scope, facts);
    return { ...res, body: JSON.stringify({ ...JSON.parse(String(res.body)), code: err.code, ...err.extra }) };
  }
  scope.log.error({ err: err instanceof Error ? err.message : String(err) }, "messages op failed");
  return unavailable(scope);
}

type Run = (event: AuthedEvent, actor: Actor) => Promise<unknown>;

/** A route: guard, run, answer `status` with the result, or the mapped refusal. */
export function route(run: Run, status = 200) {
  return async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
    const scope = preamble(event, context);
    const g = await guard(event, scope);
    if ("deny" in g) return g.deny;
    try {
      return json(status, await run(event, g), scope);
    } catch (err) {
      return mapMessageError(err, scope);
    }
  };
}

/** The request body as JSON; a body that isn't JSON is refused as invalid. */
export function bodyOf(event: AuthedEvent): unknown {
  try {
    return JSON.parse(event.body ?? "{}");
  } catch {
    return null;
  }
}
