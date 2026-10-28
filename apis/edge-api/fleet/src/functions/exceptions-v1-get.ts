import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery, preamble } from "@effy/edge-shared";

import { EXCEPTION_LIST_SPEC } from "../exceptions/list";
import { listExceptions } from "../exceptions/service";
import { mapDispatchError } from "../shared/dispatch-handler-support";
import { denied, guard } from "../shared/handler-support";

/** Any active staff, csa included: triage is their work. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await listExceptions(parseListQuery(event.queryStringParameters, EXCEPTION_LIST_SPEC)), scope);
  } catch (err) {
    return listProblem(err, scope) ?? mapDispatchError(err, scope);
  }
};
