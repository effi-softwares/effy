// Turning a points refusal into a problem the back-office can tell apart (074, contracts/routes.md).
// ⚠ `refused` puts the CODE in the problem's type URI; the console maps it to a sentence.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { ConnectionLimitError, internal, notFound, refused, type RequestScope } from "@effy/edge-shared";
import {
  InsufficientPointsError, OverAgentLimitError, PointsInvalidError, PointsNoteRequiredError, PointsOrderNotFoundError,
  PointsReasonInvalidError, PointsSettingInvalidError,
} from "@effy/edge-shared/points";

import { CustomerNotFoundError } from "./service";

export function pointsProblem(scope: RequestScope, err: unknown, what: string): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ConnectionLimitError) throw err;
  if (err instanceof CustomerNotFoundError) return notFound(scope);
  if (err instanceof PointsOrderNotFoundError) return refused(scope, 404, "order_not_found", "that order is not this customer's");
  if (err instanceof PointsInvalidError) return refused(scope, 400, "points_invalid", "points must be a whole number from 1 to 1,000,000");
  if (err instanceof PointsReasonInvalidError) return refused(scope, 400, "reason_invalid", "that reason is not one of the listed reasons");
  if (err instanceof PointsNoteRequiredError) return refused(scope, 400, "note_required", "a note is required when the reason is Other");
  if (err instanceof OverAgentLimitError) {
    return refused(scope, 403, "over_agent_limit", `the most you can credit at once is ${err.limit} points`, { limit: err.limit });
  }
  if (err instanceof InsufficientPointsError) {
    return refused(scope, 409, "insufficient_points", `only ${err.usable} points are usable`, { usable: err.usable });
  }
  if (err instanceof PointsSettingInvalidError) return refused(scope, 400, "setting_invalid", `${err.field} is out of range`, { field: err.field });
  scope.log.error({ err }, `points: ${what} failed`);
  return internal(scope);
}

/** A JSON object body, or null. */
export function objectBody(raw: string | undefined): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A whole number, or null when the field is absent or not one. */
export const intField = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
/** A string, "" when absent, null when present and not a string. */
export const textField = (v: unknown): string | null => (v === undefined || v === null ? "" : typeof v === "string" ? v : null);
