import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { InviteShopStaffRequest, ShopRole, ShopTeamMemberDTO } from "@effy/shared-types"

import { api } from "@/lib/api"
import { track } from "@/lib/telemetry"

const ROOT = ["shop", "team"] as const

export const teamQuery = queryOptions({
  queryKey: ROOT,
  queryFn: () => api.get<ShopTeamMemberDTO[]>("/shop/v1/team"),
  staleTime: 30_000,
})

function useInvalidate() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: ROOT })
}

export function useInviteStaff() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: InviteShopStaffRequest) => api.post<void>("/shop/v1/team/invite", body),
    onSuccess: (_r, body) => {
      track({ name: "shop_staff_invited", role: body.role })
      invalidate()
    },
  })
}

export interface TeamMemberPatch {
  name?: string
  role?: ShopRole
  status?: "active" | "disabled"
}

/** One edit route: name, role, stand down / reinstate. */
export function useUpdateMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ staffId, patch }: { staffId: string; patch: TeamMemberPatch }) =>
      api.patch<void>(`/shop/v1/team/${staffId}`, patch),
    onSuccess: (_r, { patch }) => {
      if (patch.status === "disabled") track({ name: "shop_staff_deactivated" })
      invalidate()
    },
  })
}
