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
      // ⚠ The ROLE only. Never the invitee's email or name — this is the one event that would
      // otherwise carry a colleague's identity into product analytics.
      track({ name: "shop_staff_invited", role: body.role })
      invalidate()
    },
  })
}

export function useChangeRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ staffId, role }: { staffId: string; role: ShopRole }) =>
      api.patch<void>(`/shop/v1/team/${staffId}/role`, { role }),
    onSuccess: invalidate,
  })
}

export function useDeactivateStaff() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (staffId: string) => api.post<void>(`/shop/v1/team/${staffId}/deactivate`, {}),
    onSuccess: () => {
      track({ name: "shop_staff_deactivated" })
      invalidate()
    },
  })
}
