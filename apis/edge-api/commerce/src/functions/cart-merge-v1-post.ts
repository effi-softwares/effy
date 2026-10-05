// POST /commerce/v1/cart/merge — fold a device cart into the account cart at sign-in: a union with
// the MAXIMUM quantity. Nothing already in the account cart is removed; an empty list is a no-op.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import type { LineInput } from "../cart/service";
import { changeIdOf, customerRoute, intField, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

/** `lines` as line inputs, or null when it is present but malformed. Absent is an empty list. */
export function lineInputs(v: unknown): LineInput[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: LineInput[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) return null;
    const productId = stringField((item as Record<string, unknown>).productId);
    const quantity = intField((item as Record<string, unknown>).quantity);
    if (productId === null || quantity === null) return null;
    out.push({ productId, quantity });
  }
  return out;
}

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const lines = lineInputs(body?.lines);
  const changeId = changeIdOf(body?.changeId);
  if (!body || lines === null || changeId === null) return validationFailed(scope, "lines are required");
  return respond(scope, () => cartService.merge(customer.id, changeId, lines));
});
