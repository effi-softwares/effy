import type { IssueRefundRequest } from "@effy/shared-types";

import { api } from "@/lib/api";

/** Issuing a refund, through the `orders` service, which calls the shared payments module. */

export interface IssueRefundResponse {
  refundId: string;
  amount: string;
  /** "submitted", never "refunded" — the bank has not moved anything yet. */
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
 * Decline a customer's refund request. No money moves; it sits beside paying because both close the same
 * request. The UI requires a note: refusing someone money they believe they are owed is as consequential as
 * paying them.
 */
export function declineRefundRequest(requestId: string, note: string): Promise<{ status: string }> {
  return api.post<{ status: string }>(`/orders/v1/refund-requests/${requestId}/decline`, { note });
}
