// Authenticated by the provider's signature. 200 handled, duplicate or ignored; 400 bad signature;
// 5xx nothing was recorded, so the provider's retry is processed.
import { ConnectionLimitError } from "@effy/edge-shared";
import { WebhookSignatureError } from "@effy/edge-shared/payments";

import { publicRoute } from "../lib/route";
import { handleWebhook } from "../lib/wiring";

/** Provider events are small; anything larger is not one. */
const MAX_BODY_BYTES = 1 << 20;

const status = (statusCode: number, requestId: string) => ({ statusCode, headers: { "x-request-id": requestId } });

export const handler = publicRoute(async ({ event, scope }) => {
  // The signature covers the exact bytes sent, never a re-serialised copy.
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64") : (event.body ?? "");
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return status(400, scope.requestId);

  const signature = event.headers?.["stripe-signature"] ?? "";
  try {
    await handleWebhook(scope, raw, signature);
    return status(200, scope.requestId);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err; // → retryable 503; the provider sends it again
    if (err instanceof WebhookSignatureError) {
      scope.log.warn("checkout: webhook rejected - signature did not verify");
      return status(400, scope.requestId);
    }
    scope.log.error({ err }, "checkout: webhook handling failed - nothing recorded, the provider will retry");
    return status(500, scope.requestId);
  }
});
