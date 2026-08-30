// GET /fleet/v1/drivers — the driver register (056 US1, FR-001…FR-005).
// Read = any active back-office staff, INCLUDING csa (FR-022).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DriverEmploymentStatus } from "@effy/shared-types";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { listDrivers } from "../drivers/service";

const STATUSES: DriverEmploymentStatus[] = ["active", "suspended", "offboarded"];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await guard(event, scope, "read");
  if (denied(g)) return g.deny;

  const qs = event.queryStringParameters ?? {};
  // API Gateway collapses a repeated key into a comma-joined value; both forms are accepted.
  const requested = (qs.status ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const statuses = requested.filter((s): s is DriverEmploymentStatus =>
    (STATUSES as string[]).includes(s),
  );
  const limitRaw = Number(qs.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    return json(
      200,
      await listDrivers({
        q: qs.q?.trim() || undefined,
        statuses: statuses.length > 0 ? statuses : undefined,
        zoneId: qs.zoneId?.trim() || undefined,
        includeOffboarded: qs.includeOffboarded === "true",
        cursor: qs.cursor?.trim() || undefined,
        limit,
      }),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
