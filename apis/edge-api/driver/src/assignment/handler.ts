// The auto-assignment sweep worker (049, research R2). Scheduled (EventBridge) — the SNS/SQS event
// backbone does not exist yet, so a periodic idempotent sweep is Principle III's "async worker on the
// cold path". Meets SC-003 (assignment visible ≤30s) combined with the app's poll/pull-to-refresh.
//
// Each pass, in order:
//   1. Release ineligible drivers' not-yet-started work back to the pool (FR-011 / T060).  [DONE]
//   2. Assign ready COLLECTION work to eligible on-duty drivers.                            [T017/US1]
//   3. Assign checked-in SAME-DAY drops to eligible on-duty drivers.                        [T025/US2]
//   4. Flag same-day packages past their collection cutoff.                                 [T061/US1]
//   5. Write driver_activity items for new assignments.                                     [T046/US6]
//
// Steps 2–5 are added by their owning slices; the loop, eligibility, release, and idempotency
// foundation are here. Assignment claims candidate work FOR UPDATE SKIP LOCKED and relies on the
// schema's UNIQUE(shop_fulfillment_id) so a package can never be double-assigned (research R10).

import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { eligibleDriverIds, releaseIneligibleWork } from "./repository";

export const handler: ScheduledHandler = async () => {
  const log = logger.child({ worker: "assignment-sweep" });

  try {
    const released = await releaseIneligibleWork();
    const eligible = await eligibleDriverIds();

    // TODO(T017/US1): assign ready collection work to `eligible` drivers (zone-scoped, nearest-by-
    //                 snapshot else load-balanced), FOR UPDATE SKIP LOCKED.
    // TODO(T025/US2): group checked-in same-day packages into drops and assign.
    // TODO(T061/US1): flag same-day packages past their collection cutoff.
    // TODO(T046/US6): write driver_activity for each new assignment.

    log.info({ released, eligibleDrivers: eligible.length }, "assignment sweep complete");
  } catch (err) {
    // A failed sweep must not crash the schedule; the next tick retries. Surfaced for the
    // unassigned-work alarm (Principle VII / T055).
    log.error({ err }, "assignment sweep failed");
    throw err;
  }
};
