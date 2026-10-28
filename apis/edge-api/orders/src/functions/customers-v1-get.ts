import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, listProblem, parseListQuery } from "@effy/edge-shared";

import { CUSTOMER_LIST_SPEC } from "../customers/list";
import { pointsProblem } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireStaff } from "../lib/guard";

/** Back-office › Customers, a console list (103). Any active staff. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, await customerService.list(parseListQuery(event.queryStringParameters, CUSTOMER_LIST_SPEC)), guard.scope);
  } catch (err) {
    return listProblem(err, guard.scope) ?? pointsProblem(guard.scope, err, "customer list");
  }
};
