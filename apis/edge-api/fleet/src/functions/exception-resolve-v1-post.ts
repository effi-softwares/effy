// POST /fleet/v1/exceptions/{kind}/{exceptionId}/resolve — close one exception (056 US3, FR-031).
// Write = admin/manager. Resolving asserts that something was done about a customer's failed
// delivery, so it carries the same gate as the other actions whose effect leaves the console.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DriverExceptionKind } from "@effy/shared-types";

import { validationError } from "../shared/errors";
import { denied, guard, mapFleetError, parseBody } from "../shared/handler-support";
import { resolveException } from "../exceptions/service";

const KINDS: DriverExceptionKind[] = ["delivery_failure", "collection_issue"];

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "mutate");
  if (denied(g)) return g.deny;
  try {
    const kind = KINDS.find((k) => k === event.pathParameters?.kind);
    if (!kind) {
      throw validationError("the exception could not be resolved", [
        { field: "kind", message: `must be one of ${KINDS.join(", ")}` },
      ]);
    }
    const body = parseBody<{ note?: string }>(event.body);
    return json(
      200,
      await resolveException(kind, event.pathParameters?.exceptionId ?? "", body.note ?? "", g.sub),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
