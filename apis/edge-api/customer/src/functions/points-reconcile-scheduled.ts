// Every hour: check that the points ledger still adds up (074 SC-001/SC-002). Not a route.
//
// ⚠ THE COUNT IS EMITTED EVERY RUN, ZERO INCLUDED, so the PointsInvariantViolations alarm has data
// when all is well — "no data" must never read as "healthy".
import { logger, pooled } from "@effy/edge-shared";
import { reportLedger } from "@effy/edge-shared/points";

export const handler = async (): Promise<void> => {
  const check = await reportLedger(pooled, new Date());
  if (check.violations > 0) logger.error({ check }, "points: the ledger does not add up");
  else logger.info({ check }, "points: ledger check clean");
};
