// Every 5 minutes: is a scheduled switch to the new delivery model still safe, and how many orders
// sold the old way are still open? → Effy/Platform metrics (083, research R4/R5).
//
// ⚠ No route. ⚠ A FAILURE THROWS: its alarms treat missing data as not breaching (no scheduled switch
// is the ordinary state), so silence would read as healthy; the function's own failed-invocation
// alarm (background-functions.tf) is what says the check has stopped.
import type { Context } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { sweep } from "../delivery/go-live.service";

export const handler = async (_event: unknown, context?: Context): Promise<void> => {
  if (context) context.callbackWaitsForEmptyEventLoop = false;
  const outcome = await sweep();
  if (outcome.blocked) logger.error({ outcome }, "delivery model: a scheduled switch was blocked — the platform was not ready");
  else logger.info({ outcome }, "delivery model sweep");
};
