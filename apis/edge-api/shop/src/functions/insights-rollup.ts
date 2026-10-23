// The only writer of the rollup tables, every minute. The dirty rows are the queue, so a failure
// delays figures rather than losing them.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { markCurrentHours, runRollup } from "../insights/rollup";

/** EMF every run, zeros included. The alarm is on the oldest bucket's age, not the count: freshness is the promise. */
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
        // The alarm's input: how long stale figures have been on screen.
        oldestBacklogMs: result.oldestBacklogMs,
      },
      "insights.rollup",
    );
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "insights.rollup failed",
    );
    throw err;
  }
};
