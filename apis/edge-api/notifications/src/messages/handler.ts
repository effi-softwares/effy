// The scheduled sender of back-office messages (112 R3). Idempotent: a pass that dies part-way leaves the cursor at
// the last committed page and the next pass carries on. Thrown errors reach the background-function alarm.
import type { Context, ScheduledHandler } from "aws-lambda";

import { logger, pooled, withTransaction, type Transactor } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import { announceInbox } from "@effy/edge-shared/notifications";

import { runMessagesPass } from "./worker";

/** Stop starting pages this long before the Lambda's own timeout. */
const RESERVE_MS = 60_000;
/** A pass works at most this long, so the next minute's pass is never far behind. */
const BUDGET_MS = 4 * 60_000;

const transact: Transactor = (fn) => withTransaction((client) => fn(client));

export const handler: ScheduledHandler = async (_event, context?: Context) => {
  const log = logger.child({ worker: "messages" });
  const started = Date.now();
  const remaining = typeof context?.getRemainingTimeInMillis === "function" ? context.getRemainingTimeInMillis() : 120_000;
  try {
    const summary = await runMessagesPass({
      db: pooled,
      transact,
      now: () => new Date(),
      deadline: started + Math.min(BUDGET_MS, remaining - RESERVE_MS),
      announceOps: () => announce([{ scope: "ops", kind: "messages" }]),
      announceInbox: (recipients) => announceInbox(recipients),
    });
    log.info({ metric: "messages_pass", ...summary }, "messages pass complete");
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Effy/Notifications",
              Dimensions: [[]],
              Metrics: [
                { Name: "MessagesPagesWritten", Unit: "Count" },
                { Name: "MessagesSent", Unit: "Count" },
                { Name: "MessagesNotSent", Unit: "Count" },
                { Name: "AutomationRuns", Unit: "Count" },
                { Name: "AutomationRecipients", Unit: "Count" },
              ],
            },
          ],
        },
        MessagesPagesWritten: summary.pages,
        MessagesSent: summary.sent,
        MessagesNotSent: summary.notSent,
        AutomationRuns: summary.automationRuns,
        AutomationRecipients: summary.automationRecipients,
      }),
    );
  } catch (err) {
    log.error({ err }, "messages pass failed");
    throw err;
  }
};
