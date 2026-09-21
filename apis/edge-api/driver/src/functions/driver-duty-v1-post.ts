import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { DutyRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { HoldingPackagesError, setDuty } from "../driver/service";

/**
 * POST /driver/v1/duty — go on/off duty (049). Duty status gates assignment (FR-005/006).
 *
 * ⚠ FR-011 (off-duty-mid-run guard) and the release of not-yet-collected work back to the pool are
 * enforced by the assignment worker + a guard on going off duty; this handler owns the session
 * transition. See T060.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await authenticate(event, context);
  if (!guard.ok) return guard.response;

  let body: DutyRequest;
  try {
    body = JSON.parse(event.body ?? "{}") as DutyRequest;
  } catch {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "body must be JSON", guard.scope);
  }
  if (typeof body.onDuty !== "boolean") {
    return problem(400, ProblemType.ValidationFailed, "Invalid request", "onDuty (boolean) is required", guard.scope);
  }

  try {
    const result = await setDuty(
      guard.driver,
      body.onDuty,
      body.expectedEndAt,
      // ⚠ 064 FR-018 — the driver has seen what they are holding and is going off duty anyway. The
      // flag is the CONFIRMATION, not a bypass: without it the call below refuses and names the
      // packages, so a shift can never end silently on a van with goods in it.
      body.acknowledgeHeldPackages === true,
    );
    return json(200, result, guard.scope);
  } catch (err) {
    if (err instanceof HoldingPackagesError) {
      // ⚠ 409, AND IT CARRIES THE ITEMS. A count cannot be acted on; a list can — the driver goes and
      // finds them. 056 found that standing a driver down could strand physical goods permanently and
      // invisibly, and showing the itemised work before confirming is the fix it landed on.
      guard.scope.log.info(
        { driverId: guard.driver.id, heldCount: err.held.length },
        "driver.off_duty_refused_holding_packages",
      );
      return problem(
        409,
        "holding_packages",
        "You still have packages",
        `You are still carrying ${err.held.length} package${err.held.length === 1 ? "" : "s"}. ` +
          "Check them in at the hub, or confirm to go off duty anyway.",
        guard.scope,
        // The field list is how the app renders the manifest. No address and no recipient name —
        // the order reference and the shop are enough to find a parcel in a van (FR-028).
        err.held.map((h) => ({ field: h.packageId, message: `${h.orderNumber} — ${h.shopName}` })),
      );
    }
    guard.scope.log.error({ err, driverId: guard.driver.id }, "duty: transition failed");
    return unavailable(guard.scope);
  }
};
