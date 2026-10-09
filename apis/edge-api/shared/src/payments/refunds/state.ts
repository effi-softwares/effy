/**
 * The refund state machine (055).
 *
 * ⚠ FIVE STATES, BECAUSE EACH IS A DIFFERENT ANSWER TO THE ONLY QUESTION ANYONE ASKS ABOUT A
 * REFUND: did the money go?
 *
 *     submitting ──► submitted ──► succeeded
 *          │              │
 *          │              └───────► failed    (the bank rejected it — up to 30 days later)
 *          └──────────────────────► refused   (the provider would not accept it at all)
 *
 *   · `submitting` vs `submitted` — has the provider GOT it? `submitting` means we asked and got no
 *     answer, so the refund may or may not exist. It does not count toward what has been refunded,
 *     or an outage on our side would make the platform refuse to return money it still holds.
 *   · `failed` vs `refused` — could retrying ever help? `failed` is the bank rejecting a refund that
 *     was accepted; staff must resolve it. `refused` is a decision, and retrying cannot change it.
 *
 * ⚠ THE MACHINE IS ENFORCED IN SQL. Every transition's WHERE clause names the states it may leave,
 * so a terminal refund cannot be reopened by a late or redelivered event. This file is vocabulary.
 */
import type { RefundStatus as ProviderRefundStatus } from "../gateway";

export const REFUND_SUBMITTING = "submitting";
export const REFUND_SUBMITTED = "submitted";
export const REFUND_SUCCEEDED = "succeeded";
export const REFUND_FAILED = "failed";
export const REFUND_REFUSED = "refused";

export const REASON_ITEM_NOT_SUPPLIED = "item_not_supplied";
export const REASON_ITEM_UNUSABLE = "item_unusable";
export const REASON_ORDER_CANCELLED = "order_cancelled";
export const REASON_GOODWILL = "goodwill";

/**
 * 081 — a refund that IS a courier override's compensation (the delivery charge, or the difference,
 * back to the card). Its own kind, so its key is per move and staff read what it was.
 * ⚠ NOT AN OPERATOR REASON: no refund dialog offers it; only `@effy/edge-shared/delivery` override.ts
 * records it.
 */
export const KIND_DELIVERY = "delivery";
export const REASON_COURIER_OVERRIDE = "courier_override";

/** Reasons an operator may choose. EFFY's vocabulary; the provider is told only one thing. */
export const OPERATOR_REASONS: ReadonlySet<string> = new Set([
  REASON_ITEM_NOT_SUPPLIED, REASON_ITEM_UNUSABLE, REASON_ORDER_CANCELLED, REASON_GOODWILL,
]);

/**
 * The provider's vocabulary mapped onto the platform's TERMINAL states; null while it is still
 * working (`pending`, `requires_action`) — the platform already says `submitted`, which is true.
 *
 * ⚠ `failed` AND `canceled` ARE NOT THE SAME OUTCOME. `failed` is the bank rejecting an accepted
 * refund (→ `failed`); `canceled` is the provider withdrawing it before it moved (→ `refused`).
 */
export function settledStatus(s: ProviderRefundStatus | undefined): "succeeded" | "failed" | "refused" | null {
  if (s === "succeeded") return "succeeded";
  if (s === "failed") return "failed";
  if (s === "canceled") return "refused";
  return null;
}
