// GET /v2/platform/status — the version-coexistence demonstration (spec US4/SC-010):
// served side by side with v1 by the SAME service/repository, with a deliberately
// reshaped payload (the platform's canonical breaking-shape example). Versioning
// lives only at this edge (research A3; docs/api/versioning-policy.md rule 5).
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { internal, json, preamble } from "@effy/edge-shared";
import { statusRepository } from "../status/repository";
import { createPlatformStatusService } from "../status/service";

const service = createPlatformStatusService(statusRepository, process.env.EFFY_ENV ?? "dev");

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  try {
    const status = await service.getStatus();
    // v2 DTO — migration fields nest under database; the contract version is explicit.
    return json(200, {
      contract_version: 2,
      environment: status.environment,
      database: {
        name: status.databaseName,
        time: status.databaseTime.toISOString(),
        migration: {
          version: status.migrationVersion,
          applied: status.migrationsApplied,
        },
      },
    }, scope);
  } catch (err) {
    scope.log.error({ err }, "platformstatus: read failed");
    return internal(scope);
  }
};
