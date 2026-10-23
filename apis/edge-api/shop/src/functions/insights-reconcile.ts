// Nightly reconciliation. Non-zero `corrections` means something writes those tables without the triggers seeing it.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { runReconcile } from "../insights/reconcile";

/** The correction count is the alarm, with a threshold of zero. */
function emitReconcileMetric(corrections: number, rebuilds: number): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Insights",
            Dimensions: [[]],
            Metrics: [
              { Name: "InsightsReconcileCorrections", Unit: "Count" },
              { Name: "InsightsTimezoneRebuilds", Unit: "Count" },
            ],
          },
        ],
      },
      InsightsReconcileCorrections: corrections,
      InsightsTimezoneRebuilds: rebuilds,
    }),
  );
}

export const handler: ScheduledHandler = async () => {
  const result = await runReconcile();
  emitReconcileMetric(result.corrections, result.timezoneRebuilds);
  logger.info(
    {
      shops: result.shops,
      bucketsChecked: result.bucketsChecked,
      corrections: result.corrections,
      timezoneRebuilds: result.timezoneRebuilds,
    },
    "insights.reconcile",
  );
};
