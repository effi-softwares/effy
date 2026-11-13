// The caller's own back-office record (119, research R1): READ ONLY. A sign-in never creates a record or changes a
// role - the record is the origin and the authority, the token's groups are not read. No record → 403 not_on_team;
// a disabled or removed person → 403 staff_disabled. The console signs the browser out on either (R8).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, refused, subject, unavailable } from "@effy/edge-shared";
import { TEAM_REFUSAL_WORDS, type StaffRecordDTO } from "@effy/shared-types";

import { loadAndTouch } from "../staff/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);

  const sub = subject(event);
  if (!sub) {
    return problem(401, ProblemType.Unauthenticated, "Authentication required",
      "a valid access token for this audience is required", scope);
  }

  try {
    const outcome = await loadAndTouch(sub);
    if (!outcome.ok) {
      scope.log.warn({ sub, refusal: outcome.refusal }, "me: no active team record for this account");
      return refused(scope, 403, outcome.refusal, TEAM_REFUSAL_WORDS.accessEnded);
    }
    const m = outcome.member;
    const body: StaffRecordDTO = {
      subject: m.subject,
      name: m.name,
      email: m.email,
      roles: m.role ? [m.role] : [],
      status: m.status,
      lastSeenAt: m.lastSeenAt ?? new Date().toISOString(),
    };
    return json(200, body, scope);
  } catch (err) {
    scope.log.error({ err: err instanceof Error ? err.message : String(err), sub }, "me: staff record read failed");
    return unavailable(scope);
  }
};
