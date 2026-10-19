import type {
  AdminCreatePromotionGroupRequest,
  AdminPromotionGroupDetailDTO,
  AdminPromotionGroupDTO,
  AdminPromotionGroupPreviewDTO,
  AdminPutGroupMembersRequest,
  AdminUpdatePromotionGroupRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// Display groups (094 US2) — where promotions are shown, by key. Screens never touch the client directly.
export const listGroups = () => api.get<AdminPromotionGroupDTO[]>("/admin/v1/promotion-groups");
export const getGroup = (id: string) => api.get<AdminPromotionGroupDetailDTO>(`/admin/v1/promotion-groups/${id}`);
export const createGroup = (body: AdminCreatePromotionGroupRequest) => api.post<AdminPromotionGroupDTO>("/admin/v1/promotion-groups", body);
export const updateGroup = (id: string, body: AdminUpdatePromotionGroupRequest) => api.patch<AdminPromotionGroupDTO>(`/admin/v1/promotion-groups/${id}`, body);
export const deleteGroup = (id: string) => api.delete<void>(`/admin/v1/promotion-groups/${id}`);
export const putMembers = (id: string, body: AdminPutGroupMembersRequest) => api.put<AdminPromotionGroupDetailDTO>(`/admin/v1/promotion-groups/${id}/members`, body);
export const previewGroup = (id: string) => api.get<AdminPromotionGroupPreviewDTO>(`/admin/v1/promotion-groups/${id}/preview`);
