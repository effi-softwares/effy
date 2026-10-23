import type {
  AdminCreateSkinRequest,
  AdminSkinDTO,
  AdminSkinListItemDTO,
  AdminUpdateSkinRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// Promotion skins — how a promotion looks in each place. Screens never touch the client directly.
export const listSkins = () => api.get<{ items: AdminSkinListItemDTO[] }>("/admin/v1/promotion-skins").then((r) => r.items);
export const getSkin = (id: string) => api.get<AdminSkinDTO>(`/admin/v1/promotion-skins/${id}`);
export const createSkin = (body: AdminCreateSkinRequest) => api.post<AdminSkinDTO>("/admin/v1/promotion-skins", body);
export const updateSkin = (id: string, body: AdminUpdateSkinRequest) => api.put<AdminSkinDTO>(`/admin/v1/promotion-skins/${id}`, body);
export const duplicateSkin = (id: string, name: string) => api.post<AdminSkinDTO>(`/admin/v1/promotion-skins/${id}/duplicate`, { name });
export const deleteSkin = (id: string) => api.delete<void>(`/admin/v1/promotion-skins/${id}`);
