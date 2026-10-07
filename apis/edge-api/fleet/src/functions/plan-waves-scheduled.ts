// The planner's scheduled entry point (063, reshaped by 072).
//
// ⚠ EVERY TICK ASSIGNS (072). Until 072 this woke often and planned rarely: a wave ran only inside
// the lead time before a collection run. The pass now gives every package a driver can take to a
// driver, on every tick; what a driver may not do early is governed by the round's opening time, in
// the driver service, not by withholding the work here.
//
// ⚠ OVERLAPPING INVOCATIONS MUST BE SAFE. A retry after a timeout is indistinguishable from the next
// tick. A pass takes a transaction-scoped advisory lock and a second one does nothing; a package's
// exclusivity is still the partial unique index `round_package_open_uq` (research R4, 063 R6).
// ⚠ `ScheduledHandler` AND `logger`, NOT `preamble`. `preamble` reads
// `event.requestContext.requestId` — it exists to correlate an HTTP request, and an EventBridge
// event has no `requestContext` at all.
//
// ⚠ THIS SHIPPED WRONG AND THE PLANNER NEVER RAN ONCE. Every invocation since deploy died on the
// handler's first line with `Cannot read properties of undefined (reading 'requestId')`, three times
// per tick because Lambda retries an async invocation twice. Nothing caught it: the pure planner
// tests never touch the handler, the container tests call the repository directly, and the
// config-contract test reads the YAML. `event as never` is what silenced the one check that would
// have — a cast asserting a shape the runtime never produces.
//
// The notifications drain (050) had the right shape all along; this now matches it.
import { announceDispatch } from "../lib/live";
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { maxCustodyHours } from "../dispatch/custody";
import { passChangedAnything, runPass } from "../planner/service";

/** One EMF record. ⚠ No dimensions: a dimensioned metric is a DIFFERENT metric and the alarm goes blind (059). */
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

  // ⚠ ANNOUNCED AFTER THE PASS HAS COMMITTED, AND ONLY IF IT CHANGED SOMETHING (071 FR-004, 072 R9).
  // The pass runs all day; telling every open screen "something changed" 288 times a day when
  // nothing had would be a refresh timer with extra steps.
  if (passChangedAnything(outcome)) await announceDispatch(outcome.driverIds);

  // ⚠ 064 — the held-hours measurement rides on the planner tick because an on-demand custody read
  // only happens when a dispatcher opens a screen: an alarm fed by that would be silent exactly when
  // nobody is looking.
  try {
    emit({ DriverPackagesHeldHours: await maxCustodyHours() });
  } catch (err) {
    scope.log.error({ err }, "dispatch.custody_measure_failed");
  }

  // ⚠ ONE LINE PER PASS, ALWAYS — including a pass that did nothing. "Nothing to do" and "the
  // planner is dead" must never be the same silence; that cost a live investigation in 063.
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

  // ⚠ 072 — `DispatchWaveAssignedNothing` IS NO LONGER EMITTED. It meant "a wave considered work and
  // placed none", which was a failure when waves ran just before a run. With a pass every few
  // minutes all day, one package readied at 20:00 with no driver on duty is that condition until
  // morning. `DispatchUnassignedPastOpening` is the failure that remains real: the run has opened
  // and nobody has the package.
  emit({
    DispatchPackagesAssigned: assigned,
    DispatchPackagesUnassigned: unassigned,
    DispatchPackagesReleased: outcome.released,
    DispatchUnassignedPastOpening: pastOpening,
  });
};
