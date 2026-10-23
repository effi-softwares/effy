// Hourly ledger check. Emits the count every run, zero included, so the alarm always has data.
import { logger, pooled } from "@effy/edge-shared";
import { reportLedger } from "@effy/edge-shared/points";

export const handler = async (): Promise<void> => {
  const check = await reportLedger(pooled, new Date());
  if (check.violations > 0) logger.error({ check }, "points: the ledger does not add up");
  else logger.info({ check }, "points: ledger check clean");
};
