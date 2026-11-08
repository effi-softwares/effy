// Fixes the audience, so only the driver authorizer can register a driver token. Registering is also "signed in on a
// phone", so the catch-up notice is checked here (110 R11) - after the device is saved, and never failing it.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import { logger, makeDevicePostHandler, subject, withTransaction, type AuthedEvent } from "@effy/edge-shared";

import { catchUpNotice } from "../devices/catch-up";

const register = makeDevicePostHandler("driver");

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const res = await register(event, context);
  const sub = subject(event);
  if (sub && (res.statusCode ?? 500) < 300) {
    try {
      await withTransaction((tx) => catchUpNotice(tx, sub));
    } catch (err) {
      logger.warn({ err }, "driver catch-up notice not checked");
    }
  }
  return res;
};
