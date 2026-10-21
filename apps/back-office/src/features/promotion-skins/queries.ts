import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdminCreateSkinRequest, AdminUpdateSkinRequest } from "@effy/shared-types";

import { createSkin, deleteSkin, duplicateSkin, getSkin, listSkins, updateSkin } from "./repo";

// A skin change changes what every group wearing it looks like, so the group roots are refreshed too.
const SKINS = ["back-office", "promotion-skins"] as const;
const GROUPS = ["back-office", "promotion-groups"] as const;

export const promotionSkinsQuery = () => queryOptions({ queryKey: [...SKINS, "list"] as const, queryFn: listSkins });
export const promotionSkinQuery = (id: string) => queryOptions({ queryKey: [...SKINS, "detail", id] as const, queryFn: () => getSkin(id) });

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SKINS });
      void qc.invalidateQueries({ queryKey: GROUPS });
    },
  });
}

export const useCreateSkin = () => useInvalidating((b: AdminCreateSkinRequest) => createSkin(b));
export const useUpdateSkin = (id: string) => useInvalidating((b: AdminUpdateSkinRequest) => updateSkin(id, b));
export const useDuplicateSkin = (id: string) => useInvalidating((name: string) => duplicateSkin(id, name));
export const useDeleteSkin = () => useInvalidating((id: string) => deleteSkin(id));
