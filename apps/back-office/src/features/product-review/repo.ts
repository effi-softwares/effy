import type {
  ApproveReviewRequest,
  MarginNotSetDTO,
  ReviewDecisionDTO,
  ReviewItemDetailDTO,
  ReviewKind,
  ReviewQueueDTO,
  SendBackReviewRequest,
  SetMarginRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for product review (067). Screens never touch the api client directly (Principle
// VI). Every endpoint is on the `edge-catalog` cold-path service behind the shared gateway — see
// specs/067-product-approval-margin/contracts/review-admin.md.

export interface QueueParams {
  q?: string;
  kind?: ReviewKind | null;
  shopId?: string | null;
  cursor?: string | null;
}

export async function listQueue({ q, kind, shopId, cursor }: QueueParams): Promise<ReviewQueueDTO> {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (kind) params.set("kind", kind);
  if (shopId) params.set("shopId", shopId);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return api.get<ReviewQueueDTO>(`/catalog/v1/review${qs ? `?${qs}` : ""}`);
}

export async function listMarginNotSet(cursor?: string | null): Promise<MarginNotSetDTO> {
  return api.get<MarginNotSetDTO>(
    `/catalog/v1/review/margin-not-set${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

export async function getItem(productId: string): Promise<ReviewItemDetailDTO> {
  return api.get<ReviewItemDetailDTO>(`/catalog/v1/review/items/${productId}`);
}

export async function approve(productId: string, body: ApproveReviewRequest): Promise<ReviewDecisionDTO> {
  return api.post<ReviewDecisionDTO>(`/catalog/v1/review/items/${productId}/approve`, body);
}

export async function sendBack(productId: string, body: SendBackReviewRequest): Promise<unknown> {
  return api.post(`/catalog/v1/review/items/${productId}/send-back`, body);
}

export async function setMargin(productId: string, body: SetMarginRequest): Promise<ReviewDecisionDTO> {
  return api.post<ReviewDecisionDTO>(`/catalog/v1/products/${productId}/margin`, body);
}
