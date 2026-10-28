import type {
  ApproveReviewRequest,
  ListViews,
  MarginNotSetDTO,
  MissingDetailsPageDTO,
  PlacementsDTO,
  ReviewDecisionDTO,
  ReviewItemDetailDTO,
  ReviewKind,
  ReviewQueueDTO,
  SendBackReviewRequest,
  SetMarginRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

export interface QueueParams {
  q?: string
  kind?: ReviewKind | null
  shopId?: string | null
}

/** A quick read of the queue's first page (the rail's count, the overview's oldest item). */
export async function listQueue({ q, kind, shopId }: QueueParams): Promise<ReviewQueueDTO> {
  const params = new URLSearchParams()
  if (q && q.trim()) params.set("q", q.trim())
  if (kind) params.set("kind", kind)
  if (shopId) params.set("shopId", shopId)
  const qs = params.toString()
  return api.get<ReviewQueueDTO>(`/catalog/v1/review${qs ? `?${qs}` : ""}`)
}

/** One page of the queue for the address's view (103). */
export function fetchQueuePage(qs: URLSearchParams, signal: AbortSignal): Promise<ReviewQueueDTO> {
  return api.get<ReviewQueueDTO>(`/catalog/v1/review?${qs}`, { signal })
}

/** The queue's kinds counted under the search and shop, in one request. */
export function fetchQueueViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<"all" | ReviewKind>> {
  return api.get<ListViews<"all" | ReviewKind>>(`/catalog/v1/review?${qs}`, { signal })
}

export function fetchMarginNotSetPage(qs: URLSearchParams, signal: AbortSignal): Promise<MarginNotSetDTO> {
  return api.get<MarginNotSetDTO>(`/catalog/v1/review/margin-not-set?${qs}`, { signal })
}

export async function getItem(productId: string): Promise<ReviewItemDetailDTO> {
  return api.get<ReviewItemDetailDTO>(`/catalog/v1/review/items/${productId}`)
}

export async function approve(productId: string, body: ApproveReviewRequest): Promise<ReviewDecisionDTO> {
  return api.post<ReviewDecisionDTO>(`/catalog/v1/review/items/${productId}/approve`, body)
}

export async function sendBack(productId: string, body: SendBackReviewRequest): Promise<unknown> {
  return api.post(`/catalog/v1/review/items/${productId}/send-back`, body)
}

export async function setMargin(productId: string, body: SetMarginRequest): Promise<ReviewDecisionDTO> {
  return api.post<ReviewDecisionDTO>(`/catalog/v1/products/${productId}/margin`, body)
}

/** Products on sale with a required detail empty (101): a requirement added after they were approved. */
export function fetchMissingDetailsPage(qs: URLSearchParams, signal: AbortSignal): Promise<MissingDetailsPageDTO> {
  return api.get<MissingDetailsPageDTO>(`/catalog/v1/products/missing-details?${qs}`, { signal })
}

/** Replace a product's extra "also shown in" leaves (101). */
export async function setPlacements(productId: string, categoryIds: string[]): Promise<PlacementsDTO> {
  return api.put<PlacementsDTO>(`/catalog/v1/products/${productId}/placements`, { categoryIds })
}
