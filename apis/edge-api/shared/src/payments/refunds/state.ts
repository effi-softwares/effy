/**
 * The refund state machine. Each state answers "did the money go?":
 *
 *  submitting ──► submitted ──► succeeded
 *  │ └───────► failed (the bank rejected it, up to 30 days later)
 *  └──────────────────────► refused (the provider would not accept it)
 *
 * `submitting` means no answer yet: it may or may not exist. `failed` needs staff; `refused` is final.
 * Enforced in SQL: each transition's where names the states it may leave. This file is vocabulary.
 */
import type { RefundStatus as ProviderRefundStatus } from "../gateway";

export const REFUND_SUBMITTING = "submitting";
export const REFUND_SUBMITTED = "submitted";
export const REFUND_SUCCEEDED = "succeeded";
export const REASON_ITEM_NOT_SUPPLIED = "item_not_supplied";
export const REASON_ITEM_UNUSABLE = "item_unusable";
export const REASON_ORDER_CANCELLED = "order_cancelled";
export const REASON_GOODWILL = "goodwill";

/** A courier override's compensation: its own kind, keyed per move. Recorded only by the delivery override, never offered to operators. */
export const KIND_DELIVERY = "delivery";
export const REASON_COURIER_OVERRIDE = "courier_override";

/** Reasons an operator may choose. The provider is told only one thing. */
export const OPERATOR_REASONS: ReadonlySet<string> = new Set([
  REASON_ITEM_NOT_SUPPLIED, REASON_ITEM_UNUSABLE, REASON_ORDER_CANCELLED, REASON_GOODWILL,
]);

/**
 * The provider's terminal states mapped onto ours; null while it is still working. `failed` (bank
 * rejected) → `failed`; `canceled` (withdrawn before it moved) → `refused`.
 */
export function settledStatus(s: ProviderRefundStatus | undefined): "succeeded" | "failed" | "refused" | null {
  if (s === "succeeded") return "succeeded";
  if (s === "failed") return "failed";
  if (s === "canceled") return "refused";
  return null;
}
