import type { IssueRefundRequest } from "@effy/shared-types";

import { api } from "@/lib/api";

/**
 * Issuing a refund (055 US1).
 *
 * Every call here goes to the console's own `orders` service on the gateway. Until 070 issuing and
 * declining were the one exception — they went to a separate Go backend, because it alone held the
 * payment secret. That backend is retired; the refund rules are the platform's shared payments
 * module, which the `orders` service calls directly.
 */

export interface IssueRefundResponse {
  refundId: string;
  amount: string;
  /** ⚠ "submitted", never "refunded" — the bank has not moved anything yet (FR-007). */
  status: string;
  remainingAmount: string;
}

export function issueRefund(
  orderId: string,
  body: IssueRefundRequest,
): Promise<IssueRefundResponse> {
  return api.post<IssueRefundResponse>(`/orders/v1/orders/${orderId}/refunds`, body);
}

/**
 * Dismiss a proposed refund.
 *
 * No money moves: this records a person's judgement that a shortfall is not owed.
 */
export function dismissProposal(
  orderId: string,
  orderItemId: string,
  reason: string,
): Promise<{ dismissed: boolean }> {
  return api.post<{ dismissed: boolean }>(
    `/orders/v1/orders/${orderId}/proposals/${orderItemId}/dismiss`,
    { reason },
  );
}


/**
 * Decline a customer's refund request (055 FR-005r2).
 *
 * No money moves, and it sits beside the decision to pay on purpose: both close the same request,
 * so one service decides which request is still open.
 *
 * ⚠ A note is required by the UI, not by the wire. Telling a customer they are not owed money they
 * believe they are owed is as consequential as paying them, and it is the decision nobody comes back
 * to check.
 */
export function declineRefundRequest(requestId: string, note: string): Promise<{ status: string }> {
  return api.post<{ status: string }>(`/orders/v1/refund-requests/${requestId}/decline`, { note });
}
