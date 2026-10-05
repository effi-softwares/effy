// POST /commerce/v1/stripe/webhook — the payment provider's notifications. No shopper credential:
// the request is authenticated by the provider's signature over the body EXACTLY as received.
//
//   200  handled, a duplicate, or an event type the platform does not act on
//   400  the signature did not verify — the only failure that is the caller's
//   5xx  handling failed; NOTHING was recorded, so the provider's retry will be processed
import { ConnectionLimitError } from "@effy/edge-shared";
import { WebhookSignatureError } from "@effy/edge-shared/payments";

import { publicRoute } from "../lib/route";
import { handleWebhook } from "../lib/wiring";

/** Provider events are small; anything larger is not one. */
const MAX_BODY_BYTES = 1 << 20;

const status = (statusCode: number, requestId: string) => ({ statusCode, headers: { "x-request-id": requestId } });

export const handler = publicRoute(async ({ event, scope }) => {
  // ⚠ THE BYTES THE PROVIDER SIGNED. The gateway hands a text body through unchanged and marks a
  // binary one as base64; either way the signature is checked against what was sent, never against
  // a parsed-and-re-serialised copy, which would not verify.
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64") : (event.body ?? "");
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return status(400, scope.requestId);

  const signature = event.headers?.["stripe-signature"] ?? "";
  try {
    await handleWebhook(scope, raw, signature);
    return status(200, scope.requestId);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err; // → retryable 503; the provider sends it again
    if (err instanceof WebhookSignatureError) {
      scope.log.warn("checkout: webhook rejected — signature did not verify");
      return status(400, scope.requestId);
    }
    scope.log.error({ err }, "checkout: webhook handling failed — nothing recorded, the provider will retry");
    return status(500, scope.requestId);
  }
});
