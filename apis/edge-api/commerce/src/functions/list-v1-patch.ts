// PATCH /commerce/v1/lists/{listId} — rename a named list. The default list cannot be renamed.
import { json } from "@effy/edge-shared";

import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, savedError } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  if (!body || (body.name !== undefined && typeof body.name !== "string")) return badBody(scope, "invalid_body");
  try {
    return json(200, await savedService.renameList(customer.id, pathParam(event, "listId"), (body.name as string | undefined) ?? ""), scope);
  } catch (err) {
    return savedError(scope, err, "rename list");
  }
});
