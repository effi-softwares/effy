// The product import worker (102): one step of one import per message, from the product-import queue.
// A thrown error leaves the message to be retried; on its last try the import is marked failed, so the
// screen says so, and the message goes to the dead-letter queue (alarmed).
import type { SQSEvent } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { markFailed, runStep } from "../imports/worker";

const LAST_TRY = 3;

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let msg: { importId?: unknown; step?: unknown };
    try {
      msg = JSON.parse(record.body) as typeof msg;
    } catch {
      logger.warn({ body: record.body.slice(0, 200) }, "import: unreadable message dropped");
      continue;
    }
    if (typeof msg.importId !== "string" || (msg.step !== "check" && msg.step !== "create")) {
      logger.warn({ msg }, "import: message names no import step, dropped");
      continue;
    }
    try {
      await runStep(msg.importId, msg.step);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), importId: msg.importId, step: msg.step }, "import: step failed");
      if (Number(record.attributes.ApproximateReceiveCount) >= LAST_TRY) await markFailed(msg.importId).catch(() => undefined);
      throw err;
    }
  }
};
