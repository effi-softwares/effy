// The scheduled rollup — every minute (058, US3).
//
// ⚠ IT IS THE ONLY WRITER OF THE ROLLUP TABLES, which is what lets the read path be a plain indexed
// scan with no locking to think about. Failure is safe: the dirty rows it could not process are
// still there a minute later (the table IS the queue), so a bad deploy or a brief database blip
// delays figures rather than losing them.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { markCurrentHours, runRollup } from "../insights/rollup";

/**
 * Emit the backlog metrics as CloudWatch EMF on stdout (Principle VII).
 *
 * ⚠ THE AGE, NOT THE COUNT, IS WHAT IS ALARMED ON. A queue of 400 buckets drained every minute is
 * healthy; a queue of ONE bucket that has sat there for twenty minutes means the figures an operator
 * is reading are twenty minutes stale and nothing is fixing it. SC-004 promises freshness, so
 * freshness is what is measured.
 *
 * Emitted on EVERY run, zeros included, so the alarm has a continuous signal rather than inferring
 * health from silence (the same stdout-EMF pattern 035 and 050 use — no SDK call, no metric-filter
 * ordering dependency).
 */
function emitBacklogMetric(oldestBacklogMs: number, buckets: number): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Insights",
            Dimensions: [[]],
            Metrics: [
              { Name: "InsightsBacklogAgeMs", Unit: "Milliseconds" },
              { Name: "InsightsBucketsRecomputed", Unit: "Count" },
            ],
          },
        ],
      },
      InsightsBacklogAgeMs: oldestBacklogMs,
      InsightsBucketsRecomputed: buckets,
    }),
  );
}

export const handler: ScheduledHandler = async () => {
  try {
    const marked = await markCurrentHours();
    const result = await runRollup();
    emitBacklogMetric(result.oldestBacklogMs, result.buckets);
    logger.info(
      {
        buckets: result.buckets,
        shops: result.shops,
        currentHoursMarked: marked,
        // ⚠ THE ALARM'S INPUT. Not "how many buckets are queued" — a count says nothing about how
        // long anyone has been looking at stale figures, and the figures' honesty is what SC-004
        // actually promises.
        oldestBacklogMs: result.oldestBacklogMs,
      },
      "insights.rollup",
    );
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "insights.rollup failed",
    );
    throw err; // Lambda's own error metric is the alarm; the queue is untouched either way.
  }
};
