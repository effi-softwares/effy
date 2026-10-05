// POST /commerce/v1/saved/merge — fold a device's guest list into the account at sign-in.
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
      // ⚠ An empty string is ABSENT, not zero. "0" would report the item as having dropped from
      // nothing — a fabricated fact, and worse than no baseline at all.
      savedPriceAmount: price === "" ? null : price,
      savedCurrency: currency === "" ? null : currency,
      // ⚠ An unparseable timestamp takes now rather than rejecting the whole merge: one bad row
      // from a device must not cost the shopper their entire guest list.
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
