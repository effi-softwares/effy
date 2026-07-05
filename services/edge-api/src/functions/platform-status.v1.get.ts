// GET /v1/platform/status — public proving read: the complete three-layer traversal
// (handler → service → repository) to the dev database. v1 wire shape: flat
// (contracts/edge-api.contract.md; identical to core-api's v1).
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { internal, json, preamble } from "../lib/http";
import { statusRepository } from "../repository";
import { createPlatformStatusService } from "../service";

// Module-scope wiring (cached singleton pattern — ARCHITECTURE.md): built once per
// container, reused across warm invocations.
const service = createPlatformStatusService(statusRepository, process.env.EFFY_ENV ?? "dev");

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  try {
    const status = await service.getStatus();
    // v1 DTO — the flat contract shape; mapping lives at the edge, never in the service.
    return json(200, {
      environment: status.environment,
      database_name: status.databaseName,
      database_time: status.databaseTime.toISOString(),
      migration_version: status.migrationVersion,
      migrations_applied: status.migrationsApplied,
    }, scope);
  } catch (err) {
    // The cause (e.g. a missing goose ledger before 003's first db-up) reaches ONLY
    // the log; the caller gets the uniform internal problem.
    scope.log.error({ err }, "platformstatus: read failed");
    return internal(scope);
  }
};
