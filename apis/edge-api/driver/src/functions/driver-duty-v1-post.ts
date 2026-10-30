import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { announceCollectionShops } from "@effy/edge-shared/live";

import { announceDuty } from "../work/announce";
import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, ProblemType, unavailable } from "@effy/edge-shared";
import type { DutyRequest } from "@effy/shared-types";

import { authenticate } from "../driver/guard";
import { HoldingPackagesError, setDuty } from "../driver/service";

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
      // The confirmation after seeing what they hold; without it the call refuses and names the packages.
      body.acknowledgeHeldPackages === true,
    );
    await announceDuty();
    // The shops on this driver's collection rounds: "on the way" follows duty (099).
    await announceCollectionShops([guard.driver.id]);
    return json(200, result, guard.scope);
  } catch (err) {
    if (err instanceof HoldingPackagesError) {
      // With the items: a list can be acted on, a count cannot.
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
        // No address or recipient: the order reference and the shop find a parcel in a van.
        err.held.map((h) => ({ field: h.packageId, message: `${h.orderNumber} - ${h.shopName}` })),
      );
    }
    guard.scope.log.error({ err, driverId: guard.driver.id }, "duty: transition failed");
    return unavailable(guard.scope);
  }
};
