// GET /fleet/v1/vehicles — the register (061 US1, FR-001/FR-009).
// Read = any active back-office staff, including csa.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";

import { listVehicles } from "../vehicles/repository";
import { denied, guard, mapFleetError } from "../shared/handler-support";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;
  try {
    const q = event.queryStringParameters ?? {};
    return json(
      200,
      await listVehicles({
        status: q.status ?? undefined,
        refrigeration: (q.refrigeration as "chilled" | "frozen" | undefined) ?? undefined,
        nonCompliantOnly: q.nonCompliant === "true",
        cursor: q.cursor ?? undefined,
      }),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
