// Data layer for the feedback console slice (046). Screens never touch the api client directly
// (Principle VI). Every endpoint lives under the admin cold-path service behind the shared gateway.
import { api } from "@/lib/api"

import type { FeedbackDetailDTO, FeedbackListDTO, FeedbackListParams } from "./model"

function encodeListQuery({ q, category, status, rating, from, to, cursor, limit }: FeedbackListParams): string {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (category) params.set("category", category)
  if (status) params.set("status", status)
  if (rating) params.set("rating", String(rating))
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  if (cursor) params.set("cursor", cursor)
  if (limit) params.set("limit", String(limit))
  const s = params.toString()
  return s ? `?${s}` : ""
}

export async function listFeedback(p: FeedbackListParams): Promise<FeedbackListDTO> {
  return api.get<FeedbackListDTO>(`/admin/v1/feedback${encodeListQuery(p)}`)
}

export async function getFeedback(referenceCode: string): Promise<FeedbackDetailDTO> {
  return api.get<FeedbackDetailDTO>(`/admin/v1/feedback/${encodeURIComponent(referenceCode)}`)
}

export async function setFeedbackStatus(referenceCode: string, status: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(
    `/admin/v1/feedback/${encodeURIComponent(referenceCode)}/status`,
    { status },
  )
}

export async function addFeedbackNote(referenceCode: string, body: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(
    `/admin/v1/feedback/${encodeURIComponent(referenceCode)}/notes`,
    { body },
  )
}

export async function replyToFeedback(referenceCode: string, body: string): Promise<FeedbackDetailDTO> {
  return api.post<FeedbackDetailDTO>(
    `/admin/v1/feedback/${encodeURIComponent(referenceCode)}/reply`,
    { body },
  )
}
