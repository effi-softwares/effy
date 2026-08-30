// GET /fleet/v1/exceptions — undeliverable drops and missing/short package reports (056 US3).
// Read = any active back-office staff, csa MOST OF ALL — a CSA is exactly who is asked "why did my
// delivery fail", and until this route existed nobody at Effy could answer it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble } from "@effy/edge-shared";
import type { DriverExceptionKind } from "@effy/shared-types";

import { denied, guard, mapFleetError } from "../shared/handler-support";
import { listExceptions } from "../exceptions/service";

const KINDS: DriverExceptionKind[] = ["delivery_failure", "collection_issue"];
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
  const kind = KINDS.find((k) => k === qs.kind);
  // Default: OUTSTANDING only. A queue that opens showing everything ever resolved is not a queue.
  // `resolved=all` opts into both; `resolved=true` into resolved only.
  const resolved = qs.resolved === "all" ? undefined : qs.resolved === "true";
  const limitRaw = Number(qs.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    return json(
      200,
      await listExceptions({
        kind,
        resolved,
        driverId: qs.driverId?.trim() || undefined,
        from: qs.from?.trim() || undefined,
        to: qs.to?.trim() || undefined,
        cursor: qs.cursor?.trim() || undefined,
        limit,
      }),
      scope,
    );
  } catch (err) {
    return mapFleetError(err, scope);
  }
};
