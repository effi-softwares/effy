// The scheduled attention evaluator (059, US3).
//
// ⚠ A SCHEDULE, NOT A TRIGGER, AND ONE FACT DECIDES IT: `awaiting_pick` becomes true BY THE PASSAGE
// OF TIME. An order ages into needing attention — there is no INSERT, no UPDATE, no transaction to
// fire from. Any event-driven design covers three of the four conditions and silently misses the
// most time-critical one. The reasoning in full is at the head of `../attention/evaluator.ts`.
//
// Failure is safe in the same way 058's rollup is: an occurrence not recorded this minute is
// recorded next minute, because the state table is compared against a fresh derivation every run
// rather than against an incremental queue.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { evaluateAll } from "../attention/evaluator";

/**
 * Emit the run's figures as CloudWatch EMF on stdout (Principle VII).
 *
 * ⚠ `AttentionFailedShops` IS THE ONE WORTH ALARMING ON. Intents-per-run is expected to be zero most
 * of the time — a healthy shop needs nothing — so alarming on it would fire constantly. A shop whose
 * evaluation throws is different: it means that shop's operators are being told nothing at all, and
 * nothing else would ever say so.
 *
 * ⚠ DELIBERATELY NO ALARM ON WEB SEND FAILURES. A browser subscription expiring is normal and
 * expected; an alarm that fires weekly on healthy behaviour is an alarm that gets muted, and then
 * the real one is muted too.
 *
 * Emitted on EVERY run, zeros included, so the alarm has a continuous signal rather than inferring
 * health from silence (the same stdout-EMF pattern 035, 050 and 058 use).
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
