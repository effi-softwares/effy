import { json } from "@effy/edge-shared";

import { customerRoute, jsonBody } from "../lib/route";
import { savedService } from "../lib/wiring";
import type { MergeItem } from "../saved/repository";
import { badBody, parseRfc3339, savedError } from "../saved/respond";

const optionalText = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === "string" ? v : undefined;

/** The request's items, or null when the body is not the expected shape. */
function mergeItems(body: Record<string, unknown> | null): MergeItem[] | null {
  if (!body) return null;
  const raw = body.items;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;

  const out: MergeItem[] = [];
  for (const it of raw) {
    if (typeof it !== "object" || it === null) return null;
    const o = it as Record<string, unknown>;
    const price = optionalText(o.savedPriceAmount);
    const currency = optionalText(o.savedCurrency);
    if (price === undefined || currency === undefined) return null;
    if (o.productId !== undefined && typeof o.productId !== "string") return null;
    if (o.savedAt !== undefined && o.savedAt !== null && typeof o.savedAt !== "string") return null;
    out.push({
      productId: (o.productId as string | undefined) ?? "",
      variantId: typeof o.variantId === "string" ? o.variantId : null,
      // An empty string is absent, not zero: "0" would invent a price the item dropped from.
      savedPriceAmount: price === "" ? null : price,
      savedCurrency: currency === "" ? null : currency,
      // One bad timestamp takes now rather than rejecting the whole guest list.
      savedAt: parseRfc3339(o.savedAt) ?? new Date(),
    });
  }
  return out;
}

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const items = mergeItems(jsonBody(event));
  if (items === null) return badBody(scope, "invalid_body");
  try {
    return json(200, await savedService.merge(customer.id, items), scope);
  } catch (err) {
    return savedError(scope, err, "merge");
  }
});
