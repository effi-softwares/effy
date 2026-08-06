// Data layer for the deliverability slice (037). Screens never touch the api client directly
// (Principle VI). Every endpoint lives under the admin cold-path service behind the shared gateway.
import { api } from "@/lib/api";

import type { DeliveryDetail, DeliveryList, DeliveryListParams } from "./model";

function encodeListQuery({ state, q, limit, offset }: DeliveryListParams): string {
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (q) params.set("q", q);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function listDeliverability(p: DeliveryListParams): Promise<DeliveryList> {
  return api.get<DeliveryList>(`/admin/v1/deliverability${encodeListQuery(p)}`);
}

export async function getDeliverability(address: string): Promise<DeliveryDetail> {
  return api.get<DeliveryDetail>(`/admin/v1/deliverability/${encodeURIComponent(address)}`);
}

export async function repairDeliverability(
  address: string,
  note: string,
): Promise<DeliveryDetail> {
  return api.post<DeliveryDetail>(
    `/admin/v1/deliverability/${encodeURIComponent(address)}/repair`,
    { note },
  );
}
