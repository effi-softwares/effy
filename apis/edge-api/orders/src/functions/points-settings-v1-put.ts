import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { forbidden, hasStaffRole, json, unavailable, validationFailed } from "@effy/edge-shared";
import type { PointsSettingsPatch } from "@effy/edge-shared/points";

import { objectBody, pointsProblem } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireStaff } from "../lib/guard";

const FIELDS = ["centsPerPoint", "expiryMonths", "csaCreditLimitPoints", "warningDays", "holdMinutes"] as const;

/**
 * PUT /orders/v1/points/settings — change the points rules (074 US6, FR-025).
 * ⚠ ADMIN ONLY, from the staff record: these change what every customer's points are worth and how
 * long they last. Every changed field is audited.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    if (!(await hasStaffRole(guard.sub, ["admin"]))) return forbidden(guard.scope);
  } catch (err) {
    // ⚠ Fail-CLOSED, as the guard does: a role that cannot be checked is a refusal.
    guard.scope.log.error({ err }, "points settings: role lookup failed");
    return unavailable(guard.scope);
  }

  const body = objectBody(event.body);
  if (!body) return validationFailed(guard.scope, "a settings object is required");
  const patch: PointsSettingsPatch = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    if (typeof body[f] !== "number" || !Number.isInteger(body[f])) return validationFailed(guard.scope, `${f} must be a whole number`);
    patch[f] = body[f] as number;
  }
  try {
    return json(200, await customerService.updateSettings(guard.sub, patch), guard.scope);
  } catch (err) {
    return pointsProblem(guard.scope, err, "settings update");
  }
};
