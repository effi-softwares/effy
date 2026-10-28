import { api } from "@/lib/api"

import type { ListViews } from "@effy/shared-types"

import type { FeedbackDetailDTO, FeedbackListDTO, FeedbackListParams, FeedbackView } from "./model"

/** A quick read: how many are in one status (the rail's and the overview's count). */
export async function listFeedback(p: FeedbackListParams): Promise<FeedbackListDTO> {
  return api.get<FeedbackListDTO>(`/admin/v1/feedback?view=${p.status ?? "all"}`)
}

/** One page of feedback for the address's view (103). */
export function fetchFeedbackPage(qs: URLSearchParams, signal: AbortSignal): Promise<FeedbackListDTO> {
  return api.get<FeedbackListDTO>(`/admin/v1/feedback?${qs}`, { signal })
}

/** Every view's count for the search and filters, in one request. */
export function fetchFeedbackViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<FeedbackView>> {
  return api.get<ListViews<FeedbackView>>(`/admin/v1/feedback?${qs}`, { signal })
}

export async function getFeedback(referenceCode: string): Promise<FeedbackDetailDTO> {
  return api.get<FeedbackDetailDTO>(`/admin/v1/feedback/${encodeURIComponent(referenceCode)}`)
}

export async function setFeedbackStatus(referenceCode: string, status: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(`/admin/v1/feedback/${encodeURIComponent(referenceCode)}/status`, { status })
}

export async function addFeedbackNote(referenceCode: string, body: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(`/admin/v1/feedback/${encodeURIComponent(referenceCode)}/notes`, { body })
}

export async function replyToFeedback(referenceCode: string, body: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(`/admin/v1/feedback/${encodeURIComponent(referenceCode)}/reply`, { body })
}
