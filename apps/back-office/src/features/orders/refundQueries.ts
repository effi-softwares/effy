import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { IssueRefundRequest } from "@effy/shared-types";

import { declineRefundRequest, dismissProposal, issueRefund } from "./refundRepo";
import { orderDetailQuery } from "./queries";

/**
 * ⚠ NO OPTIMISTIC UPDATE, DELIBERATELY.
 *
 * Optimism is right when the worst case is a flicker. Here the worst case is telling a staff member a
 * refund happened when the provider refused it — and they would move on. The screen waits for the
 * server, then re-reads the order so the refund list, the totals and the remaining amount all come
 * from one authoritative answer rather than three guesses.
 */
export function useIssueRefund(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueRefundRequest) => issueRefund(orderId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey });
    },
  });
}

/**
 * Dismissing a proposal.
 *
 * ⚠ Also no optimistic update, for the same reason as issuing — and one more: a dismissal that
 * appears to have worked and did not leaves a refund the platform believes is owed, invisible, with
 * nobody looking for it.
 */
export function useDismissProposal(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderItemId, reason }: { orderItemId: string; reason: string }) =>
      dismissProposal(orderId, orderItemId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey }),
  });
}


/**
 * Declining a request.
 *
 * ⚠ No optimistic update, for the same reason as the other two: a decline that appears to have worked
 * and did not leaves a customer waiting for an answer nobody will give again.
 */
export function useDeclineRefundRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note: string }) =>
      declineRefundRequest(requestId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderDetailQuery(orderId).queryKey }),
  });
}
