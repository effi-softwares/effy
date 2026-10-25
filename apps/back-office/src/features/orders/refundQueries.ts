import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { IssueRefundRequest } from "@effy/shared-types"

import { declineRefundRequest, dismissProposal, issueRefund } from "./refundRepo"
import { orderDetailQuery } from "./queries"

export function useIssueRefund(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: IssueRefundRequest) => issueRefund(orderId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey })
    },
  })
}

export function useDismissProposal(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderItemId, reason }: { orderItemId: string; reason: string }) =>
      dismissProposal(orderId, orderItemId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey }),
  })
}

export function useDeclineRefundRequest(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note: string }) => declineRefundRequest(requestId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey }),
  })
}
