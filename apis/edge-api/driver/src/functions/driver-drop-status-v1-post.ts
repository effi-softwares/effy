import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import { announceStop } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem } from "@effy/edge-shared";
import type { DropStatusRequest } from "@effy/shared-types";
import { authenticate } from "../driver/guard";
import { setDropStatus } from "../work/delivery";
import { NotFoundError } from "../work/service";
import { RoundNotOpenError, roundNotOpenProblem } from "../work/open";

/** POST /driver/v1/delivery/drops/{dropId}/status (063). ⚠ `delivered` needs proof — Slice D. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;
  const dropId = event.pathParameters?.dropId;
  if (!dropId) return problem(400, "invalid_request", "Missing drop id", "A drop id is required.", guard.scope);
  let body: DropStatusRequest;
  try { body = JSON.parse(event.body ?? "{}") as DropStatusRequest; }
  catch { return problem(400, "invalid_request", "Malformed body", "The request body was not valid JSON.", guard.scope); }
  if (!body.changeId) return problem(400, "invalid_request", "Missing changeId", "A changeId is required so a retry is recognised.", guard.scope);
  try {
    const status = await setDropStatus(dropId, guard.driver.id, body);
    await announceStop(dropId); // 073 — the shop sees it too // 071 — committed; dispatch sees the drop's progress
    return json(200, status, guard.scope);
  } catch (err) {
    // 072 — the round has not opened. Nothing was written; the answer says when it will.
    if (err instanceof RoundNotOpenError) return roundNotOpenProblem(err, guard.scope);
    if (err instanceof NotFoundError) return problem(404, "not_found", "Not available", "That drop is not available.", guard.scope);
    throw err;
  }
};
