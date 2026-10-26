// The category tree, retired categories included, with counts and resolved defaults (101). Read = any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { denied, guard, mapTaxonomyError } from "../taxonomy/handler-support";
import * as svc from "../taxonomy/service";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    return json(200, await svc.tree(), scope);
  } catch (err) {
    return mapTaxonomyError(err, scope);
  }
};
