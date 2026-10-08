// Once a day: write the "Expired" history line for points that have expired, and queue the one warning
// for points about to (074 US4). Not a route — nothing calls it but the schedule.
//
// ⚠ EXPIRY DOES NOT DEPEND ON THIS RUNNING. A lot stops counting the instant its expires_at passes,
// because the balance function reads it (research R2). A run that is late or fails makes the history
// line late — never an expired point spendable.
//
// A failure is thrown, so the platform's own error count and retry see it; the next run starts from
// the database again, so nothing is lost by a run that dies.
import { emitMetric, logger, pooled, withTransaction } from "@effy/edge-shared";
import { announcePointsFor, dueToExpire, expireLot, POINTS_METRIC_NAMESPACE, queueExpiryWarnings } from "@effy/edge-shared/points";

/** Lots per run. Far above a day's expiries; a backlog simply takes another run. */
const BATCH = 500;

export const handler = async (): Promise<void> => {
  const now = new Date();
  const due = await dueToExpire(pooled, now, BATCH);
  const touched = new Set<string>();
  let expired = 0;
  for (const lot of due) {
    // One transaction per lot: one customer's lock at a time, and a failure costs one lot, not the run.
    const out = await withTransaction((tx) => expireLot(tx, lot.lotId, now));
    if (out.points > 0) {
      expired += 1;
      touched.add(out.customerId);
    }
  }
  const warned = await queueExpiryWarnings(pooled, now);

  if (expired > 0) emitMetric(POINTS_METRIC_NAMESPACE, "PointsExpired", expired);
  // After every commit: the customers whose history just gained a line.
  await announcePointsFor([...touched]);
  logger.info({ expired, warned, backlog: due.length === BATCH }, "points: expiry pass complete");
};
