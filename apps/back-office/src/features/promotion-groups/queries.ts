import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdminCreatePromotionGroupRequest, AdminUpdatePromotionGroupRequest } from "@effy/shared-types";

import { createGroup, deleteGroup, getGroup, listGroups, previewGroup, putMembers, updateGroup } from "./repo";

// A group change also changes what a promotion's page says it is shown in, so both roots are refreshed.
const GROUPS = ["back-office", "promotion-groups"] as const;
const PROMOTIONS = ["back-office", "promotions"] as const;

export const promotionGroupsQuery = () => queryOptions({ queryKey: [...GROUPS, "list"] as const, queryFn: listGroups });
export const promotionGroupQuery = (id: string) => queryOptions({ queryKey: [...GROUPS, "detail", id] as const, queryFn: () => getGroup(id) });
export const promotionGroupPreviewQuery = (id: string) =>
  queryOptions({ queryKey: [...GROUPS, "preview", id] as const, queryFn: () => previewGroup(id) });

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: GROUPS });
      void qc.invalidateQueries({ queryKey: PROMOTIONS });
    },
  });
}

export const useCreateGroup = () => useInvalidating((b: AdminCreatePromotionGroupRequest) => createGroup(b));
export const useUpdateGroup = (id: string) => useInvalidating((b: AdminUpdatePromotionGroupRequest) => updateGroup(id, b));
export const useDeleteGroup = () => useInvalidating((id: string) => deleteGroup(id));
/** Members in order, each with its skin and picture (null = the group's default / the best fit). */
export type MemberChoice = { promotionId: string; skinId: string | null; imageId: string | null };
export const usePutMembers = (id: string) => useInvalidating((members: MemberChoice[]) => putMembers(id, { members }));
