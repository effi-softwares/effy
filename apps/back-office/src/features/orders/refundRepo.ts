import type { IssueRefundRequest } from "@effy/shared-types";

import { api, coreApi } from "@/lib/api";

/**
 * Issuing a refund (055 US1).
 *
 * ⚠ THIS IS THE ONE PLACE IN THIS CONSOLE THAT CALLS `core-api` RATHER THAN THE GATEWAY, and the
 * reason is not architectural taste: the payment secret lives in `core-api` and nowhere else
 * (019 SC-012). Reading the order — including its refunds — still comes from `edge-api/orders`, where
 * 053 built the console's read path.
 *
 * ⚠ The rejected alternatives are worth knowing, because "two hosts" looks like an accident: routing
 * refunds through the cold path would have meant either duplicating the platform's most dangerous
 * secret into a Lambda, or forwarding an operator's token between services — which is the
 * auth-brokering Principle IV forbids by name (research R1).
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
  return coreApi.post<IssueRefundResponse>(`/v1/admin/orders/${orderId}/refunds`, body);
}

/**
 * Dismiss a proposed refund.
 *
 * ⚠ THE GATEWAY, not `core-api` — no money moves, so it belongs with the rest of the console's order
 * reads and writes. Issuing is the exception, and it is an exception for one reason only: the payment
 * secret lives in `core-api` and nowhere else.
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
 * ⚠ `core-api`, not the gateway — even though NO MONEY MOVES. The decision belongs beside the one to
 * pay: both close the same request, and splitting them across two services would mean two places that
 * must agree about which request is still open.
 *
 * ⚠ A note is required by the UI, not by the wire. Telling a customer they are not owed money they
 * believe they are owed is as consequential as paying them, and it is the decision nobody comes back
 * to check.
 */
export function declineRefundRequest(requestId: string, note: string): Promise<{ status: string }> {
  return coreApi.post<{ status: string }>(`/v1/admin/refund-requests/${requestId}/decline`, { note });
}
