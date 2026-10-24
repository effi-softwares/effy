// The planner's schedule: every tick assigns every package a driver can take; the round's opening time
// (in the driver service) governs what may be done early. Overlapping invocations are safe: a pass
// takes a transaction-scoped advisory lock, and `round_package_open_uq` keeps packages exclusive. Uses
// `ScheduledHandler` and `logger`, not `preamble`, which needs an HTTP `requestContext`.
import { announceCollectionShops, announceDispatch } from "../lib/live";
import type { ScheduledHandler } from "aws-lambda";

import { logger, query } from "@effy/edge-shared";

import { maxCustodyHours } from "../dispatch/custody";
import { passChangedAnything, runPass } from "../planner/service";
import { overdueCrossedSince } from "../sequence/service";

/** The schedule's interval, for steps that became overdue since the last tick. */
const PASS_INTERVAL_MS = 5 * 60_000;

/** No dimensions: a dimensioned metric is a different metric and the alarm goes blind. */
function emit(metrics: Record<string, number>): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Dispatch",
            Dimensions: [[]],
            Metrics: Object.keys(metrics).map((Name) => ({ Name, Unit: "Count" })),
          },
        ],
      },
      ...metrics,
    }),
  );
}

export const handler: ScheduledHandler = async (_event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const scope = { log: logger.child({ awsRequestId: context.awsRequestId }) };

  const outcome = await runPass();

  // Announced after commit and only if something changed: the pass runs all day.
  const changed = passChangedAnything(outcome);
  if (changed) {
    await announceDispatch(outcome.driverIds);
    // The shops whose next collection gained or lost its driver (099).
    await announceCollectionShops(outcome.driverIds);
  }

  // An overdue step is time passing, not a write: announced once when it crosses its threshold.
  try {
    const crossed = await overdueCrossedSince({ query: (t, v) => query(t, v) }, new Date(Date.now() - PASS_INTERVAL_MS));
    if (crossed > 0 && !changed) await announceDispatch([]);
  } catch (err) {
    scope.log.error({ err }, "dispatch.overdue_check_failed");
  }

  // The held-hours measurement rides on the tick so the alarm works when nobody is looking.
  try {
    emit({ DriverPackagesHeldHours: await maxCustodyHours() });
  } catch (err) {
    scope.log.error({ err }, "dispatch.custody_measure_failed");
  }

  // One line per pass, always, so "nothing to do" never looks like "the planner is dead".
  scope.log.info(
    {
      skipped: outcome.skipped,
      released: outcome.released,
      reasonsChanged: outcome.reasonsChanged,
      collection: outcome.collection,
      delivery: outcome.delivery,
    },
    "dispatch.pass",
  );
  if (outcome.skipped !== null) return;

  const assigned = outcome.collection.assigned + outcome.delivery.assigned;
  const unassigned = outcome.collection.unassigned + outcome.delivery.unassigned;
  const pastOpening = outcome.collection.unassignedPastOpening + outcome.delivery.unassignedPastOpening;

  if (pastOpening > 0) {
    scope.log.error({ pastOpening }, "dispatch.unassigned_past_opening");
  }

  // `DispatchUnassignedPastOpening` is the real failure: the run has opened and nobody has the package.
  emit({
    DispatchPackagesAssigned: assigned,
    DispatchPackagesUnassigned: unassigned,
    DispatchPackagesReleased: outcome.released,
    DispatchUnassignedPastOpening: pastOpening,
    // Parcels still at a supplier after the run that would make their window: counted, not alarmed.
    DispatchParcelsCollectLate: outcome.collection.collectLate ?? 0,
  });
};
