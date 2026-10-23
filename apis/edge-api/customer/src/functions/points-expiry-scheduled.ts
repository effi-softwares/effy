// Daily: writes the "Expired" history line and queues the warning for points about to expire. Expiry
// itself does not depend on this (the balance reads expires_at). Failures are thrown; the next run restarts.
import { emitMetric, logger, pooled, withTransaction } from "@effy/edge-shared";
import { announcePointsFor, dueToExpire, expireLot, POINTS_METRIC_NAMESPACE, queueExpiryWarnings } from "@effy/edge-shared/points";

/** Far above a day's expiries; a backlog takes another run. */
const BATCH = 500;

export const handler = async (): Promise<void> => {
  const now = new Date();
  const due = await dueToExpire(pooled, now, BATCH);
  const touched = new Set<string>();
  let expired = 0;
  for (const lot of due) {
    // One transaction per lot, so a failure costs one lot.
    const out = await withTransaction((tx) => expireLot(tx, lot.lotId, now));
    if (out.points > 0) {
      expired += 1;
      touched.add(out.customerId);
    }
  }
  const warned = await queueExpiryWarnings(pooled, now);

  if (expired > 0) emitMetric(POINTS_METRIC_NAMESPACE, "PointsExpired", expired);
  await announcePointsFor([...touched]);
  logger.info({ expired, warned, backlog: due.length === BATCH }, "points: expiry pass complete");
};
