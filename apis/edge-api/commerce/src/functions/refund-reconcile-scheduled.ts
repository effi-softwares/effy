// Every five minutes: resolve refunds whose submission to the payment provider never got an answer
// (070 FR-024). Not a route — nothing calls it but the schedule.
//
// A failure here is thrown, so the platform's own error metric and retry see it; the next run
// starts from the database again, so nothing is lost by a run that dies.
import { logger } from "@effy/edge-shared";

import { refundService } from "../lib/wiring";

export const handler = async (): Promise<void> => {
  const outcome = await refundService.reconcile();
  logger.info({ outcome }, "refunds: reconcile pass complete");
};
