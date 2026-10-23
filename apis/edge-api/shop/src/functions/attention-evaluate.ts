// Scheduled because `awaiting_pick` becomes true by time passing (see `../attention/evaluator.ts`).
// Failure is safe: each run compares against a fresh derivation.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { evaluateAll } from "../attention/evaluator";

/**
 * EMF every run, zeros included. `AttentionFailedShops` is the one alarmed on: a failing shop's
 * operators are told nothing. No alarm on intents (usually zero) or web send failures (expiry is normal).
 */
function emitMetrics(stats: {
  shops: number;
  appeared: number;
  intents: number;
  failedShops: number;
  durationMs: number;
}): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Attention",
            Dimensions: [[]],
            Metrics: [
              { Name: "AttentionShopsEvaluated", Unit: "Count" },
              { Name: "AttentionOccurrencesAppeared", Unit: "Count" },
              { Name: "AttentionIntentsEnqueued", Unit: "Count" },
              { Name: "AttentionFailedShops", Unit: "Count" },
              { Name: "AttentionRunDurationMs", Unit: "Milliseconds" },
            ],
          },
        ],
      },
      AttentionShopsEvaluated: stats.shops,
      AttentionOccurrencesAppeared: stats.appeared,
      AttentionIntentsEnqueued: stats.intents,
      AttentionFailedShops: stats.failedShops,
      AttentionRunDurationMs: stats.durationMs,
    }),
  );
}

export const handler: ScheduledHandler = async () => {
  const startedAt = Date.now();
  const stats = await evaluateAll();
  const durationMs = Date.now() - startedAt;

  emitMetrics({ ...stats, durationMs });
  logger.info({ ...stats, durationMs }, "attention: run complete");
};
