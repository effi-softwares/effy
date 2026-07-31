import type {
  AuditEntryDTO,
  CreatePromoCodeRequest,
  PresignBannerImageResponse,
  OrderPolicyDTO,
  PagedDTO,
  PromoCodeDTO,
  SetPromoStatusRequest,
  UpdateOrderPolicyRequest,
  UpdatePromoCodeRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type { AuditEntry, OrderPolicy, Paged, PromoCode, PromoListParams } from "./model";

// The data layer for back-office promotions & order rules. Every call maps DTO→domain (identity map
// here, since the contracts double as the domain shapes) so screens never touch the api client
// directly (Principle VI). All endpoints live under the admin cold-path service behind the shared
// gateway (contracts/promotions-admin-api.contract.md).

function encodeQuery({ page, pageSize, status, q }: PromoListParams): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  if (q && q.trim()) params.set("q", q.trim());
  return params.toString();
}

// ── Codes ──────────────────────────────────────────────────────────────────────────────────

export async function listPromos(params: PromoListParams): Promise<Paged<PromoCode>> {
  return api.get<PagedDTO<PromoCodeDTO>>(`/admin/v1/promotions?${encodeQuery(params)}`);
}

export async function getPromo(id: string): Promise<PromoCode> {
  return api.get<PromoCodeDTO>(`/admin/v1/promotions/${id}`);
}

export async function createPromo(body: CreatePromoCodeRequest): Promise<PromoCode> {
  return api.post<PromoCodeDTO>("/admin/v1/promotions", body);
}

export async function updatePromo(id: string, body: UpdatePromoCodeRequest): Promise<PromoCode> {
  return api.patch<PromoCodeDTO>(`/admin/v1/promotions/${id}`, body);
}

export async function setPromoStatus(id: string, body: SetPromoStatusRequest): Promise<PromoCode> {
  return api.post<PromoCodeDTO>(`/admin/v1/promotions/${id}/status`, body);
}

export async function deletePromo(id: string): Promise<void> {
  await api.delete<void>(`/admin/v1/promotions/${id}`);
}

/**
 * Two-step banner artwork upload (028).
 *
 * ⚠ The bytes go DIRECTLY to S3, never through the API. This mints a short-lived presigned PUT and
 * returns the object key; the caller uploads, then saves the key as `bannerImageKey` through the
 * ordinary update route. Sending the file through Lambda would mean base64 in a request body and a
 * 6 MB payload ceiling on an image the bucket would happily take at 10 MB.
 */
export async function presignBannerImage(
  id: string,
  contentType: string,
  fileSize: number,
): Promise<PresignBannerImageResponse> {
  return api.post<PresignBannerImageResponse>(`/admin/v1/promotions/${id}/banner-image/presign`, {
    contentType,
    fileSize,
  });
}

/** PUT the file straight at S3 using the presigned url. No auth header — the signature IS the auth. */
export async function uploadBannerImage(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}). The link may have expired — try again.`);
  }
}

export async function getPromoHistory(id: string): Promise<AuditEntry[]> {
  const res = await api.get<{ items: AuditEntryDTO[] }>(`/admin/v1/promotions/${id}/audit`);
  return res.items;
}

// ── Order rules (the single policy row) ────────────────────────────────────────────────────

export async function getOrderPolicy(): Promise<OrderPolicy> {
  return api.get<OrderPolicyDTO>("/admin/v1/order-policy");
}

export async function putOrderPolicy(body: UpdateOrderPolicyRequest): Promise<OrderPolicy> {
  return api.put<OrderPolicyDTO>("/admin/v1/order-policy", body);
}
