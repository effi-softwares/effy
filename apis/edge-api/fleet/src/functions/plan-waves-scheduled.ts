// The wave planner's scheduled entry point (063).
//
// ⚠ IT WAKES OFTEN AND PLANS RARELY. The schedule below fires every few minutes; a wave is planned
// only when a collection run has actually reached `run_time − prep_buffer − planning_lead`. The
// COLLECTION SCHEDULE decides when work is created; the cron expression decides only how often we
// look. That distinction is the whole difference between a wave planner and 049's one-minute
// scavenger, which had no deadline and therefore no reason to batch (D12).
//
// ⚠ OVERLAPPING INVOCATIONS MUST BE SAFE. A retry after a timeout is indistinguishable from the next
// tick, and both can read the same gather result. Exclusivity is the partial unique index
// `round_package_open_uq`, not this handler's timing (research R6).
import type { Context } from "aws-lambda";

import { preamble } from "@effy/edge-shared";

import { runDuePlanning } from "../planner/service";

export const handler = async (event: unknown, context: Context): Promise<void> => {
  const scope = preamble(event as never, context);
  const outcomes = await runDuePlanning();

  for (const o of outcomes) {
    if (o.skippedReason !== null) {
      scope.log.info({ kind: o.kind, skipped: o.skippedReason }, "dispatch.wave_skipped");
      continue;
    }

    scope.log.info(
      {
        kind: o.kind,
        waveId: o.waveId,
        considered: o.considered,
        assigned: o.assigned,
        unassigned: o.unassigned,
      },
      "dispatch.wave_planned",
    );

    // ⚠ THE ALARM TARGET (Principle VII). A wave that considered work and placed NONE of it is the
    // failure nothing else reports: no shopper sees an error, no driver is told anything is wrong,
    // and the packages simply do not move. It is emitted as its OWN record rather than as a
    // dimension on the line above, because a dimensioned metric is a different metric in CloudWatch
    // and the alarm would go blind (059 found exactly this; 054 before it).
    if (o.considered > 0 && o.assigned === 0) {
      scope.log.error(
        { kind: o.kind, waveId: o.waveId, considered: o.considered },
        "dispatch.wave_assigned_nothing",
      );
    }

    // ⚠ EMF ON STDOUT, ITS OWN RECORD — the 035/050/058 pattern. No SDK call, no metric-filter or
    // log-group ordering dependency, and crucially NO DIMENSION on an existing metric: a dimensioned
    // metric is a DIFFERENT metric in CloudWatch, so an alarm on the undimensioned name would go
    // blind the moment a dimension was added. 059 found exactly that, and 054 before it.
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Effy/Dispatch",
              Dimensions: [[]],
              Metrics: [
                { Name: "DispatchPackagesConsidered", Unit: "Count" },
                { Name: "DispatchPackagesAssigned", Unit: "Count" },
                { Name: "DispatchPackagesUnassigned", Unit: "Count" },
                { Name: "DispatchWaveAssignedNothing", Unit: "Count" },
              ],
            },
          ],
        },
        DispatchPackagesConsidered: o.considered,
        DispatchPackagesAssigned: o.assigned,
        DispatchPackagesUnassigned: o.unassigned,
        // ⚠ THE ALARM TARGET. A wave that considered work and placed none of it is the failure
        // nothing else reports: no shopper sees an error, no driver is told, the packages just do
        // not move.
        DispatchWaveAssignedNothing: o.considered > 0 && o.assigned === 0 ? 1 : 0,
      }),
    );
  }
};
