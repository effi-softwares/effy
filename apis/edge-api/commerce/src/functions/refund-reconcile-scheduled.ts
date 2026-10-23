// Resolves refunds whose submission to the provider never got an answer. Failures are thrown; the
// next run starts again from the database.
import { logger } from "@effy/edge-shared";

import { refundService } from "../lib/wiring";

export const handler = async (): Promise<void> => {
  const outcome = await refundService.reconcile();
  logger.info({ outcome }, "refunds: reconcile pass complete");
};
