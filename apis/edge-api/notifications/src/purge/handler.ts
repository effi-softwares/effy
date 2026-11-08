// The daily notification purge (109). Thrown errors reach the background-function alarm.
import type { Context, ScheduledHandler } from "aws-lambda";

import { logger, pooled } from "@effy/edge-shared";

import { purge } from "./repository";

const RESERVE_MS = 15_000;

export const handler: ScheduledHandler = async (_event, context?: Context) => {
  const log = logger.child({ worker: "notification-purge" });
  const started = Date.now();
  const remaining = typeof context?.getRemainingTimeInMillis === "function" ? context.getRemainingTimeInMillis() : 120_000;
  try {
    const summary = await purge(pooled, new Date(), started + remaining - RESERVE_MS);
    log.info({ metric: "notification_purge", ...summary }, "notification purge complete");
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [{ Namespace: "Effy/Notifications", Dimensions: [[]], Metrics: [{ Name: "NotificationsPurged", Unit: "Count" }] }],
        },
        NotificationsPurged: summary.notifications + summary.erased,
      }),
    );
  } catch (err) {
    log.error({ err }, "notification purge failed");
    throw err;
  }
};
