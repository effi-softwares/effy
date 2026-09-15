// The nightly reconciliation (058, US3).
//
// ⚠ A NON-ZERO `corrections` IS AN ALARM, NOT A SUCCESS. It means a figure changed without its
// bucket being marked — i.e. something writes to the order, refund or fulfilment tables in a way the
// triggers do not see. The repair is cheap; the fact that a repair was needed is the finding.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { runReconcile } from "../insights/reconcile";

/**
 * ⚠ THE CORRECTION COUNT IS THE ALARM, and the threshold is ZERO. Every other alarm on this platform
 * tolerates a baseline; this one must not. A correction means a figure changed without its bucket
 * being marked — i.e. something writes to the order, refund or fulfilment tables in a way the
 * triggers do not see. The nightly repair is cheap; the hole it implies is what needs a person.
 */
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
