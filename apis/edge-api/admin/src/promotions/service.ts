// The order rules.
import * as repo from "./repository";
import { type FieldIssue, type OrderPolicy, PromoError } from "./types";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export async function readOrderPolicy(): Promise<OrderPolicy> {
  return repo.readOrderPolicy();
}

/** `max_line_quantity` stays inside `cart_item`'s `CHECK (quantity <= 99)`. */
export async function writeOrderPolicy(input: Record<string, unknown>, actorSub: string): Promise<OrderPolicy> {
  const fields: FieldIssue[] = [];
  const minimum = input.minimumSubtotalAmount;
  const maxLine = input.maxLineQuantity;
  const maxDistinct = input.maxDistinctItems;

  if (typeof minimum !== "string" || !MONEY_RE.test(minimum)) {
    fields.push({ field: "minimumSubtotalAmount", message: "must be a non-negative amount" });
  }
  if (!Number.isInteger(maxLine) || (maxLine as number) < 1 || (maxLine as number) > 99) {
    fields.push({ field: "maxLineQuantity", message: "must be between 1 and 99" });
  }
  if (!Number.isInteger(maxDistinct) || (maxDistinct as number) < 1 || (maxDistinct as number) > 500) {
    fields.push({ field: "maxDistinctItems", message: "must be between 1 and 500" });
  }
  if (fields.length > 0) {
    throw new PromoError(422, "order_policy_invalid", fields[0]!.message, fields);
  }

  return repo.writeOrderPolicy(
    {
      minimumSubtotalAmount: minimum as string,
      maxLineQuantity: maxLine as number,
      maxDistinctItems: maxDistinct as number,
    },
    actorSub,
  );
}
