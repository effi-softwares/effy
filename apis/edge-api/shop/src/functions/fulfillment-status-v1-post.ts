// POST /shop/v1/fulfillments/{id}/status — advance or reverse a portion (020, US3).
//
// This is the endpoint that finally moves shop_fulfillment.status off `pending`, where 019 left it
// with no consumer. Concurrency-safe: a transition another operator already applied returns 200 with
// the current portion rather than an error (FR-014, SC-005).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, parseJsonBody, preamble, problem, ProblemType } from "@effy/edge-shared";

import { gate, mapFulfillmentError, toDetailDTO } from "../fulfillments/handler-support";
import { transition } from "../fulfillments/service";
import { REQUESTABLE_TRANSITIONS } from "../fulfillments/types";
import type { RequestableTransition } from "../fulfillments/types";

// ⚠ Imported, never restated — see the note on REQUESTABLE_TRANSITIONS.
const REQUESTABLE: readonly string[] = REQUESTABLE_TRANSITIONS;

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  const id = event.pathParameters?.id;
  if (!id) return mapFulfillmentError(new Error("missing id"), scope);

  const parsed = parseJsonBody<Record<string, unknown>>(event.body);
  if (!parsed.value) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "a JSON body is required", scope, parsed.errors);
  }

  // `received` and `collected` are deliberately not requestable: the first is implicit on open
  // (FR-011a), the second belongs to the dev-only pickup stub alone (FR-030).
  //
  // ⚠ 055 US6 adds `unfulfillable` — the exit a shop that cannot supply its portion previously
  // lacked. `withdrawn` is NOT requestable and must never become so: it is written by `core-api` when
  // an ORDER is cancelled, and a shop asserting it would be claiming a customer cancelled.
  const to = parsed.value.to;
  if (typeof to !== "string" || !REQUESTABLE.includes(to)) {
    return problem(400, ProblemType.ValidationFailed, "Validation failed",
      "invalid target state", scope, [
        { field: "to", message: `must be one of: ${REQUESTABLE.join(", ")}` },
      ]);
  }

  try {
    // ⚠ The reason is REQUIRED for `unfulfillable` — enforced by the service and, underneath it, by a
    // CHECK constraint. Back-office is asked to decide a refund on the strength of this; "the shop
    // said no" is not a basis for returning a customer's money.
    const reason = typeof parsed.value.reason === "string" ? parsed.value.reason : undefined;
    return json(
      200,
      toDetailDTO(await transition(g.actor, id, to as RequestableTransition, reason)),
      scope,
    );
  } catch (err) {
    return mapFulfillmentError(err, scope);
  }
};
