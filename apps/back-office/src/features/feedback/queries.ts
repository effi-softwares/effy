import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import {
  addFeedbackNote,
  getFeedback,
  listFeedback,
  replyToFeedback,
  setFeedbackStatus,
} from "./repo"
import type { FeedbackListParams } from "./model"

// Server state lives ONLY in the TanStack Query cache (Principle VI).
const ROOT = ["back-office", "feedback"] as const

export const feedbackListQuery = (params: FeedbackListParams) =>
  queryOptions({
    queryKey: [...ROOT, "list", params] as const,
    queryFn: () => listFeedback(params),
  })

export const feedbackDetailQuery = (referenceCode: string) =>
  queryOptions({
    queryKey: [...ROOT, "detail", referenceCode] as const,
    queryFn: () => getFeedback(referenceCode),
  })

export function useSetFeedbackStatus(referenceCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (status: string) => setFeedbackStatus(referenceCode, status),
    onSuccess: (detail) => {
      queryClient.setQueryData([...ROOT, "detail", referenceCode], detail)
      void queryClient.invalidateQueries({ queryKey: [...ROOT, "list"] })
    },
  })
}

export function useAddFeedbackNote(referenceCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addFeedbackNote(referenceCode, body),
    onSuccess: (detail) => {
      queryClient.setQueryData([...ROOT, "detail", referenceCode], detail)
    },
  })
}

export function useReplyToFeedback(referenceCode: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => replyToFeedback(referenceCode, body),
    onSuccess: (detail) => {
      queryClient.setQueryData([...ROOT, "detail", referenceCode], detail)
      void queryClient.invalidateQueries({ queryKey: [...ROOT, "list"] })
    },
  })
}
