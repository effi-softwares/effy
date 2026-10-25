import type { IssueRefundRequest } from "@effy/shared-types"

import { api } from "@/lib/api"

interface IssueRefundResponse {
  refundId: string
  amount: string
  status: string
  remainingAmount: string
}

export function issueRefund(orderId: string, body: IssueRefundRequest): Promise<IssueRefundResponse> {
  return api.post<IssueRefundResponse>(`/orders/v1/orders/${orderId}/refunds`, body)
}

export function dismissProposal(orderId: string, orderItemId: string, reason: string): Promise<{ dismissed: boolean }> {
  return api.post<{ dismissed: boolean }>(`/orders/v1/orders/${orderId}/proposals/${orderItemId}/dismiss`, { reason })
}

export function declineRefundRequest(requestId: string, note: string): Promise<{ status: string }> {
  return api.post<{ status: string }>(`/orders/v1/refund-requests/${requestId}/decline`, { note })
}
